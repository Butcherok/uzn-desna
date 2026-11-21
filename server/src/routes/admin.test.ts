import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, CSRF_VALUE } from '../app.js';
import { loadConfig } from '../config/env.js';
import { loadAdminAssets, type AdminAssets } from '../gateway/admin-assets.js';
import { MemoryStore } from '../gateway/memory-store.js';
import { ADMIN_CSP } from './admin.js';

const SITE = 'https://butcherok.github.io';
const SELF = 'https://uzn-desna-api.onrender.com';
const INDEX = '<!doctype html><title>Адміністрування</title><div id="root"></div>';
const SCRIPT = `console.log(${JSON.stringify('x'.repeat(2000))});`;

let opened: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of opened) await a.close();
  opened = [];
});

async function distDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'uzn-admin-'));
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'index.html'), INDEX);
  await writeFile(join(dir, 'assets', 'app-1a2b3c.js'), SCRIPT);
  await writeFile(join(dir, 'secret.env'), 'X=1');
  return dir;
}

async function setup(assets: AdminAssets | null, env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://unused',
    SITE_ORIGIN: SITE,
    RENDER_EXTERNAL_URL: SELF,
    ...env,
  });
  const now = new Date('2026-11-21T10:00:00Z');
  const app = await buildApp({
    config,
    store: new MemoryStore(),
    now: () => now,
    startedAt: now,
    adminAssets: assets,
  });
  opened.push(app);
  return app;
}

describe('admin interface (decision 040)', () => {
  it('serves index for app routes with the admin CSP and no-cache', async () => {
    const app = await setup(await loadAdminAssets(await distDir()));
    for (const url of ['/admin/', '/admin/contacts', '/admin/help']) {
      const res = await app.inject({ url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.headers['content-security-policy']).toBe(ADMIN_CSP);
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.body).toBe(INDEX);
    }
  });

  it('redirects /admin to /admin/', async () => {
    const app = await setup(await loadAdminAssets(await distDir()));
    const res = await app.inject({ url: '/admin' });
    expect(res.statusCode).toBe(301);
    expect(res.headers.location).toBe('/admin/');
  });

  it('serves hashed assets as immutable and gzipped on request', async () => {
    const app = await setup(await loadAdminAssets(await distDir()));
    const plain = await app.inject({ url: '/admin/assets/app-1a2b3c.js' });
    expect(plain.statusCode).toBe(200);
    expect(plain.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(plain.body).toBe(SCRIPT);
    const packed = await app.inject({
      url: '/admin/assets/app-1a2b3c.js',
      headers: { 'accept-encoding': 'gzip, br' },
    });
    expect(packed.headers['content-encoding']).toBe('gzip');
    expect(packed.rawPayload.length).toBeLessThan(SCRIPT.length);
  });

  it('answers 404 for missing files, unknown types and path traversal', async () => {
    const app = await setup(await loadAdminAssets(await distDir()));
    for (const url of [
      '/admin/assets/none.js',
      '/admin/secret.env',
      '/admin/../package.json',
      '/admin/%2e%2e/package.json',
    ]) {
      const res = await app.inject({ url });
      expect([404, 301]).toContain(res.statusCode);
      expect(res.body).not.toContain('X=1');
    }
  });

  it('keeps the API CSP on API responses', async () => {
    const app = await setup(null);
    const res = await app.inject({ url: '/api/v1/health' });
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    );
  });

  it('says the interface is not built when there is no build', async () => {
    const app = await setup(null);
    const res = await app.inject({ url: '/admin/' });
    expect(res.statusCode).toBe(503);
    expect(res.body).toContain('ще не зібрано');
  });

  it('accepts mutating requests from its own address and rejects others', async () => {
    const app = await setup(null);
    const own = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { origin: SELF, 'x-requested-with': CSRF_VALUE },
    });
    expect(own.statusCode).toBe(204);
    const foreign = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { origin: 'https://evil.example', 'x-requested-with': CSRF_VALUE },
    });
    expect(foreign.statusCode).toBe(403);
  });

  it('does not add its own address to CORS', async () => {
    const app = await setup(null);
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/health',
      headers: { origin: SELF, 'access-control-request-method': 'GET' },
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('publish status (TZ 8.5, decision 040)', () => {
  it('requires a session', async () => {
    const app = await setup(null);
    const res = await app.inject({ url: '/api/v1/publish/status' });
    expect(res.statusCode).toBe(401);
  });
});
