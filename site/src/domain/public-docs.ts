/**
 * Правила страницы «Публічна інформація» (ТЗ 4.3). Слой domain:
 * чистые функции над переданными данными, без чтения файлов и сети.
 */
import type { PublicDoc, PublishedWhere } from '@uzn/shared';

/** Где опубликован пункт — словом, не цветом и не значком (ТЗ 11.3, п. 10). */
export const PLACE_LABELS: Record<PublishedWhere, string> = {
  own: 'На цьому сайті',
  parent: 'На чинній сторінці підприємства',
  balans: 'У системі «Баланс» органу управління',
  prozorro: 'У Prozorro',
  edata: 'На порталі Є-data',
  request: 'Надається за запитом на інформацію',
};

const byOrder = (a: PublicDoc, b: PublicDoc): number => a.order - b.order;

/** Документы над перечнем: то, что житель открывает чаще всего. */
export function featuredDocs(docs: readonly PublicDoc[]): PublicDoc[] {
  return docs.filter((doc) => doc.featured).sort(byOrder);
}

/** Закупівлі та договори: Prozorro и Є-data (ТЗ 4.3, блоки 3 и 4). */
export function procurementDocs(docs: readonly PublicDoc[]): PublicDoc[] {
  return docs
    .filter((doc) => doc.publishedWhere === 'prozorro' || doc.publishedWhere === 'edata')
    .sort(byOrder);
}

/** Перечень по ч. 8 ст. 60-2: только записи с формулировкой пункта. */
export function normList(docs: readonly PublicDoc[]): PublicDoc[] {
  return docs.filter((doc) => doc.normRef !== undefined).sort(byOrder);
}
