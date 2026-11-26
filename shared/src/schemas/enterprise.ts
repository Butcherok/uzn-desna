import { z } from 'zod';
import { envelopeSchema } from './envelope.js';
import { langText, richLangText } from './lang-text.js';

/**
 * Реквизиты предприятия — сущность `Enterprise` (ТЗ 6.2, 13.1), синглтон.
 *
 * Схема описывает поля версии 1: служебные поля записи БД в выгрузку для
 * публичных страниц не идут (ТЗ 6.1, пп. 2, 5, 7; решение 007).
 *
 * Значения — паспорт предприятия, разделы 1, 3 и 4, и решения Заказчика
 * 17.11.2026 (полное название и подчинение — паспортные). Придуманных
 * сведений о предприятии в данных нет (инструкции проекта, п. 5).
 *
 * `nameShort` не обязательно: короткое название выводится в шапке, подвале
 * и метаданных всех страниц и живёт в `site/src/config/site.ts`; переносить
 * его в данные вместе с английской версией — задача версии 3 (решение 009).
 *
 * `structure` ТЗ 13.1 в схеме версии 1 нет: блок структуры на странице не
 * выводится (решение Заказчика 17.11.2026, решение 011), а поле без вывода
 * было бы данными, которые никто не проверяет.
 */
/** До шести знаков после запятой — так площади даны в источнике (решение 018). */
const hectares = z
  .number()
  .positive()
  .max(100_000)
  .refine(
    (v) => Math.abs(v * 1e6 - Math.round(v * 1e6)) < 1e-6,
    'Площа: до шести знаків після коми',
  );

/** Категория насаждений: название, число объектов (не у всех есть), гектары. */
export const areaSchema = z.object({
  name: langText(100),
  count: z.number().int().min(1).max(10_000).optional(),
  hectares,
  /** Показать число объектов в карточке «У цифрах». */
  inSummary: z.boolean().optional(),
});

export type EnterpriseArea = z.infer<typeof areaSchema>;

export const enterpriseSchema = z.object({
  nameFull: langText(300),
  nameShort: langText(120).optional(),
  edrpou: z.string().regex(/^\d{8}$/u, 'ЄДРПОУ: восемь цифр'),
  email: z.email().max(120).optional(),
  legalForm: langText(120),
  /** Дата регистрации. Выводится одна дата (решение Заказчика 17.11.2026) */
  registeredAt: z.iso.date().optional(),
  ownerBody: langText(200),
  governedBy: langText(200),
  coordinatedBy: langText(200).optional(),
  kved: z
    .array(z.object({ code: z.string().max(10), title: langText(200) }))
    .max(10)
    .optional(),
  legalBasis: z.array(langText(300)).max(10).optional(),
  /** «Інформаційна довідка» — до 1500 знаков (ТЗ 5.2, п. 6) */
  infoReference: richLangText(1500).optional(),
  /** Численность работников — карточка «У цифрах» (решение 053). */
  staffCount: z.number().int().min(1).max(100_000).optional(),
  /**
   * «Що доглядаємо»: площадь по категориям (решение 053). Итог не хранится —
   * это сумма `hectares`, поэтому арифметика на странице сходится всегда
   * (решение 018).
   */
  areas: z.array(areaSchema).max(20).optional(),
});

export type Enterprise = z.infer<typeof enterpriseSchema>;

export const enterpriseFileSchema = envelopeSchema.extend({
  items: z.array(enterpriseSchema).length(1, 'Enterprise — синглтон: ровно одна запись'),
});
