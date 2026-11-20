/**
 * Правила повтора запроса админки (ТЗ 8.7, пп. 3, 6). Чистая функция: время
 * и сеть передаёт слой `gateway`.
 */
export type Failure =
  /** Нет ответа за отведённое время. */
  | { kind: 'timeout' }
  /** Сеть недоступна: запрос не ушёл или оборвался. */
  | { kind: 'network' }
  /** Сервис ответил ошибкой. */
  | { kind: 'http'; status: number; code: string | null };

export interface RetryDecision {
  retry: boolean;
  delayMs: number;
}

/**
 * `attempt` — номер уже сделанной попытки, с нуля. Повтор один на запрос:
 * после таймаута или обрыва — сразу (п. 3), после `DB_UNAVAILABLE` — через
 * `dbDelayMs` (п. 6). Ошибки данных и прав не повторяются: ответ не изменится.
 *
 * Создание записи (`idempotent: false`) после таймаута не повторяется: запрос
 * мог дойти, и повтор создал бы вторую запись. `DB_UNAVAILABLE` сервер отдаёт
 * до записи, поэтому его повтор безопасен всегда.
 */
export function retryDecision(
  failure: Failure,
  attempt: number,
  dbDelayMs: number,
  idempotent = true,
): RetryDecision {
  const no = { retry: false, delayMs: 0 };
  if (attempt >= 1) return no;
  if (failure.kind === 'timeout' || failure.kind === 'network') {
    return idempotent ? { retry: true, delayMs: 0 } : no;
  }
  if (failure.status === 503 && failure.code === 'DB_UNAVAILABLE') {
    return { retry: true, delayMs: dbDelayMs };
  }
  return no;
}

/** Сообщение без кода ответа (ТЗ 2.3, требование 5; 8.7, п. 3). */
export const CONNECT_FAILED = "Не вдалося з'єднатися. Спробуйте ще раз";
export const WAKING_UP = 'Сервіс прокидається, це займає до хвилини';
