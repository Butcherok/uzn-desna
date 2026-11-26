/**
 * Замер Lighthouse опубликованного сайта (решение 032; ТЗ 11.2).
 *
 * Режим телефона по умолчанию Lighthouse (имитация медленной сети и процессора
 * ×4), три прогона на страницу, медиана по каждой метрике отдельно — тот же
 * метод, что в `docs/checklists/v1-12-2.md`, раздел 1.
 *
 * Пишет в каталог `OUT`:
 * - `latest.md` — таблица последнего замера с отметкой порогов ТЗ 11.2;
 * - `history.csv` — дописывает строки (страница × замер), не переписывая старые.
 * Ту же таблицу дописывает в отчёт запуска (`GITHUB_STEP_SUMMARY`), если он есть.
 *
 * Падением рабочего процесса порог не отмечается: разброс лабораторного замера
 * давал бы ложные письма. Нарушение видно словом «не пройдено» в таблице.
 *
 * Запуск: node scripts/bin/lighthouse-run.mjs <базовый адрес> <каталог> [прогонов]
 * Переменные: LH_CHROME — путь к Chrome; LH_COMMIT — коммит, который замеряется;
 * LH_PAGES — страницы через пробел (по умолчанию — все страницы сайта).
 */
import { execFile } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const LIGHTHOUSE = 'lighthouse@13.6.0';

/** Все страницы сайта, кроме 404: на адресе с кодом 404 Lighthouse отчёт не строит. */
const PAGES = [
  ['/', 'Головна'],
  ['/about/', 'Про підприємство'],
  ['/about/public-info/', 'Публічна інформація'],
  ['/tenders/', 'Наші закупівлі'],
  ['/jobs/', 'Вакансії'],
  ['/services/', 'Послуги'],
  ['/contacts/', 'Контакти'],
  ['/news/', 'Новини'],
];

/** Пороги приёмки ТЗ 11.2: LCP, TBT, TTFB — мс; оценки — не ниже. */
const LIMITS = { lcp: 2500, cls: 0.1, tbt: 300, ttfb: 1200, score: 90 };

const [base, out, runsArg] = process.argv.slice(2);
if (!base || !out) {
  console.error('Нужно: <базовый адрес> <каталог> [прогонов]');
  process.exit(2);
}
const runs = Number(runsArg ?? 3);
const chrome = process.env.LH_CHROME ?? '/usr/bin/google-chrome';
const commit = process.env.LH_COMMIT ?? '';
const only = (process.env.LH_PAGES ?? '').split(' ').filter(Boolean);
const pages = only.length ? PAGES.filter(([p]) => only.includes(p)) : PAGES;

function median(values) {
  const v = values.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

async function once(url) {
  const { stdout } = await run(
    'npx',
    [
      '--yes',
      LIGHTHOUSE,
      url,
      '--output=json',
      '--quiet',
      '--only-categories=performance,accessibility,best-practices',
      '--chrome-flags=--headless=new --no-sandbox',
    ],
    { maxBuffer: 64 * 1024 * 1024, env: { ...process.env, CHROME_PATH: chrome } },
  );
  const r = JSON.parse(stdout);
  if (r.runtimeError) throw new Error(`${url}: ${r.runtimeError.code}`);
  const a = r.audits;
  const score = (k) => Math.round((r.categories[k]?.score ?? 0) * 100);
  return {
    perf: score('performance'),
    a11y: score('accessibility'),
    bp: score('best-practices'),
    lcp: a['largest-contentful-paint']?.numericValue,
    cls: a['cumulative-layout-shift']?.numericValue,
    tbt: a['total-blocking-time']?.numericValue,
    ttfb: a['server-response-time']?.numericValue,
    lighthouse: r.lighthouseVersion,
    chrome: r.environment?.hostUserAgent?.match(/Chrome\/(\d+)/)?.[1] ?? '',
  };
}

const rows = [];
let versions = '';
for (const [path, name] of pages) {
  const url = base.replace(/\/$/, '') + path;
  const samples = [];
  for (let i = 0; i < runs; i += 1) samples.push(await once(url));
  versions = `Lighthouse ${samples[0].lighthouse}, Chrome ${samples[0].chrome}`;
  const m = (k) => median(samples.map((s) => s[k]));
  rows.push({
    path,
    name,
    perf: m('perf'),
    a11y: m('a11y'),
    bp: m('bp'),
    lcp: m('lcp'),
    cls: m('cls'),
    tbt: m('tbt'),
    ttfb: m('ttfb'),
  });
  console.log(`${name}: CLS ${m('cls')?.toFixed(4)}, LCP ${Math.round(m('lcp'))} мс`);
}

const failed = (r) =>
  [
    r.lcp > LIMITS.lcp && 'LCP',
    r.cls > LIMITS.cls && 'CLS',
    r.tbt > LIMITS.tbt && 'TBT',
    r.ttfb > LIMITS.ttfb && 'TTFB',
    Math.min(r.perf, r.a11y, r.bp) < LIMITS.score && 'оценка',
  ].filter(Boolean);

const at = new Date().toISOString();
const sec = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} с`;
const num = (x, d) => x.toFixed(d).replace('.', ',');
const table = [
  '| Страница | Perf | A11y | BP | LCP | CLS | TBT | TTFB | Порог ТЗ 11.2 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...rows.map((r) => {
    const f = failed(r);
    return `| ${r.name} | ${r.perf} | ${r.a11y} | ${r.bp} | ${sec(r.lcp)} | ${num(r.cls, 3)} | ${Math.round(r.tbt)} мс | ${Math.round(r.ttfb)} мс | ${f.length ? `**не пройдено: ${f.join(', ')}**` : 'пройдено'} |`;
  }),
].join('\n');

const md = [
  '# Lighthouse — последний замер',
  '',
  `Замер: ${at}. Адрес: ${base}. Коммит: ${commit || 'не указан'}.`,
  `${versions}; режим телефона по умолчанию, ${runs} прогона на страницу, медиана по каждой метрике.`,
  '',
  table,
  '',
  `Пороги ТЗ 11.2: LCP ${sec(LIMITS.lcp)}, CLS ${num(LIMITS.cls, 2)}, TBT ${LIMITS.tbt} мс, TTFB ${sec(LIMITS.ttfb)}, оценки не ниже ${LIMITS.score}. История — \`history.csv\`.`,
  '',
].join('\n');

await mkdir(out, { recursive: true });
await writeFile(join(out, 'latest.md'), md);
const csv = join(out, 'history.csv');
const exists = await access(csv).then(
  () => true,
  () => false,
);
if (!exists) await writeFile(csv, 'at,commit,path,perf,a11y,bp,lcp_ms,cls,tbt_ms,ttfb_ms\n');
const before = exists ? await readFile(csv, 'utf8') : '';
const lines = rows
  .map(
    (r) =>
      `${at},${commit},${r.path},${r.perf},${r.a11y},${r.bp},${Math.round(r.lcp)},${r.cls.toFixed(4)},${Math.round(r.tbt)},${Math.round(r.ttfb)}`,
  )
  .join('\n');
await appendFile(csv, (before && !before.endsWith('\n') ? '\n' : '') + lines + '\n');
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md);
