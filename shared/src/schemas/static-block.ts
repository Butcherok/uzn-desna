import { z } from 'zod';
import { envelopeSchema } from './envelope.js';
import { langText } from './lang-text.js';

/**
 * Текстовый блок страницы — сущность `StaticBlock` (ТЗ 6.2, 13.1).
 * Ключи из закрытого перечня: текст на странице не пишется в её коде.
 */
export const blockKeySchema = z.enum([
  'home.intro',
  'home.numbers',
  'about.history',
  'public-info.note',
  'news.fb.note',
  'news.feed.note',
]);

export type BlockKey = z.infer<typeof blockKeySchema>;

export const staticBlockSchema = z.object({
  blockKey: blockKeySchema,
  text: langText(1000).optional(),
  numbers: z
    .array(z.object({ value: langText(20), label: langText(120) }))
    .max(4)
    .optional(),
});

export type StaticBlock = z.infer<typeof staticBlockSchema>;

export const staticBlocksFileSchema = envelopeSchema.extend({
  items: z.array(staticBlockSchema),
});
