/**
 * Точка входа `sync-external` (ТЗ 7.1). Запуск: `npm run sync -- prozorro feed`.
 * Шаги перечисляются аргументами; рабочий процесс решает, какие шаги
 * выполняются в этом прогоне (Prozorro — только утром, ТЗ 7.3, п. 3).
 *
 * Пишет в `data/sync/`. Для рабочего процесса выводит `site_changed` и
 * `any_changed` в `GITHUB_OUTPUT`.
 */
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { feedRulesFileSchema } from '@uzn/shared';
import { IMAGE_DIR, IMAGE_MAX_BYTES, attachImages } from '../src/sync/feed/images.js';
import { fetchSource } from '../src/sync/feed/sources.js';
import { ATTEMPT_TIMEOUT_MS, fetchText } from '../src/sync/http.js';
import { fetchTenders, searchUrl } from '../src/sync/prozorro.js';
import { mask, secretValues } from '../src/sync/mask.js';
import { runSync } from '../src/sync/run.js';
import type { Step } from '../src/sync/run.js';

const SYNC_DIR = join('data', 'sync');
const KNOWN_STEPS: readonly Step[] = ['prozorro', 'feed'];
const FEED_RULES_FILE = join('data', 'feed-rules.json');
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
const deps = { fetch, log, sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) };

// Фото публикаций ленты (решение 034).
const IMAGES_DIR = join(SYNC_DIR, IMAGE_DIR);
const UA = { 'user-agent': 'uzn-desna-sync/1.0 (+https://github.com/Butcherok/uzn-desna)' };
await mkdir(IMAGES_DIR, { recursive: true });
const imageDeps = {
  fetchPage: (url: string) =>
    fetchText(`фото ${new URL(url).hostname}`, url, { headers: UA }, deps),
  fetchImage: async (url: string) => {
    const response = await fetch(url, {
      headers: UA,
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.startsWith('image/'))
      throw new Error(`HTTP ${response.status} ${type}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > IMAGE_MAX_BYTES) throw new Error('too large');
    return bytes;
  },
  // 960×540: на десктопе карточка шире 360 px, плотность 2 — 720; запас на 3 колонки.
  toCardWebp: async (bytes: Uint8Array) =>
    new Uint8Array(
      await sharp(bytes)
        .rotate()
        .resize(960, 540, { fit: 'cover', position: 'attention' })
        .webp({ quality: 72 })
        .toBuffer(),
    ),
  listFiles: async () => (await readdir(IMAGES_DIR)).filter((f) => f.endsWith('.webp')),
  writeFile: (name: string, bytes: Uint8Array) => writeFile(join(IMAGES_DIR, name), bytes),
  removeFile: (name: string) => rm(join(IMAGES_DIR, name), { force: true }),
  log,
};

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
  fetchTenders: () => fetchTenders(deps, prozorroUrl),
  readFeedRules: async () => {
    const file = feedRulesFileSchema.parse(JSON.parse(await readFile(FEED_RULES_FILE, 'utf8')));
    const [rules] = file.items;
    if (rules === undefined) throw new Error('data/feed-rules.json: нет записи правил');
    return rules;
  },
  fetchFeedSource: (id, rules) => fetchSource(id, rules, deps, new Date()),
  attachFeedImages: (items) => attachImages(items, imageDeps),
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
