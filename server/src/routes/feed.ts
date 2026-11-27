/**
 * «Стрічка новин» в админке (ТЗ 9.5; решение 043): карточки ленты и их
 * скрытие. Владелец и редактор (ТЗ 9.1).
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pendingChanges } from '../domain/content.js';
import { ApiError } from '../domain/errors.js';
import { feedView, loadFeed, setFeedHidden } from '../domain/feed.js';
import { parseBody, requireAuth, type AppDeps } from './http.js';

const hideBody = z.object({
  urlKey: z.string().min(3).max(500),
  hidden: z.boolean(),
});

export function feedRoutes(app: FastifyInstance, deps: AppDeps): void {
  const source = deps.feedSource ?? null;

  app.get('/feed', { preHandler: requireAuth(deps) }, async () => {
    const [load, decisions] = await Promise.all([loadFeed(source), deps.store.listModeration()]);
    return { ...feedView(load, decisions), pendingChanges: await pendingChanges(deps.store) };
  });

  app.post('/feed/hidden', { preHandler: requireAuth(deps) }, async (req) => {
    const auth = req.auth;
    if (!auth) throw new ApiError('UNAUTHENTICATED');
    const body = parseBody(hideBody, req.body);
    const { changed } = await setFeedHidden(
      { store: deps.store, source, now: deps.now() },
      auth.user,
      body.urlKey,
      body.hidden,
    );
    return { hidden: body.hidden, changed, pendingChanges: await pendingChanges(deps.store) };
  });
}
