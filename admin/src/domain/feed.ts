/**
 * Стрічка новин в админке (ТЗ 9.5; решения 043, 055): подписи и порядок
 * карточек ленты. Слой domain: чистые функции.
 */
import { FEED_ITEMS_ON_HOME, FEED_PAGE_SIZE } from '@uzn/shared';

export type FeedPlace = 'home' | 'news';

export interface FeedItemView {
  urlKey: string;
  url: string;
  title: string;
  sourceName: string;
  lang: 'uk' | 'en';
  publishedAt: string;
  hidden: boolean;
  hiddenAt: string | null;
  place: FeedPlace | null;
  /** Страница «Новин», с 1; у скрытой — `null`. */
  page: number | null;
}

export interface FeedList {
  state: 'data' | 'empty' | 'unknown';
  items: FeedItemView[];
  pendingChanges: number;
}

export const FEED_HINT =
  'Приховати картку можна лише на нашому сайті: на сайті джерела публікація залишається. ' +
  'Текст чужих публікацій не редагується. Прихована картка не повернеться після оновлення стрічки, ' +
  'а її місце займе наступна.';

export const FEED_PLACE_HINT =
  'Місце картки показано з урахуванням ваших змін. На сайті воно з’явиться після публікації.';

/** Где показывается карточка: главная — это и первая страница «Новин». */
export function placeLabel(place: FeedPlace, page: number | null): string {
  if (place === 'home') return 'Показується на головній і на 1-й сторінці «Новин»';
  return `Показується в «Новинах», сторінка ${page ?? 1}`;
}

export const LANG_LABEL = { uk: 'Українською', en: 'Англійською' } as const;

/** Дата публикации по Киеву: `20.11.2026`. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export const hiddenNotice = (title: string): string =>
  `Картку «${title}» приховано. Із сайту вона зникне після публікації — кнопка «Опублікувати зміни» внизу.`;

export const shownNotice = (title: string): string =>
  `Картку «${title}» повернуто. На сайті вона з’явиться після публікації.`;

/**
 * Список после решения по одной карточке, не дожидаясь ответа на `GET /feed`:
 * видимые по дате, затем скрытые; места пересчитываются так же, как на
 * сервере (3 на главной, все — в «Новинах» страницами).
 */
export function applyHidden(
  items: readonly FeedItemView[],
  urlKey: string,
  hidden: boolean,
  at: string,
): FeedItemView[] {
  const updated = items.map((i) =>
    i.urlKey === urlKey ? { ...i, hidden, hiddenAt: hidden ? at : null } : i,
  );
  const byDate = (a: FeedItemView, b: FeedItemView) => b.publishedAt.localeCompare(a.publishedAt);
  const visible = updated.filter((i) => !i.hidden).sort(byDate);
  const rest = updated.filter((i) => i.hidden).sort(byDate);
  return [
    ...visible.map((i, n) => ({
      ...i,
      place: (n < FEED_ITEMS_ON_HOME ? 'home' : 'news') as FeedPlace,
      page: Math.floor(n / FEED_PAGE_SIZE) + 1,
    })),
    ...rest.map((i) => ({ ...i, place: null, page: null })),
  ];
}
