/**
 * Публикация (ТЗ 8.5; решения 040, 041): состояние для полосы внизу админки,
 * запуск `publish-content` и выгрузка для рабочего процесса.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { UPLOAD_PATH_RE } from '@uzn/shared';
import { z } from 'zod';
import { pendingChanges } from '../domain/content.js';
import { ApiError } from '../domain/errors.js';
import { buildExport, recordExport, refreshRun, runView, startPublish } from '../domain/publish.js';
import { requireAuth, type AppDeps } from './http.js';

const exportQuery = z.object({ runId: z.coerce.number().int().positive().optional() });
const mediaQuery = z.object({ path: z.string().regex(UPLOAD_PATH_RE) });

/** Сравнение за постоянное время: по длине и содержимому токен не угадывается. */
function sameToken(given: string, expected: string): boolean {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (typeof h !== 'string') return null;
  const m = /^Bearer\s+(\S+)$/u.exec(h);
  return m?.[1] ?? null;
}

export function publishRoutes(app: FastifyInstance, deps: AppDeps): void {
  const runner = deps.runner ?? null;
  const repoMedia = deps.repoMedia ?? new Set<string>();
  const ctx = () => ({ store: deps.store, runner, now: deps.now(), repoMedia });

  app.get('/publish/status', { preHandler: requireAuth(deps) }, async () => {
    const run = await refreshRun(ctx());
    const meta = await deps.store.getContentMeta();
    return {
      lastPublishedAt: meta.lastPublishedAt?.toISOString() ?? null,
      pendingChanges: await pendingChanges(deps.store),
      configured: runner !== null,
      run: runView(run),
    };
  });

  app.post('/publish', { preHandler: requireAuth(deps) }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) throw new ApiError('UNAUTHENTICATED');
    const run = await startPublish(ctx(), auth.user);
    return reply.code(202).send({
      runId: run.runId,
      startedAt: run.startedAt.toISOString(),
      run: runView(run),
    });
  });

  // Только по токену выгрузки (ТЗ 8.5): ни сессии, ни cookie. Без
  // настроенного токена эндпоинт закрыт для всех.
  const requireExportToken = async (req: FastifyRequest): Promise<void> => {
    const expected = deps.config.publish.exportToken;
    const given = bearer(req);
    if (!expected || !given || !sameToken(given, expected)) {
      throw new ApiError('UNAUTHENTICATED', 'Потрібен токен вивантаження');
    }
  };

  app.get('/export', { preHandler: requireExportToken }, async (req) => {
    const q = exportQuery.safeParse(req.query);
    if (!q.success) throw new ApiError('VALIDATION_FAILED', 'Невірний номер прогону');
    const now = deps.now();
    const { body, pendingPaths } = await buildExport(deps.store, now);
    if (q.data.runId !== undefined) {
      await recordExport(deps.store, runner, q.data.runId, now, pendingPaths);
    }
    return body;
  });

  // Содержимое неопубликованного файла для рабочего процесса (решение 042).
  // Опубликованные лежат в `content-data`, их рабочий процесс не скачивает.
  app.get('/export/media', { preHandler: requireExportToken }, async (req, reply) => {
    const q = mediaQuery.safeParse(req.query);
    if (!q.success) throw new ApiError('NOT_FOUND', 'Файл не знайдено');
    const data = await deps.store.readUploadData(q.data.path);
    if (!data) throw new ApiError('NOT_FOUND', 'Файл не знайдено');
    return reply.type('application/octet-stream').send(data);
  });
}
