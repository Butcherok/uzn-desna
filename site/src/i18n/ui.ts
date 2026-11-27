/**
 * Словарь подписей оболочки (ТЗ 4.13, 12.4: «непереведённых подписей
 * интерфейса нет»; решение 056). Ключ без перевода не проходит проверку
 * типов: у обоих языков один и тот же тип `UiStrings`.
 *
 * Украинские строки — прежние строки оболочки, слово в слово. Английские —
 * черновик разработчика на утверждение Заказчика (ТЗ 4.13, В4). Английское
 * название — вариант 2 «как назвали бы в Англии» (решение Заказчика
 * 27.11.2026 ждёт утверждения): меняется здесь, одной строкой на язык.
 */
import type { Lang } from './lang';

export interface UiStrings {
  /** Название в шапке: крупная строка и подпись под ней */
  brandMain: string;
  brandSub: string;
  /** Короткое название: `title`, подвал, метаданные */
  nameShort: string;
  /** Окончание подписи ссылки-логотипа: «…, головна» */
  brandHome: string;
  skip: string;
  navLabel: string;
  menuButton: string;
  crumbsLabel: string;
  /** Подпись блока переключателя языка */
  langNav: string;
  /** Подпись ссылки на этот язык — на самом этом языке */
  langLink: string;
  /** Буквы переключателя */
  langCode: string;
  address: string;
  edrpou: string;
  /**
   * Описание картинки `og:image` на английских страницах. Украинское —
   * `OG_IMAGE_ALT` в `config/site.ts` (решение 054).
   */
  ogImageAlt: string;
  /** Пункты меню и карточки по пути страницы */
  sections: Record<'/' | '/about/' | '/services/' | '/contacts/', string>;
  footer: {
    networkTitle: string;
    /** Подписи ссылок «Підприємства мережі», в порядке `NETWORK_LINKS` */
    networkLinks: readonly [string, string];
    facebookTitle: string;
    facebookLink: string;
    rights: string;
    updated: string;
    accessibility: string;
    developer: string;
  };
}

export const UI: Record<Lang, UiStrings> = {
  uk: {
    brandMain: 'КП УЗН',
    brandSub: 'Деснянського району',
    nameShort: 'КП УЗН Деснянського району',
    brandHome: 'головна',
    skip: 'Перейти до вмісту',
    navLabel: 'Розділи сайту',
    menuButton: 'Меню розділів',
    crumbsLabel: 'Ви тут',
    langNav: 'Мова сайту',
    langLink: 'українська версія',
    langCode: 'UA',
    address: '02232, м. Київ, вул. Героїв Енергетиків, 26',
    edrpou: 'ЄДРПОУ',
    ogImageAlt:
      'Парк Деснянського району: алеї з лавками й ліхтарями між деревами ведуть до будівлі районної адміністрації та кінотеатру, позаду житлові багатоповерхівки',
    sections: {
      '/': 'Головна',
      '/about/': 'Про підприємство',
      '/services/': 'Послуги',
      '/contacts/': 'Контакти',
    },
    footer: {
      networkTitle: 'Підприємства мережі',
      networkLinks: ['Київзеленбуд', 'Чинна сторінка підприємства'],
      facebookTitle: 'Facebook',
      facebookLink: 'Сторінка підприємства',
      rights: 'Усі права захищено.',
      updated: 'Оновлено',
      accessibility: 'Заява про доступність',
      developer: 'Розробка — S#RP',
    },
  },
  en: {
    brandMain: 'Desnianskyi',
    brandSub: 'Green Spaces',
    nameShort: 'Desnianskyi Green Spaces',
    brandHome: 'home',
    skip: 'Skip to content',
    navLabel: 'Site sections',
    menuButton: 'Sections menu',
    crumbsLabel: 'You are here',
    langNav: 'Site language',
    langLink: 'English version',
    langCode: 'EN',
    address: '26 Heroiv Enerhetykiv Street, Kyiv 02232, Ukraine',
    edrpou: 'EDRPOU code',
    ogImageAlt:
      'A park in Desnianskyi District: tree-lined paths with benches and street lamps lead to the district administration building and a cinema, with blocks of flats behind',
    sections: {
      '/': 'Home',
      '/about/': 'About us',
      '/services/': 'Services',
      '/contacts/': 'Contact us',
    },
    footer: {
      networkTitle: 'Our network',
      networkLinks: [
        'Kyivzelenbud (in Ukrainian)',
        'Our page on the Kyivzelenbud website (in Ukrainian)',
      ],
      facebookTitle: 'Facebook',
      facebookLink: 'Our Facebook page (in Ukrainian)',
      rights: 'All rights reserved.',
      updated: 'Updated',
      accessibility: 'Accessibility statement (in Ukrainian)',
      developer: 'Website by S#RP',
    },
  },
};
