import { describe, expect, it } from 'vitest';
import { PLACE_LABELS, PLACE_TAG_MAX, PLACE_TAGS, tenderLinks } from './public-docs.js';
import type { PublicDoc } from '@uzn/shared';

/**
 * Метка-признак на карточке «Публічної інформації» (решение 017).
 * Длинная метка расширяла карточку и давала горизонтальную прокрутку
 * страницы на 320 и 600 px, поэтому длина ограничена и проверяется тестом.
 */
describe('PLACE_TAGS', () => {
  it('покрывает те же места публикации, что и полные подписи', () => {
    expect(Object.keys(PLACE_TAGS).sort()).toEqual(Object.keys(PLACE_LABELS).sort());
  });

  it(`не длиннее ${PLACE_TAG_MAX} знаков и не пустая`, () => {
    for (const [place, tag] of Object.entries(PLACE_TAGS)) {
      expect(tag.trim(), place).not.toBe('');
      expect([...tag].length, `${place}: «${tag}»`).toBeLessThanOrEqual(PLACE_TAG_MAX);
    }
  });
});

/**
 * «Наші закупівлі» (ТЗ 4.9): ссылка на Prozorro обязательна в обеих версиях
 * и на этой странице стоит первой. Второй копии адресов в данных нет —
 * страница берёт те же записи, что и «Публічна інформація».
 */
describe('tenderLinks', () => {
  const doc = (slug: string, publishedWhere: PublicDoc['publishedWhere'], order: number) =>
    ({
      slug,
      title: { uk: slug },
      publishedWhere,
      externalUrl: `https://example.org/${slug}`,
      featured: false,
      order,
    }) as PublicDoc;

  const fixture: PublicDoc[] = [
    doc('edata-agreements', 'edata', 10),
    doc('edata-transactions', 'edata', 11),
    doc('own-page', 'own', 12),
    doc('prozorro-tenders', 'prozorro', 13),
  ];

  it('ставит Prozorro первым, хотя в перечне он последний', () => {
    expect(tenderLinks(fixture).map((item) => item.slug)).toEqual([
      'prozorro-tenders',
      'edata-agreements',
      'edata-transactions',
    ]);
  });

  it('другие места публикации на страницу не попадают', () => {
    expect(tenderLinks(fixture).some((item) => item.publishedWhere === 'own')).toBe(false);
  });
});
