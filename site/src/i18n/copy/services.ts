import type { PageCopy } from './types';

/** «Послуги» (ТЗ 4.4) */
export interface ServicesCopy {
  description: string;
  lead: string;
  orderNote: string;
  /** Абзац об аварийных случаях: текст до ссылки на «Контакти» */
  emergencyBefore: string;
}

export const SERVICES_COPY: PageCopy<ServicesCopy> = {
  uk: {
    description:
      'Роботи КП УЗН Деснянського району: озеленення, газони, квітники, догляд за насадженнями, обрізка та знесення дерев, корчування пнів, автовишка.',
    lead: 'Роботи, які виконує підприємство.',
    orderNote: 'Замовлення і уточнення — приймальня підприємства.',
    emergencyBefore:
      'Якщо дерево впало або може впасти, зламані лавки чи огорожа — це не замовлення послуги, а звернення до оперативного чергового. Його номер і решта телефонів — на сторінці',
  },
};
