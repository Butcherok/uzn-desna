import { describe, expect, it } from 'vitest';
import { RunnerUnavailableError } from '../domain/publish.js';
import { GitHubRunner, RUN_CACHE_TTL_MS, createRunner } from './github.js';

const TOKEN = 'github_pat_' + 'x'.repeat(30);
const config = {
  githubToken: TOKEN,
  repository: 'Butcherok/uzn-desna',
  workflow: 'publish-content.yml',
  ref: 'main',
  exportToken: null,
};

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? 'GET',
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { impl, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('GitHubRunner (decision 041)', () => {
  it('dispatches with run details and returns the run number', async () => {
    const f = fakeFetch([
      json(200, {
        workflow_run_id: 123,
        run_url: 'https://api.github.com/repos/Butcherok/uzn-desna/actions/runs/123',
        html_url: 'https://github.com/Butcherok/uzn-desna/actions/runs/123',
      }),
    ]);
    const r = new GitHubRunner({ config, fetch: f.impl });
    expect(await r.dispatch()).toEqual({
      runId: 123,
      runUrl: 'https://github.com/Butcherok/uzn-desna/actions/runs/123',
    });
    const [call] = f.calls;
    expect(call?.method).toBe('POST');
    expect(call?.url).toBe(
      'https://api.github.com/repos/Butcherok/uzn-desna/actions/workflows/publish-content.yml/dispatches',
    );
    expect(call?.body).toEqual({ ref: 'main', return_run_details: true });
    expect(call?.headers['Authorization']).toBe(`Bearer ${TOKEN}`);
    expect(call?.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('finds the run in the list when GitHub answers 204', async () => {
    const f = fakeFetch([
      new Response(null, { status: 204 }),
      json(200, { workflow_runs: [] }),
      json(200, { workflow_runs: [{ id: 456 }] }),
    ]);
    const r = new GitHubRunner({ config, fetch: f.impl, sleep: async () => {} });
    expect(await r.dispatch()).toEqual({
      runId: 456,
      runUrl: 'https://github.com/Butcherok/uzn-desna/actions/runs/456',
    });
    expect(f.calls[1]?.url).toContain('event=workflow_dispatch');
    expect(f.calls[1]?.url).toContain('created=%3E%3D');
  });

  it('turns HTTP errors and network failures into RunnerUnavailableError without the token', async () => {
    for (const res of [
      json(403, { message: 'Resource not accessible' }),
      new TypeError('fetch failed'),
    ]) {
      const r = new GitHubRunner({ config, fetch: fakeFetch([res]).impl });
      const err = await r.dispatch().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(RunnerUnavailableError);
      expect(String((err as Error).message)).not.toContain(TOKEN);
    }
  });

  it('maps run status and conclusion', async () => {
    const cases: [unknown, string][] = [
      [{ status: 'queued', conclusion: null }, 'in_progress'],
      [{ status: 'in_progress', conclusion: null }, 'in_progress'],
      [{ status: 'completed', conclusion: 'success' }, 'success'],
      [{ status: 'completed', conclusion: 'failure' }, 'failure'],
      [{ status: 'completed', conclusion: 'cancelled' }, 'failure'],
    ];
    for (const [body, state] of cases) {
      const r = new GitHubRunner({ config, fetch: fakeFetch([json(200, body)]).impl });
      expect(await r.getRun(1)).toBe(state);
    }
    const gone = new GitHubRunner({ config, fetch: fakeFetch([json(404, {})]).impl });
    expect(await gone.getRun(1)).toBe('missing');
  });

  it('caches a run for 60 seconds with one shared request (TZ 7.5, п. 4)', async () => {
    let t = 0;
    const f = fakeFetch([
      json(200, { status: 'in_progress' }),
      json(200, { status: 'completed', conclusion: 'success' }),
    ]);
    const r = new GitHubRunner({ config, fetch: f.impl, now: () => t });
    const [a, b] = await Promise.all([r.getRun(9), r.getRun(9)]);
    expect([a, b]).toEqual(['in_progress', 'in_progress']);
    expect(f.calls).toHaveLength(1);
    t += RUN_CACHE_TTL_MS;
    expect(await r.getRun(9)).toBe('success');
    expect(f.calls).toHaveLength(2);
  });

  it('does not cache a failed request', async () => {
    const f = fakeFetch([json(500, {}), json(200, { status: 'in_progress' })]);
    const r = new GitHubRunner({ config, fetch: f.impl });
    await expect(r.getRun(9)).rejects.toBeInstanceOf(RunnerUnavailableError);
    expect(await r.getRun(9)).toBe('in_progress');
  });

  it('is not created without a token', () => {
    expect(createRunner({ ...config, githubToken: null })).toBeNull();
    expect(createRunner(config)).toBeInstanceOf(GitHubRunner);
  });
});
