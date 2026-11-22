/** Резервные копии (ТЗ 9.6; 9.1 — только владелец; решение 045). */
import type { FastifyInstance } from 'fastify';
import { backupStatus, startBackup } from '../domain/backup.js';
import { ApiError } from '../domain/errors.js';
import { requireAuth, type AppDeps } from './http.js';

export const BACKUP_WORKFLOW = 'backup.yml';

export function backupRoutes(app: FastifyInstance, deps: AppDeps): void {
  const ctx = () => ({
    store: deps.store,
    runner: deps.backupRunner ?? null,
    now: deps.now(),
    workflowUrl: `https://github.com/${deps.config.publish.repository}/actions/workflows/${BACKUP_WORKFLOW}`,
  });
  const owner = { preHandler: requireAuth(deps, { roles: ['owner'] }) };

  app.get('/backup', owner, async () => backupStatus(ctx()));

  app.post('/backup', owner, async (req, reply) => {
    const auth = req.auth;
    if (!auth) throw new ApiError('UNAUTHENTICATED');
    return reply.code(202).send(await startBackup(ctx(), auth.user));
  });
}
