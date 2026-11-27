/**
 * Правило «нет перевода — нет страницы» (ТЗ 4.13, 3.2, п. 6; решение 056).
 * Слой domain: чистые функции над переданными данными.
 *
 * Английская страница существует, только если у неё есть английские тексты
 * страницы и у **каждого** украинского текста данных, который она выводит,
 * есть `en` (ТЗ 4.13: «перевод каждого опубликованного украинского текста»).
 * Частичная страница со скрытыми блоками не собирается: она показала бы
 * меньше украинской, но и не то, что утверждено.
 */
import type { Contact, Enterprise, LangText, Leader, Service } from '@uzn/shared';
import type { EnSection } from '../i18n/lang';
import { footerContacts, publishedContacts, contactBySlug } from './contacts';
import { publishedLeaders } from './leaders';

/** Текст, у которого есть украинский, но нет английского. */
export function lacksEnglish(text: LangText | undefined): boolean {
  if (text === undefined || text.uk.trim() === '') return false;
  return (text.en ?? '').trim() === '';
}

export interface TranslationInput {
  contacts: readonly Contact[];
  enterprise: Enterprise;
  leaders: readonly Leader[];
  services: readonly Service[];
  /** Блок «Історія підприємства» */
  history: LangText | undefined;
  /** Есть ли английские тексты страницы (`PageCopy.en`) */
  copy: Record<EnSection, boolean>;
}

/** Тексты данных, которые выводит каждая страница (вместе с подвалом). */
export function textsOf(page: EnSection, input: TranslationInput): (LangText | undefined)[] {
  const footer = footerContacts(input.contacts).flatMap((c) => [c.purpose, c.hours]);
  const office = contactBySlug(input.contacts, 'pryimalnia');
  const { enterprise: e } = input;
  switch (page) {
    case '/':
      return [...footer, office?.purpose, office?.hours];
    case '/contacts/':
      return [
        ...footer,
        office?.hours,
        ...publishedContacts(input.contacts).flatMap((c) => [c.purpose, c.hours, c.role]),
      ];
    case '/services/':
      return [
        ...footer,
        office?.hours,
        ...input.services.flatMap((s) => [s.title, s.summary, s.group]),
      ];
    case '/about/':
      return [
        ...footer,
        e.infoReference,
        input.history,
        e.nameFull,
        e.legalForm,
        e.ownerBody,
        e.governedBy,
        e.coordinatedBy,
        ...(e.areas ?? []).map((a) => a.name),
        ...(e.kved ?? []).map((k) => k.title),
        ...(e.legalBasis ?? []),
        ...publishedLeaders(input.leaders).flatMap((l) => [
          l.fullName,
          l.position,
          l.bio,
          // Фото без описания не выводится (ТЗ 11.3): описание нужно, только если фото есть
          l.photoPath ? l.photoAlt : undefined,
        ]),
      ];
  }
}

/** Сколько текстов страницы без перевода; 0 и тексты страницы есть — страница собирается. */
export function missingEnglish(page: EnSection, input: TranslationInput): number {
  return textsOf(page, input).filter(lacksEnglish).length;
}

/**
 * Английские страницы, которые собираются. Главная — условие остальных:
 * без неё переключателю некуда вести со страниц без перевода (ТЗ 3.2, п. 6),
 * поэтому без английской главной английской версии нет вовсе.
 */
export function englishPages(
  sections: readonly EnSection[],
  input: TranslationInput,
): Set<EnSection> {
  const ready = sections.filter((page) => input.copy[page] && missingEnglish(page, input) === 0);
  return ready.includes('/') ? new Set(ready) : new Set();
}
