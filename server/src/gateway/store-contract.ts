/**
 * Общий набор проверок хранилища. Один и тот же набор гоняется на
 * MemoryStore (всегда) и на MongoStore (когда задан `MONGODB_TEST_URI` —
 * в CI это контейнер MongoDB). Так хранилище в памяти, на котором стоят
 * тесты API, не расходится с настоящей БД.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DuplicateKeyError,
  type NewContentRecord,
  type NewUser,
  type Store,
} from '../domain/model.js';

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

export function newContent(key: string, extra: Partial<NewContentRecord> = {}): NewContentRecord {
  const at = new Date('2026-11-20T10:00:00Z');
  return {
    kind: 'contacts',
    key,
    data: { slug: key, nested: { order: 1 } },
    status: 'draft',
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    firstPublishedAt: null,
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

    it('stores content records; key is unique per kind', async () => {
      const a = await store.insertContent(newContent('pryimalnia'));
      expect(a.id).toMatch(/\S/);
      // Тот же ключ в другой сущности — не конфликт.
      await store.insertContent(newContent('pryimalnia', { kind: 'services' }));
      await expect(store.insertContent(newContent('pryimalnia'))).rejects.toBeInstanceOf(
        DuplicateKeyError,
      );
      const got = await store.findContent('contacts', a.id);
      expect(got?.data).toEqual({ slug: 'pryimalnia', nested: { order: 1 } });
      expect(got?.updatedAt.toISOString()).toBe(t0.toISOString());
      expect(await store.findContent('services', a.id)).toBeNull();
      expect(await store.findContent('contacts', 'not-an-id')).toBeNull();
      expect((await store.listContent('contacts')).map((r) => r.id)).toEqual([a.id]);
    });

    it('replaces content only when updatedAt still matches', async () => {
      const a = await store.insertContent(newContent('a'));
      await store.insertContent(newContent('b'));
      const next = { ...a, data: { slug: 'a2' }, key: 'a2', updatedAt: later(1000) };
      expect(await store.replaceContent(next, later(5))).toBe(false);
      expect(await store.replaceContent(next, t0)).toBe(true);
      expect((await store.findContent('contacts', a.id))?.key).toBe('a2');
      // Повтор с прежним updatedAt уже не проходит.
      expect(await store.replaceContent({ ...next, key: 'a3' }, t0)).toBe(false);
      await expect(
        store.replaceContent({ ...next, key: 'b', updatedAt: later(2000) }, later(1000)),
      ).rejects.toBeInstanceOf(DuplicateKeyError);
    });

    it('reorders, counts changes and deletes content', async () => {
      const a = await store.insertContent(newContent('a', { data: { slug: 'a', order: 1 } }));
      const b = await store.insertContent(newContent('b', { data: { slug: 'b', order: 2 } }));
      expect(await store.countContentChangedSince(null)).toBe(2);
      expect(await store.countContentChangedSince(t0)).toBe(0);
      await store.updateContentOrder('contacts', [{ id: b.id, order: 1 }], later(1000));
      const gotB = await store.findContent('contacts', b.id);
      expect(gotB?.data.order).toBe(1);
      expect(gotB?.updatedAt.toISOString()).toBe(later(1000).toISOString());
      expect(await store.countContentChangedSince(t0)).toBe(1);
      expect(await store.deleteContent('services', a.id)).toBe(false);
      expect(await store.deleteContent('contacts', a.id)).toBe(true);
      expect(await store.deleteContent('contacts', a.id)).toBe(false);
      expect((await store.listContent('contacts')).map((r) => r.key)).toEqual(['b']);
    });

    it('marks seeding once and counts purged records', async () => {
      expect(await store.getContentMeta()).toEqual({
        seededAt: null,
        lastPublishedAt: null,
        purgedPending: 0,
        lastRun: null,
      });
      await store.incrementPurgedPending();
      expect(await store.markContentSeeded(t0)).toBe(true);
      expect(await store.markContentSeeded(later(1000))).toBe(false);
      const meta = await store.getContentMeta();
      expect(meta.seededAt?.toISOString()).toBe(t0.toISOString());
      expect(meta.lastPublishedAt?.toISOString()).toBe(t0.toISOString());
      expect(meta.purgedPending).toBe(1);
    });

    it('tracks a publish run and finishes it once', async () => {
      await store.markContentSeeded(t0);
      await store.incrementPurgedPending();
      await store.incrementPurgedPending();
      const run = {
        runId: 42,
        runUrl: 'https://github.com/o/r/actions/runs/42',
        startedAt: t0,
        startedBy: 'Власник',
        result: 'in_progress' as const,
        finishedAt: null,
        snapshotAt: null,
        purgedAtSnapshot: 0,
      };
      await store.setPublishRun(run);
      expect(await store.patchPublishRun(7, { snapshotAt: later(1000) })).toBe(false);
      expect(
        await store.patchPublishRun(42, { snapshotAt: later(1000), purgedAtSnapshot: 1 }),
      ).toBe(true);
      expect((await store.getContentMeta()).lastRun?.snapshotAt?.toISOString()).toBe(
        later(1000).toISOString(),
      );
      const finish = {
        result: 'success' as const,
        finishedAt: later(5000),
        publishedAt: later(1000),
        purgedDelta: 1,
      };
      expect(await store.finishPublishRun(7, finish)).toBe(false);
      expect(await store.finishPublishRun(42, finish)).toBe(true);
      expect(await store.finishPublishRun(42, finish)).toBe(false);
      const meta = await store.getContentMeta();
      expect(meta.lastRun?.result).toBe('success');
      expect(meta.lastRun?.finishedAt?.toISOString()).toBe(later(5000).toISOString());
      expect(meta.lastPublishedAt?.toISOString()).toBe(later(1000).toISOString());
      expect(meta.purgedPending).toBe(1);
    });
  });
}
