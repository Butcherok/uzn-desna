import { describe, expect, it } from 'vitest';
import { MemoryStore } from './gateway/memory-store.js';
import { newUser } from './gateway/store-contract.js';
import { bootstrapOwner } from './domain/bootstrap.js';

const now = new Date('2026-11-20T10:00:00Z');
const hash = '$2b$12$' + 'a'.repeat(53);
const input = { login: 'roman', passwordHash: hash, displayName: 'Роман' };

describe('first owner bootstrap (ТЗ 9.2, п. 2)', () => {
  it('creates the owner once and logs it', async () => {
    const store = new MemoryStore();
    expect(await bootstrapOwner(store, input, now)).toBe('created');
    const u = await store.findUserByLogin('roman');
    expect(u).toMatchObject({ role: 'owner', active: true, mustChangePassword: false });
    expect(u?.passwordHash).toBe(hash);
    expect(store.log[0]).toMatchObject({ action: 'user.bootstrap', result: 'ok' });
    expect(JSON.stringify(store.log)).not.toContain(hash);
    expect(await bootstrapOwner(store, input, now)).toBe('skipped-users-exist-vars-left');
    expect(store.users.size).toBe(1);
  });

  it('does nothing when users exist or variables are missing', async () => {
    const store = new MemoryStore();
    expect(await bootstrapOwner(store, null, now)).toBe('skipped-no-vars');
    await store.createUser(newUser('anna'));
    expect(await bootstrapOwner(store, null, now)).toBe('skipped-users-exist');
  });

  it('refuses a plain password or a bad login', async () => {
    const store = new MemoryStore();
    expect(await bootstrapOwner(store, { ...input, passwordHash: 'MyPassword123' }, now)).toBe(
      'rejected-bad-hash',
    );
    expect(await bootstrapOwner(store, { ...input, login: 'roman@mail.com' }, now)).toBe(
      'rejected-bad-login',
    );
    expect(store.users.size).toBe(0);
  });
});
