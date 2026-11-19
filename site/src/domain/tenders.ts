/**
 * Правила страницы «Наші закупівлі», версия 2 (ТЗ 4.9). Слой domain:
 * чистые функции над переданными данными.
 */
import { formatDate } from '@uzn/shared';
import type { Tender, TendersFile } from '@uzn/shared';

/** Выводится 10 из 20 хранимых, остальное — по ссылке на Prozorro (ТЗ 6.3). */
export const TENDERS_SHOWN = 10;

/**
 * Статус словами — названия из документации API Prozorro, раздел «Tender»,
 * поле `status`, украинская версия:
 * https://prozorro-api-docs.readthedocs.io/uk/master/standard/tender.html
 * Взята основная часть названия, без пояснения в скобках. Сверено 19.11.2026.
 */
export const STATUS_LABELS: Readonly<Record<string, string>> = {
  'active.enquiries': 'Період уточнень',
  'active.tendering': 'Очікування пропозицій',
  'active.pre-qualification': 'Перед-кваліфікаційний період',
  'active.pre-qualification.stand-still': 'Блокування перед аукціоном',
  'active.auction': 'Період аукціону',
  'active.qualification': 'Кваліфікація переможця',
  'active.awarded': 'Пропозиції розглянуто',
  active: 'Активний тендер',
  unsuccessful: 'Закупівля не відбулась',
  complete: 'Завершена закупівля',
  cancelled: 'Відмінена закупівля',
};

/**
 * Статус, которого нет в перечне (документация не даёт ему украинского
 * названия или Prozorro добавит новый), не выдумывается: карточка отсылает
 * к странице закупки.
 */
export const STATUS_UNKNOWN = 'Статус — на сторінці закупівлі';

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? STATUS_UNKNOWN;
}

const NBSP = ' ';

/** Сумма с пробелом между тысячами и «грн» после числа (ТЗ 5.1, п. 6). */
export function formatAmount(amount: number | null, currency: string | null): string | null {
  if (amount === null) return null;
  const [whole = '0', fraction = '00'] = amount.toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/gu, NBSP);
  const unit = currency === null || currency === 'UAH' ? 'грн' : currency;
  return `${grouped},${fraction}${NBSP}${unit}`;
}

/** Срок подачи: дата и время по часовому поясу, в котором его отдал Prozorro. */
export function formatDeadline(iso: string | null): string | null {
  if (iso === null) return null;
  return `${formatDate(iso)}, ${iso.slice(11, 16)}`;
}

export interface TenderCard {
  tenderID: string;
  title: string;
  status: string;
  amount: string | null;
  published: string;
  deadline: string | null;
  url: string;
}

export function tenderCards(items: readonly Tender[]): TenderCard[] {
  return items.slice(0, TENDERS_SHOWN).map((tender) => ({
    tenderID: tender.tenderID,
    title: tender.title,
    status: statusLabel(tender.status),
    amount: formatAmount(tender.amount, tender.currency),
    published: formatDate(tender.datePublished),
    deadline: formatDeadline(tender.tenderEndDate),
    url: tender.url,
  }));
}

/** Что выводит блок по правилу трёх состояний (ТЗ 3.3, 6.5). */
export type TendersView =
  | { kind: 'cards'; cards: TenderCard[]; stale: string | null }
  | { kind: 'empty' }
  | { kind: 'unavailable' };

export function tendersView(file: TendersFile): TendersView {
  if (file.state === 'empty') return { kind: 'empty' };
  if (file.items.length === 0) return { kind: 'unavailable' };
  const stale =
    file.state === 'unknown' && file.fetchedAt !== null ? formatDate(file.fetchedAt) : null;
  return { kind: 'cards', cards: tenderCards(file.items), stale };
}
