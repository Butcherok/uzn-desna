import { z } from 'zod';

/**
 * Переменные окружения бэкенда (ТЗ 10.5). Значения задаются в настройках
 * Render; в репозитории — только имена (`.env.example`). Секреты не
 * выводятся в журнал: при ошибке разбора называется имя переменной, не значение.
 */

const origin = z
  .url()
  .refine((v) => new URL(v).origin === v, 'ожидается адрес без пути и косой черты в конце');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'ожидается строка подключения MongoDB'),
    MONGODB_DB: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,38}$/)
      .default('uzn'),
    /** Адрес сайта на Pages — единственный разрешённый источник CORS (ТЗ 8.1, п. 5). */
    SITE_ORIGIN: origin.default('http://localhost:4321'),
    /** Режим SameSite cookie сессии. ТЗ 8.2, п. 1 — `lax`; см. findings про межсайтовую админку. */
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    /**
     * Сколько прокси стоит перед сервисом. Нужно, чтобы адрес клиента для
     * ограничения частоты брался из `X-Forwarded-For`, а не был адресом прокси.
     * Значение для Render задаётся в задаче 5б после сверки с документацией.
     */
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    BUILD_VERSION: z.string().optional(),
    RENDER_GIT_COMMIT: z.string().optional(),
    BOOTSTRAP_OWNER_LOGIN: z.string().optional(),
    BOOTSTRAP_OWNER_PASSWORD_HASH: z.string().optional(),
    BOOTSTRAP_OWNER_DISPLAY_NAME: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.SITE_ORIGIN.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['SITE_ORIGIN'],
        message: 'в production нужен адрес https://',
      });
    }
    if (env.COOKIE_SAME_SITE === 'none' && env.NODE_ENV !== 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SAME_SITE'],
        message: 'SameSite=None работает только с Secure, то есть в production',
      });
    }
  });

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  mongoUri: string;
  mongoDb: string;
  siteOrigin: string;
  /** Разрешённые источники CORS: сайт и в разработке — `localhost:4321`. */
  corsOrigins: string[];
  cookieSameSite: 'lax' | 'strict' | 'none';
  cookieSecure: boolean;
  cookieName: string;
  trustProxy: number;
  version: string;
  bootstrap: { login: string; passwordHash: string; displayName: string } | null;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  // Пустая строка в настройках сервиса = переменная не задана.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v.trim() !== ''),
  );
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new ConfigError(`Неверные переменные окружения:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  const secure = e.NODE_ENV === 'production';
  const bootLogin = e.BOOTSTRAP_OWNER_LOGIN?.trim().toLowerCase();
  const bootHash = e.BOOTSTRAP_OWNER_PASSWORD_HASH?.trim();
  return {
    env: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    mongoUri: e.MONGODB_URI,
    mongoDb: e.MONGODB_DB,
    siteOrigin: e.SITE_ORIGIN,
    corsOrigins:
      e.NODE_ENV === 'production'
        ? [e.SITE_ORIGIN]
        : [...new Set([e.SITE_ORIGIN, 'http://localhost:4321'])],
    cookieSameSite: e.COOKIE_SAME_SITE,
    cookieSecure: secure,
    // Префикс `__Host-` браузер принимает только у Secure-cookie с Path=/ и без Domain:
    // такую cookie не подменит соседний поддомен.
    cookieName: secure ? '__Host-uzn_sid' : 'uzn_sid',
    trustProxy: e.TRUST_PROXY,
    version: e.BUILD_VERSION ?? e.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev',
    bootstrap:
      bootLogin && bootHash
        ? {
            login: bootLogin,
            passwordHash: bootHash,
            displayName: e.BOOTSTRAP_OWNER_DISPLAY_NAME?.trim() || 'Власник',
          }
        : null,
  };
}
