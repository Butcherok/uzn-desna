/**
 * Язык как параметр оболочки (ТЗ 3.2, 4.13; решение 056).
 *
 * Украинский — без префикса и по умолчанию, английский — с префиксом `/en/`
 * (ТЗ 3.2, п. 4). Слаги не переводятся (п. 2). Определения языка браузера и
 * перенаправлений нет: язык меняется только переключателем.
 */
export type Lang = 'uk' | 'en';

export const DEFAULT_LANG: Lang = 'uk';

/** Значение `html lang` и `hreflang` */
export const HTML_LANG: Record<Lang, string> = { uk: 'uk', en: 'en' };

/**
 * `og:locale` в форме `язык_ТЕРРИТОРИЯ` (протокол Open Graph). Английский —
 * британский: название и тексты пишутся так, как писали бы в Англии
 * (решение Заказчика 27.11.2026).
 */
export const OG_LOCALE: Record<Lang, string> = { uk: 'uk_UA', en: 'en_GB' };

/** Локаль `Intl` для дат и чисел */
export const INTL_LOCALE: Record<Lang, string> = { uk: 'uk-UA', en: 'en-GB' };

/**
 * Страницы английской версии (ТЗ 4.13): Головна, Про підприємство, Послуги,
 * Контакти. Остальное — «Новини», закупівлі, вакансії, публічна інформація,
 * «Заява про доступність», версия 3 «Зелені зони» и «Техніка» — только
 * украинские (ТЗ 4.13; решение В3).
 */
export const EN_SECTIONS = ['/', '/about/', '/services/', '/contacts/'] as const;

export type EnSection = (typeof EN_SECTIONS)[number];

/** Путь страницы на языке: `/services/` → `/en/services/`. Путь — без базы. */
export function localizedPath(path: string, lang: Lang): string {
  if (lang === DEFAULT_LANG) return path;
  return path === '/' ? '/en/' : `/en${path}`;
}

/** Обратное: `/en/services/` → `{ lang: 'en', path: '/services/' }`. */
export function splitLangPath(path: string): { lang: Lang; path: string } {
  if (path === '/en/') return { lang: 'en', path: '/' };
  if (path.startsWith('/en/')) return { lang: 'en', path: path.slice(3) };
  return { lang: 'uk', path };
}
