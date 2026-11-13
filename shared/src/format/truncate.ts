/**
 * Обрезка текста по границе слова — ТЗ 5.2, пп. 1–2.
 * Посреди слова или ссылки не обрезаем никогда.
 */
export const TRUNCATE_EXCERPT = 200;
export const TRUNCATE_TITLE = 90;

const ELLIPSIS = '…';

export function truncateAtWord(input: string, limit: number): string {
  const text = input.replace(/\s+/gu, ' ').trim();
  if (limit <= 0) return '';
  if (text.length <= limit) return text;

  const head = text.slice(0, limit);
  const lastSpace = head.lastIndexOf(' ');
  const cut = lastSpace > 0 ? head.slice(0, lastSpace) : head;

  return `${cut.replace(/[\s,.;:!?-]+$/u, '')}${ELLIPSIS}`;
}
