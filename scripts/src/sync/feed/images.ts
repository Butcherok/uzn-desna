/**
 * Фото публикаций ленты (решение 034; ТЗ 4.8, 7.4, п. 8 в редакции 3.25).
 *
 * Для записей без фото берётся картинка статьи из `og:image`, обрезается под
 * карточку (16:9) и сохраняется у нас: `data/sync/media/feed/<имя>.webp`.
 * Со страницы сайта к доменам источника запросов нет (ТЗ 11.2, п. 5): фото
 * отдаётся с адреса сайта, производные размеры делает сборка.
 *
 * Фото — не данные ленты: его отказ не ошибка источника и не влияет на
 * `SyncState`. Не нашлось — `imagePath: null`, карточка выводит нашу
 * иллюстрацию, следующий прогон попробует снова.
 */
import { createHash } from 'node:crypto';
import type { FeedItem } from '@uzn/shared';

/** Сколько записей без фото пробовать за прогон: выводится 8, на главной 3. */
export const IMAGES_PER_RUN = 12;
/** Больше — не фото для карточки, а что-то другое. */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_DIR = 'media/feed';

export interface ImageDeps {
  /** HTML страницы публикации. Бросает при сбое. */
  fetchPage: (url: string) => Promise<string>;
  /** Байты картинки. Бросает при сбое, не-картинке и превышении размера. */
  fetchImage: (url: string) => Promise<Uint8Array>;
  /** Обрезка под 16:9 и WebP. */
  toCardWebp: (bytes: Uint8Array) => Promise<Uint8Array>;
  /** Имена файлов, уже лежащих в `media/feed/`. */
  listFiles: () => Promise<string[]>;
  writeFile: (name: string, bytes: Uint8Array) => Promise<void>;
  removeFile: (name: string) => Promise<void>;
  log: (line: string) => void;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x2F;/gi, '/');
}

/**
 * Адрес `og:image` (или `twitter:image`) из HTML, абсолютный и только https.
 * Порядок атрибутов в `<meta>` у сайтов разный — разбираются оба.
 */
export function ogImageUrl(html: string, pageUrl: string): string | null {
  for (const name of ['og:image:secure_url', 'og:image', 'twitter:image']) {
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
      const key = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      if (key?.toLowerCase() !== name) continue;
      const content = /\bcontent\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
      if (content === undefined) continue;
      try {
        const url = new URL(decodeEntities(content.trim()), pageUrl);
        if (url.protocol === 'https:') return url.toString();
      } catch {
        // битый адрес — пробуем следующий тег
      }
    }
  }
  return null;
}

/** Имя файла фото по ключу записи: стабильно между прогонами. */
export function imageFileName(urlKey: string): string {
  return `${createHash('sha1').update(urlKey).digest('hex').slice(0, 12)}.webp`;
}

/**
 * Проставляет `imagePath` новым записям и убирает файлы записей, вытесненных
 * из ленты. Порядок и прочие поля записей не меняются.
 */
export async function attachImages(
  items: readonly FeedItem[],
  deps: ImageDeps,
  limit = IMAGES_PER_RUN,
): Promise<FeedItem[]> {
  const files = new Set(await deps.listFiles());
  const out = items.map((item) => {
    // Путь есть, а файла нет (ветку данных чистили руками) — скачать заново.
    if (item.imagePath !== null && !files.has(item.imagePath.slice(IMAGE_DIR.length + 1))) {
      return { ...item, imagePath: null };
    }
    return item;
  });

  const missing = out
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.imagePath === null)
    .sort((a, b) => b.item.publishedAt.localeCompare(a.item.publishedAt))
    .slice(0, limit);

  let added = 0;
  for (const { item, index } of missing) {
    const name = imageFileName(item.urlKey);
    try {
      const imageUrl = ogImageUrl(await deps.fetchPage(item.url), item.url);
      if (imageUrl === null) {
        deps.log(`фото ${item.sourceId}: у публикации нет og:image`);
        continue;
      }
      await deps.writeFile(name, await deps.toCardWebp(await deps.fetchImage(imageUrl)));
      files.add(name);
      out[index] = { ...item, imagePath: `${IMAGE_DIR}/${name}` };
      added += 1;
    } catch (error) {
      deps.log(`фото ${item.sourceId}: сбой ${(error as Error).name}`);
    }
  }

  const kept = new Set(
    out.flatMap((i) => (i.imagePath === null ? [] : [i.imagePath.slice(IMAGE_DIR.length + 1)])),
  );
  let removed = 0;
  for (const file of files) {
    if (kept.has(file)) continue;
    await deps.removeFile(file);
    removed += 1;
  }
  deps.log(
    `фото: добавлено ${added}, удалено ${removed}, без фото ${out.filter((i) => i.imagePath === null).length}`,
  );
  return out;
}
