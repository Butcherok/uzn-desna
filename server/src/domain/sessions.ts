import { createHash, randomBytes } from 'node:crypto';
import type { Session, Store, User } from './model.js';

/** ТЗ 8.2, п. 1 и 6.4: срок 12 часов, продление при активности, не более 5 сессий. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const MAX_SESSIONS_PER_USER = 5;
/** Продлевать не чаще раза в 5 минут: иначе каждый запрос — запись в БД. */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Токен из cookie: 32 байта в base64url — ровно 43 знака. Остальное не ищем в БД. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedToken(token: string | undefined): token is string {
  return token !== undefined && TOKEN_RE.test(token);
}

/** Создаёт сессию и вытесняет самые старые сверх предела. Отдаёт токен для cookie. */
export async function openSession(
  store: Store,
  userId: string,
  now: Date,
): Promise<{ token: string; session: Session }> {
  const token = newSessionToken();
  const session = await store.createSession({
    tokenHash: hashSessionToken(token),
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    lastSeenAt: now,
  });
  const active = await store.listUserSessions(userId, now);
  for (const old of active.slice(MAX_SESSIONS_PER_USER)) {
    await store.deleteSession(old.id);
  }
  return { token, session };
}

export interface ResolvedSession {
  session: Session;
  user: User;
  /** Срок продлён: cookie нужно выставить заново с новым сроком. */
  renewed: boolean;
}

/**
 * Находит действующую сессию по токену. Просроченная удаляется; сессия
 * заблокированного пользователя гасится немедленно (ТЗ 9.2, п. 7).
 */
export async function resolveSession(
  store: Store,
  token: string | undefined,
  now: Date,
): Promise<ResolvedSession | null> {
  if (!isWellFormedToken(token)) return null;
  const session = await store.findSessionByTokenHash(hashSessionToken(token));
  if (!session) return null;
  if (session.expiresAt.getTime() <= now.getTime()) {
    await store.deleteSession(session.id);
    return null;
  }
  const user = await store.findUserById(session.userId);
  if (!user || !user.active) {
    await store.deleteSession(session.id);
    return null;
  }
  let renewed = false;
  if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await store.touchSession(session.id, now, expiresAt);
    session.lastSeenAt = now;
    session.expiresAt = expiresAt;
    renewed = true;
  }
  return { session, user, renewed };
}
