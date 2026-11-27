import { readFile } from 'node:fs/promises';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { FeedFile, FeedItem } from '@uzn/shared';
import { buildApp, CSRF_VALUE } from '../app.js';
import { loadConfig } from '../config/env.js';
import type { FeedLoad, FeedSource } from '../domain/feed.js';
import type { Role } from '../domain/model.js';
import { openSession } from '../domain/sessions.js';
import { MemoryStore } from '../gateway/memory-store.js';
import { newUser } from '../gateway/store-contract.js';

const T0 = Date.parse('2026-11-22T10:00:00Z');
const H = { 'x-requested-with': CSRF_VALUE };
const EXPORT_TOKEN = 'e'.repeat(40);

let opened: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of opened) await a.close();
  opened = [];
});

function item(n: number): FeedItem {
  return {
    urlKey: `example.com/news/${n}`,
    url: `https://example.com/news/${n}/`,
    title: `Новина ${n}`,
    sourceId: 'kyivzelenbud',
    sourceName: 'Київзеленбуд',
    sourceDomain: 'example.com',
    lang: 'uk',
    publishedAt: new Date(Date.UTC(2026, 10, 1 + n)).toISOString(),
    excerpt: null,
    category: null,
    imagePath: null,
    via: 'rss',
    fetchedAt: '2026-11-22T09:00:00.000Z',
  };
}

function feedFile(items: FeedItem[]): FeedFile {
  return {
    schemaVersion: 1,
    generatedAt: '2026-11-22T09:00:00.000Z',
    source: 'sync',
    state: items.length > 0 ? 'data' : 'empty',
    items,
    fetchedAt: '2026-11-22T09:00:00.000Z',
    lastSuccessAt: '2026-11-22T09:00:00.000Z',
    sourceErrors: [],
  };
}

class FakeSource implements FeedSource {
  load: () => Promise<FeedLoad>;
  constructor(public result: FeedLoad) {
    this.load = async () => this.result;
  }
}

interface Ctx {
  app: FastifyInstance;
  store: MemoryStore;
  source: FakeSource;
  clock: { t: number };
  as: (role: Role) => (opts: InjectOptions) => Promise<LightMyRequestResponse>;
}

async function setup(
  load: FeedLoad = { file: feedFile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(item)), fresh: true },
): Promise<Ctx> {
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://unused',
    SITE_ORIGIN: 'https://butcherok.github.io',
    EXPORT_TOKEN,
  });
  const store = new MemoryStore();
  const source = new FakeSource(load);
  const clock = { t: T0 };
  const now = () => new Date(clock.t);
  const app = await buildApp({ config, store, now, startedAt: now(), feedSource: source });
  opened.push(app);
  const cookies = new Map<Role, string>();
  for (const role of ['owner', 'editor'] as const) {
    const user = await store.createUser(newUser(role, { role }));
    cookies.set(role, (await openSession(store, user.id, now())).token);
  }
  const as = (role: Role) => (opts: InjectOptions) =>
    app.inject({
      ...opts,
      headers: { ...H, ...(opts.headers ?? {}) },
      cookies: { [config.cookieName]: cookies.get(role) ?? '' },
    });
  return { app, store, source, clock, as };
}

const list = async (ctx: Ctx, role: Role = 'editor') =>
  (await ctx.as(role)({ method: 'GET', url: '/api/v1/feed' })).json();
const hide = (ctx: Ctx, urlKey: string, hidden = true, role: Role = 'editor') =>
  ctx.as(role)({ method: 'POST', url: '/api/v1/feed/hidden', payload: { urlKey, hidden } });

describe('GET /feed (TZ 9.5)', () => {
  it('needs a session; editor and owner both see the feed', async () => {
    const ctx = await setup();
    expect((await ctx.app.inject({ url: '/api/v1/feed' })).statusCode).toBe(401);
    expect((await list(ctx, 'owner')).items).toHaveLength(10);
    const body = await list(ctx, 'editor');
    expect(body.state).toBe('data');
    expect(body.pendingChanges).toBe(0);
  });

  it('newest first; places follow the build: 3 home, all in news by pages', async () => {
    const ctx = await setup();
    const { items } = await list(ctx);
    expect(items[0].title).toBe('Новина 10');
    expect(items.map((i: { place: string }) => i.place)).toEqual([
      'home',
      'home',
      'home',
      'news',
      'news',
      'news',
      'news',
      'news',
      'news',
      'news',
    ]);
    expect(items.map((i: { page: number }) => i.page)).toEqual(Array(10).fill(1));
    // Только поля для показа: текст чужой публикации редактировать нечем.
    expect(Object.keys(items[0]).sort()).toEqual(
      [
        'hidden',
        'hiddenAt',
        'lang',
        'page',
        'place',
        'publishedAt',
        'sourceName',
        'title',
        'url',
        'urlKey',
      ].sort(),
    );
  });

  it('unknown when the feed file cannot be read; the last copy stays', async () => {
    const ctx = await setup({ file: feedFile([item(1)]), fresh: false });
    const body = await list(ctx);
    expect(body.state).toBe('unknown');
    expect(body.items).toHaveLength(1);
    ctx.source.result = { file: null, fresh: false };
    expect(await list(ctx)).toMatchObject({ state: 'unknown', items: [] });
    ctx.source.result = { file: feedFile([]), fresh: true };
    expect(await list(ctx)).toMatchObject({ state: 'empty', items: [] });
  });
});

describe('POST /feed/hidden (TZ 9.5)', () => {
  it('hides: the card moves to the end, the next one takes its place', async () => {
    const ctx = await setup();
    const res = await hide(ctx, 'example.com/news/10');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ hidden: true, changed: true, pendingChanges: 1 });
    const { items } = await list(ctx);
    expect(items.at(-1)).toMatchObject({
      urlKey: 'example.com/news/10',
      hidden: true,
      hiddenAt: new Date(T0).toISOString(),
      place: null,
      page: null,
    });
    expect(items[0].title).toBe('Новина 9');
    expect(items[7]).toMatchObject({ title: 'Новина 2', place: 'news' });
  });

  it('repeating the same decision changes nothing and is not logged again', async () => {
    const ctx = await setup();
    await hide(ctx, 'example.com/news/10');
    const again = await hide(ctx, 'example.com/news/10');
    expect(again.json()).toMatchObject({ changed: false, pendingChanges: 1 });
    expect((await hide(ctx, 'example.com/news/3', false)).json()).toMatchObject({
      changed: false,
      pendingChanges: 1,
    });
    expect(ctx.store.log.filter((l) => l.action.startsWith('feed.'))).toHaveLength(1);
  });

  it('logs who hid what and when; returning is logged too (TZ 9.5, п. 7)', async () => {
    const ctx = await setup();
    await hide(ctx, 'example.com/news/5');
    ctx.clock.t += 60_000;
    await hide(ctx, 'example.com/news/5', false, 'owner');
    const entries = ctx.store.log.filter((l) => l.entity === 'feed');
    expect(entries.map((e) => e.action)).toEqual(['feed.hide', 'feed.show']);
    expect(entries[0]).toMatchObject({
      entityId: 'example.com/news/5',
      result: 'ok',
      details: { title: 'Новина 5', source: 'Київзеленбуд' },
    });
    expect(entries[0]?.userId).not.toBe(entries[1]?.userId);
    expect(entries[1]?.at.toISOString()).toBe(new Date(T0 + 60_000).toISOString());
  });

  it('refuses to hide a card that is not in the feed; returning still works offline', async () => {
    const ctx = await setup();
    const res = await hide(ctx, 'example.com/news/999');
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toBe('Картку не знайдено у стрічці. Оновіть сторінку');
    await hide(ctx, 'example.com/news/2');
    ctx.source.result = { file: null, fresh: false };
    expect((await hide(ctx, 'example.com/news/2', false)).json()).toMatchObject({ changed: true });
  });

  it('validates the body and needs the CSRF header', async () => {
    const ctx = await setup();
    const bad = await ctx.as('editor')({
      method: 'POST',
      url: '/api/v1/feed/hidden',
      payload: { urlKey: 'x', hidden: 'yes' },
    });
    expect(bad.statusCode).toBe(422);
    const noCsrf = await ctx.as('editor')({
      method: 'POST',
      url: '/api/v1/feed/hidden',
      headers: { 'x-requested-with': '' },
      payload: { urlKey: 'example.com/news/1', hidden: true },
    });
    expect(noCsrf.statusCode).toBe(403);
  });

  it('export carries hidden cards only, sorted, and survives a return', async () => {
    const ctx = await setup();
    await hide(ctx, 'example.com/news/7');
    await hide(ctx, 'example.com/news/10');
    await hide(ctx, 'example.com/news/3');
    await hide(ctx, 'example.com/news/3', false);
    const exp = await ctx.app.inject({
      url: '/api/v1/export',
      headers: { authorization: `Bearer ${EXPORT_TOKEN}` },
    });
    const file = exp.json().files['moderation.json'];
    expect(file.source).toBe('admin-export');
    expect(file.items).toEqual([
      { urlKey: 'example.com/news/10', hiddenAt: new Date(T0).toISOString() },
      { urlKey: 'example.com/news/7', hiddenAt: new Date(T0).toISOString() },
    ]);
  });

  it('the build-side file list knows moderation.json (TZ 6.6, п. 3)', async () => {
    const scripts = await readFile(
      new URL('../../../scripts/src/publish/export.ts', import.meta.url),
      'utf8',
    );
    expect(scripts).toContain(`'moderation.json'`);
  });
});
