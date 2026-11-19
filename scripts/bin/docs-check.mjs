/**
 * Шаг `docs:check` (ТЗ 10.3, п. 4): держит в пределах те файлы, которые агент
 * читает при каждом старте сессии, и обновляет карту разделов базы знаний.
 *
 * Зачем шаг нужен. Пределы «CLAUDE.md до 80 строк, project-context.md до 100
 * строк» записаны в ТЗ с самого начала, но ничем не проверялись, и
 * `project-context.md` дорос до 133 строк и 44 КБ. Каждая сессия начинается с
 * его чтения, то есть лишние 33 КБ уходили в переписку при каждом старте
 * независимо от задачи. Обещание предел не держит — держит проверка.
 *
 * Карта `docs/kb-map.md` нужна по той же причине: ТЗ занимает 319 КБ, и читать
 * его целиком ради одного подраздела незачем. Карта даёт номера строк, по
 * которым берётся срез.
 *
 * Запуск с `--write` переписывает карту; без него только проверяет.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Файлы, читаемые при старте сессии, и их пределы в строках (ТЗ 10.3, п. 4). */
const LIMITS = [
  { path: 'CLAUDE.md', lines: 80 },
  { path: 'docs/project-context.md', lines: 100 },
];

const KB_DIR = 'docs/knowledge-base';
const MAP_PATH = 'docs/kb-map.md';
const MAP_HEAD = `# Карта разделов базы знаний

Файл создаётся шагом \`docs:check\`; руками не правится.

Зачем: документы базы знаний крупные, самый большой — ТЗ. Чтобы прочитать один
подраздел, не втягивая в переписку весь файл, берётся срез по номерам строк:

\`\`\`
sed -n '169,200p' docs/knowledge-base/10_tz-sait.md
\`\`\`

Номера строк меняются при каждой правке документа, поэтому карта пересобирается
тем же шагом и проверяется в CI.
`;

async function buildMap() {
  const files = (await readdir(KB_DIR)).filter((f) => f.endsWith('.md')).sort();
  const parts = [MAP_HEAD];
  for (const file of files) {
    const text = await readFile(join(KB_DIR, file), 'utf8');
    const lines = text.split('\n');
    const rows = [];
    lines.forEach((line, i) => {
      const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
      if (m) rows.push({ level: m[1].length, title: m[2], line: i + 1 });
    });
    const bytes = Buffer.byteLength(text, 'utf8');
    parts.push(
      `\n## ${file}\n\nСтрок: ${lines.length}. Размер: ${bytes.toLocaleString('ru-RU')} Б.\n`,
    );
    if (rows.length === 0) {
      parts.push('\nРазделов не найдено.\n');
      continue;
    }
    parts.push('\n| Раздел | Строки |\n| --- | --- |\n');
    rows.forEach((row, idx) => {
      const end = idx + 1 < rows.length ? rows[idx + 1].line - 1 : lines.length;
      const indent = row.level === 3 ? '— ' : '';
      parts.push(`| ${indent}${row.title} | ${row.line}–${end} |\n`);
    });
  }
  return parts.join('');
}

const problems = [];

for (const { path, lines } of LIMITS) {
  const text = await readFile(path, 'utf8');
  const count = text.split('\n').filter((l, i, a) => i < a.length - 1 || l !== '').length;
  const bytes = Buffer.byteLength(text, 'utf8');
  const mark = count > lines ? 'не  ' : 'ок  ';
  console.log(`${mark} ${path}: ${count} строк из ${lines}, ${bytes} Б`);
  if (count > lines) {
    problems.push(
      `${path}: ${count} строк при пределе ${lines}. Этот файл читается при каждом ` +
        `старте сессии — вынесите исторические разделы в docs/done.md или docs/findings.md.`,
    );
  }
}

const built = await buildMap();
const current = await readFile(MAP_PATH, 'utf8').catch(() => null);

if (process.argv.includes('--write')) {
  if (built !== current) {
    await writeFile(MAP_PATH, built, 'utf8');
    console.log(`ок   ${MAP_PATH} переписан`);
  } else {
    console.log(`ок   ${MAP_PATH} и так свежий`);
  }
} else if (built !== current) {
  problems.push(`${MAP_PATH} устарел. Выполните: npm run docs:map`);
} else {
  console.log(`ок   ${MAP_PATH} совпадает с документами базы знаний`);
}

if (problems.length > 0) {
  console.error('\ndocs:check — не пройдено:');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log('docs:check — пройдено');
