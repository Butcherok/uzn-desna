/**
 * Правила записи состояния (ТЗ 6.5) и учёт сбоев (ТЗ 7.5, п. 3).
 * Чистые функции: вход — прежний файл и исход запроса, выход — новый файл.
 */
import { SCHEMA_VERSION } from '@uzn/shared';
import type { SyncErrorCode, SyncSource, SyncState, Tender, TendersFile } from '@uzn/shared';

/** Третий подряд неудачный прогон по одному источнику роняет процесс (ТЗ 7.5, п. 3). */
export const FAILURES_TO_FAIL = 3;

export type Outcome<T> =
  { ok: true; items: T[] } | { ok: false; code: SyncErrorCode; message: string };

export function emptyTendersFile(now: string): TendersFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now,
    source: 'sync',
    state: 'unknown',
    items: [],
    fetchedAt: null,
    lastSuccessAt: null,
    sourceErrors: [],
  };
}

/**
 * Новый файл блока. Ответ с записями — `data`, без записей — `empty`,
 * ошибка — `unknown` с **прежними** записями и прежним `fetchedAt`.
 * `generatedAt` при ошибке тоже прежний: иначе каждый сбойный прогон
 * менял бы файл и давал коммит без изменения содержимого (ТЗ 12.3).
 */
export function nextTendersFile(
  previous: TendersFile,
  outcome: Outcome<Tender>,
  now: string,
): TendersFile {
  if (!outcome.ok) {
    return {
      ...previous,
      state: 'unknown',
      sourceErrors: [{ source: 'prozorro', code: outcome.code }],
    };
  }
  const sameItems = JSON.stringify(previous.items) === JSON.stringify(outcome.items);
  const state = outcome.items.length > 0 ? 'data' : 'empty';
  if (sameItems && previous.state === state && previous.sourceErrors.length === 0) {
    // Содержимое не изменилось — файл тоже: коммита не будет (ТЗ 12.3).
    return previous;
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now,
    source: 'sync',
    state,
    items: outcome.items,
    fetchedAt: now,
    lastSuccessAt: now,
    sourceErrors: [],
  };
}

export function nextSyncState(
  source: SyncSource,
  previous: SyncState | undefined,
  outcome: Outcome<{ id: string }>,
  previousIds: ReadonlySet<string>,
  now: string,
): SyncState {
  if (!outcome.ok) {
    return {
      source,
      lastRunAt: now,
      lastSuccessAt: previous?.lastSuccessAt ?? null,
      result: 'error',
      errorCode: outcome.code,
      errorMessage: outcome.message.slice(0, 300),
      itemsFetched: 0,
      itemsNew: 0,
      consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1,
    };
  }
  return {
    source,
    lastRunAt: now,
    lastSuccessAt: now,
    result: 'ok',
    errorCode: null,
    errorMessage: null,
    itemsFetched: outcome.items.length,
    itemsNew: outcome.items.filter((item) => !previousIds.has(item.id)).length,
    consecutiveFailures: 0,
  };
}
