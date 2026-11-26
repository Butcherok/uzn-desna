/**
 * Многострочное короткое поле (часы работы, решение 050): строка данных —
 * строка на экране. Пустые строки и пробелы по краям отбрасываются, поэтому
 * лишний перенос в админке не даёт пустой строки на сайте.
 */
export function textLines(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
