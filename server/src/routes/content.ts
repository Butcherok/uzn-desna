/**
 * Эндпоинты контента ТЗ 8.3: один набор маршрутов на каждую сущность
 * реестра `KINDS`. Здесь — только HTTP: разбор запроса, вызов `domain`, ответ.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createRecord,
  getRecord,
  getSingleton,
  listRecords,
  patchRecord,
  pendingChanges,
  purge,
  recordView,
  reorder,
  restore,
  setStatus,
  softDelete,
  type ContentCtx,
  type WriteOptions,
} from '../domain/content.js';
import { KINDS, type KindDef } from '../domain/content-kinds.js';
import type { ContentRecord } from '../domain/model.js';
import { parseBody, requireAuth, type AppDeps } from './http.js';

const flag = z
  .enum(['1', 'true', '0', 'false'])
  .optional()
  .transform((v) => v === '1' || v === 'true');

const listQuery = z.object({ trashed: flag });
const patchQuery = z.object({ confirmSlugChange: flag });
const deleteQuery = z.object({ permanent: flag });
const idParams = z.object({ id: z.string().min(1).max(64) });
const statusBody = z.object({ status: z.enum(['draft', 'published']) });
const orderBody = z.object({ ids: z.array(z.string().min(1).max(64)).max(500) });

export function contentRoutes(app: FastifyInstance, deps: AppDeps): void {
  const auth = { preHandler: requireAuth(deps) };

  const ctx = (req: FastifyRequest): ContentCtx => {
    const user = req.auth?.user;
    // requireAuth уже отказал бы: сюда без пользователя не попасть.
    if (!user) throw new Error('content route without auth');
    return { store: deps.store, now: deps.now(), actor: user };
  };

  const written = async (reply: FastifyReply, record: ContentRecord, code = 200) =>
    reply
      .code(code)
      .header('ETag', etag(record))
      .send({ item: recordView(record), pendingChanges: await pendingChanges(deps.store) });

  for (const def of KINDS) {
    const base = `/${def.kind}`;
    if (def.key === 'singleton') {
      app.get(base, auth, async (_req, reply) => {
        const r = await getSingleton(deps.store, def);
        return reply.header('ETag', etag(r)).send(recordView(r));
      });
      app.patch(base, auth, async (req, reply) =>
        written(reply, await patchRecord(ctx(req), def, null, req.body, writeOpts(req))),
      );
      continue;
    }
    registerList(app, def, base, auth, ctx, written, deps);
  }
}

function registerList(
  app: FastifyInstance,
  def: KindDef,
  base: string,
  auth: { preHandler: ReturnType<typeof requireAuth> },
  ctx: (req: FastifyRequest) => ContentCtx,
  written: (reply: FastifyReply, r: ContentRecord, code?: number) => Promise<FastifyReply>,
  deps: AppDeps,
): void {
  app.get(base, auth, async (req) => {
    const { trashed } = parseBody(listQuery, req.query);
    const items = await listRecords(deps.store, def, trashed);
    return {
      items: items.map(recordView),
      total: items.length,
      pendingChanges: await pendingChanges(deps.store),
    };
  });

  app.post(base, auth, async (req, reply) =>
    written(reply, await createRecord(ctx(req), def, req.body), 201),
  );

  if (def.ordered) {
    // Статический путь `order` Fastify сопоставляет раньше параметра `:id`.
    app.patch(`${base}/order`, auth, async (req) => {
      const { ids } = parseBody(orderBody, req.body);
      const items = await reorder(ctx(req), def, ids);
      return {
        items: items.map(recordView),
        total: items.length,
        pendingChanges: await pendingChanges(deps.store),
      };
    });
  }

  app.get(`${base}/:id`, auth, async (req, reply) => {
    const { id } = parseBody(idParams, req.params);
    const r = await getRecord(deps.store, def, id);
    return reply.header('ETag', etag(r)).send(recordView(r));
  });

  app.patch(`${base}/:id`, auth, async (req, reply) => {
    const { id } = parseBody(idParams, req.params);
    return written(reply, await patchRecord(ctx(req), def, id, req.body, writeOpts(req)));
  });

  app.delete(`${base}/:id`, auth, async (req, reply) => {
    const { id } = parseBody(idParams, req.params);
    const { permanent } = parseBody(deleteQuery, req.query);
    if (permanent) {
      await purge(ctx(req), def, id);
      return reply.send({ pendingChanges: await pendingChanges(deps.store) });
    }
    return written(reply, await softDelete(ctx(req), def, id, writeOpts(req)));
  });

  app.post(`${base}/:id/restore`, auth, async (req, reply) => {
    const { id } = parseBody(idParams, req.params);
    return written(reply, await restore(ctx(req), def, id, writeOpts(req)));
  });

  app.post(`${base}/:id/status`, auth, async (req, reply) => {
    const { id } = parseBody(idParams, req.params);
    const { status } = parseBody(statusBody, req.body);
    return written(reply, await setStatus(ctx(req), def, id, status, writeOpts(req)));
  });
}

function writeOpts(req: FastifyRequest): WriteOptions {
  const ifMatch = req.headers['if-match'];
  const { confirmSlugChange } = parseBody(patchQuery, req.query);
  return { ifMatch: typeof ifMatch === 'string' ? ifMatch : undefined, confirmSlugChange };
}

/** Метка версии записи для `If-Match` (ТЗ 8.3, п. 7). */
function etag(r: ContentRecord): string {
  return `"${r.updatedAt.toISOString()}"`;
}
