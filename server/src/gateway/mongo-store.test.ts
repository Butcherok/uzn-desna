import { afterAll, describe, expect, it } from 'vitest';
import { MongoStore } from './mongo-store.js';
import { storeContract } from './store-contract.js';

/**
 * Настоящая MongoDB. Локально у агента её нет (сайт загрузки MongoDB из его
 * контейнера недоступен), поэтому набор идёт только при `MONGODB_TEST_URI` —
 * в CI его задаёт сервисный контейнер `mongo` (`.github/workflows/ci.yml`).
 * Чтобы пропуск не прошёл незамеченным, в CI переменная `REQUIRE_MONGO_TESTS`
 * превращает отсутствие БД в ошибку.
 */
const uri = process.env['MONGODB_TEST_URI'];
const required = process.env['REQUIRE_MONGO_TESTS'] === '1';

if (uri) {
  const opened: MongoStore[] = [];
  let n = 0;
  storeContract('mongo', async () => {
    const store = new MongoStore({
      uri,
      dbName: `uzn_test_${process.pid}_${n++}`,
      serverSelectionTimeoutMS: 5000,
    });
    opened.push(store);
    await store.client.db(`uzn_test_${process.pid}_${n - 1}`).dropDatabase();
    await store.ensureIndexes();
    return store;
  });

  describe('mongo store specifics', () => {
    it('creates the TTL and unique indexes', async () => {
      const store = new MongoStore({ uri, dbName: `uzn_test_${process.pid}_idx` });
      opened.push(store);
      await store.ensureIndexes();
      await store.ensureIndexes(); // повторный запуск сервиса не падает
      const db = store.client.db(`uzn_test_${process.pid}_idx`);
      const sessions = await db.collection('sessions').indexes();
      expect(sessions.find((i) => i.name === 'session_ttl')?.expireAfterSeconds).toBe(0);
      expect(sessions.find((i) => i.name === 'token_unique')?.unique).toBe(true);
      const log = await db.collection('action_log').indexes();
      expect(log.find((i) => i.name === 'log_ttl')?.expireAfterSeconds).toBe(15_552_000);
    });

    it('reports an unreachable database as unavailable, not as empty', async () => {
      const dead = new MongoStore({
        uri: 'mongodb://127.0.0.1:1/?directConnection=true',
        dbName: 'x',
        serverSelectionTimeoutMS: 500,
      });
      opened.push(dead);
      expect(await dead.ping()).toBe(false);
      await expect(dead.countUsers()).rejects.toMatchObject({ name: 'StoreUnavailableError' });
    });
  });

  afterAll(async () => {
    for (const s of opened) {
      await s.client
        .db()
        .admin()
        .listDatabases()
        .then(async (r) => {
          for (const d of r.databases) {
            if (d.name.startsWith(`uzn_test_${process.pid}`))
              await s.client.db(d.name).dropDatabase();
          }
        })
        .catch(() => undefined);
      await s.close();
    }
  });
} else {
  describe('mongo store', () => {
    it.skipIf(!required)('requires MONGODB_TEST_URI in CI', () => {
      expect(uri, 'REQUIRE_MONGO_TESTS=1, but MONGODB_TEST_URI is not set').toBeDefined();
    });
  });
}
