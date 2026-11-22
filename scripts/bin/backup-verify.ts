/**
 * Сверка резервной копии в рабочем процессе `backup` (ТЗ 9.6, п. 8; решение
 * 045). Аргументы: журнал `mongodump`, JSON с числом документов по коллекциям
 * восстановленной БД, имя и размер зашифрованного файла. Пишет отчёт в
 * `GITHUB_STEP_SUMMARY`; расхождение — код выхода 1.
 */
import { appendFile, readFile } from 'node:fs/promises';
import { compareCounts, dumpCounts, summary } from '../src/backup/counts.js';

const [logPath, restoredPath, file, bytes] = process.argv.slice(2);
if (!logPath || !restoredPath || !file || !bytes) {
  console.error('usage: backup-verify <dump.log> <restored.json> <file> <bytes>');
  process.exit(2);
}

const dumped = dumpCounts(await readFile(logPath, 'utf8'));
const restored = JSON.parse(await readFile(restoredPath, 'utf8')) as Record<string, number>;
const check = compareCounts(dumped, restored);
const text = summary(check, file, Number(bytes));
console.log(text);
const out = process.env['GITHUB_STEP_SUMMARY'];
if (out) await appendFile(out, text);
if (!check.ok) {
  console.error(
    '::error title=BACKUP_MISMATCH::копия не совпала с исходной БД — см. отчёт прогона',
  );
  process.exit(1);
}
