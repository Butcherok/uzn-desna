/**
 * Запрос к источнику с повторами и закрытым перечнем ошибок (ТЗ 7.5, пп. 2, 5).
 *
 * Три попытки, паузы 1 с, 5 с, 25 с, таймаут одной попытки 15 с. Повторяются
 * только сбои, которые повтор может исправить: таймаут, сеть, 429, 5xx.
 * 4xx кроме 429 — ошибка адреса, повтор её не исправит.
 *
 * В журнал идут только код ответа и длина тела (ТЗ 7.5, п. 6), тело — никогда.
 */
import type { SyncErrorCode } from '@uzn/shared';

export const RETRY_DELAYS_MS = [1_000, 5_000, 25_000] as const;
export const ATTEMPT_TIMEOUT_MS = 15_000;

export class SourceError extends Error {
  constructor(
    readonly code: SyncErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SourceError';
  }
}

export interface FetchDeps {
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
}

export const defaultDeps: FetchDeps = {
  fetch: globalThis.fetch.bind(globalThis),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: (line) => console.log(line),
};

function codeForStatus(status: number): SyncErrorCode {
  if (status === 429) return 'SRC_RATE_LIMIT';
  if (status >= 500) return 'SRC_HTTP_5XX';
  return 'SRC_HTTP_4XX';
}

function retryable(code: SyncErrorCode): boolean {
  return code === 'SRC_TIMEOUT' || code === 'SRC_RATE_LIMIT' || code === 'SRC_HTTP_5XX';
}

/** Тело ответа текстом. Бросает `SourceError` после исчерпания попыток. */
export async function fetchText(
  label: string,
  url: string,
  init: RequestInit,
  deps: FetchDeps = defaultDeps,
): Promise<string> {
  let lastError: SourceError | undefined;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await deps.sleep(RETRY_DELAYS_MS[attempt - 1] ?? 0);

    try {
      const response = await deps.fetch(url, {
        ...init,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      const body = await response.text();
      deps.log(`${label}: попытка ${attempt + 1}, код ${response.status}, длина ${body.length}`);
      if (response.ok) return body;
      lastError = new SourceError(codeForStatus(response.status), `HTTP ${response.status}`);
    } catch (error) {
      const name = (error as Error).name;
      deps.log(`${label}: попытка ${attempt + 1}, сбой ${name}`);
      // Таймаут и сетевой сбой для посетителя одинаковы: источник не ответил.
      lastError = new SourceError('SRC_TIMEOUT', name);
    }

    if (!retryable(lastError.code)) break;
  }

  throw lastError ?? new SourceError('SRC_TIMEOUT', 'no attempt made');
}
