/**
 * Числа и тексты будильника `/admin` (ТЗ 8.7, пп. 2–3). Те же значения у
 * админки — `admin/src/config/admin.ts` и `admin/src/domain/retry.ts`.
 */
export const WAKE = {
  noticeAfterMs: 3_000,
  timeoutMs: 90_000,
  waking: 'Сервіс прокидається, це займає до хвилини',
  failed: "Не вдалося з'єднатися. Спробуйте ще раз",
} as const;
