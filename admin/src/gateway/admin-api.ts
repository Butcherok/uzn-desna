/**
 * Эндпоинты API, которыми пользуется админка (ТЗ 8.2, 8.3, 8.5).
 */
import type { Kind, RecordView, User } from '../domain/kinds';
import type { PublishRunView, PublishStatus } from '../domain/publish';
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
  reorder: (kind: Kind, ids: string[], o: Slow = {}) =>
    data(request<ListResult>(`/${kind}/order`, { ...o, method: 'PATCH', body: { ids } })),
};
