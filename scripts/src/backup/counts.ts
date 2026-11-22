/**
 * Проверка резервной копии (ТЗ 9.6, п. 8; решение 045): число документов по
 * коллекциям, которое записал `mongodump`, сверяется с числом в БД, поднятой
 * из копии. Чистые функции; ввод-вывод — `scripts/bin/backup-verify.ts`.
 */

const DONE_RE = /done dumping [^.\s]+\.(\S+) \((\d+) documents?\)/gu;

/** Коллекция → число документов из журнала `mongodump`. */
export function dumpCounts(log: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of log.matchAll(DONE_RE)) {
    const [, collection, n] = m;
    if (collection !== undefined && n !== undefined) out[collection] = Number(n);
  }
  return out;
}

export interface CountRow {
  collection: string;
  dumped: number | null;
  restored: number | null;
}

export interface CountCheck {
  ok: boolean;
  rows: CountRow[];
  total: number;
}

/**
 * Совпадение по каждой коллекции из обоих наборов. Пустой журнал дампа — не
 * «всё сошлось», а ошибка: значит, дамп не сделан или формат журнала сменился.
 */
export function compareCounts(
  dumped: Record<string, number>,
  restored: Record<string, number>,
): CountCheck {
  const names = [...new Set([...Object.keys(dumped), ...Object.keys(restored)])].sort();
  const rows = names.map((collection) => ({
    collection,
    dumped: dumped[collection] ?? null,
    restored: restored[collection] ?? null,
  }));
  const ok = Object.keys(dumped).length > 0 && rows.every((r) => r.dumped === r.restored);
  return { ok, rows, total: rows.reduce((s, r) => s + (r.dumped ?? 0), 0) };
}

/** Отчёт прогона: таблица Markdown, без данных — только имена коллекций и числа. */
export function summary(check: CountCheck, file: string, bytes: number): string {
  const lines = [
    `### Резервна копія: ${check.ok ? 'перевірена' : 'НЕ ЗБІГАЄТЬСЯ'}`,
    '',
    `Файл \`${file}\`, ${Math.max(1, Math.round(bytes / 1024))} КБ, зашифровано \`age\`.`,
    'Копію розшифровано одноразовим ключем прогону, піднято в чистій MongoDB і звірено:',
    '',
    '| Колекція | У копії | Після відновлення |',
    '|---|---:|---:|',
    ...check.rows.map(
      (r) =>
        `| \`${r.collection}\` | ${r.dumped ?? '—'} | ${r.restored ?? '—'}${r.dumped === r.restored ? '' : ' ⚠'} |`,
    ),
    '',
    `Усього документів: ${check.total}.`,
  ];
  return `${lines.join('\n')}\n`;
}
