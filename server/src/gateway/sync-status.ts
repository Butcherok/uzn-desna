/**
 * Состояние синхронизаций для раздела «Стан системи» (ТЗ 8.6, 9.1; решение 049).
 *
 * Два источника, оба только для чтения:
 * - `data/sync/sync-state.json` из ветки `sync-data` по `raw.githubusercontent.com`,
 *   без токена: итог и счётчик сбоев по каждому источнику. Файл пишется только
 *   при изменении данных (ТЗ 7.5), поэтому его `lastRunAt` может отставать.
 * - последние прогоны `Sync external` из API GitHub тем же токеном, что и
 *   публикация (право Actions): настоящее время и итог каждого прогона.
 *
 * Кэш в памяти процесса — 60 секунд, как у ленты (ТЗ 7.5, п. 4). Сбой чтения
 * отдаёт прежнюю копию с `fresh: false`, а без неё — `null` («невідомо»), а не
 * пустой список: ошибка не равна пустому результату.
 */
import { syncStateFileSchema, type SyncStateFile } from '@uzn/shared';
import type { Loaded, SyncRun, SyncStatusSource } from '../domain/system.js';

export const SYNC_STATUS_CACHE_TTL_MS = 60_000;
export const SYNC_WORKFLOW = 'sync-external.yml';
const REQUEST_TIMEOUT_MS = 10_000;
const RUNS_SHOWN = 5;

export const syncStateUrlOf = (repository: string): string =>
  `https://raw.githubusercontent.com/${repository}/sync-data/data/sync/sync-state.json`;

type Fetch = typeof fetch;

export interface GitHubSyncStatusOptions {
  repository: string;
  /** Токен публикации; без него прогоны не запрашиваются. */
  token: string | null;
  fetch?: Fetch;
  now?: () => number;
  warn?: (message: string) => void;
}

/** Кэш на 60 с с общим запросом и прежней копией при сбое. */
class Cached<T> {
  private last: T | null = null;
  private at = Number.NEGATIVE_INFINITY;
  private value: Loaded<T> | null = null;
  private inflight: Promise<Loaded<T>> | null = null;

  constructor(
    private readonly now: () => number,
    private readonly load: () => Promise<T>,
    private readonly onError: (err: Error) => void,
  ) {}

  get(): Promise<Loaded<T>> {
    if (this.value && this.now() - this.at < SYNC_STATUS_CACHE_TTL_MS) {
      return Promise.resolve(this.value);
    }
    this.inflight ??= this.refresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async refresh(): Promise<Loaded<T>> {
    let result: Loaded<T>;
    try {
      this.last = await this.load();
      result = { value: this.last, fresh: true };
    } catch (err) {
      this.onError(err as Error);
      result = { value: this.last, fresh: false };
    }
    this.value = result;
    this.at = this.now();
    return result;
  }
}

export class GitHubSyncStatus implements SyncStatusSource {
  private readonly fetchImpl: Fetch;
  private readonly stateCache: Cached<SyncStateFile>;
  private readonly runsCache: Cached<SyncRun[]> | null;

  constructor(private readonly opts: GitHubSyncStatusOptions) {
    this.fetchImpl = opts.fetch ?? fetch;
    const now = opts.now ?? Date.now;
    const warn = opts.warn ?? (() => undefined);
    this.stateCache = new Cached(
      now,
      () => this.loadState(),
      (e) => {
        warn(`sync-state: ${e.message}`);
      },
    );
    this.runsCache = opts.token
      ? new Cached(
          now,
          () => this.loadRuns(opts.token as string),
          (e) => {
            // Сообщение без заголовков: токен в журнал не попадает.
            warn(`sync runs: ${e.message}`);
          },
        )
      : null;
  }

  state(): Promise<Loaded<SyncStateFile>> {
    return this.stateCache.get();
  }

  runs(): Promise<Loaded<SyncRun[]>> {
    return this.runsCache ? this.runsCache.get() : Promise.resolve({ value: null, fresh: true });
  }

  private async loadState(): Promise<SyncStateFile> {
    const res = await this.fetchImpl(syncStateUrlOf(this.opts.repository), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const parsed = syncStateFileSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error('sync-state.json не прошёл проверку схемой');
    return parsed.data;
  }

  private async loadRuns(token: string): Promise<SyncRun[]> {
    const repo = this.opts.repository;
    const res = await this.fetchImpl(
      `https://api.github.com/repos/${repo}/actions/workflows/${SYNC_WORKFLOW}/runs?per_page=${RUNS_SHOWN}`,
      {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'uzn-desna-admin',
        },
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { workflow_runs?: unknown };
    if (!Array.isArray(body.workflow_runs)) throw new Error('ответ без workflow_runs');
    return body.workflow_runs.flatMap((r: unknown): SyncRun[] => {
      const run = r as {
        id?: unknown;
        event?: unknown;
        created_at?: unknown;
        status?: unknown;
        conclusion?: unknown;
      };
      if (typeof run.id !== 'number' || typeof run.created_at !== 'string') return [];
      return [
        {
          id: run.id,
          event:
            run.event === 'schedule' || run.event === 'workflow_dispatch' ? run.event : 'other',
          createdAt: run.created_at,
          state:
            run.status !== 'completed'
              ? 'in_progress'
              : run.conclusion === 'success'
                ? 'success'
                : 'failure',
          url: `https://github.com/${repo}/actions/runs/${run.id}`,
        },
      ];
    });
  }
}
