/**
 * Точка входа бэкенда (ТЗ 8, 10.5): Node.js и Fastify, только API.
 * Порядок запуска: разобрать окружение → начать слушать порт → в фоне
 * подключиться к БД, создать индексы и при необходимости первого владельца.
 * Порт открывается сразу, чтобы `/health` отвечал и при медленной БД.
 */
import { buildApp } from './app.js';
import { ConfigError, loadConfig } from './config/env.js';
import { BOOTSTRAP_MESSAGES, bootstrapOwner } from './domain/bootstrap.js';
import { seedContent } from './domain/content-seed.js';
import { INITIAL_DATA } from './gateway/initial-data.js';
import { MongoStore } from './gateway/mongo-store.js';

const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000, 60_000];

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const store = new MongoStore({ uri: config.mongoUri, dbName: config.mongoDb });
  const app = await buildApp(
    { config, store, now: () => new Date(), startedAt: new Date() },
    {
      logger: {
        level: config.env === 'production' ? 'info' : 'debug',
        redact: {
          paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
          censor: '[hidden]',
        },
      },
    },
  );

  const prepareDb = async (attempt = 0): Promise<void> => {
    try {
      await store.ensureIndexes();
      const outcome = await bootstrapOwner(store, config.bootstrap, new Date());
      const level = outcome === 'created' || outcome === 'skipped-users-exist' ? 'info' : 'warn';
      app.log[level]({ bootstrap: outcome }, BOOTSTRAP_MESSAGES[outcome]);
      const seed = await seedContent(store, INITIAL_DATA, new Date());
      app.log.info({ seed }, 'initial content');
    } catch (err) {
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] ?? 60_000;
      app.log.warn({ err, retryInMs: delay }, 'database preparation failed, will retry');
      setTimeout(() => void prepareDb(attempt + 1), delay).unref();
    }
  };

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await store.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ host: config.host, port: config.port });
  void prepareDb();
}

void main();
