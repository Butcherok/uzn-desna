/**
 * Состояние публикации (ТЗ 8.5, решение 040). С 5г — время последней
 * публикации и число неопубликованных правок для полосы внизу админки;
 * запуск публикации и сведения о прогоне добавляет задача 5д.
 */
import type { FastifyInstance } from 'fastify';
import { pendingChanges } from '../domain/content.js';
import { requireAuth, type AppDeps } from './http.js';

export function publishRoutes(app: FastifyInstance, deps: AppDeps): void {
  app.get('/publish/status', { preHandler: requireAuth(deps) }, async () => {
    const meta = await deps.store.getContentMeta();
    return {
      lastPublishedAt: meta.lastPublishedAt?.toISOString() ?? null,
      pendingChanges: await pendingChanges(deps.store),
      run: null,
    };
  });
}
