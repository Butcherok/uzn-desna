import { z } from 'zod';
import { envelopeSchema } from './envelope.js';
import { langText } from './lang-text.js';
import { storedPhoneSchema } from '../format/phone.js';

/**
 * Карточка сценария «Куди звертатися» — сущность `Scenario` (ТЗ 6.2, 13.1).
 *
 * Обязательны `slug`, `situation`, `emergency`, `order` (ТЗ 13.1, версия 3.4).
 * `whatWeDo`, `phone` и `hours` перестали быть обязательными решением
 * Заказчика 16.11.2026: на все ситуации один номер оперативного дежурного,
 * он выведен один раз в первом блоке страницы, а роль дежурного на страницах
 * не описывается (`claude/12_kontent-4-5-4-6.md`, раздел 1).
 */
export const scenarioSchema = z.object({
  slug: z
    .string()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Слаг: латиница, цифры и дефис'),
  /** Ситуация словами жителя (ТЗ 5.2, п. 5) */
  situation: langText(150),
  /** Одно предложение, что делает предприятие. Версия 1 его не выводит */
  whatWeDo: langText(300).optional(),
  /** Телефон сценария. Пусто — выводится номер первого блока страницы */
  phone: storedPhoneSchema.optional(),
  hours: langText(120).optional(),
  emergency: z.boolean(),
  order: z.number().int().nonnegative(),
});

export type Scenario = z.infer<typeof scenarioSchema>;

export const scenariosFileSchema = envelopeSchema.extend({
  items: z.array(scenarioSchema),
});
