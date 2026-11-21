import { slugify } from './format/translit.js';

/**
 * Правила загрузки файлов (ТЗ 8.4; решение 042). Одни и те же для сервера,
 * который принимает файл, и для админки, которая предупреждает до отправки.
 */

/**
 * Сущности, у которых есть поле загруженного файла, само поле и языковое поле,
 * из которого строится `slug` (то же, что `titleField` на сервере).
 */
export const UPLOAD_TARGETS = {
  leaders: { field: 'photoPath', accept: 'image', titleField: 'fullName' },
  'public-docs': { field: 'filePath', accept: 'document', titleField: 'title' },
} as const;

export type UploadEntity = keyof typeof UPLOAD_TARGETS;
export type UploadClass = 'image' | 'document';

export const UPLOAD_ENTITIES = Object.keys(UPLOAD_TARGETS) as UploadEntity[];

/** ТЗ 8.4, п. 2. */
export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export const maxBytesOf = (cls: UploadClass): number =>
  cls === 'image' ? IMAGE_MAX_BYTES : DOCUMENT_MAX_BYTES;

/**
 * Расширение по фактическому типу (ТЗ 8.4, п. 3). SVG отложен (решение 042),
 * Word — только `.docx`.
 */
export const UPLOAD_TYPES = {
  'image/jpeg': { ext: 'jpg', cls: 'image' },
  'image/png': { ext: 'png', cls: 'image' },
  'image/webp': { ext: 'webp', cls: 'image' },
  'application/pdf': { ext: 'pdf', cls: 'document' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: 'docx',
    cls: 'document',
  },
} as const satisfies Record<string, { ext: string; cls: UploadClass }>;

export type UploadMime = keyof typeof UPLOAD_TYPES;

/** Подпись допустимых типов для сообщений и поля выбора файла. */
export const ACCEPT_HINT: Record<UploadClass, string> = {
  image: 'JPEG, PNG або WebP, до 2 МБ',
  document: 'PDF або Word (.docx), до 10 МБ',
};

export const ACCEPT_ATTR: Record<UploadClass, string> = {
  image: 'image/jpeg,image/png,image/webp',
  document:
    'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx',
};

/** Сообщение об отказе — действием (ТЗ 8.4, п. 2; 2.3, требование 5). */
export const tooLargeMessage = (cls: UploadClass): string =>
  cls === 'image'
    ? 'Файл більший за 2 МБ. Зменшіть зображення й спробуйте ще раз'
    : 'Файл більший за 10 МБ. Зменшіть документ або розділіть його й спробуйте ще раз';

export const wrongTypeMessage = (cls: UploadClass): string =>
  cls === 'image'
    ? 'Це не зображення JPEG, PNG чи WebP. Збережіть фото в одному з цих форматів і спробуйте ще раз'
    : 'Це не PDF і не документ Word (.docx). Збережіть файл у PDF або .docx і спробуйте ще раз';

/**
 * `slug` для имени файла у записи, которая ещё не сохранена: та же
 * транслитерация названия, что сделает сервер при создании. Совпадать с
 * итоговым `slug` записи не обязано — имя файла влияет только на вид адреса.
 * `null` — названия ещё нет.
 */
export function provisionalSlug(title: string): string | null {
  return title.trim() === '' ? null : slugify(title);
}

/** Путь файла: `media/{entity}/{slug}-{8 знаков хэша}.{расширение}` (ТЗ 8.4, п. 5). */
export const UPLOAD_PATH_RE =
  /^media\/(leaders|public-docs)\/[a-z0-9]+(?:-[a-z0-9]+)*-[0-9a-f]{8}\.(jpg|png|webp|pdf|docx)$/u;
