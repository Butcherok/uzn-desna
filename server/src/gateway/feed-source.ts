/**
 * Файл ленты для админки (ТЗ 9.5; решение 043): `data/sync/feed.json` из
 * ветки `sync-data` публичного репозитория, по `raw.githubusercontent.com`,
 * без токена. Тот же файл берёт сборка сайта (решение 023).
 *
 * ТЗ 7.5, п. 4: кэш в памяти процесса — 60 секунд, общий Promise. Сбой
 * чтения не очищает ленту в админке: отдаётся прежняя копия с `fresh: false`.
 */
import { feedFileSchema, type FeedFile } from '@uzn/shared';
import type { FeedLoad, FeedSource } from '../domain/feed.js';

export const FEED_CACHE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

export const feedUrlOf = (repository: string): string =>
  `https://raw.githubusercontent.com/${repository}/sync-data/data/sync/feed.json`;

export interface GitHubFeedSourceOptions {
  url: string;
  fetch?: typeof fetch;
  now?: () => number;
  warn?: (message: string) => void;
}

export class GitHubFeedSource implements FeedSource {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly warn: (message: string) => void;
  private lastGood: FeedFile | null = null;
  private cachedAt = Number.NEGATIVE_INFINITY;
  private cached: FeedLoad | null = null;
  private inflight: Promise<FeedLoad> | null = null;

  constructor(opts: GitHubFeedSourceOptions) {
    this.url = opts.url;
    this.fetchImpl = opts.fetch ?? fetch;
    this.now = opts.now ?? Date.now;
    this.warn = opts.warn ?? (() => undefined);
  }

  load(): Promise<FeedLoad> {
    if (this.cached && this.now() - this.cachedAt < FEED_CACHE_TTL_MS) {
      return Promise.resolve(this.cached);
    }
    this.inflight ??= this.fetchOnce().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async fetchOnce(): Promise<FeedLoad> {
    let result: FeedLoad;
    try {
      const res = await this.fetchImpl(this.url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = feedFileSchema.safeParse(await res.json());
      if (!parsed.success) throw new Error('feed.json не прошёл проверку схемой');
      this.lastGood = parsed.data;
      result = { file: parsed.data, fresh: true };
    } catch (err) {
      this.warn(`feed: ${(err as Error).message}`);
      result = { file: this.lastGood, fresh: false };
    }
    // Неудача тоже кэшируется: без этого каждое открытие страницы ждало бы
    // 10 секунд недоступного GitHub.
    this.cached = result;
    this.cachedAt = this.now();
    return result;
  }
}
