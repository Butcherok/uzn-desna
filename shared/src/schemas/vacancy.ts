import { z } from 'zod';
import { envelopeSchema } from './envelope.js';
import { langText, richLangText } from './lang-text.js';

/**
 * Вакансия — сущность `Vacancy` (ТЗ 6.2, 13.1, страница 4.10).
 *
 * `contactId` — слаг контактной точки из `data/contacts.json` (отдел кадров):
 * номер хранится один раз, смена номера — одна правка (ТЗ 6.2, решение 2).
 *
 * Видимость (решение 026): `status` — переключатель «Показувати на сайті»
 * (ТЗ 6.1, п. 5), `validThrough` — «Актуально до»: с этого дня включительно
 * карточка на сайт не выходит. Дата публикации на странице не выводится
 * (решение Заказчика 19.11.2026): «Відкриті вакансії» уже говорят, что
 * перечень актуален на момент чтения. `publishedAt` проставит админка
 * при публикации — для журнала, не для вывода.
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
  requirements: richLangText(400),
  contactId: z.string().min(1).max(80),
  status: z.enum(['draft', 'published']),
  /** «Актуально до», `ГГГГ-ММ-ДД`: с этого дня карточка скрыта */
  validThrough: z.iso.date().optional(),
  publishedAt: z.iso.datetime().optional(),
  order: z.number().int().nonnegative(),
});

export type Vacancy = z.infer<typeof vacancySchema>;

export const vacanciesFileSchema = envelopeSchema.extend({
  items: z.array(vacancySchema),
});
