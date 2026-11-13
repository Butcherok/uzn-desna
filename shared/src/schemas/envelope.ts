import { z } from 'zod';

/**
 * Конверт файла данных — ТЗ 6.6, п. 2. Один и тот же для выгрузки из админки
 * и для результата синхронизации.
 */
export const SCHEMA_VERSION = 1;

export const dataStateSchema = z.enum(['data', 'empty', 'unknown']);

export const envelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatedAt: z.iso.datetime(),
  source: z.enum(['admin-export', 'sync']),
  state: dataStateSchema.optional(),
  items: z.array(z.unknown()),
});

export type DataState = z.infer<typeof dataStateSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
