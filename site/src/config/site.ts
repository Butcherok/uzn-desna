/**
 * Единый объект настроек сайта (ТЗ 10.2, слой config).
 * Сведения о предприятии — только подтверждённые (ТЗ 4.6, паспорт, раздел 1).
 *
 * Телефоны и часы ответа здесь не хранятся: они живут в `data/contacts.json`
 * (сущность `Contact`, ТЗ 6.2), иначе один и тот же номер правился бы в двух
 * местах (ТЗ 10.2, слой `config`: «значения, разбросанные по файлам»).
 */
export const BASE_URL: string = import.meta.env.BASE_URL;

export function withBase(path: string): string {
  const base = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
  const tail = path.startsWith('/') ? path : `/${path}`;
  return `${base}${tail}`;
}

export const ENTERPRISE = {
  /**
   * Короткое название — в шапке, подвале и метаданных всех страниц.
   * Полного названия здесь нет: оно живёт в `data/enterprise.json`
   * (сущность `Enterprise`, ТЗ 13.1) и выводится на «Про підприємство».
   */
  nameShort: 'КП УЗН Деснянського району',
  edrpou: '04589645',
  address: '02232, м. Київ, вул. Героїв Енергетиків, 26',
  facebook: 'https://www.facebook.com/kpuzndesn',
  /**
   * Точка на карте по документированному формату Google Maps URLs: поиск по
   * адресу, без названия предприятия (по названию Google показывает точку
   * устаревшего адреса). Ориентиры на странице не выводятся — решение
   * Заказчика 16.11.2026. Встроенной карты нет (ТЗ 4.6).
   */
  mapsUrl:
    'https://www.google.com/maps/search/?api=1&query=%D0%B2%D1%83%D0%BB.%20%D0%93%D0%B5%D1%80%D0%BE%D1%97%D0%B2%20%D0%95%D0%BD%D0%B5%D1%80%D0%B3%D0%B5%D1%82%D0%B8%D0%BA%D1%96%D0%B2%2C%2026%2C%20%D0%9A%D0%B8%D1%97%D0%B2%2C%2002232',
} as const;

export const NETWORK_LINKS = [
  { label: 'Київзеленбуд', href: 'https://kyivzelenbud.com/' },
  { label: 'Чинна сторінка підприємства', href: 'https://desna.kyivzelenbud.com/' },
] as const;

/**
 * Дата последней правки контента для строки подвала (ТЗ 3.1, подвал, п. 5).
 * До появления `data/` правится вручную в этом файле.
 */
export const CONTENT_UPDATED_AT = '2026-11-17';

export type NavItem = {
  readonly label: string;
  readonly path: string;
  readonly children?: readonly NavItem[];
};

/** Верхнее меню версии 1 (ТЗ 3.1). Разделов версий 2 и 3 в меню нет. */
export const NAV: readonly NavItem[] = [
  {
    label: 'Про підприємство',
    path: '/about/',
    children: [
      { label: 'Публічна інформація', path: '/about/public-info/' },
      { label: 'Наші закупівлі', path: '/tenders/' },
      { label: 'Вакансії', path: '/jobs/' },
    ],
  },
  { label: 'Послуги', path: '/services/' },
  { label: 'Куди звертатися', path: '/where-to-ask/' },
  { label: 'Контакти', path: '/contacts/' },
];
