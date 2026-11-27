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

/**
 * Источники белого списка (ТЗ 7.4; решение 055). Включение и уривок —
 * данными (`feed-rules`, раздел «Словник стрічки»), а не кодом (п. 1); здесь —
 * перечень и значения для источника, которого в данных ещё нет.
 */
export const FEED_SOURCES = [
  { id: 'kyivzelenbud', name: 'Київзеленбуд', enabled: true, excerptAllowed: false },
  { id: 'desna', name: 'КП УЗН Деснянського району', enabled: true, excerptAllowed: true },
  { id: 'podol', name: 'КП УЗН Подільського району', enabled: true, excerptAllowed: false },
  { id: 'dnipro', name: 'КП УЗН Дніпровського району', enabled: true, excerptAllowed: false },
  { id: 'hmarochos', name: 'Хмарочос', enabled: true, excerptAllowed: false },
  { id: 'theconversation', name: 'The Conversation', enabled: true, excerptAllowed: true },
] as const;

export const feedSourceIdSchema = z.enum(
  FEED_SOURCES.map((s) => s.id) as [
    (typeof FEED_SOURCES)[number]['id'],
    ...(typeof FEED_SOURCES)[number]['id'][],
  ],
);

export type FeedSourceId = z.infer<typeof feedSourceIdSchema>;

/** Путь, которым пришла запись: тематическая выборка или запасная лента (ТЗ 6.3). */
export const feedViaSchema = z.enum(['tag', 'rss']);

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
  /** Категорий карточек нет (решение 031): всегда `null`. */
  category: z.string().max(40).nullable(),
  /**
   * Фото публикации у нас: `media/feed/<имя>.webp` в каталоге `data/sync/`
   * (решение 034). `null` — фото не нашлось или ещё не скачано: карточка
   * выводит нашу иллюстрацию. У файлов, записанных до решения 034, поля нет.
   */
  imagePath: z
    .string()
    .regex(/^media\/feed\/[0-9a-f]{12}\.webp$/)
    .nullable()
    .default(null),
  via: feedViaSchema,
  fetchedAt: z.iso.datetime(),
});

export type FeedItem = z.infer<typeof feedItemSchema>;

/**
 * Лента хранит публикации за год (решение 055): все выводятся страницами по
 * дате, новые первыми. Предел числа — только защита файла от сбоя источника.
 */
export const FEED_KEEP_DAYS = 365;
export const FEED_ITEMS_MAX = 2000;
/** Карточек на странице «Новин»: делится на 1, 2 и 3 колонки сетки. */
export const FEED_PAGE_SIZE = 24;
export const FEED_ITEMS_ON_HOME = 3;

export const feedSourceErrorSchema = z.object({
  source: feedSourceIdSchema,
  code: syncErrorCodeSchema,
});

export const feedFileSchema = envelopeSchema.extend({
  source: z.literal('sync'),
  state: dataStateSchema,
  items: z.array(feedItemSchema).max(FEED_ITEMS_MAX),
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

/**
 * Перечень источников в данных приводится к `FEED_SOURCES`: выбывший
 * источник (КМДА, GDELT — решение 055) отбрасывается, новый добавляется со
 * значениями по умолчанию. Так файл и запись БД, сохранённые до изменения
 * перечня, проходят схему, а настройки владельца у оставшихся не теряются.
 */
export function normalizeFeedSources(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  const known = new Set<string>(FEED_SOURCES.map((s) => s.id));
  const kept = value.filter(
    (s): s is { id: string } =>
      typeof s === 'object' && s !== null && known.has((s as { id?: unknown }).id as string),
  );
  const present = new Set(kept.map((s) => s.id));
  return [...kept, ...FEED_SOURCES.filter((s) => !present.has(s.id)).map((s) => ({ ...s }))];
}

export const feedRulesSchema = z.object({
  sources: z.preprocess(normalizeFeedSources, z.array(feedRuleSourceSchema).min(1)),
  dictionary: z.object({ uk: dictionarySchema, en: dictionarySchema }),
});

export type FeedRules = z.infer<typeof feedRulesSchema>;
export type FeedRuleSource = z.infer<typeof feedRuleSourceSchema>;

export const feedRulesFileSchema = envelopeSchema.extend({
  source: z.literal('admin-export'),
  items: z.array(feedRulesSchema).length(1),
});
