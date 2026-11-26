import { describe, expect, it } from 'vitest';
import { formatCount, formatHectaresExact, formatHectaresShort, totalHectares } from './area.js';

/** Разбивка чинної сторінки по девяти категориям (решение 018). */
const SOURCE = [513.5552, 0.65215, 24.435506, 0.77, 10.2282, 0.235, 73.366, 9.1947, 484.2022];

const plain = (s: string): string => s.replace(/\s/gu, ' ');

describe('площади «Про підприємство»', () => {
  it('сумма девяти категорий — ровно 1116,638956 без хвоста двоичной дроби', () => {
    const total = totalHectares(SOURCE.map((hectares) => ({ hectares })));
    expect(total).toBe(1116.638956);
    expect(plain(formatHectaresExact(total))).toBe('1 116,638956');
  });

  it('строки таблицы — как в источнике, с запятой', () => {
    expect(SOURCE.map(formatHectaresExact)).toEqual([
      '513,5552',
      '0,65215',
      '24,435506',
      '0,77',
      '10,2282',
      '0,235',
      '73,366',
      '9,1947',
      '484,2022',
    ]);
  });

  it('карточка «У цифрах» — одна цифра после запятой', () => {
    expect(plain(formatHectaresShort(1116.638956))).toBe('1 116,6');
    expect(formatHectaresShort(10)).toBe('10,0');
  });

  it('пустой перечень — ноль', () => {
    expect(totalHectares([])).toBe(0);
    expect(formatCount(223)).toBe('223');
  });
});
