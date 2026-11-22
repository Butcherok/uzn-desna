import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { FEED_CACHE_TTL_MS, GitHubFeedSource, feedUrlOf } from './feed-source.js';

const sample = JSON.parse(
  await readFile(new URL('../../../data/sync/feed.json', import.meta.url), 'utf8'),
) as unknown;

function harness(responses: (() => Response | Promise<Response>)[]) {
  const clock = { t: 1_000_000 };
  const calls: string[] = [];
  const warnings: string[] = [];
  const source = new GitHubFeedSource({
    url: feedUrlOf('Butcherok/uzn-desna'),
    now: () => clock.t,
    warn: (m) => warnings.push(m),
    fetch: (async (input: string | URL | Request) => {
      calls.push(String(input));
      const next = responses.shift();
      if (!next) throw new Error('no more responses');
      return next();
    }) as typeof fetch,
  });
  return { source, clock, calls, warnings };
}

const ok = () => new Response(JSON.stringify(sample), { status: 200 });

describe('GitHubFeedSource (решение 043)', () => {
  it('reads data/sync/feed.json of the sync-data branch', () => {
    expect(feedUrlOf('Butcherok/uzn-desna')).toBe(
      'https://raw.githubusercontent.com/Butcherok/uzn-desna/sync-data/data/sync/feed.json',
    );
  });

  it('caches for 60 s and shares one request between callers', async () => {
    const h = harness([ok, ok]);
    const [a, b] = await Promise.all([h.source.load(), h.source.load()]);
    expect(a.fresh && b.fresh).toBe(true);
    expect(h.calls).toHaveLength(1);
    h.clock.t += FEED_CACHE_TTL_MS - 1;
    await h.source.load();
    expect(h.calls).toHaveLength(1);
    h.clock.t += 2;
    await h.source.load();
    expect(h.calls).toHaveLength(2);
  });

  it('a failure keeps the last good copy and says it is not fresh', async () => {
    const h = harness([
      ok,
      () => new Response('nope', { status: 500 }),
      () => new Response('{"items":"bad"}', { status: 200 }),
    ]);
    const first = await h.source.load();
    h.clock.t += FEED_CACHE_TTL_MS;
    const second = await h.source.load();
    expect(second.fresh).toBe(false);
    expect(second.file).toEqual(first.file);
    h.clock.t += FEED_CACHE_TTL_MS;
    expect((await h.source.load()).fresh).toBe(false);
    expect(h.warnings).toEqual(['feed: HTTP 500', 'feed: feed.json не прошёл проверку схемой']);
  });

  it('never loaded and unreachable — no file, not fresh', async () => {
    const h = harness([
      () => {
        throw new TypeError('fetch failed');
      },
    ]);
    expect(await h.source.load()).toEqual({ file: null, fresh: false });
  });
});
