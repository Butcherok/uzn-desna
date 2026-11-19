import { describe, expect, it } from 'vitest';
import type { Contact, Vacancy } from '@uzn/shared';
import { HR_CONTACT_SLUG, vacancyCards } from './vacancies';

const hr = (over: Partial<Contact> = {}): Contact => ({
  slug: HR_CONTACT_SLUG,
  purpose: { uk: 'Відділ кадрів' },
  phone: '+380443373503',
  roundClock: false,
  confirmed: true,
  showInFooter: false,
  order: 3,
  ...over,
});

const vacancy = (order: number, over: Partial<Vacancy> = {}): Vacancy => ({
  slug: `vacancy-${order}`,
  position: { uk: `Посада ${order}` },
  requirements: { uk: 'Вимоги' },
  contactId: HR_CONTACT_SLUG,
  publishedAt: '2026-07-17T12:23:00.000Z',
  order,
  ...over,
});

describe('vacancyCards', () => {
  it('пустой список — пустые карточки, а не ошибка', () => {
    expect(vacancyCards([], [hr()])).toEqual([]);
  });

  it('порядок по order, телефон из контактной точки, дата ДД.ММ.РРРР', () => {
    const cards = vacancyCards([vacancy(2), vacancy(1, { unit: { uk: 'Дільниця' } })], [hr()]);
    expect(cards.map((card) => card.slug)).toEqual(['vacancy-1', 'vacancy-2']);
    expect(cards[0]).toMatchObject({
      unit: 'Дільниця',
      phone: '+380443373503',
      published: '17.07.2026',
    });
    expect(cards[1]?.unit).toBeUndefined();
  });

  it('ссылка на отсутствующую точку роняет сборку', () => {
    expect(() => vacancyCards([vacancy(1, { contactId: 'nema' })], [hr()])).toThrow(/nema/u);
  });

  it('неподтверждённый телефон не публикуется — сборка падает', () => {
    expect(() => vacancyCards([vacancy(1)], [hr({ confirmed: false })])).toThrow();
  });
});
