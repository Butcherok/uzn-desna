/**
 * Даты хранятся строкой ISO 8601 (ТЗ 6.1, п. 3), выводятся как `ДД.ММ.РРРР`
 * (ТЗ 5.1, п. 6). Приведение к формату — при сборке, не при хранении.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * `lang: 'en'` — британская запись `ДД/ММ/РРРР` (решение 056): порядок тот же,
 * меняется только разделитель.
 */
export function formatDate(isoDate: string, lang: 'uk' | 'en' = 'uk'): string {
  const match = ISO_DATE.exec(isoDate.slice(0, 10));
  if (match === null) {
    throw new Error(`Дата не в формате ISO 8601: ${isoDate}`);
  }
  const [, year, month, day] = match;
  return lang === 'en' ? `${day}/${month}/${year}` : `${day}.${month}.${year}`;
}
