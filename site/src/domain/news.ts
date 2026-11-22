/**
 * Правила раздела «Новини», блок «Новини галузі» (ТЗ 4.8; решение 027).
 * Слой domain: чистые функции над переданными данными.
 */
import { FEED_ITEMS_ON_HOME, FEED_ITEMS_SHOWN, formatDate } from '@uzn/shared';
import type { FeedFile } from '@uzn/shared';
import { kyivDate } from './vacancies';

export { FEED_ITEMS_ON_HOME, FEED_ITEMS_SHOWN };

/** Язык оригинала словом: своего перевода нет (отчёт 08, раздел 2; решение 031). */
export const LANG_LABELS = { uk: 'Українською', en: 'Англійською' } as const;

/**
 * Ссылка «Машинний переклад (Google)» для публикации не на украинском
 * (решение 031). Переводит сам посетитель в Google Перекладачі: свой перевод
 * мы не публикуем — у The Conversation перевод требует согласия автора
 * (CC BY-ND). Язык источника Google определяет сам (`sl=auto`).
 */
export function translateUrl(url: string): string {
  const params = new URLSearchParams({ sl: 'auto', tl: 'uk', u: url });
  return `https://translate.google.com/translate?${params.toString()}`;
}

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
  /** Ссылка на машинный перевод; у украинских публикаций — `null`. */
  translateUrl: string | null;
  /** Фото публикации у нас (решение 034); `null` — наша иллюстрация. */
  imagePath: string | null;
}

/**
 * Карточки по дате публикации, новые первыми. Ошибка источника ленту не
 * очищает: при `unknown` выводятся сохранённые карточки (ТЗ 4.8). Ни одной
 * карточки — блок скрывается целиком, пустого блока с заголовком нет.
 *
 * Скрытые в админке карточки (ТЗ 9.5; решение 043) отбрасываются до отбора
 * последних: их место занимают следующие из сохранённых, блок не худеет.
 */
export function feedCards(
  file: FeedFile,
  limit: number,
  hidden: ReadonlySet<string> = new Set(),
): FeedCard[] {
  return file.items
    .filter((item) => !hidden.has(item.urlKey))
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
        translateUrl: item.lang === 'uk' ? null : translateUrl(item.url),
        imagePath: item.imagePath,
      };
    });
}
