import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  LOGIN_RE,
  changePasswordBodySchema,
  loginBodySchema,
  normalizeLogin,
} from '../domain/auth-schemas.js';
import { ApiError, LOGIN_FAILED_MESSAGE } from '../domain/errors.js';
import {
  checkNewPassword,
  getDummyHash,
  hashPassword,
  verifyPassword,
} from '../domain/password.js';
import { hashSessionToken, openSession, resolveSession } from '../domain/sessions.js';
import {
  clearSessionCookie,
  parseBody,
  requireAuth,
  setSessionCookie,
  userView,
  type AppDeps,
} from './http.js';

/** ТЗ 8.1, п. 6: 10 попыток входа за 15 минут на пару «логин + адрес». */
export const LOGIN_RATE = { max: 10, timeWindow: 15 * 60 * 1000 } as const;

function loginRateKey(req: FastifyRequest): string {
  const body = req.body as { login?: unknown } | null | undefined;
  const login = typeof body?.login === 'string' ? normalizeLogin(body.login).slice(0, 64) : '';
  return `login:${login}:${req.ip}`;
}

export function authRoutes(app: FastifyInstance, deps: AppDeps): void {
  const { store, config } = deps;

  /** Смена пароля перебирает текущий пароль — тот же предел, ключ — сессия. */
  const passwordRateKey = (req: FastifyRequest): string => {
    const raw = req.cookies[config.cookieName];
    return `password:${raw ? hashSessionToken(raw) : req.ip}`;
  };

  app.post(
    '/auth/login',
    { config: { rateLimit: { ...LOGIN_RATE, hook: 'preHandler', keyGenerator: loginRateKey } } },
    async (req, reply) => {
      const body = parseBody(loginBodySchema, req.body);
      const login = normalizeLogin(body.login);
      const now = deps.now();

      const user = LOGIN_RE.test(login) ? await store.findUserByLogin(login) : null;
      // bcrypt считается всегда, даже без пользователя: время ответа не выдаёт,
      // существует ли логин (ТЗ 8.2, п. 3).
      const hash = user?.passwordHash ?? (await getDummyHash());
      const verifyStart = performance.now();
      const passwordOk = (await verifyPassword(body.password, hash)) && user !== null;
      // Время проверки пароля — для замера bcrypt на Render (решение 037). Оно
      // одинаково для любого логина, поэтому ничего не выдаёт.
      reply.header('Server-Timing', `pw;dur=${Math.round(performance.now() - verifyStart)}`);

      if (!user || !passwordOk || !user.active) {
        // Неизвестный логин пишется без введённого текста: в поле логина
        // иногда вводят пароль (ТЗ 9.7, п. 6).
        await store.appendLog({
          at: now,
          userId: user?.id ?? null,
          action: 'auth.login',
          entity: 'user',
          entityId: user?.id ?? null,
          result: 'denied',
          details: { reason: user ? (user.active ? 'bad-password' : 'inactive') : 'unknown-login' },
        });
        throw new ApiError('UNAUTHENTICATED', LOGIN_FAILED_MESSAGE);
      }

      // Прежняя сессия этого браузера закрывается: новый вход — новый токен.
      const previous = await resolveSession(store, req.cookies[config.cookieName], now);
      if (previous) await store.deleteSession(previous.session.id);

      const { token } = await openSession(store, user.id, now);
      await store.updateUser(user.id, { lastLoginAt: now });
      await store.appendLog({
        at: now,
        userId: user.id,
        action: 'auth.login',
        entity: 'user',
        entityId: user.id,
        result: 'ok',
        details: {},
      });
      setSessionCookie(reply, config, token);
      return userView(user);
    },
  );

  // Выход повторяем безопасно: без сессии тоже 204 и погашенная cookie.
  app.post('/auth/logout', async (req, reply) => {
    const now = deps.now();
    const resolved = await resolveSession(store, req.cookies[config.cookieName], now);
    if (resolved) {
      await store.deleteSession(resolved.session.id);
      await store.appendLog({
        at: now,
        userId: resolved.user.id,
        action: 'auth.logout',
        entity: 'user',
        entityId: resolved.user.id,
        result: 'ok',
        details: {},
      });
    }
    clearSessionCookie(reply, config);
    return reply.code(204).send();
  });

  app.get(
    '/auth/me',
    { preHandler: requireAuth(deps, { allowPendingPasswordChange: true }) },
    async (req) => userView(req.auth!.user),
  );

  app.post(
    '/auth/password',
    {
      preHandler: requireAuth(deps, { allowPendingPasswordChange: true }),
      config: { rateLimit: { ...LOGIN_RATE, hook: 'preHandler', keyGenerator: passwordRateKey } },
    },
    async (req) => {
      const { user, session } = req.auth!;
      const body = parseBody(changePasswordBodySchema, req.body);
      const now = deps.now();

      if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
        await store.appendLog({
          at: now,
          userId: user.id,
          action: 'auth.password',
          entity: 'user',
          entityId: user.id,
          result: 'denied',
          details: { reason: 'bad-current-password' },
        });
        throw new ApiError('VALIDATION_FAILED', 'Поточний пароль введено неправильно', {
          fields: { currentPassword: 'Невірний поточний пароль' },
        });
      }
      const check = checkNewPassword(body.newPassword, user.login);
      if (!check.ok) {
        throw new ApiError('VALIDATION_FAILED', check.message, {
          fields: { newPassword: check.message ?? 'Невірне значення' },
        });
      }
      if (body.newPassword === body.currentPassword) {
        const message = 'Новий пароль має відрізнятися від поточного';
        throw new ApiError('VALIDATION_FAILED', message, { fields: { newPassword: message } });
      }

      await store.updateUser(user.id, {
        passwordHash: await hashPassword(body.newPassword),
        passwordChangedAt: now,
        mustChangePassword: false,
      });
      // ТЗ 9.2, п. 3: смена пароля отзывает все остальные сессии пользователя.
      await store.deleteUserSessions(user.id, session.id);
      await store.appendLog({
        at: now,
        userId: user.id,
        action: 'auth.password',
        entity: 'user',
        entityId: user.id,
        result: 'ok',
        details: {},
      });
      return userView({ ...user, mustChangePassword: false });
    },
  );
}
