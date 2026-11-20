/**
 * Шаг `seo:check` (ТЗ 11.4, решение 039): метаданные собранных страниц
 * сверяются с правилами ТЗ. До шага превышения длины `description` проходили
 * приёмку незамеченными: проверять было нечем.
 *
 * Правила:
 * 1. `title` — один, не длиннее 60 знаков; `description` — одно, до 160 знаков.
 *    Знаки считаются по кодовым точкам, а не по байтам UTF-8.
 * 2. `title` и `description` не повторяются на разных страницах.
 * 3. `og:title` и `og:description` совпадают с `title` и `description`.
 * 4. Канонический адрес — один, абсолютный, `https`, со слешем в конце, и
 *    совпадает с `og:url`. У 404 нет ни канонического адреса, ни `og:url`:
 *    GitHub Pages отдаёт её на любой адрес.
 * 5. Пока `INDEXING_ENABLED` в `site/src/config/site.ts` равен `false`, на
 *    каждой странице `noindex, nofollow` (ТЗ 3.3). После снятия закрытия
 *    `noindex` остаётся у 404 и «Новин».
 * 6. `application/ld+json` разбирается как JSON; на главной он есть.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const DIST = 'site/dist';
const CONFIG = 'site/src/config/site.ts';
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 160;
/** Страницы вне индекса и после снятия закрытия (решение 039) */
const NOT_INDEXABLE = new Set(['404.html', 'news/index.html']);

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
const decode = (text) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, name) => ENTITIES[name]);

function attrs(tag) {
  const result = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    result[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? '');
  }
  return result;
}

const length = (text) => [...text].length;

function inspect(html) {
  const head = html.slice(0, html.indexOf('</head>') + 1 || html.length);
  const titles = [...head.matchAll(/<title>([\s\S]*?)<\/title>/g)].map((m) => decode(m[1]));
  const metas = [...head.matchAll(/<meta\s[^>]*>/g)].map((m) => attrs(m[0]));
  const links = [...head.matchAll(/<link\s[^>]*>/g)].map((m) => attrs(m[0]));
  const named = (name) => metas.filter((m) => m.name === name).map((m) => m.content);
  const prop = (name) => metas.filter((m) => m.property === name).map((m) => m.content);
  const jsonLd = [
    ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ].map((m) => m[1]);
  return {
    titles,
    descriptions: named('description'),
    robots: named('robots'),
    ogTitle: prop('og:title'),
    ogDescription: prop('og:description'),
    ogUrl: prop('og:url'),
    canonicals: links.filter((l) => l.rel === 'canonical').map((l) => l.href),
    jsonLd,
  };
}

const config = await readFile(CONFIG, 'utf8');
const flag = /export const INDEXING_ENABLED\s*=\s*(true|false)/.exec(config);
if (!flag) {
  console.error(`seo:check: в ${CONFIG} не найдена строка INDEXING_ENABLED`);
  process.exit(1);
}
const indexing = flag[1] === 'true';

const errors = [];
const seenTitles = new Map();
const seenDescriptions = new Map();
const files = (await htmlFiles(DIST)).sort();
if (files.length === 0) {
  console.error(`seo:check: в ${DIST} нет страниц — сначала npm run build`);
  process.exit(1);
}

for (const file of files) {
  const page = relative(DIST, file).split(sep).join('/');
  const fail = (message) => errors.push(`${page}: ${message}`);
  const m = inspect(await readFile(file, 'utf8'));

  if (m.titles.length !== 1) fail(`title: ${m.titles.length} шт., нужен один`);
  const title = m.titles[0] ?? '';
  if (length(title) > TITLE_MAX) fail(`title ${length(title)} знаков > ${TITLE_MAX}: «${title}»`);

  if (m.descriptions.length !== 1) fail(`description: ${m.descriptions.length} шт., нужно одно`);
  const description = m.descriptions[0] ?? '';
  if (length(description) > DESCRIPTION_MAX) {
    fail(`description ${length(description)} знаков > ${DESCRIPTION_MAX}`);
  }
  if (description === title) fail('description повторяет title');

  for (const [seen, value, what] of [
    [seenTitles, title, 'title'],
    [seenDescriptions, description, 'description'],
  ]) {
    if (seen.has(value)) fail(`${what} совпадает с ${seen.get(value)}`);
    else seen.set(value, page);
  }

  if (m.ogTitle.length !== 1 || m.ogTitle[0] !== title) fail('og:title не равен title');
  if (m.ogDescription.length !== 1 || m.ogDescription[0] !== description) {
    fail('og:description не равен description');
  }

  if (page === '404.html') {
    if (m.canonicals.length > 0) fail('у 404 не должно быть canonical');
    if (m.ogUrl.length > 0) fail('у 404 не должно быть og:url');
  } else {
    if (m.canonicals.length !== 1) fail(`canonical: ${m.canonicals.length} шт., нужен один`);
    const canonical = m.canonicals[0] ?? '';
    if (!/^https:\/\/[^/]+\/.*\/$|^https:\/\/[^/]+\/$/.test(canonical)) {
      fail(`canonical не абсолютный https со слешем: ${canonical}`);
    }
    if (m.ogUrl.length !== 1 || m.ogUrl[0] !== canonical) fail('og:url не равен canonical');
  }

  const robots = m.robots[0];
  if (m.robots.length > 1) fail('robots meta больше одной');
  if (!indexing) {
    if (robots !== 'noindex, nofollow') fail(`сайт закрыт, а robots = ${robots ?? 'нет'}`);
  } else if (NOT_INDEXABLE.has(page)) {
    if (!robots?.includes('noindex')) fail('страница вне индекса без noindex');
  } else if (robots?.includes('noindex')) {
    fail('индексация включена, а у страницы noindex');
  }

  for (const block of m.jsonLd) {
    try {
      JSON.parse(block);
    } catch (err) {
      fail(`application/ld+json не разбирается: ${err.message}`);
    }
  }
  if (page === 'index.html' && m.jsonLd.length === 0) fail('на главной нет разметки организации');
}

if (errors.length > 0) {
  console.error(`seo:check: ${errors.length} нарушений`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(
  `seo:check: ${files.length} страниц, нарушений нет (индексация ${indexing ? 'включена' : 'закрыта'})`,
);
