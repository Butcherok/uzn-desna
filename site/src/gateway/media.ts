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

const LEADER_PHOTOS = import.meta.glob<{ default: ImageMetadata }>('../../../media/leaders/*.jpg', {
  eager: true,
});

export function leaderPhoto(photoPath: string): ImageMetadata {
  const name = photoPath.slice(photoPath.lastIndexOf('/') + 1);
  const entry = Object.entries(LEADER_PHOTOS).find(([key]) => key.endsWith(`/${name}`));
  if (entry === undefined) {
    throw new Error(`Нет файла ${photoPath}: путь из data/leaders.json не найден в media/`);
  }
  return entry[1].default;
}
