/**
 * Правила вывода карточек руководства (ТЗ 4.2, 5.4). Слой domain:
 * чистые функции над переданными данными, без чтения файлов и сети.
 */
import type { Leader } from '@uzn/shared';

const byOrder = (a: Leader, b: Leader): number => a.order - b.order;

/**
 * Порядок карточек — поле `order` (ТЗ 6.1, п. 6).
 *
 * Отбора по отметке подтверждения здесь нет: сведения всех пяти карточек
 * уже оприлюднені органом управління на чинній сторінці підприємства, и до
 * отметки карточка выводится в том же объёме (решение Заказчика 17.11.2026,
 * `docs/decisions/011-leaders-page-data.md`). Просьба убрать своё — правка
 * одной записи данных, а не страницы.
 */
export function publishedLeaders(leaders: readonly Leader[]): Leader[] {
  return [...leaders].sort(byOrder);
}
