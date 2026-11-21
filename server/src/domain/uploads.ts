/**
 * Загрузка изображений и документов (ТЗ 8.4; решение 042). Файл живёт в БД,
 * пока не опубликован: публикация забирает его выгрузкой и кладёт в ветку
 * `content-data`, после успеха прогона содержимое из БД убирается.
 * Токен GitHub прав на содержимое репозитория не получает.
 */
import { createHash } from 'node:crypto';
import {
  UPLOAD_TARGETS,
  maxBytesOf,
  tooLargeMessage,
  wrongTypeMessage,
  type UploadEntity,
} from '@uzn/shared';
import { kindDef } from './content-kinds.js';
import { ukText } from './content.js';
import { ApiError } from './errors.js';
import { BadFileError, extOf, parseFile } from './media-files.js';
import {
  DuplicateKeyError,
  type ContentKind,
  type ContentRecord,
  type Store,
  type UploadMeta,
  type User,
} from './model.js';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SLUG_MAX = 80;

export interface UploadInput {
  entity: string;
  slug: string;
  alt: string | null;
  bytes: Buffer;
  /** Поток оборвался на пределе разбора: файл заведомо больше допустимого. */
  truncated: boolean;
}

export type UploadState = 'pending' | 'published' | 'deleting';

export interface UploadUse {
  kind: ContentKind;
  label: string;
  id: string;
  title: string;
  inTrash: boolean;
}

export interface UploadView {
  path: string;
  entity: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  uploadedAt: string;
  uploadedBy: string;
  state: UploadState;
}

export interface UploadListItem extends UploadView {
  usedBy: UploadUse[];
}

const isEntity = (e: string): e is UploadEntity => Object.hasOwn(UPLOAD_TARGETS, e);

export const stateOf = (u: UploadMeta): UploadState =>
  u.deleteRequestedAt !== null ? 'deleting' : u.publishedAt !== null ? 'published' : 'pending';

export function uploadView(u: UploadMeta): UploadView {
  return {
    path: u.path,
    entity: u.entity,
    mime: u.mime,
    bytes: u.bytes,
    width: u.width,
    height: u.height,
    uploadedAt: u.uploadedAt.toISOString(),
    uploadedBy: u.uploadedBy,
    state: stateOf(u),
  };
}

/** `POST /uploads`: проверка, очистка метаданных, имя от сервера, запись. */
export async function acceptUpload(
  store: Store,
  actor: User,
  input: UploadInput,
  now: Date,
): Promise<UploadView> {
  const fields: Record<string, string> = {};
  if (!isEntity(input.entity)) fields['entity'] = 'Для цього розділу файли не завантажуються';
  if (input.slug.length > SLUG_MAX || !SLUG_RE.test(input.slug)) {
    fields['slug'] = 'Спочатку заповніть назву, потім додайте файл';
  }
  if (!isEntity(input.entity) || fields['slug']) {
    throw new ApiError('VALIDATION_FAILED', undefined, { fields });
  }
  const entity = input.entity;
  const cls = UPLOAD_TARGETS[entity].accept;

  if (input.truncated || input.bytes.length > maxBytesOf(cls)) {
    throw new ApiError('FILE_TOO_LARGE', tooLargeMessage(cls));
  }
  if (input.bytes.length === 0) {
    throw new ApiError('UNSUPPORTED_FILE_TYPE', wrongTypeMessage(cls));
  }

  let parsed;
  try {
    parsed = parseFile(input.bytes);
  } catch (err) {
    if (err instanceof BadFileError) {
      throw new ApiError('UNSUPPORTED_FILE_TYPE', wrongTypeMessage(cls));
    }
    throw err;
  }
  if ((parsed.width === null ? 'document' : 'image') !== cls) {
    throw new ApiError('UNSUPPORTED_FILE_TYPE', wrongTypeMessage(cls));
  }

  const sha256 = createHash('sha256').update(parsed.bytes).digest('hex');
  const path = `media/${entity}/${input.slug}-${sha256.slice(0, 8)}.${extOf(parsed.mime)}`;

  const existing = await store.findUpload(path);
  if (existing) {
    // Тот же файл ещё раз: отметка удаления снимается, второй копии нет.
    if (existing.deleteRequestedAt !== null) await store.setUploadDeleteRequested(path, null);
    return uploadView({ ...existing, deleteRequestedAt: null });
  }

  const record = {
    path,
    entity,
    slug: input.slug,
    mime: parsed.mime,
    bytes: parsed.bytes.length,
    width: parsed.width,
    height: parsed.height,
    sha256,
    alt: input.alt,
    uploadedAt: now,
    uploadedBy: actor.displayName,
    publishedAt: null,
    deleteRequestedAt: null,
    data: parsed.bytes,
  };
  try {
    await store.insertUpload(record);
  } catch (err) {
    if (!(err instanceof DuplicateKeyError)) throw err;
    const raced = await store.findUpload(path);
    if (raced) return uploadView(raced);
    throw err;
  }
  await store.appendLog({
    at: now,
    userId: actor.id,
    action: 'upload.create',
    entity,
    entityId: path,
    result: 'ok',
    details: { bytes: record.bytes, mime: record.mime },
  });
  return uploadView(record);
}

/** Пути файлов, на которые ссылается запись (ТЗ 6.1, п. 9). */
export function filesOf(kind: ContentKind, data: Record<string, unknown>): string[] {
  const target = (UPLOAD_TARGETS as Record<string, { field: string } | undefined>)[kind];
  if (!target) return [];
  const v = data[target.field];
  return typeof v === 'string' ? [v] : [];
}

/** Кто использует файлы: все записи, включая черновики и «Кошик». */
export async function fileUses(store: Store): Promise<Map<string, UploadUse[]>> {
  const out = new Map<string, UploadUse[]>();
  for (const kind of Object.keys(UPLOAD_TARGETS) as ContentKind[]) {
    const def = kindDef(kind);
    for (const r of await store.listContent(kind)) {
      for (const path of filesOf(kind, r.data)) {
        const uses = out.get(path) ?? [];
        uses.push({
          kind,
          label: def.label,
          id: r.id,
          title: titleOf(r, def.titleField),
          inTrash: r.deletedAt !== null,
        });
        out.set(path, uses);
      }
    }
  }
  return out;
}

const titleOf = (r: ContentRecord, field: string | undefined): string =>
  (field ? ukText(r.data[field]) : undefined) ?? r.key;

/** `GET /uploads`: от новых к старым, с тем, где файл используется. */
export async function listUploadsWithUses(store: Store): Promise<UploadListItem[]> {
  const uses = await fileUses(store);
  const all = await store.listUploads();
  return all
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
    .map((u) => ({ ...uploadView(u), usedBy: uses.get(u.path) ?? [] }));
}

/**
 * `DELETE /uploads/{path}` — только владелец (ТЗ 9.1). Используемый файл —
 * 409. Неопубликованный удаляется сразу; опубликованный уходит из ветки
 * `content-data` со следующей публикацией.
 */
export async function removeUpload(
  store: Store,
  actor: User,
  path: string,
  now: Date,
): Promise<UploadState | 'removed'> {
  const u = await store.findUpload(path);
  if (!u) throw new ApiError('NOT_FOUND', 'Файл не знайдено');
  const uses = (await fileUses(store)).get(path) ?? [];
  if (uses.length > 0) {
    const where = uses.map((x) => `«${x.title}» (${x.label}${x.inTrash ? ', у кошику' : ''})`);
    throw new ApiError(
      'CONFLICT',
      `Файл використовується: ${where.join(', ')}. Спочатку приберіть його із запису`,
    );
  }
  let outcome: UploadState | 'removed';
  if (u.publishedAt === null) {
    await store.deleteUpload(path);
    outcome = 'removed';
  } else {
    await store.setUploadDeleteRequested(path, now);
    outcome = 'deleting';
  }
  await store.appendLog({
    at: now,
    userId: actor.id,
    action: 'upload.delete',
    entity: u.entity,
    entityId: path,
    result: 'ok',
    details: { outcome },
  });
  return outcome;
}

export interface MediaManifestEntry {
  path: string;
  sha256: string;
  bytes: number;
}

/**
 * Файлы для выгрузки: уже опубликованные (кроме удалённых владельцем) и
 * неопубликованные, на которые ссылается опубликованная запись. Файл, который
 * никто не использует, на сайт и в публичный репозиторий не уходит.
 */
export function mediaManifest(
  uploads: readonly UploadMeta[],
  referenced: ReadonlySet<string>,
): MediaManifestEntry[] {
  return uploads
    .filter(
      (u) => u.deleteRequestedAt === null && (u.publishedAt !== null || referenced.has(u.path)),
    )
    .map((u) => ({ path: u.path, sha256: u.sha256, bytes: u.bytes }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
