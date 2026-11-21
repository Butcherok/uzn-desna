/**
 * Публикация (ТЗ 8.5; решение 041). Слой не знает про HTTP и GitHub: прогоны
 * запускает и читает `WorkflowRunner`, данные — хранилище.
 *
 * Порядок: `POST /publish` проверяет опубликованные записи и запускает
 * `publish-content`; рабочий процесс забирает `GET /export` — время выгрузки
 * становится снимком; при успехе прогона снимок становится временем последней
 * публикации, и правки до него уходят из счётчика неопубликованных.
 */
import { SCHEMA_VERSION } from '@uzn/shared';
import { KINDS, type KindDef } from './content-kinds.js';
import { listRecords, ukText } from './content.js';
import { ApiError, type PublishProblem } from './errors.js';
import type { ContentRecord, PublishRun, Store, User } from './model.js';

export type RunState = 'in_progress' | 'success' | 'failure' | 'missing';

/** Запуск и чтение прогонов рабочего процесса. Реализация — `gateway/github.ts`. */
export interface WorkflowRunner {
  dispatch(): Promise<{ runId: number; runUrl: string }>;
  getRun(runId: number): Promise<RunState>;
  runUrl(runId: number): string;
}

/** GitHub не ответил или отказал: запуск или проверка прогона не удались. */
export class RunnerUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RunnerUnavailableError';
  }
}

/**
 * Прогон дольше часа без итога считается зависшим: вторая публикация
 * разрешается, даже если GitHub не отвечает. Обычный прогон — 3–5 минут.
 */
export const RUN_STALE_MS = 60 * 60 * 1000;

export const NOT_CONFIGURED_MESSAGE = 'Публікацію ще не налаштовано. Зверніться до власника';
export const PUBLISH_BLOCKED_MESSAGE = 'Публікацію зупинено: виправте записи зі списку';

export interface PublishCtx {
  store: Store;
  runner: WorkflowRunner | null;
  now: Date;
}

// ---------------------------------------------------------------- выгрузка

export interface ExportFile {
  schemaVersion: number;
  generatedAt: string;
  source: 'admin-export';
  items: Record<string, unknown>[];
}

export interface ExportBody {
  schemaVersion: number;
  generatedAt: string;
  /** Имя файла `data/` → конверт ТЗ 6.6. */
  files: Record<string, ExportFile>;
}

/** Файл `data/` сущности: имя совпадает с адресом эндпоинта (ТЗ 6.6, п. 1). */
export const fileNameOf = (def: KindDef): string => `${def.kind}.json`;

const visible = (r: ContentRecord): boolean => r.status === 'published' && r.deletedAt === null;

async function publishedByKind(store: Store): Promise<Map<KindDef, ContentRecord[]>> {
  const out = new Map<KindDef, ContentRecord[]>();
  for (const def of KINDS) out.set(def, (await listRecords(store, def, false)).filter(visible));
  return out;
}

/** Полный набор редактируемых данных — только `published`, без «Кошика» (ТЗ 8.5). */
export async function buildExport(store: Store, now: Date): Promise<ExportBody> {
  const generatedAt = now.toISOString();
  const files: Record<string, ExportFile> = {};
  for (const [def, records] of await publishedByKind(store)) {
    files[fileNameOf(def)] = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt,
      source: 'admin-export',
      items: records.map((r) => r.data),
    };
  }
  return { schemaVersion: SCHEMA_VERSION, generatedAt, files };
}

/**
 * Проверка перед запуском (ТЗ 8.5, п. 2): то, что сборка не примет, не уходит
 * в рабочий процесс. Те же схемы, что у `data:check`, плюс синглтон ровно один
 * и ссылка на опубликованный контакт.
 */
export async function publishProblems(store: Store): Promise<PublishProblem[]> {
  const byKind = await publishedByKind(store);
  const problems: PublishProblem[] = [];
  const contacts = new Set(
    [...byKind.entries()]
      .filter(([def]) => def.kind === 'contacts')
      .flatMap(([, rs]) => rs.map((r) => r.key)),
  );

  for (const [def, records] of byKind) {
    if (def.key === 'singleton' && records.length !== 1) {
      problems.push({
        kind: def.kind,
        label: def.label,
        id: null,
        title: def.label,
        message: 'Дані не опубліковані',
      });
    }
    for (const r of records) {
      const title = titleOf(def, r);
      const parsed = def.schema.safeParse(r.data);
      if (!parsed.success) {
        problems.push({
          kind: def.kind,
          label: def.label,
          id: r.id,
          title,
          message: 'Не всі поля заповнені правильно. Відкрийте запис і перевірте поля',
        });
        continue;
      }
      const contactId = r.data['contactId'];
      if (def.refersToContact && typeof contactId === 'string' && !contacts.has(contactId)) {
        problems.push({
          kind: def.kind,
          label: def.label,
          id: r.id,
          title,
          message: 'Контакт не опубліковано або видалено. Виберіть інший контакт',
        });
      }
    }
  }
  return problems;
}

function titleOf(def: KindDef, r: ContentRecord): string {
  if (def.key === 'singleton') return def.label;
  return (def.titleField ? ukText(r.data[def.titleField]) : undefined) ?? r.key;
}

// ---------------------------------------------------------------- прогон

/**
 * Сверяет последний прогон с GitHub и, если он закончился, записывает итог.
 * Ошибка GitHub не мешает отдать сохранённое состояние: прогон остаётся
 * `in_progress` до следующего опроса.
 */
export async function refreshRun(ctx: PublishCtx): Promise<PublishRun | null> {
  const meta = await ctx.store.getContentMeta();
  const run = meta.lastRun;
  if (!run || run.result !== 'in_progress' || !ctx.runner) return run;

  let state: RunState;
  try {
    state = await ctx.runner.getRun(run.runId);
  } catch {
    return run;
  }
  if (state === 'in_progress') return run;

  const success = state === 'success' && run.snapshotAt !== null;
  const finish = {
    result: success ? ('success' as const) : ('failure' as const),
    finishedAt: ctx.now,
    publishedAt: success ? run.snapshotAt : null,
    purgedDelta: success ? run.purgedAtSnapshot : 0,
  };
  if (await ctx.store.finishPublishRun(run.runId, finish)) {
    await ctx.store.appendLog({
      at: ctx.now,
      userId: null,
      action: 'publish.finish',
      entity: null,
      entityId: String(run.runId),
      result: success ? 'ok' : 'error',
      details: { state },
    });
  }
  return (await ctx.store.getContentMeta()).lastRun;
}

/** `POST /publish`: проверка, защита от второй публикации, запуск. */
export async function startPublish(ctx: PublishCtx, actor: User): Promise<PublishRun> {
  if (!ctx.runner) throw new ApiError('GITHUB_UNAVAILABLE', NOT_CONFIGURED_MESSAGE);

  const current = await refreshRun(ctx);
  if (
    current?.result === 'in_progress' &&
    ctx.now.getTime() - current.startedAt.getTime() < RUN_STALE_MS
  ) {
    throw new ApiError('PUBLISH_IN_PROGRESS');
  }

  const problems = await publishProblems(ctx.store);
  if (problems.length > 0) {
    await logStart(ctx, actor, null, 'denied', { problems: problems.length });
    throw new ApiError('VALIDATION_FAILED', PUBLISH_BLOCKED_MESSAGE, { problems });
  }

  let dispatched: { runId: number; runUrl: string };
  try {
    dispatched = await ctx.runner.dispatch();
  } catch (err) {
    await logStart(ctx, actor, null, 'error', {});
    if (err instanceof RunnerUnavailableError) throw new ApiError('GITHUB_UNAVAILABLE');
    throw err;
  }

  const meta = await ctx.store.getContentMeta();
  // Рабочий процесс мог успеть забрать выгрузку раньше, чем записан прогон:
  // тогда снимок уже сохранён под этим номером и не теряется.
  const early = meta.lastRun?.runId === dispatched.runId ? meta.lastRun : null;
  const run: PublishRun = {
    runId: dispatched.runId,
    runUrl: dispatched.runUrl,
    startedAt: ctx.now,
    startedBy: actor.displayName,
    result: 'in_progress',
    finishedAt: null,
    snapshotAt: early?.snapshotAt ?? null,
    purgedAtSnapshot: early?.purgedAtSnapshot ?? 0,
  };
  await ctx.store.setPublishRun(run);
  await logStart(ctx, actor, run.runId, 'ok', {});
  return run;
}

/**
 * `GET /export` от рабочего процесса: время выгрузки — снимок прогона
 * `runId`. Прогон по расписанию сервер видит впервые здесь и заводит сам.
 */
export async function recordExport(
  store: Store,
  runner: WorkflowRunner | null,
  runId: number,
  now: Date,
): Promise<void> {
  const meta = await store.getContentMeta();
  const snapshot = { snapshotAt: now, purgedAtSnapshot: meta.purgedPending };
  if (await store.patchPublishRun(runId, snapshot)) return;
  await store.setPublishRun({
    runId,
    runUrl: runner?.runUrl(runId) ?? '',
    startedAt: now,
    startedBy: null,
    result: 'in_progress',
    finishedAt: null,
    ...snapshot,
  });
}

async function logStart(
  ctx: PublishCtx,
  actor: User,
  runId: number | null,
  result: 'ok' | 'denied' | 'error',
  details: Record<string, number>,
): Promise<void> {
  await ctx.store.appendLog({
    at: ctx.now,
    userId: actor.id,
    action: 'publish.start',
    entity: null,
    entityId: runId === null ? null : String(runId),
    result,
    details,
  });
}

export interface RunView {
  runId: number;
  runUrl: string;
  startedAt: string;
  startedBy: string | null;
  result: PublishRun['result'];
  finishedAt: string | null;
}

export function runView(run: PublishRun | null): RunView | null {
  if (!run) return null;
  return {
    runId: run.runId,
    runUrl: run.runUrl,
    startedAt: run.startedAt.toISOString(),
    startedBy: run.startedBy,
    result: run.result,
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}
