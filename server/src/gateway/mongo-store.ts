import {
  MongoClient,
  MongoClientClosedError,
  MongoNetworkError,
  MongoNotConnectedError,
  MongoServerError,
  MongoServerSelectionError,
  MongoTopologyClosedError,
  ObjectId,
  type Collection,
  type Db,
} from 'mongodb';
import {
  DuplicateKeyError,
  StoreUnavailableError,
  type ActionLogEntry,
  type NewSession,
  type NewUser,
  type Session,
  type Store,
  type User,
  type UserPatch,
} from '../domain/model.js';

export const PING_TIMEOUT_MS = 2000;

/** ТЗ 6.4: журнал хранится 180 дней, затем плановая чистка — индексом TTL. */
export const ACTION_LOG_TTL_SECONDS = 180 * 24 * 60 * 60;

type UserDoc = Omit<User, 'id'> & { _id: ObjectId };
type SessionDoc = Omit<Session, 'id' | 'userId'> & { _id: ObjectId; userId: ObjectId };
type LogDoc = Omit<ActionLogEntry, 'userId'> & { userId: ObjectId | null };

function toUser(d: UserDoc): User {
  const { _id, ...rest } = d;
  return { ...rest, id: _id.toHexString() };
}

function toSession(d: SessionDoc): Session {
  const { _id, userId, ...rest } = d;
  return { ...rest, id: _id.toHexString(), userId: userId.toHexString() };
}

/** Неверный идентификатор не находит ничего, а не роняет запрос. */
function oid(id: string): ObjectId | null {
  return ObjectId.isValid(id) && id.length === 24 ? new ObjectId(id) : null;
}

function isUnavailable(err: unknown): boolean {
  return (
    err instanceof MongoNetworkError ||
    err instanceof MongoServerSelectionError ||
    err instanceof MongoNotConnectedError ||
    err instanceof MongoTopologyClosedError ||
    err instanceof MongoClientClosedError
  );
}

async function guard<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) throw new DuplicateKeyError();
    if (isUnavailable(err)) throw new StoreUnavailableError(err);
    throw err;
  }
}

export interface MongoStoreOptions {
  uri: string;
  dbName: string;
  /** Предел ожидания выбора сервера. Atlas после паузы просыпается не мгновенно. */
  serverSelectionTimeoutMS?: number;
}

export class MongoStore implements Store {
  readonly client: MongoClient;
  private readonly db: Db;
  private readonly users: Collection<UserDoc>;
  private readonly sessions: Collection<SessionDoc>;
  private readonly log: Collection<LogDoc>;

  constructor(opts: MongoStoreOptions) {
    this.client = new MongoClient(opts.uri, {
      serverSelectionTimeoutMS: opts.serverSelectionTimeoutMS ?? 10_000,
      // Один редактор: большой пул не нужен, а у бесплатного кластера предел соединений (ТЗ 7.6).
      maxPoolSize: 5,
      appName: 'uzn-desna-server',
    });
    this.db = this.client.db(opts.dbName);
    this.users = this.db.collection<UserDoc>('users');
    this.sessions = this.db.collection<SessionDoc>('sessions');
    this.log = this.db.collection<LogDoc>('action_log');
  }

  /** Индексы создаются при каждом запуске: повторное создание того же индекса ничего не меняет. */
  async ensureIndexes(): Promise<void> {
    await guard(async () => {
      await this.users.createIndex({ login: 1 }, { unique: true, name: 'login_unique' });
      await this.sessions.createIndex({ tokenHash: 1 }, { unique: true, name: 'token_unique' });
      await this.sessions.createIndex({ userId: 1, createdAt: -1 }, { name: 'user_sessions' });
      // Просроченные сессии удаляет сама БД; проверка срока в коде остаётся,
      // потому что чистка TTL идёт раз в минуту с задержкой.
      await this.sessions.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: 'session_ttl' },
      );
      await this.log.createIndex(
        { at: 1 },
        { expireAfterSeconds: ACTION_LOG_TTL_SECONDS, name: 'log_ttl' },
      );
      await this.log.createIndex({ userId: 1, at: -1 }, { name: 'log_user' });
    });
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  /**
   * Не дольше `PING_TIMEOUT_MS`: `/health` должен отвечать быстро и при
   * недоступной БД — им админка будит сервис (ТЗ 8.7). Ограничение драйвера
   * `timeoutMS` при недоступном сервере держалось 7 с, поэтому срок свой.
   */
  async ping(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
    });
    const ping = this.db.command({ ping: 1 }).then(
      () => true,
      () => false,
    );
    try {
      return await Promise.race([ping, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  countUsers(): Promise<number> {
    return guard(() => this.users.countDocuments());
  }

  findUserByLogin(login: string): Promise<User | null> {
    return guard(async () => {
      const d = await this.users.findOne({ login });
      return d ? toUser(d) : null;
    });
  }

  findUserById(id: string): Promise<User | null> {
    const _id = oid(id);
    if (!_id) return Promise.resolve(null);
    return guard(async () => {
      const d = await this.users.findOne({ _id });
      return d ? toUser(d) : null;
    });
  }

  createUser(user: NewUser): Promise<User> {
    return guard(async () => {
      const _id = new ObjectId();
      await this.users.insertOne({ ...user, _id });
      return { ...user, id: _id.toHexString() };
    });
  }

  updateUser(id: string, patch: UserPatch): Promise<void> {
    const _id = oid(id);
    if (!_id) return Promise.resolve();
    return guard(async () => {
      await this.users.updateOne({ _id }, { $set: patch });
    });
  }

  createSession(session: NewSession): Promise<Session> {
    const userId = oid(session.userId);
    if (!userId) return Promise.reject(new Error('invalid user id'));
    return guard(async () => {
      const _id = new ObjectId();
      await this.sessions.insertOne({ ...session, _id, userId });
      return { ...session, id: _id.toHexString() };
    });
  }

  findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    return guard(async () => {
      const d = await this.sessions.findOne({ tokenHash });
      return d ? toSession(d) : null;
    });
  }

  touchSession(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void> {
    const _id = oid(id);
    if (!_id) return Promise.resolve();
    return guard(async () => {
      await this.sessions.updateOne({ _id }, { $set: { lastSeenAt, expiresAt } });
    });
  }

  deleteSession(id: string): Promise<void> {
    const _id = oid(id);
    if (!_id) return Promise.resolve();
    return guard(async () => {
      await this.sessions.deleteOne({ _id });
    });
  }

  deleteUserSessions(userId: string, exceptId?: string): Promise<void> {
    const uid = oid(userId);
    if (!uid) return Promise.resolve();
    const except = exceptId ? oid(exceptId) : null;
    return guard(async () => {
      await this.sessions.deleteMany(
        except ? { userId: uid, _id: { $ne: except } } : { userId: uid },
      );
    });
  }

  listUserSessions(userId: string, now: Date): Promise<Session[]> {
    const uid = oid(userId);
    if (!uid) return Promise.resolve([]);
    return guard(async () => {
      const docs = await this.sessions
        .find({ userId: uid, expiresAt: { $gt: now } })
        .sort({ createdAt: -1, _id: -1 })
        .toArray();
      return docs.map(toSession);
    });
  }

  appendLog(entry: ActionLogEntry): Promise<void> {
    const userId = entry.userId ? oid(entry.userId) : null;
    return guard(async () => {
      await this.log.insertOne({ ...entry, userId });
    });
  }
}
