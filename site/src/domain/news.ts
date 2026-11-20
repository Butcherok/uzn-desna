/**
 * Правила раздела «Новини», блок «Новини галузі» (ТЗ 4.8; решение 027).
 * Слой domain: чистые функции над переданными данными.
 */
import { FEED_ITEMS_ON_HOME, FEED_ITEMS_SHOWN, formatDate } from '@uzn/shared';
import type { FeedFile } from '@uzn/shared';
import { kyivDate } from './vacancies';

export { FEED_ITEMS_ON_HOME, FEED_ITEMS_SHOWN };

/** Язык оригинала словом: перевода нет (отчёт 08, раздел 2). */
export const LANG_LABELS = { uk: 'Українською', en: 'Англійською' } as const;

export interface FeedCard {
  url: string;
  title: string;
  source: string;
  date: string;
  /** Машинная дата для `<time datetime>`. */
  isoDate: string;
  lang: 'uk' | 'en';
  langLabel: string;
  excerpt: string | null;
}

/**
 * Карточки по дате публикации, новые первыми. Ошибка источника ленту не
 * очищает: при `unknown` выводятся сохранённые карточки (ТЗ 4.8). Ни одной
 * карточки — блок скрывается целиком, пустого блока с заголовком нет.
 */
export function feedCards(file: FeedFile, limit: number): FeedCard[] {
  return [...file.items]
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, limit)
    .map((item) => {
      // Дата по киевскому времени: публикация в 00:30 по Киеву — это ещё
      // вчера по UTC.
      const isoDate = kyivDate(new Date(item.publishedAt));
      return {
        url: item.url,
        title: item.title,
        source: item.sourceName,
        date: formatDate(isoDate),
        isoDate,
        lang: item.lang,
        langLabel: LANG_LABELS[item.lang],
        excerpt: item.excerpt,
      };
    });
}
