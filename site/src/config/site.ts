/**
 * Единый объект настроек сайта (ТЗ 10.2, слой config).
 * Сведения о предприятии — только подтверждённые (ТЗ 4.6, паспорт, раздел 1).
 */
export const BASE_URL: string = import.meta.env.BASE_URL;

export function withBase(path: string): string {
  const base = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
  const tail = path.startsWith('/') ? path : `/${path}`;
  return `${base}${tail}`;
}

export const ENTERPRISE = {
  nameShort: 'КП УЗН Деснянського району',
  nameFull: 'Комунальне підприємство «Управління зеленого насадження Деснянського району» м. Києва',
  edrpou: '04589645',
  address: '02232, м. Київ, вул. Героїв Енергетиків, 26',
  /** Приймальня, подтверждено (ТЗ 4.6) */
  phoneStored: '+380443373501',
  hours: 'Пн–Пт 08:00–17:00, обід 12:00–13:00',
  facebook: 'https://www.facebook.com/kpuzndesn',
} as const;

export const NETWORK_LINKS = [
  { label: 'Київзеленбуд', href: 'https://kyivzelenbud.com/' },
  { label: 'Чинна сторінка підприємства', href: 'https://desna.kyivzelenbud.com/' },
] as const;

/**
 * Дата последней правки контента для строки подвала (ТЗ 3.1, подвал, п. 5).
 * До появления `data/` правится вручную в этом файле.
 */
export const CONTENT_UPDATED_AT = '2026-11-13';

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
    ],
  },
  { label: 'Послуги', path: '/services/' },
  { label: 'Куди звертатися', path: '/where-to-ask/' },
  { label: 'Контакти', path: '/contacts/' },
];
