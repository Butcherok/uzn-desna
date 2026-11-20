/**
 * Сущности доступа (ТЗ 6.4) и порт хранилища. Слой domain знает только
 * этот интерфейс; MongoDB и хранилище в памяти лежат в gateway.
 */

export type Role = 'owner' | 'editor';

export interface User {
  id: string;
  /** Латиница, не адрес электронной почты (ТЗ 6.4). Хранится в нижнем регистре. */
  login: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
}

export type NewUser = Omit<User, 'id'>;

export interface Session {
  id: string;
  /** SHA-256 от случайных 32 байт. Сам токен не хранится (ТЗ 6.4). */
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
}

export type NewSession = Omit<Session, 'id'>;

export type ActionResult = 'ok' | 'denied' | 'error';

export interface ActionLogEntry {
  at: Date;
  userId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  result: ActionResult;
  /** Без секретов и паролей (ТЗ 6.4). */
  details: Record<string, string | number | boolean | null>;
}

export interface UserPatch {
  passwordHash?: string;
  mustChangePassword?: boolean;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
}

export interface Store {
  /** Короткая проверка связи с БД для `/health`. */
  ping(): Promise<boolean>;

  countUsers(): Promise<number>;
  findUserByLogin(login: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  /** Бросает `DuplicateKeyError`, если логин занят. */
  createUser(user: NewUser): Promise<User>;
  updateUser(id: string, patch: UserPatch): Promise<void>;

  createSession(session: NewSession): Promise<Session>;
  findSessionByTokenHash(tokenHash: string): Promise<Session | null>;
  touchSession(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void>;
  deleteSession(id: string): Promise<void>;
  /** Удаляет сессии пользователя, кроме `exceptId`. */
  deleteUserSessions(userId: string, exceptId?: string): Promise<void>;
  /** Действующие сессии пользователя, от новых к старым. */
  listUserSessions(userId: string, now: Date): Promise<Session[]>;

  appendLog(entry: ActionLogEntry): Promise<void>;
}

export class DuplicateKeyError extends Error {
  constructor(message = 'duplicate key') {
    super(message);
    this.name = 'DuplicateKeyError';
  }
}

/** Ошибка связи с БД: отдаётся как 503 `DB_UNAVAILABLE` (ТЗ 8.1, п. 4). */
export class StoreUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('database unavailable', { cause });
    this.name = 'StoreUnavailableError';
  }
}
