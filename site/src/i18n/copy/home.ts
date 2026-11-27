import type { PageCopy } from './types';

/** «Головна» (ТЗ 4.1) */
export interface HomeCopy {
  /** Полный `<title>` главной (решение 039) */
  title: string;
  description: string;
  slogan: string;
  bannerAlt: string;
  sectionsLabel: string;
  /**
   * Карточки разделов (ТЗ 4.1; решение 052). На английской главной карточки
   * «Новини» нет: новости не переводятся (ТЗ 4.13). Карточка страницы без
   * английской версии на английской главной не выводится (решение 056).
   */
  cards: readonly { path: string; title: string; text: string }[];
  newsTitle: string;
  newsAllBefore: string;
  newsLink: string;
  contactsTitle: string;
  contactsAllBefore: string;
}

export const HOME_COPY: PageCopy<HomeCopy> = {
  uk: {
    title: 'КП УЗН Деснянського району — озеленення й догляд',
    description:
      'КП УЗН Деснянського району: озеленення й догляд за зеленими насадженнями району. Послуги, контакти, новини.',
    slogan: 'Озеленення й догляд — наша щоденна робота',
    bannerAlt:
      'Парк Деснянського району: алеї з лавками й ліхтарями між деревами ведуть до будівлі районної адміністрації та кінотеатру, позаду житлові багатоповерхівки, біля кінотеатру люди',
    sectionsLabel: 'Розділи сайту',
    cards: [
      {
        path: '/services/',
        title: 'Послуги',
        text: 'Озеленення, догляд за насадженнями, ландшафтні роботи, вирощування розсади.',
      },
      {
        path: '/contacts/',
        title: 'Контакти',
        text: 'Адреса, графік роботи й телефони підрозділів підприємства.',
      },
      {
        path: '/about/',
        title: 'Про підприємство',
        text: 'Чим займається підприємство, керівництво, реквізити та публічна інформація.',
      },
      {
        path: '/news/',
        title: 'Новини',
        text: 'Новини підприємства й галузі: парки, сквери, озеленення в Києві та світі.',
      },
    ],
    newsTitle: 'Новини',
    newsAllBefore: 'Усі новини — на сторінці',
    newsLink: 'Новини',
    contactsTitle: 'Контакти',
    contactsAllBefore: 'Усі телефони підрозділів — на сторінці',
  },
};
