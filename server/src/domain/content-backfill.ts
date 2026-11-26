/**
 * Дозаполнение новых полей из начальных данных (решение 053). Начальные
 * данные грузятся только в пустую БД (решение 038), поэтому поле, которое
 * появилось в схеме позже, в рабочей БД пусто. Дозаполнение переносит его из
 * `data/*.json` один раз:
 *
 * - только поля, которых в записи нет, — введённое в админке не трогается;
 * - отметка `id` в служебной записи: если Заказчик потом очистит поле, оно не
 *   вернётся при следующем запуске;
 * - запись получает `updatedAt` = сейчас, то есть становится неопубликованной
 *   правкой: на сайт поля уходят обычной публикацией из админки;
 * - в журнал — `content.backfill` с перечнем полей.
 */
import { SINGLETON_KEY, kindDef } from './content-kinds.js';
import type { InitialData } from './content-seed.js';
import type { ContentKind, Store } from './model.js';

export interface Backfill {
  /** Неизменяемый ключ отметки. */
  id: string;
  kind: ContentKind;
  fields: readonly string[];
}

export const BACKFILLS: readonly Backfill[] = [
  { id: '2026-11-enterprise-figures', kind: 'enterprise', fields: ['staffCount', 'areas'] },
];

export type BackfillOutcome = Record<string, string[]>;

export async function backfillContent(
  store: Store,
  files: InitialData,
  now: Date,
  backfills: readonly Backfill[] = BACKFILLS,
): Promise<BackfillOutcome> {
  const applied = new Set(await store.listBackfills());
  const out: BackfillOutcome = {};
  for (const bf of backfills) {
    if (applied.has(bf.id)) continue;
    const def = kindDef(bf.kind);
    if (def.key !== 'singleton') throw new Error(`backfill ${bf.id}: only singletons supported`);
    const source = (files[bf.kind] as { items?: Record<string, unknown>[] } | undefined)
      ?.items?.[0];
    const record = (await store.listContent(bf.kind)).find(
      (r) => r.key === SINGLETON_KEY && r.deletedAt === null,
    );
    if (!source || !record) continue; // нечего переносить или некуда — попробуем при следующем запуске
    const filled = bf.fields.filter((f) => !(f in record.data) && source[f] !== undefined);
    if (filled.length > 0) {
      const data = { ...record.data };
      for (const f of filled) data[f] = source[f];
      def.schema.parse(data); // неверные начальные данные — исключение, как у загрузки (ТЗ 6.6, п. 3)
      const ok = await store.replaceContent({ ...record, data, updatedAt: now }, record.updatedAt);
      // Запись только что изменили в админке — дозаполним при следующем запуске.
      if (!ok) continue;
      await store.appendLog({
        at: now,
        userId: null,
        action: 'content.backfill',
        entity: bf.kind,
        entityId: record.id,
        result: 'ok',
        details: { fields: filled.join(', ') },
      });
      out[bf.id] = filled;
    }
    await store.markBackfillApplied(bf.id);
  }
  return out;
}
