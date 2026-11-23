import { z } from 'zod';
import { envelopeSchema } from './envelope.js';
import { langText, richLangText } from './lang-text.js';
import { storedPhoneSchema } from '../format/phone.js';

/**
 * Карточка услуги — сущность `Service` (ТЗ 6.2, 13.1).
 *
 * Обязательны `slug`, `title`, `summary`, `group`, `order`.
 *
 * `contactId`, `phone`, `audience` и `payment` не обязательны и версией 1 не
 * выводятся (решение Заказчика 17.11.2026, ТЗ 4.4): телефонов и контактных
 * лиц по услугам у предприятия нет, номер приймальні выведен один раз в
 * первом блоке страницы по образцу 4.5, а получатель и платность отнесены к
 * версии 2 вместе с админкой. Поля оставлены в схеме, чтобы админка версии 2
 * заполняла их без правки формата файла (`docs/decisions/012-services-page-data.md`).
 */
export const serviceSchema = z.object({
  slug: z
    .string()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Слаг: латиница, цифры и дефис'),
  title: langText(150),
  /** До двух предложений (ТЗ 5.2, п. 6) */
  summary: richLangText(300),
  /** Группа услуг. Порядок групп — по первому появлению в порядке `order` */
  group: langText(120),
  /** Ссылка на `Contact`. Версия 1 не выводит */
  contactId: z.string().max(60).optional(),
  /** Телефон услуги. Версия 1 не выводит */
  phone: storedPhoneSchema.optional(),
  /** Для кого услуга. Версия 1 не выводит */
  audience: z.enum(['resident', 'osbb', 'legal']).optional(),
  /** Платность. Версия 1 не выводит */
  payment: z.enum(['paid', 'maintenance', 'unknown']).optional(),
  order: z.number().int().nonnegative(),
});

export type Service = z.infer<typeof serviceSchema>;

export const servicesFileSchema = envelopeSchema.extend({
  items: z.array(serviceSchema),
});
