import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import { ApiError } from '../domain/errors.js';
import type { ResolvedSession } from '../domain/sessions.js';
import { SESSION_TTL_MS, resolveSession } from '../domain/sessions.js';
import type { Role, Store, User } from '../domain/model.js';
import type { AdminAssets } from '../gateway/admin-assets.js';
import type { WorkflowRunner } from '../domain/publish.js';

/** Зависимости приложения: всё внешнее передаётся сюда, а не импортируется. */
export interface AppDeps {
  config: AppConfig;
  store: Store;
  now: () => Date;
  startedAt: Date;
  /** Собранная админка (решение 040); `null` или нет — сборки нет. */
  adminAssets?: AdminAssets | null;
  /** Запуск `publish-content` (решение 041); `null` или нет — публикация не настроена. */
  runner?: WorkflowRunner | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: ResolvedSession | null;
  }
}

/** Проверка тела схемой Zod: непрошедшее — 422 с перечнем полей (ТЗ 8.3, п. 1). */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const r = schema.safeParse(body ?? {});
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= 'Невірне значення';
  }
  throw new ApiError('VALIDATION_FAILED', undefined, { fields });
}

export function userView(u: User): {
  login: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
} {
  return {
    login: u.login,
    displayName: u.displayName,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
  };
}

export function setSessionCookie(reply: FastifyReply, config: AppConfig, token: string): void {
  reply.setCookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: '/',
  });
}

export interface AuthOptions {
  /** Пропустить при `mustChangePassword` (ТЗ 8.2, п. 6): только `/auth/me`, `/auth/password`, выход. */
  allowPendingPasswordChange?: boolean;
  roles?: readonly Role[];
}

/**
 * Обработчик `preHandler`, требующий входа. Используется всеми закрытыми
 * эндпоинтами; эндпоинты контента (задача 5в) подключают его же.
 */
export function requireAuth(deps: AppDeps, opts: AuthOptions = {}) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const resolved = await resolveSession(
      deps.store,
      req.cookies[deps.config.cookieName],
      deps.now(),
    );
    if (!resolved) {
      clearSessionCookie(reply, deps.config);
      throw new ApiError('UNAUTHENTICATED');
    }
    if (resolved.renewed) {
      const token = req.cookies[deps.config.cookieName];
      if (token) setSessionCookie(reply, deps.config, token);
    }
    if (resolved.user.mustChangePassword && !opts.allowPendingPasswordChange) {
      throw new ApiError('FORBIDDEN', 'Спочатку змініть тимчасовий пароль');
    }
    if (opts.roles && !opts.roles.includes(resolved.user.role)) {
      throw new ApiError('FORBIDDEN');
    }
    req.auth = resolved;
  };
}
