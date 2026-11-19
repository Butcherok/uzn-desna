/**
 * Правила страницы «Вакансії» (ТЗ 4.10). Слой domain: чистые функции
 * над переданными данными, без чтения файлов и сети.
 */
import { formatDate } from '@uzn/shared';
import type { Contact, Vacancy } from '@uzn/shared';
import { contactBySlug } from './contacts';

/** Слаг контактной точки отдела кадров в `data/contacts.json`. */
export const HR_CONTACT_SLUG = 'viddil-kadriv';

export interface VacancyCard {
  slug: string;
  position: string;
  unit: string | undefined;
  requirements: string;
  phone: string;
  /** Дата публикации, `ДД.ММ.РРРР` (ТЗ 5.1, п. 6) */
  published: string;
}

/**
 * Карточки в порядке `order` (ТЗ 6.1, п. 6).
 *
 * Вакансия со ссылкой на отсутствующую или неподтверждённую контактную точку
 * роняет сборку: телефон — обязательное поле карточки (ТЗ 4.10), а карточку
 * без него выводить нельзя и молча прятать тоже.
 */
export function vacancyCards(
  vacancies: readonly Vacancy[],
  contacts: readonly Contact[],
): VacancyCard[] {
  return [...vacancies]
    .sort((a, b) => a.order - b.order)
    .map((vacancy) => {
      const contact = contactBySlug(contacts, vacancy.contactId);
      if (contact === undefined) {
        throw new Error(
          `Вакансия ${vacancy.slug}: контактная точка «${vacancy.contactId}» не найдена или не подтверждена (ТЗ 4.10)`,
        );
      }
      return {
        slug: vacancy.slug,
        position: vacancy.position.uk,
        unit: vacancy.unit?.uk,
        requirements: vacancy.requirements.uk,
        phone: contact.phone,
        published: formatDate(vacancy.publishedAt),
      };
    });
}
