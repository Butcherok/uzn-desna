/**
 * Начальные данные (ТЗ 8.3, п. 10; решение 038): при первом запуске с пустой
 * БД записи версии 1 из `data/*.json` переносятся в БД один раз. Файлы
 * передаются параметром — слой domain не читает диск.
 */
import { z } from 'zod';
import { KINDS, SINGLETON_KEY } from './content-kinds.js';
import { DuplicateKeyError, type ContentKind, type ContentStatus, type Store } from './model.js';

/** Содержимое файлов `data/*.json` по сущностям, как есть. */
export type InitialData = Partial<Record<ContentKind, unknown>>;

export type SeedOutcome =
  { status: 'seeded'; counts: Record<string, number> } | { status: 'skipped-already-seeded' };

const fileItems = z.object({ items: z.array(z.unknown()) });

export async function seedContent(
  store: Store,
  files: InitialData,
  now: Date,
): Promise<SeedOutcome> {
  if ((await store.getContentMeta()).seededAt) return { status: 'skipped-already-seeded' };

  const counts: Record<string, number> = {};
  for (const def of KINDS) {
    const raw = files[def.kind];
    if (raw === undefined) continue;
    const { items } = fileItems.parse(raw);
    // Неверный файл — исключение: сборка сайта такой файл тоже не приняла бы (ТЗ 6.6, п. 3).
    const data = items.map((item) => def.schema.parse(item));
    let inserted = 0;
    for (const item of data) {
      const status: ContentStatus =
        def.statusInData && item['status'] === 'draft' ? 'draft' : 'published';
      try {
        await store.insertContent({
          kind: def.kind,
          key: def.key === 'singleton' ? SINGLETON_KEY : String(item[def.key]),
          data: item,
          status,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          firstPublishedAt: status === 'published' ? now : null,
        });
        inserted += 1;
      } catch (err) {
        // Прошлый запуск оборвался посреди загрузки: уже вставленное не дублируется.
        if (!(err instanceof DuplicateKeyError)) throw err;
      }
    }
    counts[def.kind] = inserted;
  }

  if (!(await store.markContentSeeded(now))) return { status: 'skipped-already-seeded' };
  await store.appendLog({
    at: now,
    userId: null,
    action: 'content.seed',
    entity: null,
    entityId: null,
    result: 'ok',
    details: counts,
  });
  return { status: 'seeded', counts };
}

/**
 * Пути `media/…` в начальных данных: эти файлы лежат в `main`, а не среди
 * загруженных, и проверка перед публикацией их принимает (решение 042).
 */
export function mediaPathsIn(data: InitialData): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      if (v.startsWith('media/')) out.add(v);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v !== null && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(data);
  return out;
}
