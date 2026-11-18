import { describe, expect, it } from 'vitest';
import { PLACE_LABELS, PLACE_TAG_MAX, PLACE_TAGS } from './public-docs.js';

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
