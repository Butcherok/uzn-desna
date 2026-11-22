/**
 * Эндпоинты API, которыми пользуется админка (ТЗ 8.2, 8.3, 8.5).
 */
import type { Kind, RecordView, User } from '../domain/kinds';
import type { FeedList } from '../domain/feed';
import type { LogPage } from '../domain/log';
import type { BackupRun, BackupStatus } from '../domain/backup';
import type { PublishRunView, PublishStatus } from '../domain/publish';
import { ADMIN_CONFIG } from '../config/admin';
import { request, type ApiResponse, type RequestOptions } from './api';

export interface ListResult {
  items: RecordView[];
  total: number;
  pendingChanges: number;
}

export interface WriteResult {
  item: RecordView;
  pendingChanges: number;
}

export type { PublishStatus } from '../domain/publish';

export interface PublishStarted {
  runId: number;
  startedAt: string;
  run: PublishRunView;
}

type Slow = Pick<RequestOptions, 'onSlow'>;
type Data = Record<string, unknown>;

const data = async <T>(p: Promise<ApiResponse<T>>): Promise<T> => (await p).data;

/** Загруженный файл (ТЗ 8.4; решение 042). */
export interface UploadView {
  path: string;
  entity: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  uploadedAt: string;
  uploadedBy: string;
  /** `pending` — ще не на сайті, `published` — на сайті, `deleting` — зникне з наступною публікацією. */
  state: 'pending' | 'published' | 'deleting';
}

export interface UploadListItem extends UploadView {
  usedBy: { kind: Kind; label: string; id: string; title: string; inTrash: boolean }[];
}

/** Адрес просмотра файла в админке: тот же сервер, по сессии. */
export const uploadUrl = (path: string): string =>
  `${ADMIN_CONFIG.apiBase}/uploads/${path.split('/').map(encodeURIComponent).join('/')}`;

export const api = {
  me: (o: Slow = {}) => data(request<User>('/auth/me', o)),
  login: (login: string, password: string, o: Slow = {}) =>
    data(request<User>('/auth/login', { ...o, method: 'POST', body: { login, password } })),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string, o: Slow = {}) =>
    request<unknown>('/auth/password', {
      ...o,
      method: 'POST',
      body: { currentPassword, newPassword },
    }),

  publishStatus: (o: Slow = {}) => data(request<PublishStatus>('/publish/status', o)),
  /** Запуск не повторяется после таймаута: вторая публикация получила бы 409. */
  publish: (o: Slow = {}) =>
    data(request<PublishStarted>('/publish', { ...o, method: 'POST', idempotent: false })),

  list: (kind: Kind, trashed: boolean, o: Slow = {}) =>
    data(request<ListResult>(`/${kind}`, { ...o, query: trashed ? { trashed: '1' } : {} })),
  get: (kind: Kind, id: string | null, o: Slow = {}) =>
    request<RecordView>(id === null ? `/${kind}` : `/${kind}/${encodeURIComponent(id)}`, o),
  create: (kind: Kind, body: Data, o: Slow = {}) =>
    data(request<WriteResult>(`/${kind}`, { ...o, method: 'POST', body, idempotent: false })),
  patch: (
    kind: Kind,
    id: string | null,
    body: Data,
    opts: Slow & { etag?: string | null; confirmSlugChange?: boolean } = {},
  ) =>
    request<WriteResult>(id === null ? `/${kind}` : `/${kind}/${encodeURIComponent(id)}`, {
      ...(opts.onSlow ? { onSlow: opts.onSlow } : {}),
      method: 'PATCH',
      body,
      ...(opts.etag ? { headers: { 'If-Match': opts.etag } } : {}),
      ...(opts.confirmSlugChange ? { query: { confirmSlugChange: '1' } } : {}),
    }),
  setStatus: (kind: Kind, id: string, status: 'draft' | 'published', o: Slow = {}) =>
    data(
      request<WriteResult>(`/${kind}/${encodeURIComponent(id)}/status`, {
        ...o,
        method: 'POST',
        body: { status },
      }),
    ),
  remove: (kind: Kind, id: string, o: Slow = {}) =>
    data(request<WriteResult>(`/${kind}/${encodeURIComponent(id)}`, { ...o, method: 'DELETE' })),
  restore: (kind: Kind, id: string, o: Slow = {}) =>
    data(
      request<WriteResult>(`/${kind}/${encodeURIComponent(id)}/restore`, { ...o, method: 'POST' }),
    ),
  purge: (kind: Kind, id: string, o: Slow = {}) =>
    data(
      request<{ pendingChanges: number }>(`/${kind}/${encodeURIComponent(id)}`, {
        ...o,
        method: 'DELETE',
        query: { permanent: '1' },
      }),
    ),
  upload: (entity: string, slug: string, file: File, o: Slow = {}) => {
    const form = new FormData();
    form.append('entity', entity);
    form.append('slug', slug);
    form.append('file', file);
    // Тот же файл ещё раз даёт тот же путь: повтор после таймаута безопасен.
    return data(request<UploadView>('/uploads', { ...o, method: 'POST', form }));
  },
  uploads: (o: Slow = {}) => data(request<{ items: UploadListItem[] }>('/uploads', o)),
  removeUpload: (path: string, o: Slow = {}) =>
    data(
      request<{ outcome: 'removed' | 'deleting' }>(
        `/uploads/${path.split('/').map(encodeURIComponent).join('/')}`,
        { ...o, method: 'DELETE' },
      ),
    ),
  feed: (o: Slow = {}) => data(request<FeedList>('/feed', o)),
  /** Повтор безопасен: то же решение ещё раз ничего не меняет (решение 043). */
  setFeedHidden: (urlKey: string, hidden: boolean, o: Slow = {}) =>
    data(
      request<{ hidden: boolean; changed: boolean; pendingChanges: number }>('/feed/hidden', {
        ...o,
        method: 'POST',
        body: { urlKey, hidden },
      }),
    ),
  log: (query: Record<string, string>, o: Slow = {}) =>
    data(request<LogPage>('/log', { ...o, query })),
  backupStatus: (o: Slow = {}) => data(request<BackupStatus>('/backup', o)),
  /** Не повторяется после таймаута: второй запуск получил бы 409. */
  backup: (o: Slow = {}) =>
    data(request<BackupRun>('/backup', { ...o, method: 'POST', idempotent: false })),
  reorder: (kind: Kind, ids: string[], o: Slow = {}) =>
    data(request<ListResult>(`/${kind}/order`, { ...o, method: 'PATCH', body: { ids } })),
};
