import { randomUUID } from 'node:crypto';
import {
  DuplicateKeyError,
  StoreUnavailableError,
  type ActionLogEntry,
  type ContentKind,
  type ContentMeta,
  type ContentOrderEntry,
  type ContentRecord,
  type NewContentRecord,
  type NewSession,
  type NewUser,
  type Session,
  type Store,
  type User,
  type UserPatch,
} from '../domain/model.js';

/**
 * Хранилище в памяти: для тестов и локального запуска без MongoDB.
 * Ведёт себя как MongoStore в том, что проверяют тесты: уникальный логин,
 * порядок сессий, только добавление в журнал. Отдаёт копии, а не ссылки.
 */
export class MemoryStore implements Store {
  readonly users = new Map<string, User>();
  readonly sessions = new Map<string, Session>();
  readonly log: ActionLogEntry[] = [];
  readonly content = new Map<string, ContentRecord>();
  meta: ContentMeta = { seededAt: null, lastPublishedAt: null, purgedPending: 0 };
  available = true;

  private check(): void {
    if (!this.available) throw new StoreUnavailableError();
  }

  async ping(): Promise<boolean> {
    return this.available;
  }

  async countUsers(): Promise<number> {
    this.check();
    return this.users.size;
  }

  async findUserByLogin(login: string): Promise<User | null> {
    this.check();
    for (const u of this.users.values()) if (u.login === login) return { ...u };
    return null;
  }

  async findUserById(id: string): Promise<User | null> {
    this.check();
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async createUser(user: NewUser): Promise<User> {
    this.check();
    for (const u of this.users.values()) if (u.login === user.login) throw new DuplicateKeyError();
    const created = { ...user, id: randomUUID() };
    this.users.set(created.id, created);
    return { ...created };
  }

  async updateUser(id: string, patch: UserPatch): Promise<void> {
    this.check();
    const u = this.users.get(id);
    if (u) this.users.set(id, { ...u, ...patch });
  }

  async createSession(session: NewSession): Promise<Session> {
    this.check();
    const created = { ...session, id: randomUUID() };
    this.sessions.set(created.id, created);
    return { ...created };
  }

  async findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    this.check();
    for (const s of this.sessions.values()) if (s.tokenHash === tokenHash) return { ...s };
    return null;
  }

  async touchSession(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void> {
    this.check();
    const s = this.sessions.get(id);
    if (s) this.sessions.set(id, { ...s, lastSeenAt, expiresAt });
  }

  async deleteSession(id: string): Promise<void> {
    this.check();
    this.sessions.delete(id);
  }

  async deleteUserSessions(userId: string, exceptId?: string): Promise<void> {
    this.check();
    for (const [id, s] of this.sessions) {
      if (s.userId === userId && id !== exceptId) this.sessions.delete(id);
    }
  }

  async listUserSessions(userId: string, now: Date): Promise<Session[]> {
    this.check();
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId && s.expiresAt.getTime() > now.getTime())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((s) => ({ ...s }));
  }

  async appendLog(entry: ActionLogEntry): Promise<void> {
    this.check();
    this.log.push({ ...entry });
  }

  async listContent(kind: ContentKind): Promise<ContentRecord[]> {
    this.check();
    return [...this.content.values()].filter((r) => r.kind === kind).map(copyRecord);
  }

  async findContent(kind: ContentKind, id: string): Promise<ContentRecord | null> {
    this.check();
    const r = this.content.get(id);
    return r && r.kind === kind ? copyRecord(r) : null;
  }

  async insertContent(record: NewContentRecord): Promise<ContentRecord> {
    this.check();
    this.assertKeyFree(record.kind, record.key, null);
    const created = copyRecord({ ...record, id: randomUUID() });
    this.content.set(created.id, created);
    return copyRecord(created);
  }

  async replaceContent(record: ContentRecord, expectedUpdatedAt: Date): Promise<boolean> {
    this.check();
    const current = this.content.get(record.id);
    if (!current || current.kind !== record.kind) return false;
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return false;
    this.assertKeyFree(record.kind, record.key, record.id);
    this.content.set(record.id, copyRecord(record));
    return true;
  }

  async updateContentOrder(
    kind: ContentKind,
    entries: ContentOrderEntry[],
    at: Date,
  ): Promise<void> {
    this.check();
    for (const { id, order } of entries) {
      const r = this.content.get(id);
      if (r && r.kind === kind) {
        this.content.set(id, copyRecord({ ...r, data: { ...r.data, order }, updatedAt: at }));
      }
    }
  }

  async deleteContent(kind: ContentKind, id: string): Promise<boolean> {
    this.check();
    const r = this.content.get(id);
    if (!r || r.kind !== kind) return false;
    return this.content.delete(id);
  }

  async countContentChangedSince(since: Date | null): Promise<number> {
    this.check();
    let n = 0;
    for (const r of this.content.values()) {
      if (since === null || r.updatedAt.getTime() > since.getTime()) n += 1;
    }
    return n;
  }

  async getContentMeta(): Promise<ContentMeta> {
    this.check();
    return { ...this.meta };
  }

  async markContentSeeded(at: Date): Promise<boolean> {
    this.check();
    if (this.meta.seededAt) return false;
    this.meta = { ...this.meta, seededAt: at, lastPublishedAt: at };
    return true;
  }

  async incrementPurgedPending(): Promise<void> {
    this.check();
    this.meta = { ...this.meta, purgedPending: this.meta.purgedPending + 1 };
  }

  private assertKeyFree(kind: ContentKind, key: string, exceptId: string | null): void {
    for (const r of this.content.values()) {
      if (r.kind === kind && r.key === key && r.id !== exceptId) throw new DuplicateKeyError();
    }
  }
}

/** Глубокая копия: `data` — вложенные объекты, наружу ссылки не уходят. */
function copyRecord(r: ContentRecord): ContentRecord {
  return { ...r, data: structuredClone(r.data) };
}
