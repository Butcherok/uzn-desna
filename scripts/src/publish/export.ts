/**
 * Шаг выгрузки рабочего процесса `publish-content` (ТЗ 8.5, пп. 4–5; ТЗ 7.5;
 * решение 041): разбудить бэкенд, забрать `GET /export`, проверить конверты и
 * записать файлы `data/`. Файл, у которого не изменились записи, не
 * переписывается: время выгрузки само по себе изменением не считается, и
 * пустых коммитов нет (ТЗ 6.6, п. 5; решение 023).
 *
 * Тело ответа и токен в журнал не пишутся — только коды и длины (ТЗ 7.5, п. 6).
 */
import { SCHEMA_VERSION, envelopeSchema } from '@uzn/shared';
import { z } from 'zod';

/** Редактируемые файлы `data/` (ТЗ 6.6, п. 1) — те, что отдаёт `/export`. */
export const EXPORT_FILES = [
  'contacts.json',
  'enterprise.json',
  'feed-rules.json',
  'leaders.json',
  'public-docs.json',
  'scenarios.json',
  'services.json',
  'static-blocks.json',
  'vacancies.json',
] as const;

/** Пробуждение Render — около минуты (отчёт 06, раздел 2); запас — втрое. */
export const WAKE_BUDGET_MS = 180_000;
export const WAKE_POLL_MS = 10_000;
export const REQUEST_TIMEOUT_MS = 60_000;
/** ТЗ 7.5, п. 2. */
export const RETRY_DELAYS_MS = [1_000, 5_000, 25_000] as const;

export class PublishError extends Error {
  constructor(
    readonly code: 'EXPORT_UNAVAILABLE' | 'SCHEMA_MISMATCH',
    message: string,
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

export interface ExportDeps {
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  log: (line: string) => void;
}

const exportBodySchema = z.object({
  schemaVersion: z.number().int(),
  generatedAt: z.iso.datetime(),
  files: z.record(z.string(), z.unknown()),
});

/** Ждёт ответа `/health` с `dbConnected: true`. `false` — бюджет вышел. */
export async function waitForApi(apiBase: string, deps: ExportDeps): Promise<boolean> {
  const deadline = deps.now() + WAKE_BUDGET_MS;
  for (let n = 1; ; n += 1) {
    try {
      const res = await deps.fetch(`${apiBase}/api/v1/health`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const body = (await res.json().catch(() => null)) as { dbConnected?: unknown } | null;
      deps.log(
        `health: попытка ${n}, код ${res.status}, БД ${body?.dbConnected === true ? 'да' : 'нет'}`,
      );
      if (res.ok && body?.dbConnected === true) return true;
    } catch (error) {
      deps.log(`health: попытка ${n}, сбой ${(error as Error).name}`);
    }
    if (deps.now() + WAKE_POLL_MS > deadline) return false;
    await deps.sleep(WAKE_POLL_MS);
  }
}

/** `GET /export` с повторами. 401 не повторяется: токен не совпал. */
export async function fetchExport(
  apiBase: string,
  token: string,
  runId: string | null,
  deps: ExportDeps,
): Promise<unknown> {
  const qs = runId ? `?runId=${encodeURIComponent(runId)}` : '';
  let last = 'нет ответа';
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await deps.sleep(RETRY_DELAYS_MS[attempt - 1] ?? 0);
    try {
      const res = await deps.fetch(`${apiBase}/api/v1/export${qs}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await res.text();
      deps.log(`export: попытка ${attempt + 1}, код ${res.status}, длина ${text.length}`);
      if (res.ok) {
        try {
          return JSON.parse(text) as unknown;
        } catch {
          throw new PublishError('SCHEMA_MISMATCH', 'ответ выгрузки не разбирается как JSON');
        }
      }
      if (res.status === 401) {
        throw new PublishError('EXPORT_UNAVAILABLE', 'токен выгрузки не принят (401)');
      }
      last = `HTTP ${res.status}`;
      if (res.status < 500 && res.status !== 429) break;
    } catch (error) {
      if (error instanceof PublishError) throw error;
      last = (error as Error).name;
      deps.log(`export: попытка ${attempt + 1}, сбой ${last}`);
    }
  }
  throw new PublishError('EXPORT_UNAVAILABLE', `выгрузка не получена: ${last}`);
}

export interface MergeResult {
  /** Имя файла → новый текст; только изменившиеся файлы. */
  writes: Record<string, string>;
  unchanged: string[];
}

/**
 * Проверяет ответ и сравнивает с прежними файлами. Набор файлов — ровно
 * `EXPORT_FILES`: лишний или недостающий файл — `SCHEMA_MISMATCH`, а не
 * молча пропущенный блок (ТЗ 6.6, п. 3).
 */
export function mergeExport(body: unknown, previous: Record<string, string | null>): MergeResult {
  const parsed = exportBodySchema.safeParse(body);
  if (!parsed.success) throw new PublishError('SCHEMA_MISMATCH', 'ответ выгрузки без поля files');
  if (parsed.data.schemaVersion !== SCHEMA_VERSION) {
    throw new PublishError(
      'SCHEMA_MISMATCH',
      `schemaVersion ${parsed.data.schemaVersion}, сборка знает ${SCHEMA_VERSION}`,
    );
  }
  const names = Object.keys(parsed.data.files).sort();
  const expected = [...EXPORT_FILES].sort();
  if (names.join(',') !== expected.join(',')) {
    throw new PublishError(
      'SCHEMA_MISMATCH',
      `набор файлов не совпадает: ${names.join(', ') || 'пусто'}`,
    );
  }

  const writes: Record<string, string> = {};
  const unchanged: string[] = [];
  for (const name of expected) {
    const env = envelopeSchema.safeParse(parsed.data.files[name]);
    if (!env.success || env.data.source !== 'admin-export') {
      throw new PublishError('SCHEMA_MISMATCH', `${name}: конверт не прошёл проверку`);
    }
    if (sameItems(previous[name] ?? null, env.data.schemaVersion, env.data.items)) {
      unchanged.push(name);
      continue;
    }
    writes[name] = `${JSON.stringify(env.data, null, 2)}\n`;
  }
  return { writes, unchanged };
}

function sameItems(prevText: string | null, version: number, items: unknown[]): boolean {
  if (prevText === null) return false;
  try {
    const prev = envelopeSchema.parse(JSON.parse(prevText));
    return prev.schemaVersion === version && canonical(prev.items) === canonical(items);
  } catch {
    return false;
  }
}

/**
 * Текст для сравнения: порядок ключей объекта не важен (запись из БД и файл,
 * написанный руками, перечисляют поля по-разному), порядок записей — важен.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
