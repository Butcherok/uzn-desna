/**
 * «Стан системи» в админке (ТЗ 8.6, 9.1; решение 049): состояние синхронизаций
 * и сведения о сервисе — словами, без служебных кодов (ТЗ 9.7, п. 4).
 * Слой domain: типы ответа и чистые функции подписей.
 */
import { formatDateTime, sectionOf } from './kinds';

export interface SyncSourceState {
  source: string;
  lastRunAt: string;
  lastSuccessAt: string | null;
  result: 'ok' | 'partial' | 'error';
  errorCode: string | null;
  itemsFetched: number;
  itemsNew: number;
  consecutiveFailures: number;
}

export interface SyncRunView {
  id: number;
  event: 'schedule' | 'workflow_dispatch' | 'other';
  createdAt: string;
  state: 'in_progress' | 'success' | 'failure';
  url: string;
}

export interface SyncStatus {
  sources: SyncSourceState[] | null;
  sourcesFresh: boolean;
  runs: SyncRunView[] | null;
  runsFresh: boolean;
}

export interface SystemInfo {
  version: string;
  startedAt: string;
  counts: { kind: string; total: number; published: number }[];
  lastPublishedAt: string | null;
  pendingChanges: number;
}

const SOURCES: Record<string, string> = {
  prozorro: 'Закупівлі Prozorro',
  kyivzelenbud: 'Новини: Київзеленбуд',
  theconversation: 'Новини: The Conversation',
  kmda: 'Новини: КМДА',
  hmarochos: 'Новини: Хмарочос',
  gdelt: 'Новини: GDELT',
};

export const sourceLabel = (id: string): string => SOURCES[id] ?? 'Інше джерело';

const RESULT: Record<SyncSourceState['result'], string> = {
  ok: 'Працює',
  partial: 'Працює частково',
  error: 'Не вдалося отримати дані',
};

const ERRORS: Record<string, string> = {
  SRC_TIMEOUT: 'джерело не відповіло вчасно',
  SRC_HTTP_4XX: 'джерело відмовило в доступі або адреса змінилася',
  SRC_HTTP_5XX: 'збій на боці джерела',
  SRC_RATE_LIMIT: 'забагато запитів, джерело попросило зачекати',
  SRC_PARSE: 'джерело змінило формат відповіді',
  SCHEMA_MISMATCH: 'дані не пройшли перевірку',
};

/** Итог по источнику одной строкой: «Не вдалося отримати дані: …». */
export function resultText(s: SyncSourceState): string {
  const base = RESULT[s.result];
  if (s.result === 'ok' || s.errorCode === null) return base;
  return `${base}: ${ERRORS[s.errorCode] ?? 'інша причина'}`;
}

/**
 * Предупреждение по счётчику сбоев (ТЗ 7.5, п. 3): третий сбой подряд роняет
 * прогон, и GitHub пишет владельцу. Со второго — заранее.
 */
export function failuresWarning(s: SyncSourceState): string | null {
  if (s.consecutiveFailures < 2) return null;
  return s.consecutiveFailures >= 3
    ? `Збій ${s.consecutiveFailures} рази поспіль: прогін позначено помилкою, GitHub надіслав лист власнику.`
    : `Збій ${s.consecutiveFailures} рази поспіль. Після третього GitHub надішле лист власнику.`;
}

/**
 * Время из файла состояния. Файл переписывается только при смене итога или
 * счётчика сбоев (`scripts/src/sync/run.ts`), поэтому у работающего источника
 * `lastRunAt` — начало безошибочной полосы, у сбойного — время последнего сбоя.
 * «Последний успех» и число записей в файле устаревают и не выводятся.
 */
export function sinceText(s: SyncSourceState): string {
  return s.result === 'error'
    ? `Останній збій: ${formatDateTime(s.lastRunAt)}`
    : `Без збоїв з ${formatDateTime(s.lastRunAt)}`;
}

export const RUN_EVENT: Record<SyncRunView['event'], string> = {
  schedule: 'За розкладом',
  workflow_dispatch: 'Запущено вручну або запасним запуском',
  other: 'Інший запуск',
};

export const RUN_STATE: Record<SyncRunView['state'], string> = {
  in_progress: 'Триває',
  success: 'Успішно',
  failure: 'Помилка',
};

/** Час без прогона по расписанию, после которого раздел предупреждает (решение 048). */
export const SCHEDULE_SILENT_MS = 30 * 60 * 60 * 1000;

/**
 * Молчит ли расписание: среди последних прогонов нет запуска по расписанию за
 * 30 часов. `null` — прогоны неизвестны, судить не по чему.
 */
export function scheduleSilent(runs: SyncRunView[] | null, now: Date): boolean | null {
  if (runs === null) return null;
  const since = now.getTime() - SCHEDULE_SILENT_MS;
  return !runs.some((r) => r.event === 'schedule' && Date.parse(r.createdAt) >= since);
}

/** Подпись раздела для числа записей — как в меню. */
export const countLabel = (kind: string): string => sectionOf(kind)?.label ?? 'Інший розділ';
