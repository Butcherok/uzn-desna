/**
 * Резервная копия по кнопке владельца (ТЗ 9.6, п. 2; решение 045). Копию
 * делает рабочий процесс `backup`; бэкенд только запускает его и читает итог
 * последнего запуска. Номер прогона хранится в журнале действий
 * (`backup.start`): отдельного хранилища не нужно.
 */
import { ApiError } from './errors.js';
import type { Store, User } from './model.js';
import { RunnerUnavailableError, type RunState, type WorkflowRunner } from './publish.js';

export const BACKUP_ACTION = 'backup.start';
export const BACKUP_NOT_CONFIGURED = 'Резервні копії ще не налаштовано';
export const BACKUP_IN_PROGRESS = 'Резервна копія вже створюється. Зачекайте кілька хвилин';
export const BACKUP_DISPATCH_FAILED = 'Не вдалося запустити резервну копію. Спробуйте пізніше';
/** Прогон дольше часа без итога считается зависшим: обычный — 2–4 минуты. */
export const BACKUP_STALE_MS = 60 * 60 * 1000;

export interface BackupCtx {
  store: Store;
  runner: WorkflowRunner | null;
  now: Date;
  /** Страница рабочего процесса: там прогоны и их артефакты. */
  workflowUrl: string;
}

export interface BackupRunView {
  runId: number;
  runUrl: string;
  startedAt: string;
  startedBy: string | null;
  /** `unknown` — GitHub не ответил; это не «ошибка копии». */
  state: RunState | 'unknown';
}

export interface BackupStatus {
  configured: boolean;
  workflowUrl: string;
  last: BackupRunView | null;
}

async function lastStart(ctx: BackupCtx) {
  const { items } = await ctx.store.listLog({ action: BACKUP_ACTION, skip: 0, limit: 10 });
  return items.find((e) => e.result === 'ok' && e.entityId !== null && /^\d+$/u.test(e.entityId));
}

export async function backupStatus(ctx: BackupCtx): Promise<BackupStatus> {
  const base = { configured: ctx.runner !== null, workflowUrl: ctx.workflowUrl };
  const entry = await lastStart(ctx);
  if (!entry || !ctx.runner) return { ...base, last: null };
  const runId = Number(entry.entityId);
  let state: BackupRunView['state'];
  try {
    state = await ctx.runner.getRun(runId);
  } catch {
    state = 'unknown';
  }
  const user = entry.userId ? await ctx.store.findUserById(entry.userId) : null;
  return {
    ...base,
    last: {
      runId,
      runUrl: ctx.runner.runUrl(runId),
      startedAt: entry.at.toISOString(),
      startedBy: user?.displayName ?? null,
      state,
    },
  };
}

export async function startBackup(ctx: BackupCtx, actor: User): Promise<BackupRunView> {
  if (!ctx.runner) throw new ApiError('GITHUB_UNAVAILABLE', BACKUP_NOT_CONFIGURED);
  const current = await backupStatus(ctx);
  if (
    current.last?.state === 'in_progress' &&
    ctx.now.getTime() - Date.parse(current.last.startedAt) < BACKUP_STALE_MS
  ) {
    throw new ApiError('CONFLICT', BACKUP_IN_PROGRESS);
  }
  let run: { runId: number; runUrl: string };
  try {
    run = await ctx.runner.dispatch();
  } catch (err) {
    await ctx.store.appendLog({
      at: ctx.now,
      userId: actor.id,
      action: BACKUP_ACTION,
      entity: null,
      entityId: null,
      result: 'error',
      details: {},
    });
    if (err instanceof RunnerUnavailableError) {
      throw new ApiError('GITHUB_UNAVAILABLE', BACKUP_DISPATCH_FAILED);
    }
    throw err;
  }
  await ctx.store.appendLog({
    at: ctx.now,
    userId: actor.id,
    action: BACKUP_ACTION,
    entity: null,
    entityId: String(run.runId),
    result: 'ok',
    details: {},
  });
  return {
    runId: run.runId,
    runUrl: run.runUrl,
    startedAt: ctx.now.toISOString(),
    startedBy: actor.displayName,
    state: 'in_progress',
  };
}
