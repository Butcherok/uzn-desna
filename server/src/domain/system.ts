/**
 * Раздел «Стан системи» (ТЗ 8.6, 9.1; решение 049): сведения о сервисе и
 * состояние синхронизаций. Только чтение, только владелец.
 */
import type { SyncStateFile } from '@uzn/shared';
import { KINDS } from './content-kinds.js';
import { pendingChanges } from './content.js';
import type { Store } from './model.js';

export interface SyncRun {
  id: number;
  event: 'schedule' | 'workflow_dispatch' | 'other';
  createdAt: string;
  state: 'in_progress' | 'success' | 'failure';
  url: string;
}

export interface Loaded<T> {
  value: T | null;
  fresh: boolean;
}

export interface SyncStatusSource {
  state(): Promise<Loaded<SyncStateFile>>;
  /** `null` у `value` — прогоны не настроены или неизвестны. */
  runs(): Promise<Loaded<SyncRun[]>>;
}

export interface SystemInfo {
  version: string;
  startedAt: string;
  /** Записи по разделам без «Кошика»: всего и сколько опубликовано. */
  counts: { kind: string; total: number; published: number }[];
  lastPublishedAt: string | null;
  pendingChanges: number;
}

export async function systemInfo(
  store: Store,
  version: string,
  startedAt: Date,
): Promise<SystemInfo> {
  const lists = KINDS.filter((d) => d.key !== 'singleton');
  const counts = await Promise.all(
    lists.map(async (d) => {
      const active = (await store.listContent(d.kind)).filter((r) => r.deletedAt === null);
      return {
        kind: d.kind,
        total: active.length,
        published: active.filter((r) => r.status === 'published').length,
      };
    }),
  );
  const meta = await store.getContentMeta();
  return {
    version,
    startedAt: startedAt.toISOString(),
    counts,
    lastPublishedAt: meta.lastPublishedAt?.toISOString() ?? null,
    pendingChanges: await pendingChanges(store),
  };
}

export interface SyncStatusView {
  /** `null` — файл ни разу не прочитан: состояние неизвестно. */
  sources: SyncStateFile['items'] | null;
  sourcesFresh: boolean;
  /** `null` — прогоны не настроены (нет токена) или ни разу не прочитаны. */
  runs: SyncRun[] | null;
  runsFresh: boolean;
}

export function syncStatusView(
  state: Loaded<SyncStateFile>,
  runs: Loaded<SyncRun[]>,
): SyncStatusView {
  return {
    sources: state.value?.items ?? null,
    sourcesFresh: state.fresh,
    runs: runs.value,
    runsFresh: runs.fresh,
  };
}
