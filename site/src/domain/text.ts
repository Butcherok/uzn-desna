/**
 * Разбор длинного текста данных на абзацы (ТЗ 5.2, п. 6: справка — с
 * разбивкой на абзацы). Слой domain: чистая функция, без ввода-вывода.
 *
 * В данных абзацы разделены переводом строки: разметка в полях не хранится,
 * иначе редактор версии 2 правил бы HTML (ТЗ 9.4, п. 1).
 */
export function paragraphs(text: string): string[] {
  return text
    .split('\n')
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}
