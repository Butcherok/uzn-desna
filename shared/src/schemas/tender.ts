import { z } from 'zod';
import { dataStateSchema, envelopeSchema } from './envelope.js';

/**
 * Синхронизируемые записи (ТЗ 6.3) и состояние выдачи (ТЗ 6.5).
 * Их пишет `sync-external` (ТЗ 7.1), человек их не правит.
 */

/** Закрытый перечень кодов ошибок (ТЗ 7.5, п. 5). */
export const syncErrorCodeSchema = z.enum([
  'SRC_TIMEOUT',
  'SRC_HTTP_4XX',
  'SRC_HTTP_5XX',
  'SRC_RATE_LIMIT',
  'SRC_PARSE',
  'TOKEN_INVALID',
  'EXPORT_UNAVAILABLE',
  'SCHEMA_MISMATCH',
]);

export type SyncErrorCode = z.infer<typeof syncErrorCodeSchema>;

/**
 * Источник синхронизации: Prozorro и каждый источник ленты отдельно —
 * счётчик сбоев подряд ведётся по источнику (ТЗ 7.5, п. 3). Facebook
 * добавится своей задачей.
 */
export const syncSourceSchema = z.enum([
  'prozorro',
  'kyivzelenbud',
  'desna',
  'podol',
  'dnipro',
  'theconversation',
  'hmarochos',
]);

export type SyncSource = z.infer<typeof syncSourceSchema>;

export const sourceErrorSchema = z.object({
  source: syncSourceSchema,
  code: syncErrorCodeSchema,
});

/** Номер закупки: `UA-ГГГГ-ММ-ДД-NNNNNN-x` (отчёт 05, раздел 3). */
export const TENDER_ID = /^UA-(\d{4})-(\d{2})-(\d{2})-\d{6}-[a-z]$/u;

export const tenderSchema = z.object({
  tenderID: z.string().regex(TENDER_ID),
  title: z.string().min(1).max(2000),
  status: z.string().min(1).max(80),
  amount: z.number().nonnegative().nullable(),
  currency: z.string().length(3).nullable(),
  vatIncluded: z.boolean().nullable(),
  /** Разобрана из номера закупки: в выдаче поиска даты публикации нет (ТЗ 7.3, п. 2). */
  datePublished: z.iso.date(),
  tenderEndDate: z.iso.datetime({ offset: true }).nullable(),
  url: z.url().startsWith('https://prozorro.gov.ua/tender/'),
});

export type Tender = z.infer<typeof tenderSchema>;

/** Файл внешнего блока: конверт (ТЗ 6.6) плюс поля состояния (ТЗ 6.5). */
export const tendersFileSchema = envelopeSchema.extend({
  source: z.literal('sync'),
  state: dataStateSchema,
  items: z.array(tenderSchema).max(20),
  fetchedAt: z.iso.datetime().nullable(),
  lastSuccessAt: z.iso.datetime().nullable(),
  sourceErrors: z.array(sourceErrorSchema),
});

export type TendersFile = z.infer<typeof tendersFileSchema>;

export const syncStateSchema = z.object({
  source: syncSourceSchema,
  lastRunAt: z.iso.datetime(),
  lastSuccessAt: z.iso.datetime().nullable(),
  result: z.enum(['ok', 'partial', 'error']),
  errorCode: syncErrorCodeSchema.nullable(),
  errorMessage: z.string().max(300).nullable(),
  itemsFetched: z.number().int().nonnegative(),
  itemsNew: z.number().int().nonnegative(),
  consecutiveFailures: z.number().int().nonnegative(),
});

export type SyncState = z.infer<typeof syncStateSchema>;

export const syncStateFileSchema = envelopeSchema.extend({
  source: z.literal('sync'),
  items: z.array(syncStateSchema),
});

export type SyncStateFile = z.infer<typeof syncStateFileSchema>;
