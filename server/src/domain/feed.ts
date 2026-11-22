/**
 * Модерация ленты «Новини галузі» (ТЗ 9.5; 6.3, п. 4; решение 043).
 *
 * Карточки ленты в БД не хранятся: их пишет синхронизация в ветку
 * `sync-data`, а админка читает тот же файл через `FeedSource`. В БД живёт
 * только решение редактора — `ModerationRecord`. Текст чужой публикации не
 * правится (ТЗ 9.5, п. 4): доступно только скрытие и возврат.
 */
import { FEED_ITEMS_ON_HOME, FEED_ITEMS_SHOWN, type FeedFile } from '@uzn/shared';
import { ApiError } from './errors.js';
import type { ModerationRecord, Store, User } from './model.js';

/** Последний файл ленты; `fresh: false` — прочитать не удалось, `file` — прежняя копия. */
export interface FeedLoad {
  file: FeedFile | null;
  fresh: boolean;
}

/** Чтение файла ленты. Реализация — `gateway/feed-source.ts`. */
export interface FeedSource {
  load(): Promise<FeedLoad>;
}

/** Где окажется карточка после публикации при нынешних решениях. */
export type FeedPlace = 'home' | 'news' | 'reserve';

export interface FeedItemView {
  urlKey: string;
  url: string;
  title: string;
  sourceName: string;
  lang: 'uk' | 'en';
  publishedAt: string;
  hidden: boolean;
  /** Время скрытия; у видимой — `null`. */
  hiddenAt: string | null;
  /** У скрытой — `null`. */
  place: FeedPlace | null;
}

export interface FeedView {
  /** ТЗ 6.5: `unknown` — файл ленты прочитать не удалось. */
  state: 'data' | 'empty' | 'unknown';
  items: FeedItemView[];
}

export const CARD_NOT_FOUND_MESSAGE = 'Картку не знайдено у стрічці. Оновіть сторінку';

function placeOf(index: number): FeedPlace {
  if (index < FEED_ITEMS_ON_HOME) return 'home';
  if (index < FEED_ITEMS_SHOWN) return 'news';
  return 'reserve';
}

/**
 * Карточки для админки: видимые по дате, новые первыми, затем скрытые
 * (ТЗ 9.5, п. 1). Место считается так же, как его посчитает сборка:
 * скрытые не занимают мест, их места переходят следующим (решение 043).
 */
export function feedView(load: FeedLoad, decisions: readonly ModerationRecord[]): FeedView {
  const byKey = new Map(decisions.filter((d) => d.hidden).map((d) => [d.urlKey, d]));
  const items = [...(load.file?.items ?? [])].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
  const visible: FeedItemView[] = [];
  const hidden: FeedItemView[] = [];
  for (const item of items) {
    const decision = byKey.get(item.urlKey);
    const view = {
      urlKey: item.urlKey,
      url: item.url,
      title: item.title,
      sourceName: item.sourceName,
      lang: item.lang,
      publishedAt: item.publishedAt,
    };
    if (decision) {
      hidden.push({
        ...view,
        hidden: true,
        hiddenAt: decision.updatedAt.toISOString(),
        place: null,
      });
    } else {
      visible.push({ ...view, hidden: false, hiddenAt: null, place: placeOf(visible.length) });
    }
  }
  const state = !load.fresh ? 'unknown' : items.length === 0 ? 'empty' : 'data';
  return { state, items: [...visible, ...hidden] };
}

export interface FeedCtx {
  store: Store;
  source: FeedSource | null;
  now: Date;
}

const emptyLoad: FeedLoad = { file: null, fresh: false };

export async function loadFeed(source: FeedSource | null): Promise<FeedLoad> {
  if (!source) return emptyLoad;
  try {
    return await source.load();
  } catch {
    return emptyLoad;
  }
}

/**
 * Скрыть или вернуть карточку (ТЗ 9.5, п. 1, 3, 7). Повтор того же решения
 * ничего не меняет и в журнал не пишется: счётчик правок не растёт от
 * двойного нажатия. Скрыть можно только карточку, которая есть в ленте;
 * вернуть — всегда, даже если файл ленты сейчас не читается.
 */
export async function setFeedHidden(
  ctx: FeedCtx,
  actor: User,
  urlKey: string,
  hidden: boolean,
): Promise<{ changed: boolean }> {
  const load = await loadFeed(ctx.source);
  const item = load.file?.items.find((i) => i.urlKey === urlKey) ?? null;
  if (hidden && load.fresh && item === null) {
    throw new ApiError('NOT_FOUND', CARD_NOT_FOUND_MESSAGE);
  }
  const current = await ctx.store.findModeration(urlKey);
  if ((current?.hidden ?? false) === hidden) return { changed: false };
  if (!hidden && current === null) return { changed: false };

  await ctx.store.upsertModeration({ urlKey, hidden, updatedAt: ctx.now, updatedBy: actor.id });
  await ctx.store.appendLog({
    at: ctx.now,
    userId: actor.id,
    action: hidden ? 'feed.hide' : 'feed.show',
    entity: 'feed',
    entityId: urlKey,
    result: 'ok',
    details: { title: item?.title ?? null, source: item?.sourceName ?? null },
  });
  return { changed: true };
}
