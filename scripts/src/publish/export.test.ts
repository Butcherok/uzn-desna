import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXPORT_FILES,
  PublishError,
  WAKE_BUDGET_MS,
  fetchExport,
  mergeExport,
  parseMediaManifest,
  syncMedia,
  waitForApi,
  type ExportDeps,
  type MediaFs,
} from './export.js';
import { createHash } from 'node:crypto';

const API = 'https://api.example';
const TOKEN = 't'.repeat(40);

function deps(responses: (Response | Error)[]) {
  let t = 0;
  const urls: string[] = [];
  const lines: string[] = [];
  const d: ExportDeps = {
    fetch: (async (url: string | URL | Request) => {
      urls.push(String(url));
      const next = responses.shift();
      if (!next) throw new Error('no more responses');
      if (next instanceof Error) throw next;
      return next;
    }) as typeof fetch,
    sleep: async (ms) => {
      t += ms;
    },
    now: () => t,
    log: (line) => lines.push(line),
  };
  return { d, urls, lines };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

const fileOf = (items: unknown[], generatedAt = '2026-11-21T10:00:00.000Z') => ({
  schemaVersion: 1,
  generatedAt,
  source: 'admin-export',
  items,
});

const bodyOf = (overrides: Record<string, unknown> = {}, generatedAt?: string) => ({
  schemaVersion: 1,
  generatedAt: '2026-11-21T10:00:00.000Z',
  files: Object.fromEntries(
    EXPORT_FILES.map((name) => [name, overrides[name] ?? fileOf([{ n: name }], generatedAt)]),
  ),
});

describe('waitForApi', () => {
  it('waits until the database is connected', async () => {
    const { d, urls } = deps([
      new TypeError('fetch failed'),
      json(200, { status: 'ok', dbConnected: false }),
      json(200, { status: 'ok', dbConnected: true }),
    ]);
    expect(await waitForApi(API, d)).toBe(true);
    expect(urls).toEqual(Array(3).fill(`${API}/api/v1/health`));
  });

  it('gives up after the wake budget', async () => {
    const responses = Array.from({ length: 40 }, () => json(503, {}));
    const { d, urls } = deps(responses);
    expect(await waitForApi(API, d)).toBe(false);
    expect(d.now()).toBeLessThanOrEqual(WAKE_BUDGET_MS);
    expect(urls.length).toBeGreaterThan(10);
  });
});

describe('fetchExport', () => {
  it('sends the token and run number and never logs the body', async () => {
    const { d, urls, lines } = deps([json(200, { secret: 'body' })]);
    expect(await fetchExport(API, TOKEN, '55', d)).toEqual({ secret: 'body' });
    expect(urls[0]).toBe(`${API}/api/v1/export?runId=55`);
    expect(lines.join('\n')).not.toContain('secret');
    expect(lines.join('\n')).not.toContain(TOKEN);
  });

  it('retries 5xx and network failures, then reports EXPORT_UNAVAILABLE', async () => {
    const { d, urls } = deps([json(503, {}), new TypeError('x'), json(502, {}), json(500, {})]);
    const err = await fetchExport(API, TOKEN, null, d).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PublishError);
    expect((err as PublishError).code).toBe('EXPORT_UNAVAILABLE');
    expect(urls).toHaveLength(4);
  });

  it('does not retry a rejected token', async () => {
    const { d, urls } = deps([json(401, {})]);
    const err = (await fetchExport(API, TOKEN, null, d).catch((e: unknown) => e)) as PublishError;
    expect(err.code).toBe('EXPORT_UNAVAILABLE');
    expect(err.message).toContain('401');
    expect(urls).toHaveLength(1);
  });
});

describe('mergeExport', () => {
  it('writes only files whose records changed', () => {
    const prev: Record<string, string | null> = Object.fromEntries(
      EXPORT_FILES.map((n) => [
        n,
        JSON.stringify(fileOf([{ n }], '2026-01-01T00:00:00.000Z'), null, 2),
      ]),
    );
    prev['contacts.json'] = null;
    const body = bodyOf({ 'leaders.json': fileOf([{ n: 'changed' }]) });
    const { writes, unchanged } = mergeExport(body, prev);
    expect(Object.keys(writes).sort()).toEqual(['contacts.json', 'leaders.json']);
    expect(unchanged).toHaveLength(EXPORT_FILES.length - 2);
    expect(JSON.parse(writes['leaders.json'] ?? '')).toEqual(fileOf([{ n: 'changed' }]));
    expect(writes['leaders.json']?.endsWith('}\n')).toBe(true);
  });

  it('ignores key order but not record order', () => {
    const prev = Object.fromEntries(
      EXPORT_FILES.map((n) => [n, JSON.stringify(fileOf([{ a: 1, b: { c: 1, d: 2 } }, { n }]))]),
    );
    const same = bodyOf(
      Object.fromEntries(
        EXPORT_FILES.map((n) => [n, fileOf([{ b: { d: 2, c: 1 }, a: 1 }, { n }])]),
      ),
    );
    expect(mergeExport(same, prev).writes).toEqual({});
    const swapped = bodyOf(
      Object.fromEntries(
        EXPORT_FILES.map((n) => [n, fileOf([{ n }, { a: 1, b: { c: 1, d: 2 } }])]),
      ),
    );
    expect(Object.keys(mergeExport(swapped, prev).writes)).toHaveLength(EXPORT_FILES.length);
  });

  it('rejects a missing or extra file, a bad envelope and an unknown version', () => {
    const missing = bodyOf();
    delete (missing.files as Record<string, unknown>)['vacancies.json'];
    const extra = bodyOf();
    (extra.files as Record<string, unknown>)['feed.json'] = fileOf([]);
    const bad = bodyOf({ 'contacts.json': { items: [] } });
    const version = { ...bodyOf(), schemaVersion: 2 };
    for (const body of [missing, extra, bad, version, null, { files: 1 }]) {
      const err = (() => {
        try {
          mergeExport(body, {});
        } catch (e) {
          return e;
        }
        return null;
      })();
      expect(err).toBeInstanceOf(PublishError);
      expect((err as PublishError).code).toBe('SCHEMA_MISMATCH');
    }
  });

  it('covers exactly the editable data files the build checks', () => {
    const check = readFileSync('scripts/bin/data-check.ts', 'utf8');
    for (const name of EXPORT_FILES) expect(check).toContain(`'${name}'`);
  });
});

describe('media (decision 042)', () => {
  const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const A = Buffer.from('photo-a');
  const B = Buffer.from('photo-b');
  const pa = 'media/leaders/karp-ye-a-0a1b2c3d.jpg';
  const pb = 'media/public-docs/statut-1a2b3c4d.pdf';
  const old = 'media/leaders/old-2a2b3c4d.jpg';
  const entry = (path: string, data: Buffer) => ({ path, sha256: sha(data), bytes: data.length });

  function memFs(files: Record<string, Buffer>): MediaFs & { files: Map<string, Buffer> } {
    const map = new Map(Object.entries(files));
    return {
      files: map,
      list: async (dir) => [...map.keys()].filter((p) => p.startsWith(`${dir}/`)),
      read: async (p) => map.get(p) ?? null,
      write: async (p, d) => void map.set(p, d),
      remove: async (p) => void map.delete(p),
    };
  }

  it('requires the manifest: none would mean "delete every file"', () => {
    expect(() => parseMediaManifest({ files: {} })).toThrow(PublishError);
    expect(() => parseMediaManifest({ media: [{ path: '../x', sha256: 'a', bytes: 1 }] })).toThrow(
      PublishError,
    );
    expect(parseMediaManifest({ media: [entry(pa, A)] })).toHaveLength(1);
  });

  it('downloads missing files, keeps matching ones, removes the rest', async () => {
    const fs = memFs({ [pa]: A, [old]: Buffer.from('x'), 'media/banner/banner-day.png': B });
    const { d, urls } = deps([new Response(B, { status: 200 })]);
    const r = await syncMedia(API, TOKEN, [entry(pa, A), entry(pb, B)], fs, d);
    expect(r).toEqual({ written: [pb], removed: [old] });
    expect(urls).toEqual([`${API}/api/v1/export/media?path=${encodeURIComponent(pb)}`]);
    expect(fs.files.get(pb)?.equals(B)).toBe(true);
    // Оформление сайта вне каталогов загрузки не трогается.
    expect(fs.files.has('media/banner/banner-day.png')).toBe(true);
  });

  it('fails on a hash mismatch or a file nobody has, retries server errors', async () => {
    const fs = memFs({});
    const bad = deps([new Response(Buffer.from('other!!'), { status: 200 })]);
    await expect(syncMedia(API, TOKEN, [entry(pa, A)], fs, bad.d)).rejects.toMatchObject({
      code: 'SCHEMA_MISMATCH',
    });
    const missing = deps([new Response('', { status: 404 })]);
    await expect(syncMedia(API, TOKEN, [entry(pa, A)], fs, missing.d)).rejects.toMatchObject({
      code: 'EXPORT_UNAVAILABLE',
    });
    const flaky = deps([new Response('', { status: 503 }), new Response(A, { status: 200 })]);
    expect((await syncMedia(API, TOKEN, [entry(pa, A)], fs, flaky.d)).written).toEqual([pa]);
    expect(fs.files.size).toBe(1);
  });
});
