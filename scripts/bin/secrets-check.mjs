/**
 * Шаг `secrets:check` (ТЗ 10.4, 10.5, п. 1): в сборке не должно быть ни имён
 * секретов, ни характерных образцов их значений. Репозиторий публичный.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const DIST = 'site/dist';
const TEXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.txt', '.xml', '.svg', '.map']);

const NAMES = [
  'MONGODB_URI',
  'FB_PAGE_TOKEN',
  'FB_PAGE_ID',
  'EXPORT_TOKEN',
  'GITHUB_TOKEN',
  'BOOTSTRAP_OWNER_LOGIN',
  'BOOTSTRAP_OWNER_PASSWORD_HASH',
];

const PATTERNS = [
  [/mongodb(\+srv)?:\/\//i, 'строка подключения MongoDB'],
  [/ghp_[A-Za-z0-9]{20,}/, 'личный токен GitHub'],
  [/github_pat_[A-Za-z0-9_]{20,}/, 'личный токен GitHub (новый формат)'],
  [/EAA[A-Za-z0-9]{30,}/, 'токен Meta'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'закрытый ключ'],
  [/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/, 'хэш bcrypt'],
];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else out.push(path);
  }
  return out;
}

async function main() {
  const files = (await walk(DIST).catch(() => [])).filter((path) =>
    TEXT.has(extname(path).toLowerCase()),
  );

  if (files.length === 0) {
    console.error(`secrets:check — сборка не найдена в ${DIST}. Сначала npm run build`);
    process.exit(1);
  }

  const findings = [];

  for (const path of files) {
    const text = await readFile(path, 'utf8');
    for (const name of NAMES) {
      if (text.includes(name)) findings.push(`${path}: имя секрета ${name}`);
    }
    for (const [pattern, label] of PATTERNS) {
      if (pattern.test(text)) findings.push(`${path}: похоже на ${label}`);
    }
  }

  if (findings.length > 0) {
    console.error('secrets:check — в сборке найдено то, чего там быть не должно:');
    for (const finding of findings) console.error(`  ${finding}`);
    process.exit(1);
  }

  console.log(`secrets:check — проверено файлов: ${files.length}, секретов не найдено`);
}

await main();
