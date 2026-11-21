/**
 * Запуск и чтение прогонов `publish-content` через REST API GitHub
 * (ТЗ 8.5, п. 3; решение 041). Токен — fine-grained, только этот репозиторий,
 * право Actions: Read and write. В журнал и в ответы токен не попадает.
 *
 * `return_run_details: true` (GitHub, 19.02.2026) — ответ 200 с номером
 * прогона. Если GitHub ответил по-старому, 204 без тела, номер ищется в
 * списке прогонов рабочего процесса.
 */
import type { PublishConfig } from '../config/env.js';
import { RunnerUnavailableError, type RunState, type WorkflowRunner } from '../domain/publish.js';

const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 10_000;
/** ТЗ 7.5, п. 4: кэш статусов в памяти процесса — 60 секунд, общий Promise. */
export const RUN_CACHE_TTL_MS = 60_000;

type Fetch = typeof fetch;

export interface GitHubRunnerOptions {
  config: PublishConfig & { githubToken: string };
  fetch?: Fetch;
  now?: () => number;
  /** Пауза между поисками прогона после ответа 204. */
  sleep?: (ms: number) => Promise<void>;
}

interface CacheEntry {
  at: number;
  value: Promise<RunState>;
}

export class GitHubRunner implements WorkflowRunner {
  private readonly cfg: GitHubRunnerOptions['config'];
  private readonly fetchImpl: Fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly cache = new Map<number, CacheEntry>();

  constructor(opts: GitHubRunnerOptions) {
    this.cfg = opts.config;
    this.fetchImpl = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  runUrl(runId: number): string {
    return `https://github.com/${this.cfg.repository}/actions/runs/${runId}`;
  }

  async dispatch(): Promise<{ runId: number; runUrl: string }> {
    const since = new Date(this.now() - 5_000).toISOString();
    const res = await this.call(
      'POST',
      `/repos/${this.cfg.repository}/actions/workflows/${this.cfg.workflow}/dispatches`,
      { ref: this.cfg.ref, return_run_details: true },
    );
    if (res.status === 200) {
      const body = (await res.json().catch(() => null)) as {
        workflow_run_id?: unknown;
        html_url?: unknown;
      } | null;
      const id = body?.workflow_run_id;
      if (typeof id === 'number' && Number.isSafeInteger(id)) {
        return {
          runId: id,
          runUrl: typeof body?.html_url === 'string' ? body.html_url : this.runUrl(id),
        };
      }
    } else if (res.status !== 204) {
      throw new RunnerUnavailableError(`dispatch: HTTP ${res.status}`);
    }
    const found = await this.findDispatchedRun(since);
    if (found === null) throw new RunnerUnavailableError('dispatch: run not found');
    return { runId: found, runUrl: this.runUrl(found) };
  }

  getRun(runId: number): Promise<RunState> {
    const hit = this.cache.get(runId);
    if (hit && this.now() - hit.at < RUN_CACHE_TTL_MS) return hit.value;
    const value = this.fetchRun(runId);
    this.cache.set(runId, { at: this.now(), value });
    // Неудача не кэшируется: следующий опрос спросит GitHub снова.
    value.catch(() => this.cache.delete(runId));
    return value;
  }

  private async fetchRun(runId: number): Promise<RunState> {
    const res = await this.call('GET', `/repos/${this.cfg.repository}/actions/runs/${runId}`);
    if (res.status === 404) return 'missing';
    if (!res.ok) throw new RunnerUnavailableError(`run: HTTP ${res.status}`);
    const body = (await res.json().catch(() => null)) as {
      status?: unknown;
      conclusion?: unknown;
    } | null;
    if (body?.status !== 'completed') return 'in_progress';
    return body.conclusion === 'success' ? 'success' : 'failure';
  }

  private async findDispatchedRun(since: string): Promise<number | null> {
    const path =
      `/repos/${this.cfg.repository}/actions/workflows/${this.cfg.workflow}/runs` +
      `?event=workflow_dispatch&per_page=1&created=${encodeURIComponent(`>=${since}`)}`;
    for (let i = 0; i < 5; i += 1) {
      if (i > 0) await this.sleep(2_000);
      const res = await this.call('GET', path);
      if (!res.ok) continue;
      const body = (await res.json().catch(() => null)) as {
        workflow_runs?: { id?: unknown }[];
      } | null;
      const id = body?.workflow_runs?.[0]?.id;
      if (typeof id === 'number' && Number.isSafeInteger(id)) return id;
    }
    return null;
  }

  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await this.fetchImpl(`${API}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.cfg.githubToken}`,
          'X-GitHub-Api-Version': API_VERSION,
          'User-Agent': 'uzn-desna-admin',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: ctrl.signal,
      });
    } catch (err) {
      // Сообщение `fetch` не содержит заголовков: токен в ошибку не попадает.
      throw new RunnerUnavailableError('github request failed', { cause: err });
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createRunner(config: PublishConfig): GitHubRunner | null {
  if (!config.githubToken) return null;
  return new GitHubRunner({ config: { ...config, githubToken: config.githubToken } });
}
