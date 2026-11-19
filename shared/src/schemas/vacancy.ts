import { z } from 'zod';
import { envelopeSchema } from './envelope.js';
import { langText } from './lang-text.js';

/**
 * Вакансия — сущность `Vacancy` (ТЗ 6.2, 13.1, страница 4.10).
 *
 * `contactId` — слаг контактной точки из `data/contacts.json` (отдел кадров):
 * номер хранится один раз, смена номера — одна правка (ТЗ 6.2, решение 2).
 * `publishedAt` — дата публикации вакансии, строка ISO 8601 в UTC (ТЗ 6.1, п. 3).
 */
export const vacancySchema = z.object({
  slug: z
    .string()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Слаг: латиница, цифры и дефис'),
  position: langText(150),
  /** Подразделение или дільниця */
  unit: langText(150).optional(),
  /** Две-три строки */
  requirements: langText(400),
  contactId: z.string().min(1).max(80),
  publishedAt: z.iso.datetime(),
  order: z.number().int().nonnegative(),
});

export type Vacancy = z.infer<typeof vacancySchema>;

export const vacanciesFileSchema = envelopeSchema.extend({
  items: z.array(vacancySchema),
});
