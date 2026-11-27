import { describe, expect, it } from 'vitest';
import { formatDate } from './date.js';

describe('formatDate', () => {
  it('выводит дату как ДД.ММ.РРРР (ТЗ 5.1, п. 6)', () => {
    expect(formatDate('2002-01-09')).toBe('09.01.2002');
    expect(formatDate('2015-11-16')).toBe('16.11.2015');
  });

  it('принимает дату-время UTC и берёт из неё дату (ТЗ 6.1, п. 3)', () => {
    expect(formatDate('2026-11-17T14:00:00.000Z')).toBe('17.11.2026');
  });

  it('падает на непонятном значении, а не выводит мусор', () => {
    expect(() => formatDate('17.11.2026')).toThrow();
  });
});

describe('formatDate по-английски (решение 056)', () => {
  it('ДД/ММ/РРРР — британский порядок', () => {
    expect(formatDate('2002-01-09', 'en')).toBe('09/01/2002');
  });
});
