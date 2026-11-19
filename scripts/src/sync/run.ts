/**
 * Прогон `sync-external` (ТЗ 7.1): читает прежние файлы `data/sync/`,
 * выполняет шаги, пишет новые файлы и сообщает, изменилось ли содержимое.
 *
 * Ввод-вывод передаётся снаружи, поэтому прогон целиком проверяется тестом.
 */
import { SCHEMA_VERSION, syncStateFileSchema, tendersFileSchema } from '@uzn/shared';
import type { SyncState, SyncStateFile, Tender, TendersFile } from '@uzn/shared';
import { SourceError } from './http.js';
import { mask } from './mask.js';
import { FAILURES_TO_FAIL, emptyTendersFile, nextSyncState, nextTendersFile } from './state.js';
import type { Outcome } from './state.js';

export type Step = 'prozorro';

export interface RunIo {
  readJson: (name: string) => Promise<unknown>;
  writeJson: (name: string, value: unknown) => Promise<void>;
  fetchTenders: () => Promise<Tender[]>;
  now: () => string;
  log: (line: string) => void;
  secrets: readonly string[];
}

export interface RunResult {
  /** Изменились файлы, которые выводит сайт: нужна пересборка. */
  siteChanged: boolean;
  /** Изменился хоть один файл: нужен коммит. */
  anyChanged: boolean;
  /** Прогон должен завершиться ошибкой (ТЗ 7.5, п. 3). */
  failed: boolean;
  failReasons: string[];
}

export const TENDERS_FILE = 'tenders.json';
export const SYNC_STATE_FILE = 'sync-state.json';

async function readOr<T>(
  io: RunIo,
  name: string,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } },
  fallback: T,
): Promise<T> {
  const raw = await io.readJson(name);
  if (raw === undefined) return fallback;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error(`data/sync/${name}: прежний файл не проходит схему`);
  return parsed.data;
}

/**
 * Для решения «коммитить или нет» время прогона и счётчики записей этого
 * прогона не считаются изменением: иначе каждый прогон давал бы коммит
 * (ТЗ 12.3). Результат, код ошибки и счётчик сбоев считаются — без них
 * третий сбой подряд не отследить. Следствие: при прогонах без изменений
 * `lastRunAt` в файле отстаёт; время каждого прогона видно в журнале Actions.
 */
function stateKey(state: SyncState | undefined): string {
  if (state === undefined) return '';
  return JSON.stringify([state.result, state.errorCode, state.consecutiveFailures]);
}

export async function runSync(steps: readonly Step[], io: RunIo): Promise<RunResult> {
  const now = io.now();
  const previousTenders = await readOr<TendersFile>(
    io,
    TENDERS_FILE,
    tendersFileSchema,
    emptyTendersFile(now),
  );
  const previousStateFile = await readOr<SyncStateFile>(io, SYNC_STATE_FILE, syncStateFileSchema, {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now,
    source: 'sync',
    items: [],
  });

  const states = new Map(previousStateFile.items.map((item) => [item.source, item]));
  const result: RunResult = {
    siteChanged: false,
    anyChanged: false,
    failed: false,
    failReasons: [],
  };
  let nextTenders = previousTenders;
  let stateChanged = false;

  if (steps.includes('prozorro')) {
    let outcome: Outcome<Tender>;
    try {
      outcome = { ok: true, items: await io.fetchTenders() };
    } catch (error) {
      const code = error instanceof SourceError ? error.code : 'SRC_PARSE';
      outcome = { ok: false, code, message: mask((error as Error).message, io.secrets) };
    }

    nextTenders = nextTendersFile(previousTenders, outcome, now);
    const previousState = states.get('prozorro');
    const previousIds = new Set(previousTenders.items.map((item) => item.tenderID));
    const state = nextSyncState(
      'prozorro',
      previousState,
      outcome.ok ? { ok: true, items: outcome.items.map((t) => ({ id: t.tenderID })) } : outcome,
      previousIds,
      now,
    );
    states.set('prozorro', state);
    if (stateKey(previousState) !== stateKey(state)) stateChanged = true;

    io.log(
      outcome.ok
        ? `prozorro: ok, записей ${outcome.items.length}, новых ${state.itemsNew}`
        : `prozorro: ${outcome.code}, сбоев подряд ${state.consecutiveFailures}`,
    );
    if (state.consecutiveFailures >= FAILURES_TO_FAIL) {
      result.failed = true;
      result.failReasons.push(
        `prozorro: ${state.consecutiveFailures} неудачных прогона подряд (${state.errorCode})`,
      );
    }
  }

  // Проверка схемой перед записью: файл, который не прошёл бы сборку,
  // не записывается вовсе (ТЗ 7.5, п. 3; код SCHEMA_MISMATCH).
  const tendersChecked = tendersFileSchema.safeParse(nextTenders);
  const stateFile: SyncStateFile = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now,
    source: 'sync',
    items: [...states.values()].sort((a, b) => a.source.localeCompare(b.source)),
  };
  const stateChecked = syncStateFileSchema.safeParse(stateFile);
  if (!tendersChecked.success || !stateChecked.success) {
    return { ...result, failed: true, failReasons: [...result.failReasons, 'SCHEMA_MISMATCH'] };
  }

  if (JSON.stringify(nextTenders) !== JSON.stringify(previousTenders)) {
    await io.writeJson(TENDERS_FILE, nextTenders);
    result.siteChanged = true;
    result.anyChanged = true;
  }
  if (stateChanged || (await io.readJson(SYNC_STATE_FILE)) === undefined) {
    await io.writeJson(SYNC_STATE_FILE, stateFile);
    result.anyChanged = true;
  }
  return result;
}
