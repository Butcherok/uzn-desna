/** Журнал действий (ТЗ 9.7): только владелец (ТЗ 9.1). */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { readLog } from '../domain/action-log.js';
import { ApiError } from '../domain/errors.js';
import { requireAuth, type AppDeps } from './http.js';

const logQuery = z.object({
  user: z.string().max(64).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
});

export function actionLogRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get('/log', { preHandler: requireAuth(deps, { roles: ['owner'] }) }, async (req) => {
    const q = logQuery.safeParse(req.query);
    if (!q.success) throw new ApiError('VALIDATION_FAILED', 'Невірний фільтр журналу');
    const f = q.data;
    return readLog(deps.store, {
      ...(f.user ? { user: f.user } : {}),
      ...(f.from ? { from: f.from } : {}),
      ...(f.to ? { to: f.to } : {}),
      ...(f.page ? { page: f.page } : {}),
    });
  });
}
