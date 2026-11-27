/**
 * Площади «Про підприємство» (решение 053). Площадь в данных — гектары до
 * шести знаков после запятой, как в источнике (решение 018). Сумма считается
 * в целых миллионных долях гектара: в двоичной дроби 513.5552 + 0.65215 + …
 * дала бы хвост вроде …638955999, и итог на странице разошёлся бы со строками.
 */
const MICRO = 1_000_000;

export function totalHectares(areas: readonly { hectares: number }[]): number {
  const micro = areas.reduce((sum, a) => sum + Math.round(a.hectares * MICRO), 0);
  return micro / MICRO;
}

/**
 * Язык вывода чисел (ТЗ 3.2; решение 056): украинский — «1 116,6», английский
 * (британская запись) — «1,116.6». По умолчанию — украинский.
 */
export type NumberLang = 'uk' | 'en';

const LOCALE: Record<NumberLang, string> = { uk: 'uk-UA', en: 'en-GB' };

const formats = (lang: NumberLang) => ({
  exact: new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 6 }),
  tenth: new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }),
  whole: new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 0 }),
});

const BY_LANG: Record<NumberLang, ReturnType<typeof formats>> = {
  uk: formats('uk'),
  en: formats('en'),
};

/** Как в источнике: 513,5552; 0,65215; 1 116,638956. */
export function formatHectaresExact(value: number, lang: NumberLang = 'uk'): string {
  return BY_LANG[lang].exact.format(value);
}

/** Для карточки «У цифрах»: 1 116,6 (решение Заказчика 26.11.2026). */
export function formatHectaresShort(value: number, lang: NumberLang = 'uk'): string {
  return BY_LANG[lang].tenth.format(value);
}

/** Целое число с разделителем разрядов: 223; 1 250 (en — 1,250). */
export function formatCount(value: number, lang: NumberLang = 'uk'): string {
  return BY_LANG[lang].whole.format(value);
}
