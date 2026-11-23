/**
 * Правила контента ТЗ 8.3 и права 9.1 (решение 038). Слой не знает про HTTP:
 * получает хранилище, время и пользователя, отдаёт записи или бросает `ApiError`.
 */
import type { z } from 'zod';
import { SINGLETON_KEY, kindDef, type KindDef } from './content-kinds.js';
import { ApiError } from './errors.js';
import {
  DuplicateKeyError,
  type ActionLogEntry,
  type ContentRecord,
  type ContentStatus,
  type Store,
  type User,
} from './model.js';
import { slugify, uniqueSlug } from '@uzn/shared';

export interface ContentCtx {
  store: Store;
  now: Date;
  actor: User;
}

export interface WriteOptions {
  /** Значение заголовка `If-Match`: `updatedAt` записи, которую видел клиент (ТЗ 8.3, п. 7). */
  ifMatch?: string | undefined;
  /** Подтверждение смены опубликованного `slug` (ТЗ 8.3, п. 3). */
  confirmSlugChange?: boolean;
}

export interface RecordView {
  id: string;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  firstPublishedAt: string | null;
  data: Record<string, unknown>;
}

export function recordView(r: ContentRecord): RecordView {
  return {
    id: r.id,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt?.toISOString() ?? null,
    firstPublishedAt: r.firstPublishedAt?.toISOString() ?? null,
    data: r.data,
  };
}

/**
 * ТЗ 8.3, п. 8: изменённые после публикации записи, неопубликованные
 * окончательные удаления и решения модерации ленты (ТЗ 8.5; решение 043).
 */
export async function pendingChanges(store: Store): Promise<number> {
  const meta = await store.getContentMeta();
  const [content, moderation] = await Promise.all([
    store.countContentChangedSince(meta.lastPublishedAt),
    store.countModerationChangedSince(meta.lastPublishedAt),
  ]);
  return content + moderation + meta.purgedPending;
}

// ---------------------------------------------------------------- чтение

/** Списки: без «Кошика» или только «Кошик» (`trashed`). Порядок — ТЗ 6.1, п. 6. */
export async function listRecords(
  store: Store,
  def: KindDef,
  trashed: boolean,
): Promise<ContentRecord[]> {
  const all = await store.listContent(def.kind);
  return all
    .filter((r) => (r.deletedAt !== null) === trashed)
    .sort((a, b) => {
      if (def.ordered) {
        const d = orderOf(a) - orderOf(b);
        if (d !== 0) return d;
      } else if (a.key !== b.key) {
        return a.key < b.key ? -1 : 1;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
}

export async function getRecord(store: Store, def: KindDef, id: string): Promise<ContentRecord> {
  const r = await store.findContent(def.kind, id);
  if (!r) throw new ApiError('NOT_FOUND', 'Запис не знайдено');
  return r;
}

export async function getSingleton(store: Store, def: KindDef): Promise<ContentRecord> {
  const r = await findSingleton(store, def);
  if (!r) throw new ApiError('NOT_FOUND', 'Дані ще не заповнені');
  return r;
}

// ---------------------------------------------------------------- запись

export async function createRecord(
  ctx: ContentCtx,
  def: KindDef,
  body: unknown,
): Promise<ContentRecord> {
  const input = stripServerFields(def, asObject(body));
  if (def.ownerOnly && ctx.actor.role !== 'owner') {
    await deny(ctx, 'content.create', def, null, 'owner-only-kind');
  }
  if (input['slug'] !== undefined && ctx.actor.role !== 'owner') {
    await deny(ctx, 'content.create', def, null, 'slug', SLUG_OWNER_ONLY);
  }
  if (ctx.actor.role !== 'owner' && def.ownerOnlyFields.some((f) => input[f] !== undefined)) {
    await deny(ctx, 'content.create', def, null, 'owner-only-field', CONFIRM_OWNER_ONLY);
  }

  const existing = await ctx.store.listContent(def.kind);
  const draft: Record<string, unknown> = { ...input };
  const slugIsAuto = def.key === 'slug' && draft['slug'] === undefined;
  if (slugIsAuto) {
    const title = ukText(draft[def.titleField ?? '']);
    if (title !== undefined) {
      draft['slug'] = uniqueSlug(slugify(title), new Set(existing.map((r) => r.key)));
    }
  }
  if (def.ordered && draft['order'] === undefined) {
    const active = existing.filter((r) => r.deletedAt === null);
    draft['order'] = active.reduce((m, r) => Math.max(m, orderOf(r)), 0) + 1;
  }
  if (def.statusInData) draft['status'] = 'draft';

  const data = validate(def, draft, slugIsAuto ? ['slug'] : []);
  await checkContactRef(ctx.store, def, data);

  let created: ContentRecord;
  try {
    created = await ctx.store.insertContent({
      kind: def.kind,
      key: keyOf(def, data),
      data,
      status: 'draft',
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
      firstPublishedAt: null,
    });
  } catch (err) {
    throw duplicateKey(def, err);
  }
  await log(ctx, 'content.create', def, created.id, { fields: Object.keys(data).join(',') }, data);
  return created;
}

/**
 * Частичная правка: присланные поля накладываются на текущие, `null`
 * убирает поле (RFC 7386, JSON Merge Patch), и проверяется вся запись
 * (ТЗ 8.3, п. 1). У синглтона без записи правка её создаёт.
 */
export async function patchRecord(
  ctx: ContentCtx,
  def: KindDef,
  id: string | null,
  body: unknown,
  opts: WriteOptions = {},
): Promise<ContentRecord> {
  const input = stripServerFields(def, asObject(body));
  const current =
    id === null ? await findSingleton(ctx.store, def) : await getRecord(ctx.store, def, id);
  const entityId = current?.id ?? null;
  if (def.ownerOnly && ctx.actor.role !== 'owner') {
    await deny(ctx, 'content.update', def, entityId, 'owner-only-kind');
  }

  if (!current) return createSingleton(ctx, def, input);
  assertActive(current);
  assertIfMatch(current, opts.ifMatch);

  const merged: Record<string, unknown> = { ...current.data };
  for (const [k, v] of Object.entries(input)) {
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  // Сравнивается результат схемы: она приводит порядок ключей и отбрасывает лишнее.
  const data = validate(def, merged);
  const changed = changedFields(current.data, data);
  if (changed.length === 0) return current;

  if (ctx.actor.role !== 'owner') {
    if (changed.includes('slug')) {
      await deny(ctx, 'content.update', def, current.id, 'slug', SLUG_OWNER_ONLY, current.data);
    }
    if (def.ownerOnlyFields.some((f) => changed.includes(f))) {
      await deny(
        ctx,
        'content.update',
        def,
        current.id,
        'owner-only-field',
        CONFIRM_OWNER_ONLY,
        current.data,
      );
    }
  }
  if (def.key === 'blockKey' && changed.includes('blockKey')) {
    throw new ApiError('VALIDATION_FAILED', undefined, {
      fields: { blockKey: 'Ключ блоку не змінюється' },
    });
  }

  const slugChanged = def.key === 'slug' && changed.includes('slug');
  if (slugChanged) {
    if (current.firstPublishedAt && !opts.confirmSlugChange) {
      throw new ApiError(
        'CONFLICT',
        'Адреса сторінки вже опублікована. Підтвердіть її зміну: старі посилання перестануть працювати',
        { fields: { slug: 'Потрібне підтвердження' } },
      );
    }
    if (def.kind === 'contacts') await assertContactUnused(ctx.store, current.key);
  }
  await checkContactRef(ctx.store, def, data);

  const next: ContentRecord = { ...current, key: keyOf(def, data), data, updatedAt: ctx.now };
  await replaceOrConflict(ctx.store, def, next, current.updatedAt);
  await log(
    ctx,
    'content.update',
    def,
    current.id,
    {
      fields: changed.join(','),
      ...(slugChanged ? { slugFrom: current.key, slugTo: next.key } : {}),
    },
    data,
  );
  return next;
}

/** ТЗ 8.3, п. 5: публикация и снятие с публикации. */
export async function setStatus(
  ctx: ContentCtx,
  def: KindDef,
  id: string,
  status: ContentStatus,
  opts: WriteOptions = {},
): Promise<ContentRecord> {
  const current = await getRecord(ctx.store, def, id);
  assertActive(current);
  assertIfMatch(current, opts.ifMatch);
  if (current.status === status) return current;

  let data = current.data;
  if (def.statusInData) {
    data = { ...data, status };
    if (status === 'published' && data['publishedAt'] === undefined) {
      data['publishedAt'] = ctx.now.toISOString();
    }
  }
  if (status === 'published') {
    data = validate(def, data);
    await checkContactRef(ctx.store, def, data);
  }
  const next: ContentRecord = {
    ...current,
    data,
    status,
    firstPublishedAt:
      current.firstPublishedAt ?? (status === 'published' ? ctx.now : current.firstPublishedAt),
    updatedAt: ctx.now,
  };
  await replaceOrConflict(ctx.store, def, next, current.updatedAt);
  await log(ctx, 'content.status', def, id, { status }, next.data);
  return next;
}

/** Мягкое удаление (ТЗ 6.1, п. 7). Повтор ничего не меняет. */
export async function softDelete(
  ctx: ContentCtx,
  def: KindDef,
  id: string,
  opts: WriteOptions = {},
): Promise<ContentRecord> {
  const current = await getRecord(ctx.store, def, id);
  if (current.deletedAt) return current;
  assertIfMatch(current, opts.ifMatch);
  if (def.kind === 'contacts') await assertContactUnused(ctx.store, current.key);
  const next: ContentRecord = { ...current, deletedAt: ctx.now, updatedAt: ctx.now };
  await replaceOrConflict(ctx.store, def, next, current.updatedAt);
  await log(ctx, 'content.delete', def, id, {}, current.data);
  return next;
}

/** Возврат из «Кошика». Повтор ничего не меняет. */
export async function restore(
  ctx: ContentCtx,
  def: KindDef,
  id: string,
  opts: WriteOptions = {},
): Promise<ContentRecord> {
  const current = await getRecord(ctx.store, def, id);
  if (!current.deletedAt) return current;
  assertIfMatch(current, opts.ifMatch);
  await checkContactRef(ctx.store, def, current.data, 'restore');
  const next: ContentRecord = { ...current, deletedAt: null, updatedAt: ctx.now };
  await replaceOrConflict(ctx.store, def, next, current.updatedAt);
  await log(ctx, 'content.restore', def, id, {}, current.data);
  return next;
}

/** Окончательное удаление: только владелец и только из «Кошика» (ТЗ 9.1, 8.3). */
export async function purge(ctx: ContentCtx, def: KindDef, id: string): Promise<void> {
  const current = await getRecord(ctx.store, def, id);
  if (ctx.actor.role !== 'owner') {
    await deny(ctx, 'content.purge', def, id, 'owner-only', 'Остаточно видаляє лише власник');
  }
  if (!current.deletedAt) {
    throw new ApiError('CONFLICT', 'Спочатку перемістіть запис у кошик');
  }
  // Удаление ещё не на сайте, если запись попала в «Кошик» после публикации.
  const meta = await ctx.store.getContentMeta();
  const unpublished =
    meta.lastPublishedAt === null || current.updatedAt.getTime() > meta.lastPublishedAt.getTime();
  if (!(await ctx.store.deleteContent(def.kind, id))) {
    throw new ApiError('NOT_FOUND', 'Запис не знайдено');
  }
  if (unpublished) await ctx.store.incrementPurgedPending();
  await log(ctx, 'content.purge', def, id, { key: current.key }, current.data);
}

/** Новый порядок целиком: каждая запись вне «Кошика» ровно один раз, `order` с 1. */
export async function reorder(
  ctx: ContentCtx,
  def: KindDef,
  ids: readonly string[],
): Promise<ContentRecord[]> {
  const active = await listRecords(ctx.store, def, false);
  const byId = new Map(active.map((r) => [r.id, r]));
  const unique = new Set(ids);
  if (unique.size !== ids.length || ids.length !== active.length || ids.some((i) => !byId.has(i))) {
    throw new ApiError('VALIDATION_FAILED', 'Порядок не збігається з поточним переліком', {
      fields: { ids: 'Перелік має містити кожен запис рівно один раз. Оновіть сторінку' },
    });
  }
  const entries = ids
    .map((id, i) => ({ id, order: i + 1 }))
    .filter(({ id, order }) => orderOf(byId.get(id)) !== order);
  if (entries.length > 0) {
    await ctx.store.updateContentOrder(def.kind, entries, ctx.now);
    await log(ctx, 'content.order', def, null, { moved: entries.length });
  }
  return listRecords(ctx.store, def, false);
}

// ---------------------------------------------------------------- проверки

const SLUG_OWNER_ONLY = 'Адресу сторінки змінює лише власник';
const CONFIRM_OWNER_ONLY = 'Позначку підтвердження картки ставить лише власник';

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ApiError('VALIDATION_FAILED', 'Не вдалося прочитати дані запиту', {
      status: 400,
    });
  }
  return body as Record<string, unknown>;
}

/** Поля данных, которые пишет сервер: у `Vacancy` — статус и дата публикации. */
function stripServerFields(def: KindDef, input: Record<string, unknown>): Record<string, unknown> {
  if (!def.statusInData) return input;
  const rest = { ...input };
  delete rest['status'];
  delete rest['publishedAt'];
  return rest;
}

/**
 * Полная схема из `shared/`: непрошедшее — 422 с полями и текстом по-украински
 * (ТЗ 8.1, п. 3). Тексты схем `shared/` — для разработчика, в форму не идут.
 */
function validate(
  def: KindDef,
  data: Record<string, unknown>,
  hideFields: readonly string[] = [],
): Record<string, unknown> {
  const r = def.schema.safeParse(data);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    if (hideFields.includes(key)) continue;
    fields[key] ??= fieldMessage(issue, valueAt(data, issue.path));
  }
  throw new ApiError('VALIDATION_FAILED', undefined, { fields });
}

function fieldMessage(issue: z.core.$ZodIssue, value: unknown): string {
  // Проверка ссылок разметки (решение 047): текст уже для формы.
  if (issue.code === 'custom' && issue.params?.['ui'] === true) return issue.message;
  switch (issue.code) {
    case 'invalid_type':
      return value === undefined ? "Обов'язкове поле" : 'Невірне значення';
    case 'too_big':
      return issue.origin === 'string'
        ? `Не більше ${String(issue.maximum)} знаків`
        : issue.origin === 'array'
          ? `Не більше ${String(issue.maximum)} пунктів`
          : 'Завелике значення';
    case 'too_small':
      return issue.origin === 'string' && Number(issue.minimum) <= 1
        ? "Обов'язкове поле"
        : 'Замале значення';
    case 'invalid_format':
      return 'Невірний формат';
    case 'invalid_value':
      return 'Виберіть значення зі списку';
    default:
      return 'Невірне значення';
  }
}

function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let v: unknown = data;
  for (const p of path) {
    if (typeof v !== 'object' || v === null) return undefined;
    v = (v as Record<PropertyKey, unknown>)[p];
  }
  return v;
}

async function checkContactRef(
  store: Store,
  def: KindDef,
  data: Record<string, unknown>,
  mode: 'write' | 'restore' = 'write',
): Promise<void> {
  if (!def.refersToContact) return;
  const contactId = data['contactId'];
  if (typeof contactId !== 'string') return;
  const contacts = await store.listContent('contacts');
  if (contacts.some((c) => c.key === contactId && c.deletedAt === null)) return;
  if (mode === 'restore') {
    throw new ApiError(
      'CONFLICT',
      `Контакт «${contactId}» видалено або перейменовано. Спочатку відновіть контакт`,
    );
  }
  throw new ApiError('VALIDATION_FAILED', undefined, {
    fields: { contactId: 'Такого контакту немає' },
  });
}

/** Контакт, на который ссылаются, не удаляется и не меняет `slug` (ТЗ 8.3, п. 4). */
async function assertContactUnused(store: Store, slug: string): Promise<void> {
  const usage: string[] = [];
  for (const kind of ['services', 'vacancies'] as const) {
    const n = (await store.listContent(kind)).filter(
      (r) => r.deletedAt === null && r.data['contactId'] === slug,
    ).length;
    if (n > 0) usage.push(`${kindDef(kind).label} — ${String(n)}`);
  }
  if (usage.length > 0) {
    throw new ApiError(
      'CONFLICT',
      `Контакт використовується: ${usage.join(', ')}. Спочатку змініть ці записи`,
    );
  }
}

function assertActive(r: ContentRecord): void {
  if (r.deletedAt) throw new ApiError('CONFLICT', 'Запис у кошику. Спочатку відновіть його');
}

function assertIfMatch(r: ContentRecord, ifMatch: string | undefined): void {
  if (ifMatch === undefined) return;
  const seen = ifMatch.replace(/^W\//u, '').replace(/^"|"$/gu, '');
  if (seen !== r.updatedAt.toISOString()) throw new ApiError('CONFLICT');
}

async function replaceOrConflict(
  store: Store,
  def: KindDef,
  next: ContentRecord,
  expected: Date,
): Promise<void> {
  let ok: boolean;
  try {
    ok = await store.replaceContent(next, expected);
  } catch (err) {
    throw duplicateKey(def, err);
  }
  if (!ok) throw new ApiError('CONFLICT');
}

function duplicateKey(def: KindDef, err: unknown): unknown {
  if (!(err instanceof DuplicateKeyError)) return err;
  return def.key === 'blockKey'
    ? new ApiError('CONFLICT', 'Такий блок уже є', { fields: { blockKey: 'Вже існує' } })
    : new ApiError('CONFLICT', 'Запис з такою адресою сторінки вже є', {
        fields: { slug: 'Вже існує' },
      });
}

async function createSingleton(
  ctx: ContentCtx,
  def: KindDef,
  input: Record<string, unknown>,
): Promise<ContentRecord> {
  const data = validate(def, input);
  let created: ContentRecord;
  try {
    created = await ctx.store.insertContent({
      kind: def.kind,
      key: SINGLETON_KEY,
      data,
      status: 'published',
      createdAt: ctx.now,
      updatedAt: ctx.now,
      deletedAt: null,
      firstPublishedAt: null,
    });
  } catch (err) {
    if (err instanceof DuplicateKeyError) throw new ApiError('CONFLICT');
    throw err;
  }
  await log(ctx, 'content.create', def, created.id, { fields: Object.keys(data).join(',') }, data);
  return created;
}

async function findSingleton(store: Store, def: KindDef): Promise<ContentRecord | null> {
  return (await store.listContent(def.kind)).find((r) => r.key === SINGLETON_KEY) ?? null;
}

function keyOf(def: KindDef, data: Record<string, unknown>): string {
  if (def.key === 'singleton') return SINGLETON_KEY;
  return String(data[def.key]);
}

function orderOf(r: ContentRecord | undefined): number {
  const o = r?.data['order'];
  return typeof o === 'number' ? o : Number.MAX_SAFE_INTEGER;
}

export function ukText(v: unknown): string | undefined {
  if (typeof v !== 'object' || v === null) return undefined;
  const uk = (v as { uk?: unknown }).uk;
  return typeof uk === 'string' && uk.trim() !== '' ? uk : undefined;
}

function changedFields(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
}

// ---------------------------------------------------------------- журнал

async function log(
  ctx: ContentCtx,
  action: string,
  def: KindDef,
  entityId: string | null,
  details: ActionLogEntry['details'],
  data?: Record<string, unknown>,
): Promise<void> {
  // Название записи — чтобы журнал читался без открытия записи (ТЗ 9.7, п. 2).
  const title = data && def.titleField ? (ukText(data[def.titleField]) ?? null) : null;
  await ctx.store.appendLog({
    at: ctx.now,
    userId: ctx.actor.id,
    action,
    entity: def.kind,
    entityId,
    result: 'ok',
    details: title === null ? details : { ...details, title: title.slice(0, 120) },
  });
}

/** Отказ по правам: запись в журнал (ТЗ 8.3, п. 9) и 403. */
async function deny(
  ctx: ContentCtx,
  action: string,
  def: KindDef,
  entityId: string | null,
  reason: string,
  message?: string,
  data?: Record<string, unknown>,
): Promise<never> {
  // Название записи — как в успешных записях журнала (ТЗ 9.7, п. 2).
  const title = data && def.titleField ? (ukText(data[def.titleField]) ?? null) : null;
  await ctx.store.appendLog({
    at: ctx.now,
    userId: ctx.actor.id,
    action,
    entity: def.kind,
    entityId,
    result: 'denied',
    details: title === null ? { reason } : { reason, title: title.slice(0, 120) },
  });
  throw new ApiError('FORBIDDEN', message);
}
