import { describe, expect, it } from 'vitest';
import {
  checkNewPassword,
  hashPassword,
  isAcceptableBcryptHash,
  verifyPassword,
} from './password.js';

describe('password rules (ТЗ 8.2, п. 4)', () => {
  it('accepts a long passphrase without forced character classes', () => {
    expect(checkNewPassword('липа каштан дуб').ok).toBe(true);
    expect(checkNewPassword('lipakashtandub').ok).toBe(true);
  });

  it('rejects short, common, repetitive and login-containing passwords', () => {
    expect(checkNewPassword('коротко1').message).toMatch(/12/);
    expect(checkNewPassword('Qwertyuiop12').ok).toBe(false);
    expect(checkNewPassword('ababababababab').ok).toBe(false);
    expect(checkNewPassword('my-anna-secret', 'anna').message).toMatch(/логін/);
  });

  it('counts length in characters and caps at 72 bytes for bcrypt', () => {
    expect(checkNewPassword('ї'.repeat(6) + 'абвгде').ok).toBe(true); // 12 знаков
    expect(checkNewPassword('ж'.repeat(36) + 'x').ok).toBe(false); // 73 байта
    expect(checkNewPassword('abc'.repeat(24)).ok).toBe(true); // ровно 72
  });

  it('hashes with bcrypt cost 12 and verifies', async () => {
    const h = await hashPassword('lipakashtandub');
    expect(h).toMatch(/^\$2b\$12\$/);
    expect(isAcceptableBcryptHash(h)).toBe(true);
    expect(await verifyPassword('lipakashtandub', h)).toBe(true);
    expect(await verifyPassword('lipakashtandu', h)).toBe(false);
  }, 15_000);

  it('accepts only bcrypt hashes with cost >= 12 for bootstrap', () => {
    expect(isAcceptableBcryptHash('$2b$10$' + 'a'.repeat(53))).toBe(false);
    expect(isAcceptableBcryptHash('$2a$12$' + 'a'.repeat(53))).toBe(true);
    expect(isAcceptableBcryptHash('plain-password')).toBe(false);
  });
});
