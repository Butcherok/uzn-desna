import { randomUUID } from 'node:crypto';
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

/**
 * Хранилище в памяти: для тестов и локального запуска без MongoDB.
 * Ведёт себя как MongoStore в том, что проверяют тесты: уникальный логин,
 * порядок сессий, только добавление в журнал. Отдаёт копии, а не ссылки.
 */
export class MemoryStore implements Store {
  readonly users = new Map<string, User>();
  readonly sessions = new Map<string, Session>();
  readonly log: ActionLogEntry[] = [];
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
}
