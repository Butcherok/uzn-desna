/**
 * Текстовые правила ленты: разбор HTML-сущностей, снятие разметки, ключ
 * адреса и нормализованный заголовок для дублей (ТЗ 7.4, п. 5).
 */
import { TRUNCATE_EXCERPT, truncateAtWord } from '@uzn/shared';

const NAMED: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  laquo: '«',
  raquo: '»',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    }
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return NAMED[name.toLowerCase()] ?? whole;
  });
}

/** Текст без разметки: подписи к фото и скрипты выбрасываются целиком. */
export function stripHtml(html: string): string {
  const withoutBlocks = html.replace(
    /<(figure|figcaption|script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/giu,
    ' ',
  );
  return decodeEntities(withoutBlocks.replace(/<[^>]*>/gu, ' '))
    .replace(/\s+/gu, ' ')
    .trim();
}

export function cleanTitle(raw: string): string {
  return stripHtml(raw);
}

/** Отрывок до 200 символов по границе слова (ТЗ 5.2, 7.4, п. 7). */
export function excerptOf(html: string): string | null {
  const text = stripHtml(html);
  return text === '' ? null : truncateAtWord(text, TRUNCATE_EXCERPT);
}

/**
 * Ключ адреса: без схемы, `www.`, параметров, якоря и конечной косой черты,
 * хост в нижнем регистре. Путь регистр сохраняет: у части сайтов он значим.
 */
export function urlKey(url: string): string {
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(/^www\./u, '');
  const path = parsed.pathname.replace(/\/+$/u, '');
  return `${host}${path}`;
}

/** Заголовок для сравнения дублей: нижний регистр, без знаков, один пробел. */
export function normalizedTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[’ʼ`]/gu, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}
