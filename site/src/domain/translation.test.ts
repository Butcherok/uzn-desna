import { describe, expect, it } from 'vitest';
import type { Contact, Enterprise, LangText, Leader, Service } from '@uzn/shared';
import { englishPages, lacksEnglish, missingEnglish, type TranslationInput } from './translation';
import { EN_SECTIONS } from '../i18n/lang';

const t = (uk: string, en?: string): LangText => (en === undefined ? { uk } : { uk, en });

const office = {
  slug: 'pryimalnia',
  purpose: t('Приймальня', 'Front office'),
  hours: t('Пн–Пт', 'Mon–Fri'),
  phone: '+380443373501',
  confirmed: true,
  showInFooter: true,
  order: 1,
} as unknown as Contact;

const enterprise = {
  nameFull: t('Повна назва', 'Full name'),
  edrpou: '04589645',
  legalForm: t('КП', 'Municipal enterprise'),
  ownerBody: t('Громада', 'City of Kyiv'),
  governedBy: t('Департамент', 'Department'),
} as unknown as Enterprise;

const service = {
  title: t('Обрізка', 'Pruning'),
  summary: t('Опис', 'Summary'),
  group: t('Догляд', 'Care'),
  order: 1,
} as unknown as Service;

const ALL_COPY = { '/': true, '/about/': true, '/services/': true, '/contacts/': true } as const;

function input(overrides: Partial<TranslationInput> = {}): TranslationInput {
  return {
    contacts: [office],
    enterprise,
    leaders: [] as Leader[],
    services: [service],
    history: undefined,
    copy: ALL_COPY,
    ...overrides,
  };
}

describe('lacksEnglish', () => {
  it('пустой и пробельный en — перевода нет; нет украинского — требовать нечего', () => {
    expect(lacksEnglish(t('Текст'))).toBe(true);
    expect(lacksEnglish(t('Текст', '  '))).toBe(true);
    expect(lacksEnglish(t('Текст', 'Text'))).toBe(false);
    expect(lacksEnglish(undefined)).toBe(false);
  });
});

describe('englishPages — нет перевода, нет страницы (ТЗ 4.13)', () => {
  it('всё переведено — четыре страницы', () => {
    expect([...englishPages(EN_SECTIONS, input())].sort()).toEqual(
      ['/', '/about/', '/contacts/', '/services/'].sort(),
    );
  });

  it('одна услуга без перевода — нет только «Послуг»', () => {
    const pages = englishPages(
      EN_SECTIONS,
      input({ services: [{ ...service, summary: t('Опис') }] }),
    );
    expect(pages.has('/services/')).toBe(false);
    expect(pages.has('/contacts/')).toBe(true);
    expect(
      missingEnglish('/services/', input({ services: [{ ...service, group: t('Догляд') }] })),
    ).toBe(1);
  });

  it('подвал без перевода — нет ни одной страницы: подвал на каждой', () => {
    const contacts = [{ ...office, hours: t('Пн–Пт') }] as Contact[];
    expect(englishPages(EN_SECTIONS, input({ contacts })).size).toBe(0);
  });

  it('нет английских текстов страницы — страницы нет', () => {
    const pages = englishPages(EN_SECTIONS, input({ copy: { ...ALL_COPY, '/about/': false } }));
    expect(pages.has('/about/')).toBe(false);
    expect(pages.size).toBe(3);
  });

  it('без английской главной английской версии нет вовсе: переключателю некуда вести', () => {
    expect(englishPages(EN_SECTIONS, input({ copy: { ...ALL_COPY, '/': false } })).size).toBe(0);
  });

  it('неподтверждённый телефон не выводится и перевода не требует', () => {
    const hidden = { ...office, slug: 'x', confirmed: false, purpose: t('Прихований') } as Contact;
    expect(missingEnglish('/contacts/', input({ contacts: [office, hidden] }))).toBe(0);
  });

  it('описание фото руководителя требуется, только если фото есть', () => {
    const leader = {
      fullName: t('Ім’я', 'Name'),
      position: t('Посада', 'Position'),
      photoAlt: t('Фото'),
      published: true,
      order: 1,
    } as unknown as Leader;
    expect(missingEnglish('/about/', input({ leaders: [leader] }))).toBe(0);
    expect(missingEnglish('/about/', input({ leaders: [{ ...leader, photoPath: 'a.jpg' }] }))).toBe(
      1,
    );
  });
});
