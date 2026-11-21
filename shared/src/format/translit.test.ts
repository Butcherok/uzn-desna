import { describe, expect, it } from 'vitest';
import { SLUG_MAX, slugify, transliterateUk, uniqueSlug } from './translit.js';

describe('transliterateUk (КМУ № 55)', () => {
  it('reproduces version 1 slugs', () => {
    expect(slugify('Приймальня')).toBe('pryimalnia');
    expect(slugify('Бухгалтерія')).toBe('bukhhalteriia');
    expect(slugify('Карп Є. А.')).toBe('karp-ye-a');
    expect(slugify('Відділ кадрів')).toBe('viddil-kadriv');
  });

  it('follows the examples of the resolution table', () => {
    const cases: [string, string][] = [
      ['Згурський', 'zghurskyi'],
      ['Ґалаґан', 'galagan'],
      ['Єнакієве', 'yenakiieve'],
      ['Їжакевич', 'yizhakevych'],
      ['Кадіївка', 'kadiivka'],
      ['Йосипівка', 'yosypivka'],
      ['Стрий', 'stryi'],
      ['Юрій', 'yurii'],
      ['Крюківка', 'kriukivka'],
      ['Яготин', 'yahotyn'],
      ['Костянтин', 'kostiantyn'],
      ['Щербухи', 'shcherbukhy'],
      ['Знам’янка', 'znamianka'],
      ["Мар'їне", 'marine'],
      ['Розгон', 'rozghon'],
    ];
    for (const [uk, lat] of cases) expect(transliterateUk(uk)).toBe(lat);
  });
});

describe('slugify', () => {
  it('keeps latin and digits, joins with single hyphens', () => {
    expect(slugify('  Озеленення — 2026 / BIG  ')).toBe('ozelenennia-2026-big');
    expect(slugify('—')).toBe('zapys');
  });

  it('cuts long titles at a word boundary', () => {
    const s = slugify(
      'Видалення аварійних, сухостійних та фаутних дерев на прибудинкових територіях',
    );
    expect(s.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(s).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('uniqueSlug', () => {
  it('adds the first free numeric suffix within the limit', () => {
    expect(uniqueSlug('hazony', new Set())).toBe('hazony');
    expect(uniqueSlug('hazony', new Set(['hazony', 'hazony-2']))).toBe('hazony-3');
    const long = 'a'.repeat(SLUG_MAX);
    const got = uniqueSlug(long, new Set([long]));
    expect(got.length).toBeLessThanOrEqual(SLUG_MAX);
    expect(got.endsWith('-2')).toBe(true);
  });
});
