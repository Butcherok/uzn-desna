/**
 * Настройки админки в одном месте (ТЗ 10.2, слой `config`). Числа — из ТЗ 8.7.
 */
export const ADMIN_CONFIG = {
  /** API на том же адресе, что и админка (решение 036). */
  apiBase: '/api/v1',
  /** Заголовок защиты от подделки запросов (ТЗ 8.2, п. 2). */
  csrfHeader: 'X-Requested-With',
  csrfValue: 'uzn-admin',
  /** Через сколько без ответа показать «Сервіс прокидається…» (ТЗ 8.7, п. 2). */
  wakeNoticeAfterMs: 3_000,
  /** Клиентский таймаут запроса (ТЗ 8.7, п. 3). */
  requestTimeoutMs: 90_000,
  /** Повтор после 503 `DB_UNAVAILABLE` (ТЗ 8.7, п. 6). */
  dbRetryDelayMs: 3_000,
} as const;
