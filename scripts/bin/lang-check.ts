/**
 * Шаг `lang:check` (решение 056): языковые версии собранного сайта —
 * правила в `scripts/src/lang/check.ts`. Запускается после `npm run build`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { checkLanguages } from '../src/lang/check.js';

const DIST = 'site/dist';
const base = process.env.PUBLIC_BASE_PATH ?? '/uzn-desna';
const origin = process.env.PUBLIC_SITE_ORIGIN ?? 'https://butcherok.github.io';

async function htmlFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const files = await htmlFiles(DIST);
if (files.length === 0) {
  console.error(`lang:check: в ${DIST} нет страниц — сначала npm run build`);
  process.exit(1);
}
const pages = new Map<string, string>();
for (const file of files.sort()) {
  pages.set(relative(DIST, file).split(sep).join('/'), await readFile(file, 'utf8'));
}

const { errors, ukPages, enPages } = checkLanguages(pages, { base, origin });
if (errors.length > 0) {
  console.error(`lang:check: ${errors.length} нарушений`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`lang:check: украинских страниц ${ukPages}, английских ${enPages}, нарушений нет`);
