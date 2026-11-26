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

const exact = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 6 });
const tenth = new Intl.NumberFormat('uk-UA', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const whole = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 });

/** Как в источнике: 513,5552; 0,65215; 1 116,638956. */
export function formatHectaresExact(value: number): string {
  return exact.format(value);
}

/** Для карточки «У цифрах»: 1 116,6 (решение Заказчика 26.11.2026). */
export function formatHectaresShort(value: number): string {
  return tenth.format(value);
}

/** Целое число с разделителем разрядов по-украински: 223; 1 250. */
export function formatCount(value: number): string {
  return whole.format(value);
}
