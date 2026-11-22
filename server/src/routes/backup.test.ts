import type { FastifyInstance, InjectOptions } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, CSRF_VALUE } from '../app.js';
import { loadConfig } from '../config/env.js';
import type { Role } from '../domain/model.js';
import { RunnerUnavailableError, type RunState, type WorkflowRunner } from '../domain/publish.js';
import { openSession } from '../domain/sessions.js';
import { MemoryStore } from '../gateway/memory-store.js';
import { newUser } from '../gateway/store-contract.js';

let opened: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of opened) await a.close();
  opened = [];
});

class FakeRunner implements WorkflowRunner {
  next = 500;
  states = new Map<number, RunState>();
  failDispatch = false;
  failGet = false;
  async dispatch() {
    if (this.failDispatch) throw new RunnerUnavailableError('down');
    const runId = (this.next += 1);
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

async function setup({ configured = true } = {}) {
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://unused',
    SITE_ORIGIN: 'https://butcherok.github.io',
  });
  const store = new MemoryStore();
  const runner = new FakeRunner();
  const clock = { t: Date.parse('2026-11-22T12:00:00Z') };
  const now = () => new Date(clock.t);
  const app = await buildApp({
    config,
    store,
    now,
    startedAt: now(),
    backupRunner: configured ? runner : null,
  });
  opened.push(app);
  const cookies = new Map<Role, string>();
  for (const role of ['owner', 'editor'] as const) {
    const u = await store.createUser(newUser(role, { role, displayName: `Ім'я ${role}` }));
    cookies.set(role, (await openSession(store, u.id, now())).token);
  }
  const as = (role: Role) => (opts: InjectOptions) =>
    app.inject({
      ...opts,
      headers: { 'x-requested-with': CSRF_VALUE },
      cookies: { [config.cookieName]: cookies.get(role) ?? '' },
    });
  return { app, store, runner, clock, as };
}

describe('backup button (TZ 9.6, п. 2)', () => {
  it('owner only', async () => {
    const ctx = await setup();
    expect((await ctx.as('editor')({ url: '/api/v1/backup' })).statusCode).toBe(403);
    expect((await ctx.as('editor')({ method: 'POST', url: '/api/v1/backup' })).statusCode).toBe(
      403,
    );
    const s = (await ctx.as('owner')({ url: '/api/v1/backup' })).json();
    expect(s).toEqual({
      configured: true,
      workflowUrl: 'https://github.com/Butcherok/uzn-desna/actions/workflows/backup.yml',
      last: null,
    });
  });

  it('starts the workflow, logs it, shows its state; a second start waits', async () => {
    const ctx = await setup();
    const res = await ctx.as('owner')({ method: 'POST', url: '/api/v1/backup' });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ runId: 501, state: 'in_progress', startedBy: "Ім'я owner" });
    expect(ctx.store.log.at(-1)).toMatchObject({
      action: 'backup.start',
      entityId: '501',
      result: 'ok',
    });
    const again = await ctx.as('owner')({ method: 'POST', url: '/api/v1/backup' });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.message).toBe(
      'Резервна копія вже створюється. Зачекайте кілька хвилин',
    );
    ctx.runner.states.set(501, 'success');
    const s = (await ctx.as('owner')({ url: '/api/v1/backup' })).json();
    expect(s.last).toMatchObject({
      runId: 501,
      runUrl: 'https://github.com/o/r/actions/runs/501',
      state: 'success',
      startedBy: "Ім'я owner",
    });
    expect((await ctx.as('owner')({ method: 'POST', url: '/api/v1/backup' })).statusCode).toBe(202);
  });

  it('GitHub down: start fails with a message and an error entry; status says unknown', async () => {
    const ctx = await setup();
    await ctx.as('owner')({ method: 'POST', url: '/api/v1/backup' });
    ctx.runner.failGet = true;
    expect((await ctx.as('owner')({ url: '/api/v1/backup' })).json().last.state).toBe('unknown');
    ctx.runner.failGet = false;
    ctx.runner.states.set(501, 'failure');
    ctx.runner.failDispatch = true;
    const res = await ctx.as('owner')({ method: 'POST', url: '/api/v1/backup' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.message).toBe('Не вдалося запустити резервну копію. Спробуйте пізніше');
    expect(ctx.store.log.at(-1)).toMatchObject({ action: 'backup.start', result: 'error' });
    // Неудачный запуск не заслоняет последний настоящий прогон.
    expect((await ctx.as('owner')({ url: '/api/v1/backup' })).json().last.runId).toBe(501);
  });

  it('not configured without a GitHub token', async () => {
    const ctx = await setup({ configured: false });
    expect((await ctx.as('owner')({ url: '/api/v1/backup' })).json().configured).toBe(false);
    const res = await ctx.as('owner')({ method: 'POST', url: '/api/v1/backup' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.message).toBe('Резервні копії ще не налаштовано');
  });

  it('the workflow file exists and uploads only the encrypted file', async () => {
    const { readFile } = await import('node:fs/promises');
    const wf = await readFile(
      new URL('../../../.github/workflows/backup.yml', import.meta.url),
      'utf8',
    );
    expect(wf).toContain('workflow_dispatch');
    expect(wf).toMatch(/path: .*\/out\//u);
    expect(wf).toContain('--excludeCollection=sessions');
    expect(wf).toContain('retention-days: 90');
  });
});
