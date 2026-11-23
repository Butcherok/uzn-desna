/** «Стан системи» (ТЗ 8.6, 9.1 — только владелец; решение 049). */
import type { FastifyInstance } from 'fastify';
import { syncStatusView, systemInfo } from '../domain/system.js';
import { requireAuth, type AppDeps } from './http.js';

export function systemRoutes(app: FastifyInstance, deps: AppDeps): void {
  const owner = { preHandler: requireAuth(deps, { roles: ['owner'] }) };

  app.get('/system/info', owner, async () =>
    systemInfo(deps.store, deps.config.version, deps.startedAt),
  );

  app.get('/system/sync', owner, async () => {
    const source = deps.syncStatus;
    if (!source) {
      return syncStatusView({ value: null, fresh: false }, { value: null, fresh: true });
    }
    const [state, runs] = await Promise.all([source.state(), source.runs()]);
    return syncStatusView(state, runs);
  });
}
