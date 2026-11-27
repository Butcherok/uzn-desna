/**
 * Текст данных на языке страницы (ТЗ 6.1, п. 4). Английская страница
 * собирается только при полном переводе (domain/translation), поэтому
 * пустой `en` здесь — ошибка сборки, а не повод показать украинский текст
 * под английским адресом (ТЗ 4.13, «При отсутствии данных»).
 */
import type { LangText } from '@uzn/shared';
import type { Lang } from './lang';

export function pick(text: LangText, lang: Lang): string;
export function pick(text: LangText | undefined, lang: Lang): string | undefined;
export function pick(text: LangText | undefined, lang: Lang): string | undefined {
  if (text === undefined) return undefined;
  if (lang === 'uk') return text.uk;
  const en = text.en?.trim();
  if (!en) {
    throw new Error(`Нет английского текста для «${text.uk.slice(0, 60)}» (решение 056)`);
  }
  return text.en;
}
