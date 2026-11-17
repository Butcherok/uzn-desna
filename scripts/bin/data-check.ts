/**
 * Шаг `data:check` (ТЗ 10.4): каждый файл `data/*.json` проверяется
 * конвертом и схемой. Непрохождение роняет проверку — пустой блок молча
 * не собирается (ТЗ 6.6, п. 3).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ZodType } from 'zod';
import {
  contactSchema,
  enterpriseSchema,
  envelopeSchema,
  leaderSchema,
  publicDocSchema,
  scenarioSchema,
  staticBlockSchema,
  SCHEMA_VERSION,
} from '@uzn/shared';

const DATA_DIR = 'data';

/**
 * Схема записи по имени файла. Файл без схемы в этой таблице проверяется
 * только конвертом: так добавление файла не роняет шаг раньше времени,
 * но файл с известным именем обязан пройти проверку полей (ТЗ 6.6, п. 3).
 */
const ITEM_SCHEMAS: Record<string, ZodType> = {
  'contacts.json': contactSchema,
  'enterprise.json': enterpriseSchema,
  'leaders.json': leaderSchema,
  'public-docs.json': publicDocSchema,
  'scenarios.json': scenarioSchema,
  'static-blocks.json': staticBlockSchema,
};

/** Сущности-синглтоны (ТЗ 6.2, кардинальность): ровно одна запись в файле. */
const SINGLETON_FILES = new Set(['enterprise.json']);

async function main(): Promise<void> {
  const entries = await readdir(DATA_DIR).catch(() => [] as string[]);
  const files = entries.filter((name) => name.endsWith('.json')).sort();

  if (files.length === 0) {
    console.log('data:check — файлов данных пока нет, проверять нечего');
    return;
  }

  const problems: string[] = [];

  for (const name of files) {
    const path = join(DATA_DIR, name);
    const raw = await readFile(path, 'utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      problems.push(`${name}: не разбирается как JSON (${(error as Error).message})`);
      continue;
    }

    const result = envelopeSchema.safeParse(parsed);
    if (!result.success) {
      problems.push(`${name}: конверт не прошёл проверку — ${result.error.issues[0]?.message}`);
      continue;
    }

    if (result.data.schemaVersion !== SCHEMA_VERSION) {
      problems.push(
        `${name}: schemaVersion ${result.data.schemaVersion}, сборка знает ${SCHEMA_VERSION}`,
      );
      continue;
    }

    if (result.data.source === 'sync' && result.data.state === undefined) {
      problems.push(`${name}: файл синхронизации без поля state (ТЗ 6.5)`);
      continue;
    }

    if (SINGLETON_FILES.has(name) && result.data.items.length !== 1) {
      problems.push(
        `${name}: синглтон — ожидается ровно одна запись, в файле ${result.data.items.length}`,
      );
      continue;
    }

    const itemSchema = ITEM_SCHEMAS[name];
    if (itemSchema !== undefined) {
      let failed = false;
      result.data.items.forEach((item, index) => {
        const itemResult = itemSchema.safeParse(item);
        if (!itemResult.success) {
          failed = true;
          const issue = itemResult.error.issues[0];
          problems.push(
            `${name}: запись ${index + 1} — ${issue?.path.join('.') || 'поле'}: ${issue?.message}`,
          );
        }
      });
      if (failed) continue;
    }

    console.log(`data:check — ${name}: ок, записей ${result.data.items.length}`);
  }

  if (problems.length > 0) {
    console.error('data:check — не пройдено:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
}

await main();
