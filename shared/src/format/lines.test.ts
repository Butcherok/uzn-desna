import { describe, expect, it } from 'vitest';
import { textLines } from './lines.js';

describe('textLines', () => {
  it('splits by line breaks of both kinds', () => {
    expect(textLines('Пн–Пт 08:00–17:00\r\nПерерва 12:00–13:00\nСб, Нд — вихідні')).toEqual([
      'Пн–Пт 08:00–17:00',
      'Перерва 12:00–13:00',
      'Сб, Нд — вихідні',
    ]);
  });

  it('drops empty lines and trims', () => {
    expect(textLines('  Цілодобово \n\n  ')).toEqual(['Цілодобово']);
  });

  it('keeps a one-line value as one line', () => {
    expect(textLines('Пн–Пт 08:00–17:00, обідня перерва 12:00–13:00')).toHaveLength(1);
  });

  it('returns nothing for empty or missing text', () => {
    expect(textLines(undefined)).toEqual([]);
    expect(textLines('')).toEqual([]);
  });
});
