/**
 * Проверка языковых версий собранного сайта (шаг `lang:check`; ТЗ 3.2, 4.13,
 * 12.4; решение 056). Закон № 2704-VIII, ст. 27 ч. 6
 * (https://zakon.rada.gov.ua/laws/show/2704-19): версия сайта коммунального
 * предприятия на государственном языке загружается по умолчанию и содержит
 * не меньше информации по объёму и содержанию, чем версии на других языках.
 * Текст нормы с первоисточником не сверен (`claude/04_vymohy.md`, раздел 3,
 * «[ПРОВЕРИТЬ]»): сайт rada.gov.ua закрыт для инструментов разработчика.
 *
 * Правила (на входе — HTML всех страниц сборки по пути от корня `dist`):
 * 1. `html lang`: `en` у страниц под `en/`, `uk` у остальных.
 * 2. У каждой английской страницы есть украинская по тому же пути без `en/`.
 * 3. Английских страниц не больше, чем украинских (без 404 и `/admin/`).
 * 4. Видимого текста в `main` английской страницы не больше, чем в `main`
 *    её украинской пары (знаки без пробелов, по кодовым точкам).
 * 5. На английской странице нет кириллицы вне элементов с `lang="uk"` — ни в
 *    тексте, ни в `alt`, `aria-label`, `title`, `content`: непереведённых
 *    подписей нет (ТЗ 12.4).
 * 6. `hreflang`: у страницы с парой — `uk`, `en` и `x-default` на украинскую,
 *    у страницы без пары — ни одного. Адреса ведут на существующие страницы.
 * 7. Каждая ссылка на `/en/…` ведёт на собранную страницу: переключатель и
 *    меню не уводят на 404.
 */

export type Pages = ReadonlyMap<string, string>;

const NOT_CONTENT = new Set(['404.html', 'admin/index.html']);
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const TEXT_ATTRS = ['alt', 'aria-label', 'title', 'content', 'placeholder'];
const CYRILLIC = /\p{Script=Cyrillic}/u;

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decode(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

export function attrs(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    result[(m[1] ?? '').toLowerCase()] = decode(m[2] ?? m[3] ?? '');
  }
  return result;
}

/** Без скриптов, стилей и комментариев: их текст посетитель не видит */
function stripInvisible(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '');
}

/** Видимый текст `main`: знаки без пробельных, по кодовым точкам */
export function mainTextLength(html: string): number {
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(stripInvisible(html))?.[1] ?? '';
  const text = decode(main.replace(/<[^>]+>/g, ' '));
  return [...text.replace(/\s+/gu, '')].length;
}

export function htmlLang(html: string): string | undefined {
  const tag = /<html\b[^>]*>/i.exec(html)?.[0];
  return tag ? attrs(tag).lang : undefined;
}

/** Кириллица вне `lang="uk"`: отрывки текста и атрибутов с ней */
export function cyrillicOutsideUk(html: string): string[] {
  const found: string[] = [];
  const stack: { name: string; uk: boolean }[] = [];
  const isUk = (): boolean => stack.at(-1)?.uk ?? false;
  const source = stripInvisible(html);
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
  let last = 0;
  const checkText = (text: string): void => {
    const clean = decode(text).replace(/\s+/gu, ' ').trim();
    if (clean && !isUk() && CYRILLIC.test(clean)) found.push(clean.slice(0, 80));
  };
  for (const m of source.matchAll(tagRe)) {
    checkText(source.slice(last, m.index));
    last = (m.index ?? 0) + m[0].length;
    const closing = m[1] === '/';
    const name = (m[2] ?? '').toLowerCase();
    if (closing) {
      const at = stack.map((s) => s.name).lastIndexOf(name);
      if (at >= 0) stack.length = at;
      continue;
    }
    const a = attrs(m[3] ?? '');
    const uk = a.lang !== undefined ? a.lang.startsWith('uk') : isUk();
    for (const key of TEXT_ATTRS) {
      const value = a[key];
      if (value && !uk && CYRILLIC.test(value))
        found.push(`${name}[${key}]: ${value.slice(0, 80)}`);
    }
    if (!VOID.has(name) && !(m[3] ?? '').trimEnd().endsWith('/')) stack.push({ name, uk });
  }
  checkText(source.slice(last));
  return found;
}

/** Адрес страницы → путь файла в `dist`: `/uzn-desna/en/` → `en/index.html` */
export function fileOf(href: string, base: string, origin: string): string | undefined {
  let path = href;
  if (path.startsWith(origin)) path = path.slice(origin.length);
  const prefix = base.endsWith('/') ? base : `${base}/`;
  if (!path.startsWith(prefix)) return undefined;
  path = path.slice(prefix.length).split('#')[0]?.split('?')[0] ?? '';
  if (path === '') return 'index.html';
  return path.endsWith('/') ? `${path}index.html` : path;
}

function headLinks(html: string): Record<string, string>[] {
  const head = html.slice(0, html.indexOf('</head>') + 1 || html.length);
  return [...head.matchAll(/<link\s[^>]*>/g)].map((m) => attrs(m[0]));
}

export interface CheckOptions {
  base: string;
  origin: string;
}

export interface CheckResult {
  errors: string[];
  ukPages: number;
  enPages: number;
}

export function checkLanguages(pages: Pages, { base, origin }: CheckOptions): CheckResult {
  const errors: string[] = [];
  const content = [...pages.keys()].filter((p) => !NOT_CONTENT.has(p));
  const en = content.filter((p) => p.startsWith('en/'));
  const uk = content.filter((p) => !p.startsWith('en/'));
  const pairOf = (page: string): string | undefined =>
    page.startsWith('en/') ? page.slice(3) : pages.has(`en/${page}`) ? `en/${page}` : undefined;

  if (en.length > uk.length) {
    errors.push(`английских страниц ${en.length} больше украинских ${uk.length}`);
  }

  for (const [page, html] of pages) {
    const fail = (message: string): void => {
      errors.push(`${page}: ${message}`);
    };
    const isEn = page.startsWith('en/');
    const lang = htmlLang(html);
    const expected = isEn ? 'en' : 'uk';
    if (lang !== expected) fail(`html lang = ${lang ?? 'нет'}, нужен ${expected}`);

    if (isEn) {
      const ukPage = page.slice(3);
      const ukHtml = pages.get(ukPage);
      if (ukHtml === undefined) {
        fail(`нет украинской страницы ${ukPage}`);
      } else {
        const enLength = mainTextLength(html);
        const ukLength = mainTextLength(ukHtml);
        if (enLength > ukLength) {
          fail(`текста в main ${enLength} знаков больше, чем в украинской (${ukLength})`);
        }
      }
      for (const snippet of cyrillicOutsideUk(html)) fail(`кириллица без lang="uk": «${snippet}»`);
    }

    if (page !== '404.html') {
      const alternates = headLinks(html).filter((l) => l.rel === 'alternate' && l.hreflang);
      const pair = pairOf(page);
      if (pair === undefined) {
        if (alternates.length > 0) fail('hreflang у страницы без языковой пары');
      } else {
        const by = new Map(alternates.map((l) => [l.hreflang, l.href ?? '']));
        const ukFile = isEn ? pair : page;
        const enFile = isEn ? page : pair;
        for (const [code, file] of [
          ['uk', ukFile],
          ['en', enFile],
          ['x-default', ukFile],
        ] as const) {
          const href = by.get(code);
          if (href === undefined) fail(`нет hreflang="${code}"`);
          else if (fileOf(href, base, origin) !== file) {
            fail(`hreflang="${code}" ведёт на ${href}, нужна ${file}`);
          }
        }
        if (alternates.length !== 3) fail(`hreflang: ${alternates.length} шт., нужно 3`);
      }
    }

    for (const m of stripInvisible(html).matchAll(/<a\s[^>]*>/g)) {
      const href = attrs(m[0]).href;
      if (!href) continue;
      const file = fileOf(href, base, origin);
      if (file?.startsWith('en/') && !pages.has(file)) fail(`ссылка на несобранную ${href}`);
    }
  }

  return { errors, ukPages: uk.length, enPages: en.length };
}
