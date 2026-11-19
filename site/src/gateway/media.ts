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
