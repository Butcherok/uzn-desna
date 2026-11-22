import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, CSRF_VALUE } from '../app.js';
import { loadConfig } from '../config/env.js';
import { seedContent } from '../domain/content-seed.js';
import type { Role } from '../domain/model.js';
import { openSession } from '../domain/sessions.js';
import { INITIAL_DATA } from '../gateway/initial-data.js';
import { MemoryStore } from '../gateway/memory-store.js';
import { newUser } from '../gateway/store-contract.js';

let opened: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of opened) await a.close();
  opened = [];
});

async function setup() {
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://unused',
    SITE_ORIGIN: 'https://butcherok.github.io',
  });
  const store = new MemoryStore();
  const clock = { t: Date.parse('2026-11-22T10:00:00Z') };
  const now = () => new Date(clock.t);
  const app = await buildApp({ config, store, now, startedAt: now() });
  opened.push(app);
  const ids = new Map<Role, string>();
  const cookies = new Map<Role, string>();
  for (const role of ['owner', 'editor'] as const) {
    const u = await store.createUser(newUser(role, { role, displayName: `Ім'я ${role}` }));
    ids.set(role, u.id);
    cookies.set(role, (await openSession(store, u.id, now())).token);
  }
  const get = (role: Role | null, query = '') =>
    app.inject({
      url: `/api/v1/log${query}`,
      cookies: role ? { [config.cookieName]: cookies.get(role) ?? '' } : {},
    });
  const as = (role: Role) => (opts: InjectOptions) =>
    app.inject({
      ...opts,
      headers: { 'x-requested-with': CSRF_VALUE },
      cookies: { [config.cookieName]: cookies.get(role) ?? '' },
    });
  return { app, store, clock, ids, get, as };
}

describe('GET /log (TZ 9.7)', () => {
  it('owner only', async () => {
    const ctx = await setup();
    expect((await ctx.get(null)).statusCode).toBe(401);
    expect((await ctx.get('editor')).statusCode).toBe(403);
    expect((await ctx.get('owner')).statusCode).toBe(200);
  });

  it('newest first, 50 per page, names instead of ids, list of users for the filter', async () => {
    const ctx = await setup();
    for (let i = 0; i < 55; i += 1) {
      await ctx.store.appendLog({
        at: new Date(Date.parse('2026-11-22T08:00:00Z') + i * 1000),
        userId: i % 2 ? ctx.ids.get('editor')! : null,
        action: 'x.test',
        entity: null,
        entityId: String(i),
        result: 'ok',
        details: {},
      });
    }
    const p1 = (await ctx.get('owner')).json();
    expect(p1).toMatchObject({ total: 55, page: 1, pages: 2, pageSize: 50 });
    expect(p1.items).toHaveLength(50);
    expect(p1.items[0]).toMatchObject({
      entityId: '54',
      user: null,
      at: '2026-11-22T08:00:54.000Z',
    });
    expect(p1.items[1].user).toEqual({ id: ctx.ids.get('editor'), name: "Ім'я editor" });
    expect(p1.users.map((u: { name: string }) => u.name)).toEqual(["Ім'я editor", "Ім'я owner"]);
    const p2 = (await ctx.get('owner', '?page=2')).json();
    expect(p2.items.map((i: { entityId: string }) => i.entityId)).toEqual([
      '4',
      '3',
      '2',
      '1',
      '0',
    ]);
    expect((await ctx.get('owner', '?user=none')).json().total).toBe(28);
    expect((await ctx.get('owner', `?user=${ctx.ids.get('editor')}`)).json().total).toBe(27);
  });

  it('dates are Kyiv calendar days, inclusive; a bad date is 422', async () => {
    const ctx = await setup();
    const add = (iso: string) =>
      ctx.store.appendLog({
        at: new Date(iso),
        userId: null,
        action: 'x.day',
        entity: null,
        entityId: iso,
        result: 'ok',
        details: {},
      });
    await add('2026-11-20T21:59:00Z'); // 20.11, 23:59 по Киеву
    await add('2026-11-20T22:00:00Z'); // 21.11, 00:00 по Киеву
    await add('2026-11-21T21:59:00Z'); // 21.11, 23:59 по Киеву
    const day = (await ctx.get('owner', '?from=2026-11-21&to=2026-11-21')).json();
    expect(day.items.map((i: { entityId: string }) => i.entityId)).toEqual([
      '2026-11-21T21:59:00Z',
      '2026-11-20T22:00:00Z',
    ]);
    const bad = await ctx.get('owner', '?from=2026-13-01');
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.fields).toEqual({ from: 'Невірна дата' });
  });

  it('content entries carry the record title; nothing to edit or delete the log through the API', async () => {
    const ctx = await setup();
    await seedContent(ctx.store, INITIAL_DATA, new Date(ctx.clock.t));
    const list = (await ctx.as('owner')({ method: 'GET', url: '/api/v1/vacancies' })).json();
    const v = list.items[0];
    await ctx.as('owner')({ method: 'DELETE', url: `/api/v1/vacancies/${v.id}` });
    const entry = (await ctx.get('owner')).json().items[0];
    expect(entry).toMatchObject({ action: 'content.delete', entity: 'vacancies', entityId: v.id });
    expect(typeof entry.details.title).toBe('string');
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE'] as const) {
      const r = await ctx.as('owner')({ method, url: '/api/v1/log' });
      expect(r.statusCode).toBe(404);
    }
  });
});
