/**
 * Чтение данных сборки (ТЗ 6.6). Слой gateway: весь ввод-вывод здесь,
 * страницы и компоненты к файлам не обращаются.
 *
 * Файл, не прошедший проверку схемой, роняет сборку с внятной ошибкой —
 * пустой блок молча не собирается (ТЗ 6.6, п. 3).
 */
import {
  contactsFileSchema,
  enterpriseFileSchema,
  publicDocsFileSchema,
  scenariosFileSchema,
  staticBlocksFileSchema,
  SCHEMA_VERSION,
} from '@uzn/shared';
import type { PublicDoc, BlockKey, Contact, Enterprise, LangText, Scenario } from '@uzn/shared';
import contactsRaw from '../../../data/contacts.json';
import enterpriseRaw from '../../../data/enterprise.json';
import publicDocsRaw from '../../../data/public-docs.json';
import scenariosRaw from '../../../data/scenarios.json';
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

const contactsFile = parseFile('contacts.json', contactsFileSchema, contactsRaw);
const enterpriseFile = parseFile('enterprise.json', enterpriseFileSchema, enterpriseRaw);
const publicDocsFile = parseFile('public-docs.json', publicDocsFileSchema, publicDocsRaw);
const scenariosFile = parseFile('scenarios.json', scenariosFileSchema, scenariosRaw);
const staticBlocksFile = parseFile('static-blocks.json', staticBlocksFileSchema, staticBlocksRaw);

for (const [name, file] of [
  ['contacts.json', contactsFile],
  ['enterprise.json', enterpriseFile],
  ['public-docs.json', publicDocsFile],
  ['scenarios.json', scenariosFile],
  ['static-blocks.json', staticBlocksFile],
] as const) {
  if (file.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `data/${name}: schemaVersion ${file.schemaVersion}, сборка знает ${SCHEMA_VERSION}`,
    );
  }
}

export const publicDocs: readonly PublicDoc[] = publicDocsFile.items;
export const contacts: readonly Contact[] = contactsFile.items;
export const scenarios: readonly Scenario[] = scenariosFile.items;

/** `Enterprise` — синглтон (ТЗ 6.2): количество записей проверено схемой файла. */
const [enterpriseRecord] = enterpriseFile.items;
if (enterpriseRecord === undefined) {
  throw new Error('data/enterprise.json: синглтон Enterprise без записи (ТЗ 6.2)');
}
export const enterprise: Enterprise = enterpriseRecord;

/** Текст блока страницы. Блока нет — возвращается `undefined`, блок скрывается. */
export function staticBlockText(key: BlockKey): LangText | undefined {
  return staticBlocksFile.items.find((block) => block.blockKey === key)?.text;
}
