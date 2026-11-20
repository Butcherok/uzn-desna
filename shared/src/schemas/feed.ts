import { z } from 'zod';
import { dataStateSchema, envelopeSchema } from './envelope.js';
import { syncErrorCodeSchema } from './tender.js';

/**
 * Тематическая лента «Новини галузі» (ТЗ 4.8, 6.3, 7.4; решение 027).
 *
 * `FeedItem` пишет синхронизация, человек его не правит. `FeedRule` —
 * правила ленты: до админки лежат в `data/feed-rules.json`, потом правятся
 * владельцем в разделе «Словник стрічки» (ТЗ 6.2).
 */

/** Источники белого списка (ТЗ 7.4). Включение — данными, а не кодом (п. 1). */
export const feedSourceIdSchema = z.enum([
  'kmda',
  'kyivzelenbud',
  'theconversation',
  'hmarochos',
  'gdelt',
]);

export type FeedSourceId = z.infer<typeof feedSourceIdSchema>;

/** Путь, которым пришла запись: тематическая выборка или запасная лента (ТЗ 6.3). */
export const feedViaSchema = z.enum(['tag', 'rss', 'gdelt']);

export const feedItemSchema = z.object({
  /** Адрес без схемы, `www.`, параметров, якоря и конечной косой черты. */
  urlKey: z.string().min(3).max(500),
  url: z.url().startsWith('https://'),
  title: z.string().min(1).max(300),
  sourceId: feedSourceIdSchema,
  sourceName: z.string().min(1).max(80),
  sourceDomain: z.string().min(3).max(80),
  lang: z.enum(['uk', 'en']),
  publishedAt: z.iso.datetime({ offset: true }),
  /** Только у источников с `excerptAllowed` (ТЗ 7.4, п. 7). */
  excerpt: z.string().max(200).nullable(),
  /** Набора категорий пока нет (заглушка 23): всегда `null`. */
  category: z.string().max(40).nullable(),
  via: feedViaSchema,
  fetchedAt: z.iso.datetime(),
});

export type FeedItem = z.infer<typeof feedItemSchema>;

export const FEED_ITEMS_KEPT = 40;
export const FEED_ITEMS_SHOWN = 8;
export const FEED_ITEMS_ON_HOME = 3;

export const feedSourceErrorSchema = z.object({
  source: feedSourceIdSchema,
  code: syncErrorCodeSchema,
});

export const feedFileSchema = envelopeSchema.extend({
  source: z.literal('sync'),
  state: dataStateSchema,
  items: z.array(feedItemSchema).max(FEED_ITEMS_KEPT),
  fetchedAt: z.iso.datetime().nullable(),
  lastSuccessAt: z.iso.datetime().nullable(),
  sourceErrors: z.array(feedSourceErrorSchema),
});

export type FeedFile = z.infer<typeof feedFileSchema>;

/** Корень словаря: строчные буквы, апостроф, дефис, пробел. */
const root = z
  .string()
  .min(2)
  .max(40)
  .regex(/^[a-zа-щьюяґєії' -]+$/u);

const dictionarySchema = z.object({
  topics: z.array(root).min(1),
  /** Связки: оба корня должны идти подряд (`зелен* зон*`). */
  pairs: z.array(z.tuple([root, root])),
  stop: z.array(root),
});

export const feedRuleSourceSchema = z.object({
  id: feedSourceIdSchema,
  name: z.string().min(1).max(80),
  enabled: z.boolean(),
  excerptAllowed: z.boolean(),
  /** Почему выключен — для владельца и для журнала. */
  note: z.string().max(300).optional(),
});

export const feedRulesSchema = z.object({
  sources: z.array(feedRuleSourceSchema).min(1),
  dictionary: z.object({ uk: dictionarySchema, en: dictionarySchema }),
});

export type FeedRules = z.infer<typeof feedRulesSchema>;
export type FeedRuleSource = z.infer<typeof feedRuleSourceSchema>;

export const feedRulesFileSchema = envelopeSchema.extend({
  source: z.literal('admin-export'),
  items: z.array(feedRulesSchema).length(1),
});
