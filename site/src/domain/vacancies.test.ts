import { describe, expect, it } from 'vitest';
import type { Contact, Vacancy } from '@uzn/shared';
import { HR_CONTACT_SLUG, isVisible, kyivDate, vacancyCards } from './vacancies';

const TODAY = '2026-11-20';

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
  status: 'published',
  order,
  ...over,
});

describe('isVisible', () => {
  it('черновик не виден', () => {
    expect(isVisible(vacancy(1, { status: 'draft' }), TODAY)).toBe(false);
  });

  it('«Актуально до» скрывает карточку с этого дня включительно', () => {
    expect(isVisible(vacancy(1, { validThrough: '2026-11-21' }), TODAY)).toBe(true);
    expect(isVisible(vacancy(1, { validThrough: '2026-11-20' }), TODAY)).toBe(false);
    expect(isVisible(vacancy(1, { validThrough: '2026-11-19' }), TODAY)).toBe(false);
  });

  it('без «Актуально до» опубликованная карточка видна', () => {
    expect(isVisible(vacancy(1), TODAY)).toBe(true);
  });
});

describe('kyivDate', () => {
  it('киевская дата, а не UTC', () => {
    expect(kyivDate(new Date('2026-11-19T22:30:00.000Z'))).toBe('2026-11-20');
    expect(kyivDate(new Date('2026-07-17T20:59:00.000Z'))).toBe('2026-07-17');
    expect(kyivDate(new Date('2026-07-17T21:00:00.000Z'))).toBe('2026-07-18');
  });
});

describe('vacancyCards', () => {
  it('пустой список — пустые карточки, а не ошибка', () => {
    expect(vacancyCards([], [hr()], TODAY)).toEqual([]);
  });

  it('только видимые, порядок по order, телефон из контактной точки', () => {
    const cards = vacancyCards(
      [
        vacancy(3, { status: 'draft' }),
        vacancy(2),
        vacancy(1, { unit: { uk: 'Дільниця' } }),
        vacancy(4, { validThrough: '2026-11-01' }),
      ],
      [hr()],
      TODAY,
    );
    expect(cards.map((card) => card.slug)).toEqual(['vacancy-1', 'vacancy-2']);
    expect(cards[0]).toMatchObject({ unit: 'Дільниця', phone: '+380443373503' });
    expect(cards[1]?.unit).toBeUndefined();
  });

  it('ссылка на отсутствующую точку роняет сборку', () => {
    expect(() => vacancyCards([vacancy(1, { contactId: 'nema' })], [hr()], TODAY)).toThrow(/nema/u);
  });

  it('неподтверждённый телефон не публикуется — сборка падает', () => {
    expect(() => vacancyCards([vacancy(1)], [hr({ confirmed: false })], TODAY)).toThrow();
  });

  it('скрытая карточка с битой ссылкой сборку не роняет', () => {
    expect(
      vacancyCards([vacancy(1, { status: 'draft', contactId: 'nema' })], [hr()], TODAY),
    ).toEqual([]);
  });
});
