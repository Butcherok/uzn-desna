/** «Резервні копії» в админке (ТЗ 9.6; решение 045): состояние словами. */

export type BackupState = 'in_progress' | 'success' | 'failure' | 'missing' | 'unknown';

export interface BackupRun {
  runId: number;
  runUrl: string;
  startedAt: string;
  startedBy: string | null;
  state: BackupState;
}

export interface BackupStatus {
  configured: boolean;
  workflowUrl: string;
  last: BackupRun | null;
}

export const BACKUP_POLL_MS = 15_000;

export const STATE_LABEL: Record<BackupState, string> = {
  in_progress: 'Створюється — зазвичай 2–4 хвилини',
  success: 'Готово: копію перевірено, її можна завантажити',
  failure: 'Помилка: копію не створено. Відкрийте прогін, щоб побачити причину',
  missing: 'Прогін не знайдено на GitHub',
  unknown: 'Не вдалося дізнатися стан: GitHub не відповів',
};
