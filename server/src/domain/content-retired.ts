/**
 * Уборка сущностей, которых больше нет в модели (решение 052). Записи такой
 * сущности ни сайт, ни админка, ни выгрузка уже не видят — в БД они были бы
 * мусором и попадали бы в резервные копии. При каждом запуске удаляются все
 * её записи, включая «Кошик»; повторный запуск ничего не находит и журнал не
 * пишет. Счётчик неопубликованных правок не растёт: файла этой сущности в
 * выгрузке нет, публиковать нечего.
 */
import type { Store } from './model.js';

/** `scenarios` — «Куди звертатися», объединена с «Контактами» 26.11.2026. */
export const RETIRED_KINDS = ['scenarios'] as const;

export async function purgeRetiredContent(
  store: Store,
  now: Date,
  kinds: readonly string[] = RETIRED_KINDS,
): Promise<Record<string, number>> {
  const removed: Record<string, number> = {};
  for (const kind of kinds) {
    const n = await store.purgeRetiredKind(kind);
    if (n > 0) removed[kind] = n;
  }
  if (Object.keys(removed).length > 0) {
    await store.appendLog({
      at: now,
      userId: null,
      action: 'content.purge-retired',
      entity: null,
      entityId: null,
      result: 'ok',
      details: removed,
    });
  }
  return removed;
}
