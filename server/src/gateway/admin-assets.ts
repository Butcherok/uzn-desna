/**
 * Собранный интерфейс админки (решение 040): файлы `admin/dist` читаются один
 * раз при старте в память. Файлов единицы, вес — сотни килобайт; чтение по
 * таблице, а не по пути с диска, исключает выход за каталог по `../`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, posix } from 'node:path';
import { gzipSync } from 'node:zlib';

export interface AdminAsset {
  body: Buffer;
  /** Сжатая копия — для текстовых файлов, если она меньше исходника. */
  gzip: Buffer | null;
  type: string;
  /** Имя содержит метку содержимого (`assets/…`): файл не меняется никогда. */
  immutable: boolean;
}

/** Путь от корня админки без ведущей косой черты: `index.html`, `assets/app-1a2b.js`. */
export type AdminAssets = ReadonlyMap<string, AdminAsset>;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.svg', '.txt', '.json']);

async function walk(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? posix.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(join(dir, entry.name), rel)));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

/**
 * Читает каталог сборки. `null` — сборки нет (разработка сервера без админки,
 * тесты): сервер работает, `/admin/` отвечает, что интерфейс не собран.
 */
export async function loadAdminAssets(dir: string): Promise<AdminAssets | null> {
  let files: string[];
  try {
    files = await walk(dir);
  } catch {
    return null;
  }
  if (!files.includes('index.html')) return null;
  const map = new Map<string, AdminAsset>();
  for (const rel of files) {
    const ext = extname(rel).toLowerCase();
    const type = TYPES[ext];
    if (!type) continue;
    const body = await readFile(join(dir, rel));
    const packed = COMPRESSIBLE.has(ext) ? gzipSync(body, { level: 9 }) : null;
    map.set(rel, {
      body,
      gzip: packed && packed.length < body.length ? packed : null,
      type,
      immutable: rel.startsWith('assets/'),
    });
  }
  return map;
}
