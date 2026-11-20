/**
 * Общий набор проверок хранилища. Один и тот же набор гоняется на
 * MemoryStore (всегда) и на MongoStore (когда задан `MONGODB_TEST_URI` —
 * в CI это контейнер MongoDB). Так хранилище в памяти, на котором стоят
 * тесты API, не расходится с настоящей БД.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { DuplicateKeyError, type NewUser, type Store } from '../domain/model.js';

export function newUser(login: string, extra: Partial<NewUser> = {}): NewUser {
  return {
    login,
    displayName: login,
    passwordHash: '$2b$12$' + 'a'.repeat(53),
    role: 'editor',
    active: true,
    mustChangePassword: false,
    createdAt: new Date('2026-11-20T10:00:00Z'),
    lastLoginAt: null,
    passwordChangedAt: null,
    ...extra,
  };
}

export function storeContract(name: string, make: () => Promise<Store>): void {
  describe(`store contract: ${name}`, () => {
    let store: Store;
    const t0 = new Date('2026-11-20T10:00:00Z');
    const later = (ms: number): Date => new Date(t0.getTime() + ms);

    beforeEach(async () => {
      store = await make();
    });

    it('creates and finds users; login is unique', async () => {
      expect(await store.countUsers()).toBe(0);
      const u = await store.createUser(newUser('anna'));
      expect(u.id).toMatch(/\S/);
      expect((await store.findUserByLogin('anna'))?.id).toBe(u.id);
      expect((await store.findUserById(u.id))?.login).toBe('anna');
      expect(await store.findUserByLogin('nobody')).toBeNull();
      expect(await store.findUserById('not-an-id')).toBeNull();
      await expect(store.createUser(newUser('anna'))).rejects.toBeInstanceOf(DuplicateKeyError);
      expect(await store.countUsers()).toBe(1);
    });

    it('patches users', async () => {
      const u = await store.createUser(newUser('anna', { mustChangePassword: true }));
      await store.updateUser(u.id, { mustChangePassword: false, lastLoginAt: later(1000) });
      const got = await store.findUserById(u.id);
      expect(got?.mustChangePassword).toBe(false);
      expect(got?.lastLoginAt?.toISOString()).toBe(later(1000).toISOString());
    });

    it('stores sessions, lists newest first, deletes selectively', async () => {
      const u = await store.createUser(newUser('anna'));
      const mk = (i: number) =>
        store.createSession({
          tokenHash: `hash-${i}`,
          userId: u.id,
          createdAt: later(i * 1000),
          expiresAt: later(i * 1000 + 60_000),
          lastSeenAt: later(i * 1000),
        });
      const s1 = await mk(1);
      const s2 = await mk(2);
      const s3 = await mk(3);
      expect((await store.findSessionByTokenHash('hash-2'))?.id).toBe(s2.id);
      expect((await store.listUserSessions(u.id, later(0))).map((s) => s.id)).toEqual([
        s3.id,
        s2.id,
        s1.id,
      ]);
      // Истёкшие в список не входят.
      expect((await store.listUserSessions(u.id, later(61_500))).map((s) => s.id)).toEqual([
        s3.id,
        s2.id,
      ]);
      await store.touchSession(s1.id, later(5000), later(999_000));
      expect((await store.findSessionByTokenHash('hash-1'))?.expiresAt.toISOString()).toBe(
        later(999_000).toISOString(),
      );
      await store.deleteUserSessions(u.id, s2.id);
      expect(await store.findSessionByTokenHash('hash-1')).toBeNull();
      expect(await store.findSessionByTokenHash('hash-2')).not.toBeNull();
      await store.deleteSession(s2.id);
      expect(await store.findSessionByTokenHash('hash-2')).toBeNull();
    });

    it('appends to the action log and answers ping', async () => {
      await store.appendLog({
        at: t0,
        userId: null,
        action: 'test',
        entity: null,
        entityId: null,
        result: 'ok',
        details: {},
      });
      expect(await store.ping()).toBe(true);
    });
  });
}
