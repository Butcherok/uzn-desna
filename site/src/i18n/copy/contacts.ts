import type { PageCopy } from './types';

/** «Контакти» (ТЗ 4.6; `claude/12_kontent-4-5-4-6.md`, раздел 4) */
export interface ContactsCopy {
  description: string;
  emailTitle: string;
  emailNote: string;
  routeTitle: string;
  addressLabel: string;
  mapLink: string;
  newTab: string;
  facebookLink: string;
}

export const CONTACTS_COPY: PageCopy<ContactsCopy> = {
  uk: {
    description:
      'Адреса, телефони та графік роботи КП УЗН Деснянського району: приймальня, бухгалтерія, відділ кадрів, оперативний черговий. Як дістатися та сторінка у Facebook.',
    emailTitle: 'Електронна пошта',
    emailNote: '— для звернень і запитів на інформацію.',
    routeTitle: 'Як дістатися',
    addressLabel: 'Адреса:',
    mapLink: 'Показати на карті Google',
    newTab: '(відкриється в новій вкладці)',
    facebookLink: 'Сторінка підприємства у Facebook',
  },
};
