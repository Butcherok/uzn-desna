import { describe, expect, it } from 'vitest';
import { truncateAtWord, TRUNCATE_EXCERPT, TRUNCATE_TITLE } from './truncate.js';

describe('truncateAtWord', () => {
  it('не трогает короткий текст', () => {
    expect(truncateAtWord('Впало дерево', TRUNCATE_EXCERPT)).toBe('Впало дерево');
  });

  it('обрезает по границе слова и ставит многоточие', () => {
    const text = 'Комунальне підприємство утримує зелені зони Деснянського району міста Києва';
    const result = truncateAtWord(text, 30);

    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(31);
    expect(result).not.toContain('утрим…');
    expect(text.startsWith(result.slice(0, -1))).toBe(true);
  });

  it('не рвёт слово посередине на украинских строках', () => {
    const text = 'Видалення та обрізка аварійних дерев у парках і скверах району';
    const result = truncateAtWord(text, 25);
    const words = result.slice(0, -1).trim().split(' ');
    const last = words.at(-1) ?? '';

    expect(text.split(' ')).toContain(last);
  });

  it('не рвёт ссылку', () => {
    const text = 'Детальніше https://desna.kyivzelenbud.com/ourjob/ на сторінці';
    const result = truncateAtWord(text, 20);

    expect(result).not.toContain('https://desna.kyivz…');
  });

  it('держит пределы заголовка и отрывка', () => {
    const long = 'слово '.repeat(60).trim();

    expect(truncateAtWord(long, TRUNCATE_TITLE).length).toBeLessThanOrEqual(TRUNCATE_TITLE + 1);
    expect(truncateAtWord(long, TRUNCATE_EXCERPT).length).toBeLessThanOrEqual(TRUNCATE_EXCERPT + 1);
  });

  it('сводит повторяющиеся пробелы и переводы строк', () => {
    expect(truncateAtWord('Впало\n\n  дерево', TRUNCATE_EXCERPT)).toBe('Впало дерево');
  });
});
