/**
 * Правила страницы «Вакансії» (ТЗ 4.10). Слой domain: чистые функции
 * над переданными данными, без чтения файлов и сети.
 */
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
}

/**
 * Видна ли карточка в день сборки `today` (`ГГГГ-ММ-ДД`, киевская дата):
 * переключатель включён и «Актуально до» ещё не наступило (решение 026).
 */
export function isVisible(vacancy: Vacancy, today: string): boolean {
  return (
    vacancy.status === 'published' &&
    (vacancy.validThrough === undefined || today < vacancy.validThrough)
  );
}

/** Киевская дата `ГГГГ-ММ-ДД` для момента `now`. */
export function kyivDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(now);
}

/**
 * Видимые на `today` карточки в порядке `order` (ТЗ 6.1, п. 6).
 *
 * Вакансия со ссылкой на отсутствующую или неподтверждённую контактную точку
 * роняет сборку: телефон — обязательное поле карточки (ТЗ 4.10), а карточку
 * без него выводить нельзя и молча прятать тоже.
 */
export function vacancyCards(
  vacancies: readonly Vacancy[],
  contacts: readonly Contact[],
  today: string,
): VacancyCard[] {
  return vacancies
    .filter((vacancy) => isVisible(vacancy, today))
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
      };
    });
}
