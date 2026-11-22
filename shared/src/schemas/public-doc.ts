import { z } from 'zod';
import { envelopeSchema } from './envelope.js';
import { langText } from './lang-text.js';

/**
 * Пункт публичной информации — сущность `PublicDoc` (ТЗ 4.3, 13.1).
 *
 * Схема описывает поля версии 1. Служебные поля записи БД (`_id`, `status`,
 * `createdAt`, `updatedAt`, `deletedAt`) в выгрузку для страниц не попадают
 * по ТЗ 6.1, пп. 2, 5, 7. Поля загруженного файла (`filePath`, `docUpdatedAt`)
 * пришли с загрузкой файлов версии 2 (ТЗ 8.4; решение 042): у пункта `own`
 * вместо адреса — файл на этом сайте.
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
     * Предел 200 знаков — по ТЗ 13.1; на странице выводится целиком, не обрезается.
     */
    normRef: langText(200).optional(),
    publishedWhere: publishedWhereSchema,
    externalUrl: z.url().max(500).optional(),
    /** Загруженный файл: `media/public-docs/…` (ТЗ 13.1; 8.4, п. 5). Только у `own` */
    filePath: z
      .string()
      .max(200)
      .regex(
        /^media\/public-docs\/[a-z0-9-]+\.(?:pdf|docx)$/u,
        'Путь вида media/public-docs/имя.pdf',
      )
      .optional(),
    /** Дата обновления документа (ТЗ 13.1) */
    docUpdatedAt: z.iso.date().optional(),
    /** Выводить ли запись в блоке документов над перечнем */
    featured: z.boolean(),
    order: z.number().int().nonnegative(),
  })
  .refine((doc) => doc.publishedWhere !== 'request' || doc.externalUrl === undefined, {
    message: 'У пункта «надаётся за запитом» не может быть адреса',
    path: ['externalUrl'],
  })
  .refine((doc) => doc.publishedWhere === 'own' || doc.filePath === undefined, {
    message: 'Файл бывает только у пункта «на этом сайте»',
    path: ['filePath'],
  })
  .refine((doc) => doc.publishedWhere !== 'own' || doc.filePath !== undefined, {
    message: 'У пункта «на этом сайте» должен быть файл',
    path: ['filePath'],
  })
  .refine((doc) => doc.publishedWhere !== 'own' || doc.externalUrl === undefined, {
    message: 'У пункта «на этом сайте» вместо адреса — файл',
    path: ['externalUrl'],
  })
  .refine(
    (doc) =>
      doc.publishedWhere === 'request' ||
      doc.publishedWhere === 'own' ||
      doc.externalUrl !== undefined,
    {
      message: 'У опубликованного пункта должен быть адрес',
      path: ['externalUrl'],
    },
  )
  .refine((doc) => doc.externalUrl === undefined || doc.externalUrl.startsWith('https://'), {
    message: 'Адрес должен быть абсолютным https:// (ТЗ 6.1, п. 8)',
    path: ['externalUrl'],
  })
  .refine((doc) => !doc.featured || doc.externalUrl !== undefined || doc.filePath !== undefined, {
    message: 'В блок документов попадает только запись с адресом или файлом',
    path: ['featured'],
  });

export type PublicDoc = z.infer<typeof publicDocSchema>;

export const publicDocsFileSchema = envelopeSchema.extend({
  items: z.array(publicDocSchema),
});
