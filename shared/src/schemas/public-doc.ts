import { z } from 'zod';
import { envelopeSchema } from './envelope.js';
import { langText } from './lang-text.js';

/**
 * Пункт публичной информации — сущность `PublicDoc` (ТЗ 4.3, 13.1).
 *
 * Где опубликован пункт. Перечень расширен против первой редакции ТЗ 13.1
 * проверкой адресов 15.11.2026: два из четырёх пунктов чинной страницы ведут
 * не на неё саму, а четыре пункта ст. 60-2 не опубликованы нигде.
 */
export const publishedWhereSchema = z.enum([
  /** Файл на этом сайте — версия 2 */
  'own',
  /** Чинна сторінка підприємства на kyivzelenbud.com */
  'parent',
  /** ІКС «Баланс» органу управління, balans.gukv.gov.ua */
  'balans',
  /** Prozorro */
  'prozorro',
  /** Є-data, spending.gov.ua */
  'edata',
  /** Нигде не опубликовано: выдаётся по запросу на информацию */
  'request',
]);

export type PublishedWhere = z.infer<typeof publishedWhereSchema>;

export const publicDocSchema = z
  .object({
    slug: z
      .string()
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Слаг: латиница, цифры и дефис'),
    /** Короткое название документа: подпись ссылки (ТЗ 13.1) */
    title: langText(200),
    /**
     * Формулировка пункта ч. 8 ст. 60-2. Есть только у пунктов перечня:
     * запись без него (Prozorro, стратегічний план) в перечень не выводится.
     */
    normRef: langText(400).optional(),
    publishedWhere: publishedWhereSchema,
    externalUrl: z.url().max(500).optional(),
    /** Выводить ли запись в блоке документов над перечнем */
    featured: z.boolean(),
    order: z.number().int().nonnegative(),
  })
  .refine((doc) => doc.publishedWhere !== 'request' || doc.externalUrl === undefined, {
    message: 'У пункта «надаётся за запитом» не может быть адреса',
    path: ['externalUrl'],
  })
  .refine((doc) => doc.publishedWhere === 'request' || doc.externalUrl !== undefined, {
    message: 'У опубликованного пункта должен быть адрес',
    path: ['externalUrl'],
  })
  .refine((doc) => doc.externalUrl === undefined || doc.externalUrl.startsWith('https://'), {
    message: 'Адрес должен быть абсолютным https:// (ТЗ 6.1, п. 8)',
    path: ['externalUrl'],
  })
  .refine((doc) => !doc.featured || doc.externalUrl !== undefined, {
    message: 'В блок документов попадает только запись с адресом',
    path: ['featured'],
  });

export type PublicDoc = z.infer<typeof publicDocSchema>;

export const publicDocsFileSchema = envelopeSchema.extend({
  items: z.array(publicDocSchema),
});
