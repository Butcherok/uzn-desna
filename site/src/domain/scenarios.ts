/**
 * Правила страницы «Куди звертатися» (ТЗ 4.5). Слой domain:
 * чистые функции над переданными данными, без чтения файлов и сети.
 */
import type { Scenario } from '@uzn/shared';

/**
 * Перечень ситуаций в порядке `order` (ТЗ 6.1, п. 6).
 *
 * Отбора по наличию телефона нет: с 16.11.2026 на все ситуации один номер
 * оперативного дежурного, он выведен один раз в первом блоке страницы
 * (`claude/12_kontent-4-5-4-6.md`, раздел 1, решение 9).
 */
export function orderedScenarios(scenarios: readonly Scenario[]): Scenario[] {
  return [...scenarios].sort((a, b) => a.order - b.order);
}
