/**
 * Выгрузка для `publish-content` (ТЗ 8.5; решение 041). Запуск:
 * `npm run publish:export`. Переменные: `API_BASE`, `EXPORT_TOKEN`, `RUN_ID`
 * (номер прогона, по нему сервер отмечает время выгрузки), `PREV_DIR` —
 * прежние файлы для сравнения (по умолчанию `data`), `OUT_DIR` — куда писать
 * (по умолчанию `data`).
 *
 * Выводит `changed` в `GITHUB_OUTPUT`. При сбое пишет код из каталога 7.5
 * (`EXPORT_UNAVAILABLE`, `SCHEMA_MISMATCH`) и завершается с ошибкой; файлы
 * при этом не трогаются — сайт остаётся прежним (ТЗ 8.5, п. 5).
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  EXPORT_FILES,
  PublishError,
  fetchExport,
  mergeExport,
  waitForApi,
  type ExportDeps,
} from '../src/publish/export.js';
import { mask, secretValues } from '../src/sync/mask.js';

const env = process.env;
const secrets = secretValues(env, ['EXPORT_TOKEN']);
const log = (line: string) => console.log(mask(line, secrets));

const apiBase = (env['API_BASE'] ?? '').replace(/\/+$/u, '');
// Пробелы и перевод строки по краям — частый след вставки; сервер их тоже обрезает.
const token = (env['EXPORT_TOKEN'] ?? '').trim();
const runId = env['RUN_ID'] && /^\d+$/u.test(env['RUN_ID']) ? env['RUN_ID'] : null;
const prevDir = env['PREV_DIR'] || 'data';
const outDir = env['OUT_DIR'] || 'data';

const deps: ExportDeps = {
  fetch: globalThis.fetch.bind(globalThis),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  log,
};

async function readPrev(name: string): Promise<string | null> {
  try {
    return await readFile(join(prevDir, name), 'utf8');
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  if (!/^https:\/\/|^http:\/\/localhost[:/]/u.test(apiBase) || token.length < 32) {
    throw new PublishError('EXPORT_UNAVAILABLE', 'не заданы API_BASE или EXPORT_TOKEN');
  }
  if (!(await waitForApi(apiBase, deps))) {
    throw new PublishError('EXPORT_UNAVAILABLE', 'бэкенд не проснулся за 3 минуты');
  }
  const body = await fetchExport(apiBase, token, runId, deps);
  const previous: Record<string, string | null> = {};
  for (const name of EXPORT_FILES) previous[name] = await readPrev(name);
  const { writes, unchanged } = mergeExport(body, previous);

  await mkdir(outDir, { recursive: true });
  for (const name of EXPORT_FILES) {
    const text = writes[name] ?? previous[name];
    if (text !== null && text !== undefined) await writeFile(join(outDir, name), text);
  }
  const changed = Object.keys(writes);
  log(`publish: изменены — ${changed.join(', ') || 'нет'}; без изменений — ${unchanged.length}`);
  const output = env['GITHUB_OUTPUT'];
  if (output !== undefined) await appendFile(output, `changed=${changed.length > 0}\n`);
}

try {
  await main();
} catch (error) {
  const code = error instanceof PublishError ? error.code : 'EXPORT_UNAVAILABLE';
  console.error(`::error title=${code}::${mask((error as Error).message, secrets)}`);
  process.exitCode = 1;
}
