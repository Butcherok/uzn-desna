/**
 * Шаг `budget:check` (ТЗ 10.4, 11.2): вес файлов первого экрана сверяется
 * с бюджетом. Значения бюджета — после сжатия при передаче, поэтому для
 * текстовых файлов считаем gzip, для шрифтов и изображений — размер как есть
 * (WOFF2, WebP и PNG уже сжаты).
 *
 * Считаются только файлы, которые страница действительно запрашивает:
 * ссылки из HTML и `url()` из подключённых стилей. Файлы в сборке, на которые
 * никто не ссылается, в бюджет не входят — они выводятся отдельной строкой,
 * потому что в сборке им обычно делать нечего.
 *
 * Изображения (решение 020). До него шаг их не считал вовсе: всё, кроме
 * HTML, CSS, JS и шрифтов, попадало в корзину «прочее». Правила счёта:
 *
 * 1. Один элемент — один файл. У `<img>` и `<picture>` берётся самый тяжёлый
 *    кандидат, который элемент может запросить, и считается один раз. Складывать
 *    все ступени `srcset` нельзя: браузер скачивает ровно одну. Дневной и ночной
 *    баннеры тоже не складываются — грузится один.
 * 2. Две контрольные ширины: 360 px (это и есть бюджет ТЗ 11.2 — «на телефоне»)
 *    и 1920 px. Атрибут `media` у `<source>` читается, поэтому боковые предметы
 *    с `media="(min-width: 768px)"` в телефонную строку не попадают.
 * 3. `loading="lazy"` — не первый экран. Такая картинка уходит в вес страницы
 *    целиком, а не в первый экран. Это делает правило ТЗ 11.2, п. 2 проверяемым.
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
  images: 250 * KB,
  mainImage: 150 * KB,
  firstScreen: 500 * KB,
};

/** Ширины, на которых проверяется первый экран (решение 020). */
const VIEWPORTS = [
  { label: 'телефон 360 px', width: 360 },
  { label: 'десктоп 1920 px', width: 1920 },
];

const IMAGE_EXT = new Set(['.webp', '.avif', '.png', '.jpg', '.jpeg', '.gif', '.svg']);

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
  if (IMAGE_EXT.has(ext)) return 'images';
  return 'other';
}

async function transferSize({ path, rel }) {
  const key = bucket(rel);
  if (key === 'fonts' || key === 'images') return (await stat(path)).size;
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
      ...text.matchAll(/srcset=["']([^"']+)["']/gu),
      ...text.matchAll(/url\((["']?)([^)"']+)\1\)/gu),
    ].flatMap((match) =>
      (match[2] ?? match[1]).split(',').map((part) => part.trim().split(/\s+/u)[0]),
    );

    for (const ref of refs) {
      if (ref === undefined || ref === '' || /^(https?:|mailto:|tel:|data:|#)/iu.test(ref))
        continue;
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

/**
 * Подходит ли `media` к контрольной ширине. Разбираются `min-width`, `max-width`
 * и `and`; `prefers-color-scheme` считается подходящим всегда — тема выбирается
 * не шириной, а системой, и нам нужен тяжёлый из двух вариантов, а не оба.
 * Непонятное условие считается подходящим: лучше посчитать лишнее, чем
 * пропустить картинку мимо бюджета.
 */
function mediaMatches(media, width) {
  if (!media) return true;
  return media.split(/\s+and\s+/iu).every((part) => {
    const min = /\(\s*min-width\s*:\s*(\d+)px\s*\)/iu.exec(part);
    if (min) return width >= Number(min[1]);
    const max = /\(\s*max-width\s*:\s*(\d+)px\s*\)/iu.exec(part);
    if (max) return width <= Number(max[1]);
    return true;
  });
}

/** Адреса из одного `srcset` или `src`: дескрипторы `w` и `x` отбрасываются. */
function urlsOf(attributeValue) {
  if (attributeValue === undefined) return [];
  return attributeValue
    .split(',')
    .map((part) => part.trim().split(/\s+/u)[0])
    .filter((url) => url !== undefined && url !== '' && !/^data:/iu.test(url));
}

const attr = (tag, name) => new RegExp(`${name}=["']([^"']*)["']`, 'iu').exec(tag)?.[1];

/**
 * Картиночные элементы страницы: каждый `<picture>` целиком и каждый `<img>`
 * вне `<picture>`. Для элемента возвращается список вариантов `{ media, urls }`
 * и признак отложенной загрузки.
 */
function imageElements(html) {
  const out = [];
  const covered = [];

  for (const match of html.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/giu)) {
    covered.push([match.index, match.index + match[0].length]);
    const inner = match[1];
    const variants = [];
    for (const source of inner.matchAll(/<source\b[^>]*>/giu)) {
      variants.push({ media: attr(source[0], 'media'), urls: urlsOf(attr(source[0], 'srcset')) });
    }
    const img = /<img\b[^>]*>/iu.exec(inner);
    const lazy = img ? attr(img[0], 'loading') === 'lazy' : false;
    if (img) {
      variants.push({
        media: undefined,
        urls: [...urlsOf(attr(img[0], 'srcset')), ...urlsOf(attr(img[0], 'src'))],
      });
    }
    out.push({ variants, lazy });
  }

  for (const match of html.matchAll(/<img\b[^>]*>/giu)) {
    if (covered.some(([from, to]) => match.index >= from && match.index < to)) continue;
    out.push({
      variants: [
        {
          media: undefined,
          urls: [...urlsOf(attr(match[0], 'srcset')), ...urlsOf(attr(match[0], 'src'))],
        },
      ],
      lazy: attr(match[0], 'loading') === 'lazy',
    });
  }

  return out;
}

/** Вес одного элемента на заданной ширине: самый тяжёлый возможный кандидат. */
function heaviest(element, width, sizeOf) {
  let max = 0;
  for (const variant of element.variants) {
    if (!mediaMatches(variant.media, width)) continue;
    for (const url of variant.urls) max = Math.max(max, sizeOf(url));
  }
  return max;
}

async function main() {
  const files = await walk(DIST).catch(() => []);
  if (files.length === 0) {
    console.error(`budget:check — сборка не найдена в ${DIST}. Сначала npm run build`);
    process.exit(1);
  }

  const referenced = await collectReferenced(files);
  const totals = { html: 0, css: 0, js: 0, fonts: 0 };
  const imageSize = new Map();
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

    if (key === 'images') {
      imageSize.set(posix.basename(file.rel), size);
      if (!referenced.has(file.rel)) unreferenced.push({ rel: file.rel, size });
      continue;
    }

    if (referenced.has(file.rel)) totals[key] += size;
    else unreferenced.push({ rel: file.rel, size });
  }

  totals.html = largestHtml;
  const sizeOf = (url) => imageSize.get(posix.basename(url.split('?')[0])) ?? 0;

  /** Изображения первого экрана по страницам и контрольным ширинам. */
  const images = VIEWPORTS.map((viewport) => ({ ...viewport, first: 0, main: 0, lazy: 0 }));
  for (const file of files.filter((candidate) => bucket(candidate.rel) === 'html')) {
    const elements = imageElements(await readFile(file.path, 'utf8'));
    for (const row of images) {
      let first = 0;
      let main = 0;
      let lazy = 0;
      for (const element of elements) {
        const size = heaviest(element, row.width, sizeOf);
        if (element.lazy) lazy += size;
        else {
          first += size;
          main = Math.max(main, size);
        }
      }
      // Бюджет первого экрана — про самую тяжёлую страницу, как и у HTML.
      row.first = Math.max(row.first, first);
      row.main = Math.max(row.main, main);
      row.lazy = Math.max(row.lazy, lazy);
    }
  }

  const kb = (value) => `${(value / KB).toFixed(1)} КБ`;
  const checks = [
    ['HTML (самая тяжёлая страница)', totals.html, BUDGET.html],
    ['CSS', totals.css, BUDGET.css],
    ['JavaScript публичных страниц', totals.js, BUDGET.js],
    ['Шрифты', totals.fonts, BUDGET.fonts],
  ];

  for (const row of images) {
    checks.push([`Изображения первого экрана, ${row.label}`, row.first, BUDGET.images]);
    // «Главное изображение» ТЗ 11.2 — это баннер. Шаг проверяет строже и
    // надёжнее: самое тяжёлое изображение первого экрана. Если под пределом
    // оно, то под пределом и баннер, а искать в разметке «главное» по смыслу
    // значило бы договариваться с проверкой о том, что считать главным.
    checks.push([
      `Самое тяжёлое изображение первого экрана, ${row.label}`,
      row.main,
      BUDGET.mainImage,
    ]);
  }

  const base = totals.html + totals.css + totals.js + totals.fonts;
  for (const row of images) {
    checks.push([`Первый экран целиком, ${row.label}`, base + row.first, BUDGET.firstScreen]);
  }

  let failed = false;
  for (const [label, actual, limit] of checks) {
    const ok = actual <= limit;
    if (!ok) failed = true;
    console.log(`${ok ? 'ок  ' : 'НЕТ '} ${label}: ${kb(actual)} из ${kb(limit)}`);
  }

  const lazy = images.find((row) => row.lazy > 0);
  if (lazy) {
    console.log(
      `     ниже первого экрана (loading="lazy"), самая тяжёлая страница: ${kb(lazy.lazy)}`,
    );
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
