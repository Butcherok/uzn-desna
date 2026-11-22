import type { FastifyInstance } from 'fastify';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, CSRF_VALUE, HEALTH_RATE } from './app.js';
import { loadConfig, type AppConfig } from './config/env.js';
import { hashPassword } from './domain/password.js';
import { SESSION_TOUCH_INTERVAL_MS, SESSION_TTL_MS } from './domain/sessions.js';
import { MemoryStore } from './gateway/memory-store.js';
import { newUser } from './gateway/store-contract.js';
import { requireAuth } from './routes/http.js';

const PASSWORD = 'lipa-kashtan-dub-2026';
const SITE = 'https://butcherok.github.io';
let HASH = '';

beforeAll(async () => {
  HASH = await hashPassword(PASSWORD);
}, 30_000);

interface Ctx {
  app: FastifyInstance;
  store: MemoryStore;
  config: AppConfig;
  clock: { t: number };
}

let opened: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of opened) await a.close();
  opened = [];
});

async function setup(env: Record<string, string> = {}): Promise<Ctx> {
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://unused',
    SITE_ORIGIN: SITE,
    BUILD_VERSION: 'test-1',
    ...env,
  });
  const store = new MemoryStore();
  const clock = { t: Date.parse('2026-11-20T10:00:00Z') };
  const deps = { config, store, now: () => new Date(clock.t), startedAt: new Date(clock.t) };
  const app = await buildApp(deps);
  // Закрытый маршрут без исключения для временного пароля — как у будущих эндпоинтов контента.
  app.get('/api/v1/test/protected', { preHandler: requireAuth(deps) }, async () => ({ ok: 1 }));
  app.get(
    '/api/v1/test/owner',
    { preHandler: requireAuth(deps, { roles: ['owner'] }) },
    async () => ({ ok: 1 }),
  );
  opened.push(app);
  return { app, store, config, clock };
}

const H = { 'x-requested-with': CSRF_VALUE };

async function addUser(ctx: Ctx, login = 'anna', extra = {}) {
  return ctx.store.createUser(newUser(login, { passwordHash: HASH, ...extra }));
}

async function login(ctx: Ctx, l = 'anna', password = PASSWORD) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: H,
    payload: { login: l, password },
  });
}

interface Cookie {
  name: string;
  value: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  path?: string;
  domain?: string;
  maxAge?: number;
}

function cookieOf(res: { cookies: Cookie[] }, name: string): Cookie | undefined {
  return res.cookies.find((c) => c.name === name);
}

async function signedIn(ctx: Ctx, l = 'anna') {
  const res = await login(ctx, l);
  expect(res.statusCode).toBe(200);
  const c = cookieOf(res, ctx.config.cookieName);
  return { [ctx.config.cookieName]: c!.value };
}

describe('service endpoints', () => {
  it('health reports db state and build, no caching, noindex', async () => {
    const ctx = await setup();
    const res = await ctx.app.inject('/api/v1/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      status: 'ok',
      dbConnected: true,
      startedAt: '2026-11-20T10:00:00.000Z',
      version: 'test-1',
    });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    ctx.store.available = false;
    expect((await ctx.app.inject('/api/v1/health')).json().dbConnected).toBe(false);
  });

  it('health has its own, higher limit: Render polls it every few seconds', async () => {
    const ctx = await setup();
    for (let i = 0; i < HEALTH_RATE.max; i++) {
      expect((await ctx.app.inject('/api/v1/health')).statusCode).toBe(200);
    }
    expect((await ctx.app.inject('/api/v1/health')).statusCode).toBe(429);
  });

  it('robots.txt allows crawling so the noindex header stays visible', async () => {
    const ctx = await setup();
    const res = await ctx.app.inject('/robots.txt');
    expect(res.body).toBe('User-agent: *\nDisallow:\n');
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('unknown route returns the common error format', async () => {
    const ctx = await setup();
    const res = await ctx.app.inject('/api/v1/nope');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Не знайдено' } });
  });
});

describe('CORS and request forgery', () => {
  it('allows the site origin with credentials, never *', async () => {
    const ctx = await setup();
    const res = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/login',
      headers: {
        origin: SITE,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type,x-requested-with',
      },
    });
    expect(res.headers['access-control-allow-origin']).toBe(SITE);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    const foreign = await ctx.app.inject({
      method: 'OPTIONS',
      url: '/api/v1/auth/login',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('localhost:4321 is allowed outside production only', async () => {
    expect((await setup()).config.corsOrigins).toContain('http://localhost:4321');
    const prod = loadConfig({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://x',
      SITE_ORIGIN: SITE,
    });
    expect(prod.corsOrigins).toEqual([SITE]);
  });

  it('rejects changing requests without the header or from a foreign origin', async () => {
    const ctx = await setup();
    await addUser(ctx);
    const noHeader = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { login: 'anna', password: PASSWORD },
    });
    expect(noHeader.statusCode).toBe(403);
    expect(noHeader.json().error.code).toBe('FORBIDDEN');
    const foreign = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...H, origin: 'https://evil.example' },
      payload: { login: 'anna', password: PASSWORD },
    });
    expect(foreign.statusCode).toBe(403);
    expect(ctx.store.sessions.size).toBe(0);
  });
});

describe('login', () => {
  it('sets a hardened session cookie and stores only the token hash', async () => {
    const ctx = await setup();
    await addUser(ctx);
    const res = await login(ctx);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      login: 'anna',
      displayName: 'anna',
      role: 'editor',
      mustChangePassword: false,
    });
    const c = cookieOf(res, 'uzn_sid')!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('Lax');
    expect(c.path).toBe('/');
    expect(c.maxAge).toBe(SESSION_TTL_MS / 1000);
    expect(c.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [session] = [...ctx.store.sessions.values()];
    expect(session!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(session!.tokenHash).not.toContain(c.value);
    expect(ctx.store.log.at(-1)).toMatchObject({ action: 'auth.login', result: 'ok' });
    expect(res.headers['server-timing']).toMatch(/^pw;dur=\d+$/);
  });

  it('in production the cookie is Secure and __Host- prefixed', async () => {
    const ctx = await setup({ NODE_ENV: 'production' });
    await addUser(ctx);
    const c = cookieOf(await login(ctx), '__Host-uzn_sid')!;
    expect(c.secure).toBe(true);
    expect(c.path).toBe('/');
    expect(c.domain).toBeUndefined();
  });

  it('gives one message for unknown login, wrong password, bad format and blocked user', async () => {
    const ctx = await setup();
    await addUser(ctx);
    await addUser(ctx, 'olha', { active: false });
    const cases = await Promise.all([
      login(ctx, 'nobody'),
      login(ctx, 'anna', 'wrong-password-123'),
      login(ctx, 'Не логін!'),
      login(ctx, 'olha'),
    ]);
    for (const r of cases) {
      expect(r.statusCode).toBe(401);
      expect(r.json()).toEqual({
        error: { code: 'UNAUTHENTICATED', message: 'Невірний логін або пароль' },
      });
      expect(r.cookies.filter((c) => c.value !== '')).toHaveLength(0);
      // Заголовок замера есть и у отказа: его наличие не выдаёт, существует ли логин.
      expect(r.headers['server-timing']).toMatch(/^pw;dur=\d+$/);
    }
    // Неизвестный логин — в журнале без введённого текста (ТЗ 9.7, п. 6).
    const denied = ctx.store.log.filter((e) => e.result === 'denied');
    expect(denied.map((e) => e.details['reason']).sort()).toEqual([
      'bad-password',
      'inactive',
      'unknown-login',
      'unknown-login',
    ]);
    const unknown = denied.filter((e) => e.details['reason'] === 'unknown-login');
    for (const e of unknown) {
      expect(e).toMatchObject({
        userId: null,
        entityId: null,
        details: { reason: 'unknown-login' },
      });
      expect(JSON.stringify(e)).not.toMatch(/nobody|Не логін/u);
    }
  });

  it('login is case-insensitive and trimmed', async () => {
    const ctx = await setup();
    await addUser(ctx);
    expect((await login(ctx, '  Anna ')).statusCode).toBe(200);
  });

  it('rejects malformed bodies with 400/422 in the common format', async () => {
    const ctx = await setup();
    const bad = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...H, 'content-type': 'application/json' },
      payload: '{"login":',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('VALIDATION_FAILED');
    const wrongShape = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: H,
      payload: { login: 5 },
    });
    expect(wrongShape.statusCode).toBe(422);
    expect(Object.keys(wrongShape.json().error.fields).sort()).toEqual(['login', 'password']);
  });

  it('refuses bodies over 1 MB with 413', async () => {
    const ctx = await setup();
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { ...H, 'content-type': 'application/json' },
      payload: JSON.stringify({ login: 'a', password: 'x'.repeat(1024 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
  });

  it('limits to 10 attempts per login and address per 15 minutes', async () => {
    const ctx = await setup();
    await addUser(ctx);
    for (let i = 0; i < 10; i++) {
      expect((await login(ctx, 'anna', `wrong-password-${i}`)).statusCode).toBe(401);
    }
    const blocked = await login(ctx, 'anna');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error.code).toBe('RATE_LIMITED');
    expect(blocked.json().error.message).toBe('Занадто багато спроб. Спробуйте за 15 хв');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Другой логин с того же адреса не заблокирован.
    await addUser(ctx, 'olha');
    expect((await login(ctx, 'olha')).statusCode).toBe(200);
  }, 30_000);

  it('answers 503 when the database is down', async () => {
    const ctx = await setup();
    ctx.store.available = false;
    const res = await login(ctx);
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('DB_UNAVAILABLE');
  });
});

describe('sessions', () => {
  it('me works with the cookie and fails without it', async () => {
    const ctx = await setup();
    await addUser(ctx);
    const cookies = await signedIn(ctx);
    expect((await ctx.app.inject({ url: '/api/v1/auth/me', cookies })).json().login).toBe('anna');
    const anon = await ctx.app.inject('/api/v1/auth/me');
    expect(anon.statusCode).toBe(401);
    expect(anon.json().error.message).toBe('Сесія завершилась. Увійдіть знову');
    const junk = await ctx.app.inject({ url: '/api/v1/auth/me', cookies: { uzn_sid: 'x' } });
    expect(junk.statusCode).toBe(401);
  });

  it('expires after 12 hours of inactivity and slides while used', async () => {
    const ctx = await setup();
    await addUser(ctx);
    const cookies = await signedIn(ctx);
    ctx.clock.t += SESSION_TOUCH_INTERVAL_MS;
    const renewed = await ctx.app.inject({ url: '/api/v1/auth/me', cookies });
    expect(renewed.statusCode).toBe(200);
    expect(cookieOf(renewed, 'uzn_sid')?.maxAge).toBe(SESSION_TTL_MS / 1000);
    // 12 часов от продления минус минута — ещё жива, плюс минута — нет.
    ctx.clock.t += SESSION_TTL_MS - 60_000;
    expect((await ctx.app.inject({ url: '/api/v1/auth/me', cookies })).statusCode).toBe(200);
    ctx.clock.t += SESSION_TTL_MS + 60_000;
    expect((await ctx.app.inject({ url: '/api/v1/auth/me', cookies })).statusCode).toBe(401);
    expect(ctx.store.sessions.size).toBe(0);
  });

  it('keeps at most 5 sessions per user, dropping the oldest', async () => {
    const ctx = await setup();
    await addUser(ctx);
    const first = await signedIn(ctx);
    for (let i = 0; i < 5; i++) {
      ctx.clock.t += 1000;
      await signedIn(ctx);
    }
    expect(ctx.store.sessions.size).toBe(5);
    expect((await ctx.app.inject({ url: '/api/v1/auth/me', cookies: first })).statusCode).toBe(401);
  }, 30_000);

  it('a new login from the same browser closes the previous session', async () => {
    const ctx = await setup();
    await addUser(ctx);
    const cookies = await signedIn(ctx);
    const again = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: H,
      cookies,
      payload: { login: 'anna', password: PASSWORD },
    });
    expect(again.statusCode).toBe(200);
    expect(ctx.store.sessions.size).toBe(1);
    expect((await ctx.app.inject({ url: '/api/v1/auth/me', cookies })).statusCode).toBe(401);
  });

  it('blocking a user kills the session immediately', async () => {
    const ctx = await setup();
    const u = await addUser(ctx);
    const cookies = await signedIn(ctx);
    ctx.store.users.set(u.id, { ...ctx.store.users.get(u.id)!, active: false });
    expect((await ctx.app.inject({ url: '/api/v1/auth/me', cookies })).statusCode).toBe(401);
  });

  it('logout deletes the server session, clears the cookie and is repeatable', async () => {
    const ctx = await setup();
    await addUser(ctx);
    const cookies = await signedIn(ctx);
    const out = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: H,
      cookies,
    });
    expect(out.statusCode).toBe(204);
    expect(cookieOf(out, 'uzn_sid')?.value).toBe('');
    expect(ctx.store.sessions.size).toBe(0);
    expect((await ctx.app.inject({ url: '/api/v1/auth/me', cookies })).statusCode).toBe(401);
    const again = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: H });
    expect(again.statusCode).toBe(204);
  });

  it('roles are enforced', async () => {
    const ctx = await setup();
    await addUser(ctx);
    await addUser(ctx, 'roman', { role: 'owner' });
    const editor = await signedIn(ctx, 'anna');
    const owner = await signedIn(ctx, 'roman');
    expect((await ctx.app.inject({ url: '/api/v1/test/owner', cookies: editor })).statusCode).toBe(
      403,
    );
    expect((await ctx.app.inject({ url: '/api/v1/test/owner', cookies: owner })).statusCode).toBe(
      200,
    );
  });
});

describe('password change', () => {
  const change = (
    ctx: Ctx,
    cookies: Record<string, string>,
    currentPassword: string,
    newPassword: string,
  ) =>
    ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/password',
      headers: H,
      cookies,
      payload: { currentPassword, newPassword },
    });

  it('a temporary password blocks everything except me, password and logout', async () => {
    const ctx = await setup();
    await addUser(ctx, 'anna', { mustChangePassword: true });
    const cookies = await signedIn(ctx);
    const blocked = await ctx.app.inject({ url: '/api/v1/test/protected', cookies });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.message).toBe('Спочатку змініть тимчасовий пароль');
    expect(
      (await ctx.app.inject({ url: '/api/v1/auth/me', cookies })).json().mustChangePassword,
    ).toBe(true);
    const ok = await change(ctx, cookies, PASSWORD, 'nova-alleia-klen-2027');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().mustChangePassword).toBe(false);
    expect((await ctx.app.inject({ url: '/api/v1/test/protected', cookies })).statusCode).toBe(200);
  });

  it('checks the current password and the new password rules', async () => {
    const ctx = await setup();
    await addUser(ctx);
    const cookies = await signedIn(ctx);
    const wrong = await change(ctx, cookies, 'not-my-password', 'nova-alleia-klen-2027');
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json().error.fields).toEqual({ currentPassword: 'Невірний поточний пароль' });
    for (const weak of ['short', '123456789012', 'anna-password-x', 'ааааааааааааа', PASSWORD]) {
      const r = await change(ctx, cookies, PASSWORD, weak);
      expect(r.statusCode, weak).toBe(422);
      expect(r.json().error.fields.newPassword).toMatch(/\S/);
    }
  }, 30_000);

  it('revokes the other sessions and keeps the current one', async () => {
    const ctx = await setup();
    await addUser(ctx);
    const other = await signedIn(ctx);
    ctx.clock.t += 1000;
    const current = await signedIn(ctx);
    expect((await change(ctx, current, PASSWORD, 'nova-alleia-klen-2027')).statusCode).toBe(200);
    expect((await ctx.app.inject({ url: '/api/v1/auth/me', cookies: other })).statusCode).toBe(401);
    expect((await ctx.app.inject({ url: '/api/v1/auth/me', cookies: current })).statusCode).toBe(
      200,
    );
    expect((await login(ctx, 'anna', PASSWORD)).statusCode).toBe(401);
    expect((await login(ctx, 'anna', 'nova-alleia-klen-2027')).statusCode).toBe(200);
  }, 30_000);
});
