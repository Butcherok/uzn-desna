/**
 * Тексты страницы на двух языках (решение 056). `en` нет — у страницы нет
 * английской версии: правило «нет перевода — нет страницы» (ТЗ 4.13, 3.2, п. 6).
 * Английские тексты четырёх страниц вводит задача 3 `feat/en-content`
 * (черновик разработчика → утверждение Заказчика, В4).
 */
import type { Lang } from '../lang';

export interface PageCopy<T> {
  readonly uk: T;
  readonly en?: T | undefined;
}

/** Тексты на языке; на английском — только если перевод есть. */
export function copyFor<T>(copy: PageCopy<T>, lang: Lang): T | undefined {
  return lang === 'uk' ? copy.uk : copy.en;
}
