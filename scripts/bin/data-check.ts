/**
 * Шаг `data:check` (ТЗ 10.4): каждый файл `data/*.json` проверяется
 * конвертом и схемой. Непрохождение роняет проверку — пустой блок молча
 * не собирается (ТЗ 6.6, п. 3).
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { envelopeSchema, SCHEMA_VERSION } from '@uzn/shared';

const DATA_DIR = 'data';

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

    console.log(`data:check — ${name}: ок, записей ${result.data.items.length}`);
  }

  if (problems.length > 0) {
    console.error('data:check — не пройдено:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
}

await main();
