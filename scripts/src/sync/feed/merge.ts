/**
 * Сборка `feed.json` из прежнего файла и исходов источников (ТЗ 6.3, 6.5, 7.4).
 *
 * Порядок и вытеснение — по дате публикации: новые записи вытесняют самые
 * старые, по возрасту ничего не удаляется. Дата получения для этого не
 * годится: The Conversation отдаёт по 25 записей на тему за годы, и
 * вытесненная старая запись при следующем прогоне вернулась бы «новой»
 * (решение 027).
 */
import { FEED_ITEMS_KEPT, SCHEMA_VERSION } from '@uzn/shared';
import type { FeedFile, FeedItem, FeedRuleSource, FeedSourceId, SyncErrorCode } from '@uzn/shared';
import type { RawEntry } from './parse.js';
import type { FeedVia } from './sources.js';
import { SOURCES } from './sources.js';
import { excerptOf, normalizedTitle, urlKey } from './text.js';

export type FeedOutcome =
  | { source: FeedRuleSource; ok: true; via: FeedVia; entries: RawEntry[] }
  | { source: FeedRuleSource; ok: false; code: SyncErrorCode };

export function emptyFeedFile(now: string): FeedFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now,
    source: 'sync',
    state: 'unknown',
    items: [],
    fetchedAt: null,
    lastSuccessAt: null,
    sourceErrors: [],
  };
}

export function toFeedItem(
  source: FeedRuleSource,
  via: FeedVia,
  raw: RawEntry,
  now: string,
): FeedItem {
  const spec = SOURCES[source.id];
  return {
    urlKey: urlKey(raw.url),
    url: raw.url,
    title: raw.title,
    sourceId: source.id,
    sourceName: source.name,
    sourceDomain: spec?.domain ?? new URL(raw.url).hostname,
    lang: spec?.lang ?? 'uk',
    publishedAt: raw.publishedAt,
    excerpt: source.excerptAllowed ? excerptOf(raw.html) : null,
    category: null,
    via,
    fetchedAt: now,
  };
}

function byNewest(a: FeedItem, b: FeedItem): number {
  return b.publishedAt.localeCompare(a.publishedAt) || a.urlKey.localeCompare(b.urlKey);
}

/**
 * Прежние записи сохраняют своё `fetchedAt`; запись источника, выключенного
 * в правилах, уходит из файла: выключение означает «не показывать».
 */
export function mergeItems(
  previous: readonly FeedItem[],
  incoming: readonly FeedItem[],
  enabled: ReadonlySet<FeedSourceId>,
): FeedItem[] {
  const seenUrl = new Set<string>();
  const seenTitle = new Set<string>();
  const out: FeedItem[] = [];
  for (const item of [...previous, ...incoming]) {
    if (!enabled.has(item.sourceId)) continue;
    const title = normalizedTitle(item.title);
    if (seenUrl.has(item.urlKey) || seenTitle.has(title)) continue;
    seenUrl.add(item.urlKey);
    seenTitle.add(title);
    out.push(item);
  }
  return out.sort(byNewest).slice(0, FEED_ITEMS_KEPT);
}

/**
 * Хоть один источник ответил — `data` или `empty`; не ответил ни один —
 * `unknown` с прежними записями. Содержимое не изменилось — файл прежний,
 * коммита не будет (ТЗ 12.3).
 */
export function nextFeedFile(
  previous: FeedFile,
  outcomes: readonly FeedOutcome[],
  now: string,
): FeedFile {
  const enabled = new Set(outcomes.map((o) => o.source.id));
  const sourceErrors = outcomes
    .filter((o): o is Extract<FeedOutcome, { ok: false }> => !o.ok)
    .map((o) => ({ source: o.source.id, code: o.code }));
  const answered = outcomes.filter((o): o is Extract<FeedOutcome, { ok: true }> => o.ok);
  const incoming = answered.flatMap((o) =>
    o.entries.map((e) => toFeedItem(o.source, o.via, e, now)),
  );
  const items = mergeItems(previous.items, incoming, enabled);

  if (answered.length === 0) {
    return { ...previous, items, state: 'unknown', sourceErrors };
  }
  const state = items.length > 0 ? 'data' : 'empty';
  const same =
    JSON.stringify(items) === JSON.stringify(previous.items) &&
    previous.state === state &&
    JSON.stringify(sourceErrors) === JSON.stringify(previous.sourceErrors);
  if (same) return previous;
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now,
    source: 'sync',
    state,
    items,
    fetchedAt: now,
    lastSuccessAt: now,
    sourceErrors,
  };
}
