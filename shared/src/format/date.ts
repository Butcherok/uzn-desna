/**
 * Даты хранятся строкой ISO 8601 (ТЗ 6.1, п. 3), выводятся как `ДД.ММ.РРРР`
 * (ТЗ 5.1, п. 6). Приведение к формату — при сборке, не при хранении.
 */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

export function formatDate(isoDate: string): string {
  const match = ISO_DATE.exec(isoDate.slice(0, 10));
  if (match === null) {
    throw new Error(`Дата не в формате ISO 8601: ${isoDate}`);
  }
  const [, year, month, day] = match;
  return `${day}.${month}.${year}`;
}
