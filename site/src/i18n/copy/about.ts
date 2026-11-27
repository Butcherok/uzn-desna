import type { PageCopy } from './types';

/** «Про підприємство» (ТЗ 4.2) */
export interface AboutCopy {
  description: string;
  whatTitle: string;
  factsTitle: string;
  staffLabel: string;
  areaLabel: string;
  areasTitle: string;
  colCategory: string;
  colCount: string;
  colArea: string;
  noData: string;
  total: string;
  historyTitle: string;
  requisitesTitle: string;
  fullName: string;
  edrpou: string;
  legalForm: string;
  registeredAt: string;
  owner: string;
  governedBy: string;
  coordinatedBy: string;
  kved: string;
  legalBasisTitle: string;
  leadersTitle: string;
  moreTitle: string;
  /**
   * «Докладніше» — ссылки на украинские подразделы. На английской странице
   * пусто: подразделы не переводятся (ТЗ 4.13), блок не выводится.
   */
  more: readonly { path: string; label: string; text: string }[];
}

export const ABOUT_COPY: PageCopy<AboutCopy> = {
  uk: {
    description:
      'КП УЗН Деснянського району: чим займається підприємство, реквізити, правова основа та керівництво підприємства.',
    whatTitle: 'Чим займається підприємство',
    factsTitle: 'У цифрах',
    staffLabel: 'Працівники',
    areaLabel: 'Площа під доглядом, га',
    areasTitle: 'Що доглядаємо',
    colCategory: 'Категорія',
    colCount: 'Кількість',
    colArea: 'Площа, га',
    noData: 'немає даних',
    total: 'Разом',
    historyTitle: 'Історія підприємства',
    requisitesTitle: 'Реквізити',
    fullName: 'Повна назва',
    edrpou: 'Код ЄДРПОУ',
    legalForm: 'Організаційно-правова форма',
    registeredAt: 'Дата реєстрації',
    owner: 'Власник',
    governedBy: 'Підпорядкування',
    coordinatedBy: 'Координуючий орган',
    kved: 'Види діяльності (КВЕД)',
    legalBasisTitle: 'Правова основа',
    leadersTitle: 'Керівництво',
    moreTitle: 'Докладніше',
    more: [
      {
        path: '/about/public-info/',
        label: 'Публічна інформація',
        text: '— документи підприємства та перелік відомостей, які оприлюднюються за законом.',
      },
      {
        path: '/tenders/',
        label: 'Наші закупівлі',
        text: '— закупівлі підприємства в системі Prozorro.',
      },
      {
        path: '/jobs/',
        label: 'Вакансії',
        text: '— відкриті вакансії і телефон відділу кадрів.',
      },
    ],
  },
};
