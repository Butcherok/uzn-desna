import { z } from 'zod';
import { envelopeSchema } from './envelope.js';

/**
 * Модерация ленты «Новини галузі» (ТЗ 6.3, п. 4; 9.5; решение 043).
 *
 * В файле — только скрытые карточки: ключ записи ленты и время скрытия.
 * Возврат карточки убирает её из файла. Сборка не выводит карточки с этими
 * ключами, и следующая синхронизация их не возвращает: решение лежит не в
 * файле ленты, а здесь.
 */
export const moderationItemSchema = z.object({
  /** Естественный ключ `FeedItem.urlKey` (ТЗ 6.3). */
  urlKey: z.string().min(3).max(500),
  hiddenAt: z.iso.datetime(),
});

export type ModerationItem = z.infer<typeof moderationItemSchema>;

export const moderationFileSchema = envelopeSchema.extend({
  source: z.literal('admin-export'),
  items: z.array(moderationItemSchema),
});

export type ModerationFile = z.infer<typeof moderationFileSchema>;
