import {
  MongoClient,
  MongoClientClosedError,
  MongoNetworkError,
  MongoNotConnectedError,
  MongoServerError,
  MongoServerSelectionError,
  MongoTopologyClosedError,
  Binary,
  ObjectId,
  type Collection,
  type Db,
} from 'mongodb';
import {
  DuplicateKeyError,
  StoreUnavailableError,
  type ActionLogEntry,
  type ContentKind,
  type ContentMeta,
  type PublishFinish,
  type PublishRun,
  type ContentOrderEntry,
  type ContentRecord,
  type ModerationRecord,
  type NewContentRecord,
  type NewSession,
  type NewUser,
  type Session,
  type Store,
  type User,
  type UploadMeta,
  type UploadRecord,
  type UserPatch,
} from '../domain/model.js';

export const PING_TIMEOUT_MS = 2000;

/** ТЗ 6.4: журнал хранится 180 дней, затем плановая чистка — индексом TTL. */
export const ACTION_LOG_TTL_SECONDS = 180 * 24 * 60 * 60;

type UserDoc = Omit<User, 'id'> & { _id: ObjectId };
type SessionDoc = Omit<Session, 'id' | 'userId'> & { _id: ObjectId; userId: ObjectId };
type LogDoc = Omit<ActionLogEntry, 'userId'> & { userId: ObjectId | null };
type ContentDoc = Omit<ContentRecord, 'id'> & { _id: ObjectId };
/** Служебная запись контента — одна, с постоянным `_id`. */
type MetaDoc = ContentMeta & { _id: 'content' };

const META_ID = 'content' as const;

/** Файл: `_id` — путь (ТЗ 8.4, п. 5). Содержимое — `Binary`, до публикации. */
type UploadDoc = Omit<UploadRecord, 'path' | 'data'> & { _id: string; data: Binary | null };

/** Решение модерации ленты: `_id` — ключ записи ленты (решение 043). */
type ModerationDoc = Omit<ModerationRecord, 'urlKey'> & { _id: string };

const UPLOAD_META_PROJECTION = { data: 0 } as const;

function toUploadMeta(d: Omit<UploadDoc, 'data'> & { data?: unknown }): UploadMeta {
  const { _id, ...rest } = d;
  delete rest.data;
  return { ...rest, path: _id };
}

function toUser(d: UserDoc): User {
  const { _id, ...rest } = d;
  return { ...rest, id: _id.toHexString() };
}

function toContent(d: ContentDoc): ContentRecord {
  const { _id, ...rest } = d;
  return { ...rest, id: _id.toHexString() };
}

/** Поля документа без `_id`: явный перечень, чтобы `id` записи не попал в БД. */
function contentFields(r: NewContentRecord): Omit<ContentDoc, '_id'> {
  return {
    kind: r.kind,
    key: r.key,
    data: r.data,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    firstPublishedAt: r.firstPublishedAt,
  };
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
  private readonly content: Collection<ContentDoc>;
  private readonly meta: Collection<MetaDoc>;
  private readonly uploads: Collection<UploadDoc>;
  private readonly moderation: Collection<ModerationDoc>;

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
    this.content = this.db.collection<ContentDoc>('content');
    this.meta = this.db.collection<MetaDoc>('content_meta');
    this.uploads = this.db.collection<UploadDoc>('uploads');
    this.moderation = this.db.collection<ModerationDoc>('moderation');
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
      // Ключ уникален в пределах сущности, включая «Кошик» (решение 038).
      await this.content.createIndex({ kind: 1, key: 1 }, { unique: true, name: 'kind_key' });
      await this.content.createIndex({ updatedAt: 1 }, { name: 'content_updated' });
      await this.moderation.createIndex({ updatedAt: 1 }, { name: 'moderation_updated' });
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
  listContent(kind: ContentKind): Promise<ContentRecord[]> {
    return guard(async () => (await this.content.find({ kind }).toArray()).map(toContent));
  }

  findContent(kind: ContentKind, id: string): Promise<ContentRecord | null> {
    const _id = oid(id);
    if (!_id) return Promise.resolve(null);
    return guard(async () => {
      const d = await this.content.findOne({ _id, kind });
      return d ? toContent(d) : null;
    });
  }

  insertContent(record: NewContentRecord): Promise<ContentRecord> {
    return guard(async () => {
      const _id = new ObjectId();
      await this.content.insertOne({ _id, ...contentFields(record) });
      return { ...record, id: _id.toHexString() };
    });
  }

  replaceContent(record: ContentRecord, expectedUpdatedAt: Date): Promise<boolean> {
    const _id = oid(record.id);
    if (!_id) return Promise.resolve(false);
    return guard(async () => {
      const r = await this.content.replaceOne(
        { _id, kind: record.kind, updatedAt: expectedUpdatedAt },
        contentFields(record),
      );
      return r.matchedCount === 1;
    });
  }

  updateContentOrder(kind: ContentKind, entries: ContentOrderEntry[], at: Date): Promise<void> {
    const ops = entries.flatMap(({ id, order }) => {
      const _id = oid(id);
      return _id
        ? [
            {
              updateOne: {
                filter: { _id, kind },
                update: { $set: { 'data.order': order, updatedAt: at } },
              },
            },
          ]
        : [];
    });
    if (ops.length === 0) return Promise.resolve();
    return guard(async () => {
      await this.content.bulkWrite(ops, { ordered: true });
    });
  }

  deleteContent(kind: ContentKind, id: string): Promise<boolean> {
    const _id = oid(id);
    if (!_id) return Promise.resolve(false);
    return guard(async () => (await this.content.deleteOne({ _id, kind })).deletedCount === 1);
  }

  countContentChangedSince(since: Date | null): Promise<number> {
    return guard(() =>
      this.content.countDocuments(since === null ? {} : { updatedAt: { $gt: since } }),
    );
  }

  getContentMeta(): Promise<ContentMeta> {
    return guard(async () => {
      const d = await this.meta.findOne({ _id: META_ID });
      return {
        seededAt: d?.seededAt ?? null,
        lastPublishedAt: d?.lastPublishedAt ?? null,
        purgedPending: d?.purgedPending ?? 0,
        lastRun: d?.lastRun ?? null,
      };
    });
  }

  /**
   * Отметка ставится одним атомарным `upsert` по условию «ещё не стояла»:
   * два экземпляра на старте не загрузят данные дважды в счёт счётчика.
   */
  markContentSeeded(at: Date): Promise<boolean> {
    return guard(async () => {
      try {
        const r = await this.meta.updateOne(
          { _id: META_ID, seededAt: null },
          {
            $set: { seededAt: at, lastPublishedAt: at },
            $setOnInsert: { purgedPending: 0, lastRun: null },
          },
          { upsert: true },
        );
        return r.modifiedCount === 1 || r.upsertedCount === 1;
      } catch (err) {
        // Отметка уже стоит: условие не совпало, а `upsert` упёрся в тот же `_id`.
        if (err instanceof MongoServerError && err.code === 11000) return false;
        throw err;
      }
    });
  }

  incrementPurgedPending(): Promise<void> {
    return guard(async () => {
      await this.meta.updateOne(
        { _id: META_ID },
        {
          $inc: { purgedPending: 1 },
          $setOnInsert: { seededAt: null, lastPublishedAt: null, lastRun: null },
        },
        { upsert: true },
      );
    });
  }

  setPublishRun(run: PublishRun): Promise<void> {
    return guard(async () => {
      await this.meta.updateOne(
        { _id: META_ID },
        {
          $set: { lastRun: run },
          $setOnInsert: { seededAt: null, lastPublishedAt: null, purgedPending: 0 },
        },
        { upsert: true },
      );
    });
  }

  patchPublishRun(runId: number, patch: Partial<Omit<PublishRun, 'runId'>>): Promise<boolean> {
    return guard(async () => {
      const set = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`lastRun.${k}`, v]));
      if (Object.keys(set).length === 0) {
        return (await this.meta.countDocuments({ _id: META_ID, 'lastRun.runId': runId })) === 1;
      }
      const r = await this.meta.updateOne({ _id: META_ID, 'lastRun.runId': runId }, { $set: set });
      return r.matchedCount === 1;
    });
  }

  /**
   * Одно условное обновление: два одновременных опроса состояния не
   * завершат прогон дважды и не вычтут удалённые записи два раза.
   */
  finishPublishRun(runId: number, finish: PublishFinish): Promise<boolean> {
    return guard(async () => {
      const r = await this.meta.updateOne(
        { _id: META_ID, 'lastRun.runId': runId, 'lastRun.result': 'in_progress' },
        {
          $set: {
            'lastRun.result': finish.result,
            'lastRun.finishedAt': finish.finishedAt,
            ...(finish.publishedAt ? { lastPublishedAt: finish.publishedAt } : {}),
          },
          $inc: { purgedPending: -finish.purgedDelta },
        },
      );
      return r.modifiedCount === 1;
    });
  }

  insertUpload(upload: UploadRecord): Promise<void> {
    const { path, data, ...rest } = upload;
    return guard(async () => {
      await this.uploads.insertOne({
        _id: path,
        ...rest,
        data: data ? new Binary(data) : null,
      });
    });
  }

  listUploads(): Promise<UploadMeta[]> {
    return guard(async () =>
      (await this.uploads.find({}, { projection: UPLOAD_META_PROJECTION }).toArray()).map(
        toUploadMeta,
      ),
    );
  }

  findUpload(path: string): Promise<UploadMeta | null> {
    return guard(async () => {
      const d = await this.uploads.findOne({ _id: path }, { projection: UPLOAD_META_PROJECTION });
      return d ? toUploadMeta(d) : null;
    });
  }

  readUploadData(path: string): Promise<Buffer | null> {
    return guard(async () => {
      const d = await this.uploads.findOne({ _id: path }, { projection: { data: 1 } });
      return d?.data ? Buffer.from(d.data.buffer) : null;
    });
  }

  setUploadDeleteRequested(path: string, at: Date | null): Promise<boolean> {
    return guard(
      async () =>
        (await this.uploads.updateOne({ _id: path }, { $set: { deleteRequestedAt: at } }))
          .matchedCount === 1,
    );
  }

  deleteUpload(path: string): Promise<boolean> {
    return guard(async () => (await this.uploads.deleteOne({ _id: path })).deletedCount === 1);
  }

  settleUploads(snapshotAt: Date, exported: readonly string[]): Promise<void> {
    return guard(async () => {
      await this.uploads.deleteMany({ deleteRequestedAt: { $ne: null, $lte: snapshotAt } });
      await this.uploads.updateMany(
        { _id: { $in: [...exported] }, publishedAt: null },
        { $set: { publishedAt: snapshotAt, data: null } },
      );
    });
  }

  listModeration(): Promise<ModerationRecord[]> {
    return guard(async () =>
      (await this.moderation.find({}).toArray()).map(({ _id, ...rest }) => ({
        ...rest,
        urlKey: _id,
      })),
    );
  }

  findModeration(urlKey: string): Promise<ModerationRecord | null> {
    return guard(async () => {
      const d = await this.moderation.findOne({ _id: urlKey });
      if (!d) return null;
      const { _id, ...rest } = d;
      return { ...rest, urlKey: _id };
    });
  }

  upsertModeration(record: ModerationRecord): Promise<void> {
    return guard(async () => {
      const { urlKey, ...fields } = record;
      await this.moderation.replaceOne({ _id: urlKey }, fields, { upsert: true });
    });
  }

  countModerationChangedSince(since: Date | null): Promise<number> {
    return guard(() =>
      this.moderation.countDocuments(since === null ? {} : { updatedAt: { $gt: since } }),
    );
  }
}
