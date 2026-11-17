/**
 * Защита адреса электронной почты от сборщиков адресов (ТЗ 5.4, п. 7).
 *
 * Адрес и ссылка `mailto:` собираются числовыми HTML-сущностями: в исходном
 * коде страницы простого текстового `mailto:` нет, а браузер разбирает
 * сущности при построении документа — без JavaScript (ТЗ 11.7, п. 4).
 * Решение записано в `docs/decisions/008-email-html-entities.md`.
 */
export function encodeHtmlEntities(value: string): string {
  return Array.from(value, (character) => {
    const code = character.codePointAt(0);
    if (code === undefined) {
      throw new Error('encodeHtmlEntities: символ без кодовой точки');
    }
    return `&#${code};`;
  }).join('');
}

/**
 * Готовая разметка ссылки на почту. Вставляется только через `set:html`:
 * обычная подстановка значения экранировала бы амперсанды сущностей.
 */
export function mailtoLinkHtml(email: string, text: string = email): string {
  return `<a href="${encodeHtmlEntities(`mailto:${email}`)}">${encodeHtmlEntities(text)}</a>`;
}
