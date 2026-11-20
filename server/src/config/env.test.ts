import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './env.js';

const base = { MONGODB_URI: 'mongodb+srv://u:p@cluster.example/' };

describe('environment', () => {
  it('has safe development defaults', () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({
      env: 'development',
      port: 3000,
      mongoDb: 'uzn',
      cookieSecure: false,
      cookieName: 'uzn_sid',
      cookieSameSite: 'lax',
      trustProxy: 0,
      version: 'dev',
      bootstrap: null,
    });
  });

  it('production requires https origin and uses a Secure __Host- cookie', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', SITE_ORIGIN: 'http://example.org' }),
    ).toThrow(ConfigError);
    const c = loadConfig({
      ...base,
      NODE_ENV: 'production',
      SITE_ORIGIN: 'https://butcherok.github.io',
      RENDER_GIT_COMMIT: '179dd76ead90a36328ea837768763b88d923e75f',
    });
    expect(c.cookieSecure).toBe(true);
    expect(c.cookieName).toBe('__Host-uzn_sid');
    expect(c.version).toBe('179dd76');
  });

  it('rejects an origin with a path and never prints secret values', () => {
    let msg = '';
    try {
      loadConfig({ MONGODB_URI: 'postgres://secret-value', SITE_ORIGIN: 'https://x.org/uzn' });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('MONGODB_URI');
    expect(msg).toContain('SITE_ORIGIN');
    expect(msg).not.toContain('secret-value');
  });

  it('treats empty strings as unset and normalises bootstrap login', () => {
    const c = loadConfig({
      ...base,
      PORT: '',
      BOOTSTRAP_OWNER_LOGIN: ' Roman ',
      BOOTSTRAP_OWNER_PASSWORD_HASH: '$2b$12$x',
    });
    expect(c.port).toBe(3000);
    expect(c.bootstrap).toEqual({
      login: 'roman',
      passwordHash: '$2b$12$x',
      displayName: 'Власник',
    });
  });
});
