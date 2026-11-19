/**
 * Точка входа `sync-external` (ТЗ 7.1). Запуск: `npm run sync -- prozorro`.
 * Шаги перечисляются аргументами; рабочий процесс решает, какие шаги
 * выполняются в этом прогоне (Prozorro — только утром, ТЗ 7.3, п. 3).
 *
 * Пишет в `data/sync/`. Для рабочего процесса выводит `site_changed` и
 * `any_changed` в `GITHUB_OUTPUT`.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchTenders, searchUrl } from '../src/sync/prozorro.js';
import { mask, secretValues } from '../src/sync/mask.js';
import { runSync } from '../src/sync/run.js';
import type { Step } from '../src/sync/run.js';

const SYNC_DIR = join('data', 'sync');
const KNOWN_STEPS: readonly Step[] = ['prozorro'];
/** Имена секретов, значения которых не должны попасть в журнал (ТЗ 7.5, п. 6). */
const SECRET_NAMES = ['GITHUB_TOKEN', 'GH_TOKEN', 'FB_PAGE_TOKEN', 'MONGODB_URI', 'EXPORT_TOKEN'];

const steps = process.argv.slice(2).filter((arg): arg is Step => KNOWN_STEPS.includes(arg as Step));
const unknown = process.argv.slice(2).filter((arg) => !KNOWN_STEPS.includes(arg as Step));
if (unknown.length > 0 || steps.length === 0) {
  console.error(
    `sync: шаги — ${KNOWN_STEPS.join(', ')}; получено: ${process.argv.slice(2).join(' ')}`,
  );
  process.exit(2);
}

const prozorroUrl = searchUrl(process.env['PROZORRO_SEARCH_URL']);
const secrets = secretValues(process.env, SECRET_NAMES);
const log = (line: string): void => console.log(mask(line, secrets));

await mkdir(SYNC_DIR, { recursive: true });

const result = await runSync(steps, {
  readJson: async (name) => {
    try {
      return JSON.parse(await readFile(join(SYNC_DIR, name), 'utf8')) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  },
  writeJson: (name, value) =>
    writeFile(join(SYNC_DIR, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8'),
  fetchTenders: () =>
    fetchTenders({ fetch, log, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) }, prozorroUrl),
  now: () => new Date().toISOString(),
  log,
  secrets,
});

log(`sync: изменён сайт — ${result.siteChanged}, изменены файлы — ${result.anyChanged}`);

const output = process.env['GITHUB_OUTPUT'];
if (output !== undefined) {
  await appendFile(
    output,
    `site_changed=${result.siteChanged}\nany_changed=${result.anyChanged}\n`,
  );
}

if (result.failed) {
  // Файлы уже записаны: счётчик сбоев должен дойти до репозитория, а прогон —
  // упасть, чтобы владелец получил письмо GitHub (ТЗ 7.5, п. 3).
  for (const reason of result.failReasons)
    console.error(`::error title=sync-external::${mask(reason, secrets)}`);
  process.exitCode = 1;
}
