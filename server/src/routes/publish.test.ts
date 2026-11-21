import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, CSRF_VALUE } from '../app.js';
import { loadConfig } from '../config/env.js';
import { KINDS } from '../domain/content-kinds.js';
import { mediaPathsIn, seedContent } from '../domain/content-seed.js';
import type { Role } from '../domain/model.js';
import { RUN_STALE_MS, RunnerUnavailableError, type RunState } from '../domain/publish.js';
import type { WorkflowRunner } from '../domain/publish.js';
import { openSession } from '../domain/sessions.js';
import { INITIAL_DATA } from '../gateway/initial-data.js';
import { MemoryStore } from '../gateway/memory-store.js';
import { newUser } from '../gateway/store-contract.js';

const T0 = Date.parse('2026-11-21T10:00:00Z');
const H = { 'x-requested-with': CSRF_VALUE };
const EXPORT_TOKEN = 'e'.repeat(40);

let opened: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of opened) await a.close();
  opened = [];
});

class FakeRunner implements WorkflowRunner {
  next = 1000;
  states = new Map<number, RunState>();
  dispatched: number[] = [];
  failDispatch = false;
  failGet = false;
  async dispatch() {
    if (this.failDispatch) throw new RunnerUnavailableError('down');
    const runId = (this.next += 1);
    this.dispatched.push(runId);
    this.states.set(runId, 'in_progress');
    return { runId, runUrl: this.runUrl(runId) };
  }
  async getRun(runId: number) {
    if (this.failGet) throw new RunnerUnavailableError('down');
    return this.states.get(runId) ?? 'missing';
  }
  runUrl(runId: number) {
    return `https://github.com/o/r/actions/runs/${runId}`;
  }
}

interface Ctx {
  app: FastifyInstance;
  store: MemoryStore;
  runner: FakeRunner;
  clock: { t: number };
  as: (role: Role) => (opts: InjectOptions) => Promise<LightMyRequestResponse>;
  exportAs: (token: string | null, query?: string) => Promise<LightMyRequestResponse>;
}

async function setup({ runner = true, exportToken = true } = {}): Promise<Ctx> {
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://unused',
    SITE_ORIGIN: 'https://butcherok.github.io',
    ...(exportToken ? { EXPORT_TOKEN } : {}),
  });
  const store = new MemoryStore();
  const fake = new FakeRunner();
  const clock = { t: T0 };
  const now = () => new Date(clock.t);
  const app = await buildApp({
    config,
    store,
    now,
    startedAt: now(),
    runner: runner ? fake : null,
    repoMedia: mediaPathsIn(INITIAL_DATA),
  });
  opened.push(app);
  await seedContent(store, INITIAL_DATA, now());
  const cookies = new Map<Role, string>();
  for (const role of ['owner', 'editor'] as const) {
    const user = await store.createUser(newUser(role, { role, displayName: `Ім'я ${role}` }));
    cookies.set(role, (await openSession(store, user.id, now())).token);
  }
  const as = (role: Role) => (opts: InjectOptions) =>
    app.inject({
      ...opts,
      headers: { ...H, ...(opts.headers ?? {}) },
      cookies: { [config.cookieName]: cookies.get(role) ?? '' },
    });
  const exportAs = (token: string | null, query = '') =>
    app.inject({
      url: `/api/v1/export${query}`,
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
    });
  return { app, store, runner: fake, clock, as, exportAs };
}

const tick = (ctx: Ctx, ms = 1000) => {
  ctx.clock.t += ms;
};
const publish = (ctx: Ctx, role: Role = 'editor') =>
  ctx.as(role)({ method: 'POST', url: '/api/v1/publish' });
const status = async (ctx: Ctx) =>
  (await ctx.as('editor')({ method: 'GET', url: '/api/v1/publish/status' })).json();

async function editFirstContact(ctx: Ctx): Promise<void> {
  const list = (await ctx.as('owner')({ method: 'GET', url: '/api/v1/contacts' })).json();
  const id = list.items[0].id as string;
  const res = await ctx.as('owner')({
    method: 'PATCH',
    url: `/api/v1/contacts/${id}`,
    payload: { hours: { uk: 'Пн–Пт 08:00–17:00' } },
  });
  expect(res.statusCode).toBe(200);
}

describe('GET /export (TZ 8.5)', () => {
  it('needs the export token, not a session', async () => {
    const ctx = await setup();
    expect((await ctx.exportAs(null)).statusCode).toBe(401);
    expect((await ctx.exportAs('x'.repeat(40))).statusCode).toBe(401);
    expect((await ctx.as('owner')({ url: '/api/v1/export' })).statusCode).toBe(401);
    expect((await ctx.exportAs(EXPORT_TOKEN)).statusCode).toBe(200);
  });

  it('is closed for everyone when no token is configured', async () => {
    const ctx = await setup({ exportToken: false });
    expect((await ctx.exportAs(EXPORT_TOKEN)).statusCode).toBe(401);
  });

  it('returns every data file in the 6.6 envelope, published records only', async () => {
    const ctx = await setup();
    const body = (await ctx.exportAs(EXPORT_TOKEN)).json();
    expect(Object.keys(body.files).sort()).toEqual(KINDS.map((k) => `${k.kind}.json`).sort());
    for (const file of Object.values(body.files) as { source: string; schemaVersion: number }[]) {
      expect(file.source).toBe('admin-export');
      expect(file.schemaVersion).toBe(1);
    }
    const drafts = (INITIAL_DATA.vacancies as { items: { status: string }[] }).items.filter(
      (v) => v.status === 'draft',
    ).length;
    const all = (INITIAL_DATA.vacancies as { items: unknown[] }).items.length;
    expect(body.files['vacancies.json'].items).toHaveLength(all - drafts);
    // Записи версии 1 выгружаются как есть: файл совпадает по содержимому.
    expect(body.files['leaders.json'].items).toEqual(
      (INITIAL_DATA.leaders as { items: unknown[] }).items,
    );
  });

  it('leaves trashed records out', async () => {
    const ctx = await setup();
    const list = (await ctx.as('owner')({ method: 'GET', url: '/api/v1/scenarios' })).json();
    await ctx.as('owner')({ method: 'DELETE', url: `/api/v1/scenarios/${list.items[0].id}` });
    const body = (await ctx.exportAs(EXPORT_TOKEN)).json();
    expect(body.files['scenarios.json'].items).toHaveLength(list.items.length - 1);
  });

  it('rejects a malformed run number', async () => {
    const ctx = await setup();
    expect((await ctx.exportAs(EXPORT_TOKEN, '?runId=abc')).statusCode).toBe(422);
  });
});

describe('POST /publish (TZ 8.5)', () => {
  it('dispatches the workflow and reports the run', async () => {
    const ctx = await setup();
    const res = await publish(ctx);
    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.runId).toBe(1001);
    expect(body.startedAt).toBe(new Date(T0).toISOString());
    const s = await status(ctx);
    expect(s.configured).toBe(true);
    expect(s.run).toMatchObject({
      runId: 1001,
      runUrl: 'https://github.com/o/r/actions/runs/1001',
      startedBy: "Ім'я editor",
      result: 'in_progress',
      finishedAt: null,
    });
    expect(ctx.store.log.at(-1)).toMatchObject({ action: 'publish.start', result: 'ok' });
  });

  it('refuses a second publication while one is running', async () => {
    const ctx = await setup();
    await publish(ctx);
    const second = await publish(ctx, 'owner');
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toEqual({
      code: 'PUBLISH_IN_PROGRESS',
      message: 'Публікація вже триває',
    });
    expect(ctx.runner.dispatched).toHaveLength(1);
  });

  it('allows a new publication once the run has finished', async () => {
    const ctx = await setup();
    await publish(ctx);
    ctx.runner.states.set(1001, 'failure');
    expect((await publish(ctx)).statusCode).toBe(202);
  });

  it('treats a run stuck for an hour as finished even if GitHub is silent', async () => {
    const ctx = await setup();
    await publish(ctx);
    ctx.runner.failGet = true;
    expect((await publish(ctx)).statusCode).toBe(409);
    tick(ctx, RUN_STALE_MS);
    expect((await publish(ctx)).statusCode).toBe(202);
  });

  it('lists the records the build would reject and does not dispatch', async () => {
    const ctx = await setup();
    // Битая запись могла остаться после смены схемы (решение 038, «Последствия»).
    const [rec] = await ctx.store.listContent('services');
    if (!rec) throw new Error('no services');
    await ctx.store.replaceContent({ ...rec, data: { ...rec.data, title: 5 } }, rec.updatedAt);
    const enterprise = (await ctx.store.listContent('enterprise'))[0];
    if (!enterprise) throw new Error('no enterprise');
    await ctx.store.replaceContent({ ...enterprise, status: 'draft' }, enterprise.updatedAt);

    const res = await publish(ctx);
    expect(res.statusCode).toBe(422);
    const err = res.json().error;
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.message).toBe('Публікацію зупинено: виправте записи зі списку');
    expect(err.problems).toEqual([
      expect.objectContaining({ kind: 'services', id: rec.id, label: 'Послуги' }),
      expect.objectContaining({ kind: 'enterprise', id: null, message: 'Дані не опубліковані' }),
    ]);
    expect(ctx.runner.dispatched).toHaveLength(0);
    expect(ctx.store.log.at(-1)).toMatchObject({ action: 'publish.start', result: 'denied' });
  });

  it('flags a published record whose contact is not published', async () => {
    const ctx = await setup();
    const services = await ctx.store.listContent('services');
    const withContact = services.find((s) => typeof s.data['contactId'] === 'string');
    if (!withContact) return;
    const contact = (await ctx.store.listContent('contacts')).find(
      (c) => c.key === withContact.data['contactId'],
    );
    if (!contact) throw new Error('no contact');
    await ctx.store.replaceContent({ ...contact, status: 'draft' }, contact.updatedAt);
    const res = await publish(ctx);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.problems[0]).toMatchObject({ kind: 'services', id: withContact.id });
  });

  it('says publishing is not configured without a GitHub token', async () => {
    const ctx = await setup({ runner: false });
    const res = await publish(ctx);
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toEqual({
      code: 'GITHUB_UNAVAILABLE',
      message: 'Публікацію ще не налаштовано. Зверніться до власника',
    });
    expect((await status(ctx)).configured).toBe(false);
  });

  it('reports GitHub being down as GITHUB_UNAVAILABLE', async () => {
    const ctx = await setup();
    ctx.runner.failDispatch = true;
    const res = await publish(ctx);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('GITHUB_UNAVAILABLE');
    expect((await status(ctx)).run).toBeNull();
  });

  it('needs a session and the CSRF header', async () => {
    const ctx = await setup();
    expect(
      (await ctx.app.inject({ method: 'POST', url: '/api/v1/publish', headers: H })).statusCode,
    ).toBe(401);
    const noCsrf = await ctx.as('owner')({
      method: 'POST',
      url: '/api/v1/publish',
      headers: { 'x-requested-with': '' },
    });
    expect(noCsrf.statusCode).toBe(403);
  });
});

describe('publication cycle (TZ 8.5, decision 041)', () => {
  it('clears pending changes up to the export time once the run succeeds', async () => {
    const ctx = await setup();
    tick(ctx);
    await editFirstContact(ctx);
    expect((await status(ctx)).pendingChanges).toBe(1);

    tick(ctx);
    await publish(ctx);
    tick(ctx, 30_000);
    const exportAt = ctx.clock.t;
    expect((await ctx.exportAs(EXPORT_TOKEN, '?runId=1001')).statusCode).toBe(200);

    // Правка во время прогона в эту публикацию не попала и остаётся в счётчике.
    tick(ctx);
    const scen = (await ctx.as('owner')({ method: 'GET', url: '/api/v1/scenarios' })).json();
    await ctx.as('owner')({
      method: 'PATCH',
      url: `/api/v1/scenarios/${scen.items[0].id}`,
      payload: { order: 99 },
    });

    expect((await status(ctx)).pendingChanges).toBe(2);
    ctx.runner.states.set(1001, 'success');
    tick(ctx);
    const s = await status(ctx);
    expect(s.run.result).toBe('success');
    expect(s.run.finishedAt).toBe(new Date(ctx.clock.t).toISOString());
    expect(s.lastPublishedAt).toBe(new Date(exportAt).toISOString());
    expect(s.pendingChanges).toBe(1);
    expect(ctx.store.log.at(-1)).toMatchObject({ action: 'publish.finish', result: 'ok' });
  });

  it('keeps pending changes when the run fails', async () => {
    const ctx = await setup();
    tick(ctx);
    await editFirstContact(ctx);
    await publish(ctx);
    await ctx.exportAs(EXPORT_TOKEN, '?runId=1001');
    ctx.runner.states.set(1001, 'failure');
    const s = await status(ctx);
    expect(s.run.result).toBe('failure');
    expect(s.pendingChanges).toBe(1);
    expect(s.lastPublishedAt).toBe(new Date(T0).toISOString());
  });

  it('counts a successful run without an export as a failure (EXPORT_UNAVAILABLE)', async () => {
    const ctx = await setup();
    await publish(ctx);
    ctx.runner.states.set(1001, 'success');
    expect((await status(ctx)).run.result).toBe('failure');
  });

  it('publishes purged records and keeps later purges pending', async () => {
    const ctx = await setup();
    const purge = async () => {
      const list = (await ctx.as('owner')({ method: 'GET', url: '/api/v1/public-docs' })).json();
      const id = list.items[0].id as string;
      await ctx.as('owner')({ method: 'DELETE', url: `/api/v1/public-docs/${id}` });
      const res = await ctx.as('owner')({
        method: 'DELETE',
        url: `/api/v1/public-docs/${id}?permanent=1`,
      });
      expect(res.statusCode).toBeLessThan(300);
    };
    tick(ctx);
    await purge();
    await publish(ctx);
    tick(ctx);
    await ctx.exportAs(EXPORT_TOKEN, '?runId=1001');
    tick(ctx);
    await purge();
    ctx.runner.states.set(1001, 'success');
    const s = await status(ctx);
    expect(s.pendingChanges).toBe(1);
  });

  it('tracks a scheduled run the server first sees at export time', async () => {
    const ctx = await setup();
    tick(ctx);
    await editFirstContact(ctx);
    tick(ctx);
    ctx.runner.states.set(777, 'in_progress');
    await ctx.exportAs(EXPORT_TOKEN, '?runId=777');
    const running = await status(ctx);
    expect(running.run).toMatchObject({ runId: 777, startedBy: null, result: 'in_progress' });
    expect((await publish(ctx)).statusCode).toBe(409);
    ctx.runner.states.set(777, 'success');
    expect((await status(ctx)).pendingChanges).toBe(0);
  });

  it('keeps the stored state when GitHub cannot be asked', async () => {
    const ctx = await setup();
    await publish(ctx);
    ctx.runner.failGet = true;
    const res = await ctx.as('editor')({ method: 'GET', url: '/api/v1/publish/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json().run.result).toBe('in_progress');
  });

  it('marks a run GitHub no longer knows as failed', async () => {
    const ctx = await setup();
    await publish(ctx);
    ctx.runner.states.delete(1001);
    expect((await status(ctx)).run.result).toBe('failure');
  });
});
