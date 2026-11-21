/**
 * Изображения из каталога `media/` (ТЗ 6.1, п. 9; 8.4, п. 6): в репозитории
 * лежит оригинал, производные WebP нужных размеров делает сборка
 * (ТЗ 8.4, п. 7; 5.3). Слой gateway: чтение файлов — здесь, не в компонентах.
 *
 * В данных хранится путь вида `media/leaders/имя.jpg`; эта таблица
 * переводит его в обработанное сборкой изображение. Нет файла по пути —
 * ошибка сборки, а не молча пустая карточка (ТЗ 6.6, п. 3).
 */
import type { ImageMetadata } from 'astro';
import bannerDayFile from '../../../media/banner/banner-day.png';
import bannerNightFile from '../../../media/banner/banner-night.png';
import asideBinFile from '../../../media/aside/aside-bin.png';
import asidePlanterFile from '../../../media/aside/aside-planter.png';
import asidePlantsFile from '../../../media/aside/aside-plants.png';

/**
 * Фото руководства: начальные — из `main`, загруженные в админке — из ветки
 * `content-data` (решение 042; `Deploy` кладёт их в тот же каталог).
 */
const LEADER_PHOTOS = import.meta.glob<{ default: ImageMetadata }>(
  '../../../media/leaders/*.{jpg,png,webp}',
  { eager: true },
);

/**
 * Документы «Публічної інформації», загруженные в админке (решение 042):
 * сборка копирует файл как есть и отдаёт адрес с меткой содержимого.
 */
const PUBLIC_DOC_FILES = import.meta.glob<string>('../../../media/public-docs/*.{pdf,docx}', {
  eager: true,
  query: '?no-inline',
  import: 'default',
});

/**
 * Фото публикаций ленты (решение 034): кладёт синхронизация в
 * `data/sync/media/feed/`, при сборке каталог приходит из ветки `sync-data`.
 * Файла нет (данные опережают фото или фото не скачалось) — `null`, карточка
 * выводит нашу иллюстрацию; это не ошибка сборки, в отличие от руководства.
 */
const FEED_PHOTOS = import.meta.glob<{ default: ImageMetadata }>(
  '../../../data/sync/media/feed/*.webp',
  { eager: true },
);

export function feedPhoto(imagePath: string | null): ImageMetadata | null {
  if (imagePath === null) return null;
  const name = imagePath.slice(imagePath.lastIndexOf('/') + 1);
  const entry = Object.entries(FEED_PHOTOS).find(([key]) => key.endsWith(`/${name}`));
  return entry?.[1].default ?? null;
}

export function leaderPhoto(photoPath: string): ImageMetadata {
  const name = photoPath.slice(photoPath.lastIndexOf('/') + 1);
  const entry = Object.entries(LEADER_PHOTOS).find(([key]) => key.endsWith(`/${name}`));
  if (entry === undefined) {
    throw new Error(`Нет файла ${photoPath}: путь из data/leaders.json не найден в media/`);
  }
  return entry[1].default;
}

export interface DocFile {
  href: string;
  /** Подпись типа рядом со ссылкой: посетитель видит, что откроется файл. */
  kind: 'PDF' | 'Word';
}

export function publicDocFile(filePath: string): DocFile {
  const name = filePath.slice(filePath.lastIndexOf('/') + 1);
  const entry = Object.entries(PUBLIC_DOC_FILES).find(([key]) => key.endsWith(`/${name}`));
  if (entry === undefined) {
    throw new Error(`Нет файла ${filePath}: путь из data/public-docs.json не найден в media/`);
  }
  return { href: entry[1], kind: name.endsWith('.pdf') ? 'PDF' : 'Word' };
}

/**
 * Первый экран главной (ТЗ 4.1, дизайн-система 7а). Эти изображения не приходят
 * из данных: они часть оформления, а не содержимого, поэтому импортируются
 * по именам, а не ищутся по пути из JSON, как фотографии руководства.
 *
 * Баннер — два рисунка одного кадра: дневной и ночной. Выбор делает браузер по
 * `prefers-color-scheme` внутри `<picture>`, без JavaScript (решение 020).
 * Исходники 1600×900 (ТЗ 5.3, п. 2: не шире 1600); ступени `srcset` режет сборка.
 */
export const BANNER: { readonly day: ImageMetadata; readonly night: ImageMetadata } = {
  day: bannerDayFile,
  night: bannerNightFile,
};

/**
 * Боковые предметы первого экрана: самостоятельные рисунки, каждый сам по себе
 * (дизайн-система 7а). Декоративные — выводятся с пустым `alt`. Исходники
 * 330×480 с прозрачным фоном, то есть ровно плотность 2 при выводе в 165 px.
 */
export const ASIDES: {
  readonly bin: ImageMetadata;
  readonly planter: ImageMetadata;
  readonly plants: ImageMetadata;
} = {
  bin: asideBinFile,
  planter: asidePlanterFile,
  plants: asidePlantsFile,
};
