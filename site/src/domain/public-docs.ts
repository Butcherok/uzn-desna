/**
 * Правила страницы «Публічна інформація» (ТЗ 4.3). Слой domain:
 * чистые функции над переданными данными, без чтения файлов и сети.
 */
import type { PublicDoc, PublishedWhere } from '@uzn/shared';

/**
 * Где опубликован пункт — словом, не цветом и не значком (ТЗ 11.3, п. 10).
 * Полная формулировка: перечень по ч. 8 ст. 60-2, где для неё есть строка
 * таблицы. Для `request` формулировка закреплена решением Заказчика
 * 15.11.2026 и чек-листом 12.2 — не менять.
 */
export const PLACE_LABELS: Record<PublishedWhere, string> = {
  own: 'На цьому сайті',
  parent: 'На чинній сторінці підприємства',
  balans: 'У системі «Баланс» органу управління',
  prozorro: 'У Prozorro',
  edata: 'На порталі Є-data',
  request: 'Надається за запитом на інформацію',
};

/**
 * То же место коротким словом-признаком — для метки `.tag` на карточке
 * (дизайн-система, раздел 7; решение 017). Предел длины — `PLACE_TAG_MAX`:
 * метка длиннее колонки расширяла карточку и давала горизонтальную прокрутку.
 */
export const PLACE_TAGS: Record<PublishedWhere, string> = {
  own: 'Цей сайт',
  parent: 'Чинна сторінка',
  balans: 'Система «Баланс»',
  prozorro: 'Prozorro',
  edata: 'Є-data',
  request: 'За запитом',
};

/** Предел длины метки-признака в знаках (дизайн-система, раздел 7). */
export const PLACE_TAG_MAX = 24;

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

/**
 * Ссылки для страницы «Наші закупівлі» (ТЗ 4.9): те же записи, что и в блоке
 * «Закупівлі та договори» страницы 4.3, но Prozorro первым — на этой странице
 * он главный, а в реестре 4.3 порядок задан нумерацией перечня.
 */
export function tenderLinks(docs: readonly PublicDoc[]): PublicDoc[] {
  const place = (doc: PublicDoc): number => (doc.publishedWhere === 'prozorro' ? 0 : 1);
  return procurementDocs(docs).sort((a, b) => place(a) - place(b) || byOrder(a, b));
}

/** Перечень по ч. 8 ст. 60-2: только записи с формулировкой пункта. */
export function normList(docs: readonly PublicDoc[]): PublicDoc[] {
  return docs.filter((doc) => doc.normRef !== undefined).sort(byOrder);
}
