/**
 * Страница 404 (ТЗ 3.3). GitHub Pages отдаёт одну страницу на любой
 * несуществующий адрес, и украинский, и `/en/…`, поэтому она двуязычная:
 * украинский блок и полный английский (решение Заказчика 27.11.2026).
 */
export const NOT_FOUND_COPY = {
  uk: {
    title: 'Сторінку не знайдено',
    description: 'Такої сторінки немає. Посилання на головну, «Контакти» і телефон приймальні.',
    text: 'Можливо, адреса набрана з помилкою або сторінку перенесено.',
    home: 'Головна',
    contacts: 'Контакти',
  },
  en: {
    title: 'Page not found',
    text: 'The address may have been mistyped, or the page may have moved.',
    home: 'Home page',
    contacts: 'Contact us',
    /** Английской главной ещё нет — ссылки ведут на украинские страницы */
    homeUk: 'Home page (in Ukrainian)',
    contactsUk: 'Contact us (in Ukrainian)',
  },
} as const;
