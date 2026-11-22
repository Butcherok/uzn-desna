/**
 * Транслитерация украинского текста латиницей по таблице постанови КМУ № 55
 * від 27.01.2010 (https://zakon.rada.gov.ua/laws/show/55-2010-%D0%BF).
 * Нужна для `slug` (ТЗ 8.3, п. 3): так сделаны и `slug` версии 1
 * (`pryimalnia`, `bukhhalteriia`, `karp-ye-a`).
 *
 * Правила таблицы, кроме буквы в букву:
 * - Є, Ї, Й, Ю, Я в начале слова — `ye`, `yi`, `y`, `yu`, `ya`, в других
 *   позициях — `ie`, `i`, `i`, `iu`, `ia`;
 * - сочетание «зг» — `zgh` (отличие от «zh» = ж);
 * - мягкий знак и апостроф не передаются.
 */
const LETTERS: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'h',
  ґ: 'g',
  д: 'd',
  е: 'e',
  є: 'ie',
  ж: 'zh',
  з: 'z',
  и: 'y',
  і: 'i',
  ї: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'kh',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'shch',
  ь: '',
  ю: 'iu',
  я: 'ia',
};

const WORD_INITIAL: Record<string, string> = { є: 'ye', ї: 'yi', й: 'y', ю: 'yu', я: 'ya' };

const APOSTROPHES = new Set(["'", '’', 'ʼ', '`']);

export function transliterateUk(text: string): string {
  const chars = [...text.toLowerCase()];
  let out = '';
  let wordStart = true;
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i] ?? '';
    if (APOSTROPHES.has(ch)) continue;
    if (ch === 'з' && chars[i + 1] === 'г') {
      out += 'zgh';
      i += 1;
      wordStart = false;
      continue;
    }
    const initial = wordStart ? WORD_INITIAL[ch] : undefined;
    const mapped = initial ?? LETTERS[ch];
    if (mapped !== undefined) {
      out += mapped;
      wordStart = false;
    } else {
      out += ch;
      wordStart = !/[\p{L}\p{N}]/u.test(ch);
    }
  }
  return out;
}

/** Предел длины `slug` в схемах `shared/` (ТЗ 13.1). */
export const SLUG_MAX = 60;

/**
 * `slug` из названия: латиница, цифры, дефисы, не длиннее `SLUG_MAX`;
 * обрезается по границе слова. Пустое название даёт `zapys`.
 */
export function slugify(title: string, max = SLUG_MAX): string {
  const base = transliterateUk(title)
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  if (base === '') return 'zapys';
  if (base.length <= max) return base;
  const cut = base.slice(0, max + 1);
  const at = cut.lastIndexOf('-');
  return (at > 0 ? cut.slice(0, at) : base.slice(0, max)).replace(/-+$/u, '');
}

/** Свободный `slug`: `base`, затем `base-2`, `base-3`… в пределах `SLUG_MAX`. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = slugify(base, SLUG_MAX - suffix.length) + suffix;
    if (!taken.has(candidate)) return candidate;
  }
}
