import { z } from 'zod';
import { envelopeSchema } from './envelope.js';
import { langText, richLangText } from './lang-text.js';
import { storedPhoneSchema } from '../format/phone.js';

/**
 * Карточка руководителя — сущность `Leader` (ТЗ 6.2, 13.1).
 *
 * Схема описывает поля версии 1: служебные поля записи БД в выгрузку для
 * публичных страниц не идут (ТЗ 6.1, пп. 2, 5, 7; решение 007).
 *
 * `phone` не обязателен: карточки версии 1 выводятся без телефонов
 * (решение Заказчика 17.11.2026, ТЗ 4.2). Карточка без телефона выводится
 * без строки телефона, а не с пустой строкой (ТЗ 12.2).
 *
 * `photoAlt` обязателен при наличии фото (ТЗ 5.3, п. 4): изображение без
 * описания — дефект доступности, а не мелочь оформления.
 *
 * `confirmedAt` и `confirmedBy` — отметка подтверждения карточки её
 * владельцем (ТЗ 5.4, п. 2). Проставляются после внутреннего показа;
 * правило публикации до отметки — решение 011.
 */
export const leaderSchema = z
  .object({
    slug: z
      .string()
      .max(60)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Слаг: латиница, цифры и дефис'),
    fullName: langText(120),
    position: langText(150),
    phone: storedPhoneSchema.optional(),
    bio: richLangText(2000).optional(),
    /** Путь в репозитории: `media/leaders/…` (ТЗ 6.1, п. 9; 8.4, п. 5) */
    photoPath: z
      .string()
      .max(200)
      .regex(/^media\/leaders\/[a-z0-9-]+\.(?:jpg|png|webp)$/u, 'Путь вида media/leaders/имя.jpg')
      .optional(),
    photoAlt: langText(150).optional(),
    /** Дата назначения на должность. Известна только у директора */
    since: z.iso.date().optional(),
    confirmedAt: z.iso.datetime().optional(),
    confirmedBy: z.string().max(120).optional(),
    order: z.number().int().nonnegative(),
  })
  .refine((leader) => leader.photoPath === undefined || leader.photoAlt !== undefined, {
    message: 'Есть фото — обязателен photoAlt (ТЗ 5.3, п. 4)',
    path: ['photoAlt'],
  });

export type Leader = z.infer<typeof leaderSchema>;

export const leadersFileSchema = envelopeSchema.extend({
  items: z.array(leaderSchema),
});
