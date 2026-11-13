/**
 * Шаг `budget:check` (ТЗ 10.4, 11.2): вес файлов первого экрана сверяется
 * с бюджетом. Значения бюджета — после сжатия при передаче, поэтому для
 * текстовых файлов считаем gzip, для шрифтов — размер как есть (WOFF2 уже сжат).
 *
 * Считаются только файлы, которые страница действительно запрашивает:
 * ссылки из HTML и `url()` из подключённых стилей. Файлы в сборке, на которые
 * никто не ссылается, в бюджет не входят — они выводятся отдельной строкой,
 * потому что в сборке им обычно делать нечего.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, extname, posix } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = 'site/dist';
const KB = 1024;

const BUDGET = {
  html: 50 * KB,
  css: 30 * KB,
  js: 50 * KB,
  fonts: 120 * KB,
  firstScreen: 500 * KB,
};

async function walk(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    const rel = posix.join(prefix, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path, rel)));
    else out.push({ path, rel });
  }
  return out;
}

function bucket(rel) {
  const ext = extname(rel).toLowerCase();
  if (ext === '.html') return 'html';
  if (ext === '.css') return 'css';
  if (ext === '.js' || ext === '.mjs') return 'js';
  if (ext === '.woff2' || ext === '.woff') return 'fonts';
  return 'other';
}

async function transferSize({ path, rel }) {
  if (bucket(rel) === 'fonts') return (await stat(path)).size;
  return gzipSync(await readFile(path)).length;
}

/** Имя файла в сборке по значению атрибута или url(): базовый путь отбрасывается. */
function resolveToRel(reference, byName) {
  const clean = reference.split('?')[0].split('#')[0];
  const name = posix.basename(clean);
  return byName.get(name);
}

async function collectReferenced(files) {
  const byName = new Map(files.map((file) => [posix.basename(file.rel), file.rel]));
  const referenced = new Set();
  const queue = files.filter((file) => bucket(file.rel) === 'html');

  while (queue.length > 0) {
    const file = queue.shift();
    const text = await readFile(file.path, 'utf8');
    const refs = [
      ...text.matchAll(/(?:src|href)=["']([^"']+)["']/gu),
      ...text.matchAll(/url\((["']?)([^)"']+)\1\)/gu),
    ].map((match) => match[2] ?? match[1]);

    for (const ref of refs) {
      if (/^(https?:|mailto:|tel:|data:|#)/iu.test(ref)) continue;
      const rel = resolveToRel(ref, byName);
      if (rel === undefined || referenced.has(rel)) continue;
      referenced.add(rel);
      if (bucket(rel) === 'css') {
        const next = files.find((candidate) => candidate.rel === rel);
        if (next) queue.push(next);
      }
    }
  }

  return referenced;
}

async function main() {
  const files = await walk(DIST).catch(() => []);
  if (files.length === 0) {
    console.error(`budget:check — сборка не найдена в ${DIST}. Сначала npm run build`);
    process.exit(1);
  }

  const referenced = await collectReferenced(files);
  const totals = { html: 0, css: 0, js: 0, fonts: 0 };
  const unreferenced = [];
  let largestHtml = 0;

  for (const file of files) {
    const key = bucket(file.rel);
    if (key === 'other') continue;

    const size = await transferSize(file);

    if (key === 'html') {
      if (size > largestHtml) largestHtml = size;
      continue;
    }

    if (referenced.has(file.rel)) totals[key] += size;
    else unreferenced.push({ rel: file.rel, size });
  }

  totals.html = largestHtml;
  const firstScreen = totals.html + totals.css + totals.js + totals.fonts;
  const kb = (value) => `${(value / KB).toFixed(1)} КБ`;

  const checks = [
    ['HTML (самая тяжёлая страница)', totals.html, BUDGET.html],
    ['CSS', totals.css, BUDGET.css],
    ['JavaScript публичных страниц', totals.js, BUDGET.js],
    ['Шрифты', totals.fonts, BUDGET.fonts],
    ['Первый экран целиком', firstScreen, BUDGET.firstScreen],
  ];

  let failed = false;
  for (const [label, actual, limit] of checks) {
    const ok = actual <= limit;
    if (!ok) failed = true;
    console.log(`${ok ? 'ок  ' : 'НЕТ '} ${label}: ${kb(actual)} из ${kb(limit)}`);
  }

  if (unreferenced.length > 0) {
    console.log('     в бюджет не входят, на них не ссылается ни одна страница:');
    for (const file of unreferenced) console.log(`     ${file.rel} — ${kb(file.size)}`);
  }

  if (failed) {
    console.error('budget:check — бюджет первого экрана превышен (ТЗ 11.2)');
    process.exit(1);
  }
}

await main();
