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
import { filesOf, mediaManifest, type MediaManifestEntry } from './uploads.js';

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
  /** Файлы `media/`, лежащие в `main` с начальными данными (не загруженные). */
  repoMedia: ReadonlySet<string>;
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
  /**
   * Загруженные файлы, которые должны лежать в `content-data` (решение 042).
   * Остальные файлы `media/` ветки рабочий процесс удаляет.
   */
  media: MediaManifestEntry[];
}

export interface ExportResult {
  body: ExportBody;
  /** Неопубликованные файлы из этой выгрузки: их содержимое отдаёт `/export/media`. */
  pendingPaths: string[];
}

/** Файл `data/` сущности: имя совпадает с адресом эндпоинта (ТЗ 6.6, п. 1). */
export const fileNameOf = (def: KindDef): string => `${def.kind}.json`;

const visible = (r: ContentRecord): boolean => r.status === 'published' && r.deletedAt === null;

async function publishedByKind(store: Store): Promise<Map<KindDef, ContentRecord[]>> {
  const out = new Map<KindDef, ContentRecord[]>();
  for (const def of KINDS) out.set(def, (await listRecords(store, def, false)).filter(visible));
  return out;
}

/** Пути файлов в опубликованных записях. */
function referencedFiles(byKind: Map<KindDef, ContentRecord[]>): Set<string> {
  const out = new Set<string>();
  for (const [def, records] of byKind) {
    for (const r of records) for (const p of filesOf(def.kind, r.data)) out.add(p);
  }
  return out;
}

/** Файл модерации ленты в `data/` (ТЗ 6.3, п. 4; решение 043). */
export const MODERATION_FILE = 'moderation.json';

/** Только скрытые карточки, по ключу: порядок не зависит от БД, и пустой дифф не коммитится. */
async function moderationItems(store: Store): Promise<Record<string, unknown>[]> {
  return (await store.listModeration())
    .filter((m) => m.hidden)
    .sort((a, b) => (a.urlKey < b.urlKey ? -1 : a.urlKey > b.urlKey ? 1 : 0))
    .map((m) => ({ urlKey: m.urlKey, hiddenAt: m.updatedAt.toISOString() }));
}

/** Полный набор редактируемых данных — только `published`, без «Кошика» (ТЗ 8.5). */
export async function buildExport(store: Store, now: Date): Promise<ExportResult> {
  const generatedAt = now.toISOString();
  const files: Record<string, ExportFile> = {};
  const byKind = await publishedByKind(store);
  for (const [def, records] of byKind) {
    files[fileNameOf(def)] = {
      schemaVersion: SCHEMA_VERSION,
      generatedAt,
      source: 'admin-export',
      items: records.map((r) => r.data),
    };
  }
  files[MODERATION_FILE] = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    source: 'admin-export',
    items: await moderationItems(store),
  };
  const uploads = await store.listUploads();
  const media = mediaManifest(uploads, referencedFiles(byKind));
  const listed = new Set(media.map((m) => m.path));
  const pendingPaths = uploads
    .filter((u) => u.publishedAt === null && listed.has(u.path))
    .map((u) => u.path)
    .sort();
  return { body: { schemaVersion: SCHEMA_VERSION, generatedAt, files, media }, pendingPaths };
}

/**
 * Проверка перед запуском (ТЗ 8.5, п. 2): то, что сборка не примет, не уходит
 * в рабочий процесс. Те же схемы, что у `data:check`, плюс синглтон ровно один
 * и ссылка на опубликованный контакт.
 */
export async function publishProblems(
  store: Store,
  repoMedia: ReadonlySet<string>,
): Promise<PublishProblem[]> {
  const byKind = await publishedByKind(store);
  const problems: PublishProblem[] = [];
  const available = new Set(repoMedia);
  for (const u of await store.listUploads())
    if (u.deleteRequestedAt === null) available.add(u.path);
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
      if (filesOf(def.kind, r.data).some((p) => !available.has(p))) {
        problems.push({
          kind: def.kind,
          label: def.label,
          id: r.id,
          title,
          message: 'Файл не знайдено. Відкрийте запис і завантажте файл ще раз',
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
    // Файлы — после итога прогона, один раз: второй опрос сюда не попадёт.
    if (success && run.snapshotAt) {
      await ctx.store.settleUploads(run.snapshotAt, run.uploadPaths ?? []);
    }
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

  const problems = await publishProblems(ctx.store, ctx.repoMedia);
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
    uploadPaths: early?.uploadPaths ?? [],
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
  uploadPaths: string[],
): Promise<void> {
  const meta = await store.getContentMeta();
  const snapshot = { snapshotAt: now, purgedAtSnapshot: meta.purgedPending, uploadPaths };
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
