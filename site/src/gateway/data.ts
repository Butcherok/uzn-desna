/**
 * Чтение данных сборки (ТЗ 6.6). Слой gateway: весь ввод-вывод здесь,
 * страницы и компоненты к файлам не обращаются.
 *
 * Файл, не прошедший проверку схемой, роняет сборку с внятной ошибкой —
 * пустой блок молча не собирается (ТЗ 6.6, п. 3).
 */
import { publicDocsFileSchema, staticBlocksFileSchema, SCHEMA_VERSION } from '@uzn/shared';
import type { PublicDoc, BlockKey, LangText } from '@uzn/shared';
import publicDocsRaw from '../../../data/public-docs.json';
import staticBlocksRaw from '../../../data/static-blocks.json';

function parseFile<T>(name: string, schema: { parse: (input: unknown) => T }, raw: unknown): T {
  try {
    return schema.parse(raw);
  } catch (error) {
    throw new Error(
      `data/${name} не прошёл проверку схемой (ТЗ 6.6, п. 3): ${(error as Error).message}`,
      { cause: error },
    );
  }
}

const publicDocsFile = parseFile('public-docs.json', publicDocsFileSchema, publicDocsRaw);
const staticBlocksFile = parseFile('static-blocks.json', staticBlocksFileSchema, staticBlocksRaw);

for (const [name, file] of [
  ['public-docs.json', publicDocsFile],
  ['static-blocks.json', staticBlocksFile],
] as const) {
  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `data/${name}: schemaVersion ${file.schemaVersion}, сборка знает ${SCHEMA_VERSION}`,
    );
  }
}

export const publicDocs: readonly PublicDoc[] = publicDocsFile.items;

/** Текст блока страницы. Блока нет — возвращается `undefined`, блок скрывается. */
export function staticBlockText(key: BlockKey): LangText | undefined {
  return staticBlocksFile.items.find((block) => block.blockKey === key)?.text;
}
