import { z } from 'zod';
import { envelopeSchema } from './envelope.js';
import { langText } from './lang-text.js';
import { storedPhoneSchema } from '../format/phone.js';

/**
 * Контактная точка — сущность `Contact` (ТЗ 6.2, 13.1).
 *
 * Схема описывает поля версии 1: служебные поля записи БД в выгрузку для
 * публичных страниц не идут (ТЗ 6.1, пп. 2, 5, 7; решение 007).
 *
 * `confirmed: false` — запись на сайт не выводится (ТЗ 4.6): непроверенный
 * телефон не публикуется. Отбор делает слой `domain`, не схема: файл вправе
 * хранить неподтверждённую запись, страница — нет.
 */
export const contactSchema = z.object({
  slug: z
    .string()
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Слаг: латиница, цифры и дефис'),
  /** Назначение: «Приймальня», «Бухгалтерія» (ТЗ 13.1) */
  purpose: langText(120),
  /** Хранится как +380XXXXXXXXX, выводится маской (ТЗ 5.1, п. 6; 6.1, п. 8) */
  phone: storedPhoneSchema,
  /** Часы ответа. Нет часов — выводится один номер без подписи */
  hours: langText(120).optional(),
  roundClock: z.boolean(),
  confirmed: z.boolean(),
  /** Выводить ли точку в подвале (ТЗ 3.1, подвал, пп. 1–2) */
  showInFooter: z.boolean(),
  order: z.number().int().nonnegative(),
});

export type Contact = z.infer<typeof contactSchema>;

export const contactsFileSchema = envelopeSchema.extend({
  items: z.array(contactSchema),
});
