import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { ApiError } from './domain/errors.js';
import { StoreUnavailableError } from './domain/model.js';
import { hashSessionToken } from './domain/sessions.js';
import { ADMIN_CSP, adminRoutes, isAdminPath } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { contentRoutes } from './routes/content.js';
import { feedRoutes } from './routes/feed.js';
import { actionLogRoutes } from './routes/action-log.js';
import { backupRoutes } from './routes/backup.js';
import { DOCUMENT_MAX_BYTES } from '@uzn/shared';
import { publishRoutes } from './routes/publish.js';
import { UPLOAD_FIELD_MAX, uploadRoutes } from './routes/uploads.js';
import type { AppDeps } from './routes/http.js';
import { systemRoutes } from './routes/system.js';

export const API_PREFIX = '/api/v1';
/** ТЗ 8.1, п. 7: тело JSON — до 1 МБ. */
export const BODY_LIMIT_BYTES = 1024 * 1024;
/** ТЗ 8.1, п. 6: 60 запросов в минуту на сессию (без сессии — на адрес). */
export const SESSION_RATE = { max: 60, timeWindow: 60 * 1000 } as const;
/** `/health`: опрос Render (решение 037) плюс будильник админки. */
export const HEALTH_RATE = { max: 120, timeWindow: 60 * 1000 } as const;
/** ТЗ 8.2, п. 2: обязательный заголовок на всех изменяющих запросах. */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'uzn-admin';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface BuildOptions {
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(deps: AppDeps, opts: BuildOptions = {}): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: opts.logger ?? false,
    bodyLimit: BODY_LIMIT_BYTES,
    // Доверять ровно N ближайшим прокси (то же, что число в `trustProxy`).
    trustProxy:
      config.trustProxy > 0 ? (_addr: string, hop: number) => hop < config.trustProxy : false,
    // Идентификатор запроса виден в журнале процесса и помогает найти ошибку по жалобе.
    requestIdHeader: false,
    genReqId: () => crypto.randomUUID(),
  });

  app.decorateRequest('auth', null);

  await app.register(cookie);
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
    maxAge: 600,
  });
  await app.register(rateLimit, {
    global: true,
    ...SESSION_RATE,
    keyGenerator: (req) => {
      const token = req.cookies[config.cookieName];
      return token ? `s:${hashSessionToken(token)}` : `ip:${req.ip}`;
    },
    errorResponseBuilder: (_req, ctx) => {
      const minutes = Math.max(1, Math.ceil(ctx.ttl / 60_000));
      return new ApiError(
        'RATE_LIMITED',
        minutes <= 1
          ? 'Занадто багато спроб. Спробуйте за хвилину'
          : `Занадто багато спроб. Спробуйте за ${minutes} хв`,
      );
    },
  });

  // Файлы (ТЗ 8.4). Предел потока — самый большой допустимый файл; файл
  // сверх него обрезается и отмечается `truncated`, отказ формулирует домен.
  await app.register(multipart, {
    throwFileSizeLimit: false,
    limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1, fields: 5, fieldSize: UPLOAD_FIELD_MAX },
  });

  // Защита от подделки запросов (ТЗ 8.2, п. 2): изменяющий запрос без нашего
  // заголовка или с чужим Origin не исполняется. Простая HTML-форма с чужого
  // сайта не может поставить такой заголовок.
  app.addHook('onRequest', async (req) => {
    if (SAFE_METHODS.has(req.method)) return;
    const origin = req.headers.origin;
    if (origin !== undefined && !config.mutationOrigins.includes(origin)) {
      throw new ApiError('FORBIDDEN', 'Запит відхилено');
    }
    if (req.headers[CSRF_HEADER] !== CSRF_VALUE) {
      throw new ApiError('FORBIDDEN', 'Запит відхилено');
    }
  });

  app.addHook('onSend', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    reply.header(
      'Content-Security-Policy',
      isAdminPath(req.url.split('?')[0] ?? '')
        ? ADMIN_CSP
        : "default-src 'none'; frame-ancestors 'none'",
    );
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
  });

  app.setErrorHandler((err: FastifyError | ApiError | Error, req, reply) => {
    let apiErr: ApiError;
    if (err instanceof ApiError) {
      apiErr = err;
    } else if (err instanceof StoreUnavailableError) {
      req.log.warn({ err: err.cause }, 'database unavailable');
      apiErr = new ApiError('DB_UNAVAILABLE');
    } else {
      const code = (err as FastifyError).code;
      if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
        apiErr = new ApiError('FILE_TOO_LARGE', 'Дані завеликі');
      } else if (typeof code === 'string' && code.startsWith('FST_ERR_CTP_')) {
        apiErr = new ApiError('VALIDATION_FAILED', 'Не вдалося прочитати дані запиту', {
          status: 400,
        });
      } else {
        req.log.error({ err }, 'unhandled error');
        apiErr = new ApiError('INTERNAL');
      }
    }
    return reply.code(apiErr.status).type('application/json; charset=utf-8').send(apiErr.toBody());
  });

  app.setNotFoundHandler((_req, reply) => {
    const e = new ApiError('NOT_FOUND');
    return reply.code(e.status).send(e.toBody());
  });

  // ТЗ 8.6, 11.4 п. 5 (решение 039): обход разрешён, из индекса сервис
  // убирает заголовок `X-Robots-Tag` на каждом ответе. Запрет обхода прятал бы
  // этот заголовок от поисковика: адрес со ссылкой с `/admin` мог бы попасть в
  // индекс без содержимого.
  app.get('/robots.txt', { config: { rateLimit: false } }, async (_req, reply) =>
    reply.type('text/plain; charset=utf-8').send('User-agent: *\nDisallow:\n'),
  );

  await app.register(
    async (api) => {
      // Render опрашивает `/health` каждые несколько секунд (healthCheckPath):
      // предел выше общего, чтобы проверка Render вместе с будильником админки
      // не получила 429, и без записи каждого запроса в журнал. Совсем без
      // предела нельзя: каждый запрос пингует Atlas (100 операций в секунду).
      api.get('/health', { logLevel: 'warn', config: { rateLimit: HEALTH_RATE } }, async () => ({
        status: 'ok',
        dbConnected: await deps.store.ping(),
        startedAt: deps.startedAt.toISOString(),
        version: config.version,
      }));
      authRoutes(api, deps);
      contentRoutes(api, deps);
      publishRoutes(api, deps);
      uploadRoutes(api, deps);
      feedRoutes(api, deps);
      actionLogRoutes(api, deps);
      backupRoutes(api, deps);
      systemRoutes(api, deps);
    },
    { prefix: API_PREFIX },
  );

  adminRoutes(app, deps.adminAssets ?? null);

  return app;
}
