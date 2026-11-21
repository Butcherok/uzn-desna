/**
 * Обращения админки к API (ТЗ 8, 8.7). Здесь — весь ввод-вывод: `fetch`,
 * таймаут, повтор по правилам `domain/retry`, разбор ответа об ошибке.
 * Ответ об ошибке превращается в `ApiFailure` с готовым украинским текстом.
 */
import { ADMIN_CONFIG } from '../config/admin';
import type { PublishProblem } from '../domain/publish';
import { CONNECT_FAILED, retryDecision, type Failure } from '../domain/retry';

export interface ApiFailure {
  /** Код из перечня ТЗ 8.1 или `NETWORK`; в интерфейс не выводится. */
  code: string;
  status: number;
  message: string;
  fields: Record<string, string>;
  /** Записи, из-за которых публикация не запущена (ТЗ 8.5, п. 2). */
  problems: PublishProblem[];
}

export class ApiRequestError extends Error {
  readonly failure: ApiFailure;
  constructor(failure: ApiFailure) {
    super(failure.message);
    this.name = 'ApiRequestError';
    this.failure = failure;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  /** Создание записи: после таймаута не повторяется (domain/retry). */
  idempotent?: boolean;
  /** Сообщает, что ответа нет дольше `wakeNoticeAfterMs` (ТЗ 8.7, п. 2). */
  onSlow?: (slow: boolean) => void;
}

export interface ApiResponse<T> {
  data: T;
  etag: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Attempt<T> =
  { ok: true; value: ApiResponse<T> } | { ok: false; failure: Failure; error: ApiFailure };

async function attempt<T>(url: string, init: RequestInit): Promise<Attempt<T>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ADMIN_CONFIG.requestTimeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    const timedOut = ctrl.signal.aborted;
    return {
      ok: false,
      failure: { kind: timedOut ? 'timeout' : 'network' },
      error: { code: 'NETWORK', status: 0, message: CONNECT_FAILED, fields: {}, problems: [] },
    };
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text().catch(() => '');
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (res.ok) return { ok: true, value: { data: json as T, etag: res.headers.get('ETag') } };
  const err = (
    json as {
      error?: { code?: unknown; message?: unknown; fields?: unknown; problems?: unknown };
    } | null
  )?.error;
  const code = typeof err?.code === 'string' ? err.code : null;
  return {
    ok: false,
    failure: { kind: 'http', status: res.status, code },
    error: {
      code: code ?? 'INTERNAL',
      status: res.status,
      message:
        typeof err?.message === 'string' && err.message
          ? err.message
          : 'Щось пішло не так. Спробуйте ще раз',
      fields:
        err?.fields && typeof err.fields === 'object' ? (err.fields as Record<string, string>) : {},
      problems: Array.isArray(err?.problems) ? (err.problems as PublishProblem[]) : [],
    },
  };
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  const method = opts.method ?? 'GET';
  const qs = opts.query ? `?${new URLSearchParams(opts.query).toString()}` : '';
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  if (method !== 'GET') headers[ADMIN_CONFIG.csrfHeader] = ADMIN_CONFIG.csrfValue;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const init: RequestInit = {
    method,
    headers,
    credentials: 'same-origin',
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  };
  let slow = false;
  const slowTimer = setTimeout(() => {
    slow = true;
    opts.onSlow?.(true);
  }, ADMIN_CONFIG.wakeNoticeAfterMs);
  try {
    for (let n = 0; ; n += 1) {
      const r = await attempt<T>(`${ADMIN_CONFIG.apiBase}${path}${qs}`, init);
      if (r.ok) return r.value;
      const next = retryDecision(
        r.failure,
        n,
        ADMIN_CONFIG.dbRetryDelayMs,
        opts.idempotent ?? true,
      );
      if (!next.retry) throw new ApiRequestError(r.error);
      if (next.delayMs > 0) await sleep(next.delayMs);
    }
  } finally {
    clearTimeout(slowTimer);
    if (slow) opts.onSlow?.(false);
  }
}
