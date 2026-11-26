import { randomUUID } from 'node:crypto';
import {
  DuplicateKeyError,
  StoreUnavailableError,
  type ActionLogEntry,
  type ActionLogRecord,
  type LogQuery,
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
  readonly uploads = new Map<string, UploadRecord>();
  readonly moderation = new Map<string, ModerationRecord>();
  meta: ContentMeta = { seededAt: null, lastPublishedAt: null, purgedPending: 0, lastRun: null };
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

  async purgeRetiredKind(kind: string): Promise<number> {
    this.check();
    let n = 0;
    for (const [id, r] of this.content) {
      if (r.kind === kind && this.content.delete(id)) n += 1;
    }
    return n;
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
    return { ...this.meta, lastRun: this.meta.lastRun ? { ...this.meta.lastRun } : null };
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

  async setPublishRun(run: PublishRun): Promise<void> {
    this.check();
    this.meta = { ...this.meta, lastRun: { ...run } };
  }

  async patchPublishRun(
    runId: number,
    patch: Partial<Omit<PublishRun, 'runId'>>,
  ): Promise<boolean> {
    this.check();
    if (this.meta.lastRun?.runId !== runId) return false;
    this.meta = { ...this.meta, lastRun: { ...this.meta.lastRun, ...patch } };
    return true;
  }

  async finishPublishRun(runId: number, finish: PublishFinish): Promise<boolean> {
    this.check();
    const run = this.meta.lastRun;
    if (run?.runId !== runId || run.result !== 'in_progress') return false;
    this.meta = {
      ...this.meta,
      lastRun: { ...run, result: finish.result, finishedAt: finish.finishedAt },
      lastPublishedAt: finish.publishedAt ?? this.meta.lastPublishedAt,
      purgedPending: Math.max(0, this.meta.purgedPending - finish.purgedDelta),
    };
    return true;
  }

  async insertUpload(upload: UploadRecord): Promise<void> {
    this.check();
    if (this.uploads.has(upload.path)) throw new DuplicateKeyError();
    this.uploads.set(upload.path, copyUpload(upload));
  }

  async listUploads(): Promise<UploadMeta[]> {
    this.check();
    return [...this.uploads.values()].map(metaOf);
  }

  async findUpload(path: string): Promise<UploadMeta | null> {
    this.check();
    const u = this.uploads.get(path);
    return u ? metaOf(u) : null;
  }

  async readUploadData(path: string): Promise<Buffer | null> {
    this.check();
    const data = this.uploads.get(path)?.data;
    return data ? Buffer.from(data) : null;
  }

  async setUploadDeleteRequested(path: string, at: Date | null): Promise<boolean> {
    this.check();
    const u = this.uploads.get(path);
    if (!u) return false;
    this.uploads.set(path, { ...u, deleteRequestedAt: at });
    return true;
  }

  async deleteUpload(path: string): Promise<boolean> {
    this.check();
    return this.uploads.delete(path);
  }

  async settleUploads(snapshotAt: Date, exported: readonly string[]): Promise<void> {
    this.check();
    const t = snapshotAt.getTime();
    const sent = new Set(exported);
    for (const [path, u] of this.uploads) {
      if (u.deleteRequestedAt !== null && u.deleteRequestedAt.getTime() <= t) {
        this.uploads.delete(path);
      } else if (u.publishedAt === null && sent.has(path)) {
        this.uploads.set(path, { ...u, publishedAt: snapshotAt, data: null });
      }
    }
  }

  private assertKeyFree(kind: ContentKind, key: string, exceptId: string | null): void {
    for (const r of this.content.values()) {
      if (r.kind === kind && r.key === key && r.id !== exceptId) throw new DuplicateKeyError();
    }
  }

  async listLog(q: LogQuery): Promise<{ items: ActionLogRecord[]; total: number }> {
    this.check();
    const matched = this.log
      .map((e, i) => ({ ...e, details: { ...e.details }, id: String(i) }))
      .filter(
        (e) =>
          (q.userId === undefined || e.userId === q.userId) &&
          (q.action === undefined || e.action === q.action) &&
          (q.from === undefined || e.at.getTime() >= q.from.getTime()) &&
          (q.to === undefined || e.at.getTime() < q.to.getTime()),
      )
      // Новые первыми; при равном времени — позже добавленная.
      .sort((a, b) => b.at.getTime() - a.at.getTime() || Number(b.id) - Number(a.id));
    return { items: matched.slice(q.skip, q.skip + q.limit), total: matched.length };
  }

  async listUsers(): Promise<User[]> {
    this.check();
    return [...this.users.values()].map((u) => ({ ...u }));
  }

  async listModeration(): Promise<ModerationRecord[]> {
    this.check();
    return [...this.moderation.values()].map((m) => ({ ...m }));
  }

  async findModeration(urlKey: string): Promise<ModerationRecord | null> {
    this.check();
    const m = this.moderation.get(urlKey);
    return m ? { ...m } : null;
  }

  async upsertModeration(record: ModerationRecord): Promise<void> {
    this.check();
    this.moderation.set(record.urlKey, { ...record });
  }

  async countModerationChangedSince(since: Date | null): Promise<number> {
    this.check();
    let n = 0;
    for (const m of this.moderation.values()) {
      if (since === null || m.updatedAt.getTime() > since.getTime()) n += 1;
    }
    return n;
  }
}

/** Глубокая копия: `data` — вложенные объекты, наружу ссылки не уходят. */
function copyRecord(r: ContentRecord): ContentRecord {
  return { ...r, data: structuredClone(r.data) };
}

function copyUpload(u: UploadRecord): UploadRecord {
  return { ...u, data: u.data ? Buffer.from(u.data) : null };
}

function metaOf(u: UploadRecord): UploadMeta {
  const meta: Partial<UploadRecord> = { ...u };
  delete meta.data;
  return meta as UploadMeta;
}
