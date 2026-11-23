import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, CSRF_VALUE } from '../app.js';
import { loadConfig } from '../config/env.js';
import { seedContent } from '../domain/content-seed.js';
import type { Role } from '../domain/model.js';
import { openSession } from '../domain/sessions.js';
import { GitHubSyncStatus, SYNC_STATUS_CACHE_TTL_MS } from '../gateway/sync-status.js';
import { INITIAL_DATA } from '../gateway/initial-data.js';
import { MemoryStore } from '../gateway/memory-store.js';
import { newUser } from '../gateway/store-contract.js';

let opened: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of opened) await a.close();
  opened = [];
});

const STATE = {
  schemaVersion: 1,
  generatedAt: '2026-11-23T18:26:48.900Z',
  source: 'sync',
  items: [
    {
      source: 'prozorro',
      lastRunAt: '2026-11-23T18:26:48.900Z',
      lastSuccessAt: '2026-11-23T15:25:29.019Z',
      result: 'error',
      errorCode: 'SRC_HTTP_4XX',
      errorMessage: null,
      itemsFetched: 0,
      itemsNew: 0,
      consecutiveFailures: 1,
    },
  ],
};

const RUNS = {
  workflow_runs: [
    {
      id: 45238416623,
      event: 'workflow_dispatch',
      created_at: '2026-11-23T18:26:31Z',
      status: 'completed',
      conclusion: 'success',
    },
    { id: 7, event: 'schedule', created_at: '2026-11-23T13:00:00Z', status: 'in_progress' },
    {
      id: 8,
      event: 'push',
      created_at: '2026-11-23T12:00:00Z',
      status: 'completed',
      conclusion: 'failure',
    },
  ],
};

interface Calls {
  urls: string[];
  auth: (string | null)[];
}

function fakeFetch(plan: { state?: number; runs?: number }, calls: Calls): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.urls.push(url);
    calls.auth.push(new Headers(init?.headers).get('authorization'));
    const isRuns = url.startsWith('https://api.github.com/');
    const status = (isRuns ? plan.runs : plan.state) ?? 200;
    return new Response(JSON.stringify(isRuns ? RUNS : STATE), { status });
  }) as typeof fetch;
}

async function setup(source: GitHubSyncStatus | null) {
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://unused',
    SITE_ORIGIN: 'https://butcherok.github.io',
    BUILD_VERSION: 'abc1234',
  });
  const store = new MemoryStore();
  const now = () => new Date('2026-11-23T19:00:00Z');
  await seedContent(store, INITIAL_DATA, now());
  const app = await buildApp({ config, store, now, startedAt: now(), syncStatus: source });
  opened.push(app);
  const cookies = new Map<Role, string>();
  for (const role of ['owner', 'editor'] as const) {
    const u = await store.createUser(newUser(role, { role, displayName: role }));
    cookies.set(role, (await openSession(store, u.id, now())).token);
  }
  const as = (role: Role) => (opts: InjectOptions) =>
    app.inject({
      ...opts,
      headers: { 'x-requested-with': CSRF_VALUE },
      cookies: { [config.cookieName]: cookies.get(role) ?? '' },
    });
  return { as };
}

describe('«Стан системи» (ТЗ 8.6, 9.1; решение 049)', () => {
  it('only the owner; editor 403', async () => {
    const ctx = await setup(null);
    expect((await ctx.as('editor')({ url: '/api/v1/system/info' })).statusCode).toBe(403);
    expect((await ctx.as('editor')({ url: '/api/v1/system/sync' })).statusCode).toBe(403);
  });

  it('/system/info: version, start, counts by section, publication', async () => {
    const ctx = await setup(null);
    const body = (await ctx.as('owner')({ url: '/api/v1/system/info' })).json();
    expect(body).toMatchObject({
      version: 'abc1234',
      startedAt: '2026-11-23T19:00:00.000Z',
      pendingChanges: 0,
    });
    const services = body.counts.find((c: { kind: string }) => c.kind === 'services');
    expect(services.total).toBe((INITIAL_DATA.services as { items: unknown[] }).items.length);
    expect(services.published).toBe(services.total);
    expect(body.counts.some((c: { kind: string }) => c.kind === 'enterprise')).toBe(false);
  });

  it('/system/sync: sources from sync-state, runs from Actions with the token', async () => {
    const calls: Calls = { urls: [], auth: [] };
    const src = new GitHubSyncStatus({
      repository: 'o/r',
      token: 'github_pat_TEST',
      fetch: fakeFetch({}, calls),
    });
    const ctx = await setup(src);
    const body = (await ctx.as('owner')({ url: '/api/v1/system/sync' })).json();
    expect(body.sources[0]).toMatchObject({ source: 'prozorro', consecutiveFailures: 1 });
    expect(body.runs).toEqual([
      {
        id: 45238416623,
        event: 'workflow_dispatch',
        createdAt: '2026-11-23T18:26:31Z',
        state: 'success',
        url: 'https://github.com/o/r/actions/runs/45238416623',
      },
      expect.objectContaining({ id: 7, event: 'schedule', state: 'in_progress' }),
      expect.objectContaining({ id: 8, event: 'other', state: 'failure' }),
    ]);
    // Файл состояния — без токена, прогоны — с ним.
    expect(calls.urls[calls.auth.indexOf(null)]).toContain(
      'raw.githubusercontent.com/o/r/sync-data',
    );
    expect(calls.auth.filter(Boolean)).toEqual(['Bearer github_pat_TEST']);
  });

  it('failure is «unknown», not empty; a later failure keeps the last copy', async () => {
    const calls: Calls = { urls: [], auth: [] };
    const plan: { state?: number; runs?: number } = { state: 500, runs: 401 };
    const t = { now: 0 };
    const warns: string[] = [];
    const src = new GitHubSyncStatus({
      repository: 'o/r',
      token: 'github_pat_SECRET',
      fetch: fakeFetch(plan, calls),
      now: () => t.now,
      warn: (m) => warns.push(m),
    });
    expect(await src.state()).toEqual({ value: null, fresh: false });
    expect(await src.runs()).toEqual({ value: null, fresh: false });
    expect(warns.join(' ')).not.toContain('SECRET');

    plan.state = 200;
    plan.runs = 200;
    t.now += SYNC_STATUS_CACHE_TTL_MS - 1;
    expect((await src.state()).value).toBeNull(); // ещё кэш
    t.now += 2;
    expect((await src.state()).fresh).toBe(true);

    plan.state = 503;
    t.now += SYNC_STATUS_CACHE_TTL_MS + 1;
    const stale = await src.state();
    expect(stale.fresh).toBe(false);
    expect(stale.value?.items[0]?.source).toBe('prozorro');
  });

  it('without a token runs are «not configured», sync-state is still read', async () => {
    const calls: Calls = { urls: [], auth: [] };
    const src = new GitHubSyncStatus({
      repository: 'o/r',
      token: null,
      fetch: fakeFetch({}, calls),
    });
    expect(await src.runs()).toEqual({ value: null, fresh: true });
    expect((await src.state()).value?.items).toHaveLength(1);
    expect(calls.urls.every((u) => !u.includes('api.github.com'))).toBe(true);
  });
});
