/**
 * Разбор загруженного файла без внешних библиотек (ТЗ 8.4, пп. 3, 4, 7;
 * решение 042): тип — по сигнатуре содержимого, размеры — из заголовка,
 * метаданные снимка вырезаются блоками без перекодирования. Изображение на
 * Render не декодируется: обработка — при сборке.
 *
 * От метаданных JPEG остаётся один тег ориентации: без него снимок с
 * телефона ляжет боком, а сборка (`sharp().rotate()` в Astro) поворачивает
 * по нему.
 */
import { UPLOAD_TYPES, type UploadMime } from '@uzn/shared';

export interface ParsedFile {
  mime: UploadMime;
  /** Файл без метаданных: его и хранить. */
  bytes: Buffer;
  /** Для изображения — с учётом ориентации; для документа — `null`. */
  width: number | null;
  height: number | null;
}

/** Файл не того типа, что заявлен, или испорчен. */
export class BadFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadFileError';
  }
}

const startsWith = (buf: Buffer, sig: readonly number[], at = 0): boolean =>
  buf.length >= at + sig.length && sig.every((b, i) => buf[at + i] === b);

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));

/** Тип по сигнатуре; `null` — не из допустимых (ТЗ 8.4, п. 3). */
export function sniffMime(buf: Buffer): UploadMime | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(buf, PNG_SIG)) return 'image/png';
  if (startsWith(buf, ascii('RIFF')) && startsWith(buf, ascii('WEBP'), 8)) return 'image/webp';
  if (startsWith(buf, ascii('%PDF-'))) return 'application/pdf';
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) && isDocx(buf)) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

/**
 * `.docx` — архив ZIP с `word/document.xml` и `[Content_Types].xml`. Имена
 * записей в ZIP хранятся несжатыми, поэтому поиск по байтам надёжен; таблица
 * Excel и презентация этих имён не содержат.
 */
function isDocx(buf: Buffer): boolean {
  return buf.includes('word/document.xml', 0, 'latin1') && buf.includes('[Content_Types].xml');
}

export function parseFile(buf: Buffer): ParsedFile {
  const mime = sniffMime(buf);
  if (mime === null) throw new BadFileError('unsupported signature');
  switch (mime) {
    case 'image/jpeg':
      return { mime, ...parseJpeg(buf) };
    case 'image/png':
      return { mime, ...parsePng(buf) };
    case 'image/webp':
      return { mime, ...parseWebp(buf) };
    default:
      return { mime, bytes: buf, width: null, height: null };
  }
}

export const extOf = (mime: UploadMime): string => UPLOAD_TYPES[mime].ext;

// ------------------------------------------------------------------ JPEG

/** Сохраняются: JFIF (APP0), ICC (APP2), Adobe (APP14). Прочие APPn и COM — нет. */
const JPEG_KEEP_APP = new Set([0xe0, 0xe2, 0xee]);
const isSof = (m: number): boolean =>
  m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

function parseJpeg(buf: Buffer): Omit<ParsedFile, 'mime'> {
  const parts: Buffer[] = [buf.subarray(0, 2)];
  let orientation = 1;
  let width = 0;
  let height = 0;
  let pos = 2;
  let orientationSlot = -1;

  for (;;) {
    if (pos + 4 > buf.length || buf[pos] !== 0xff) throw new BadFileError('jpeg: broken segment');
    const marker = buf[pos + 1] ?? 0;
    if (marker === 0xff) {
      pos += 1; // заполняющие байты
      continue;
    }
    if (marker === 0xd9) throw new BadFileError('jpeg: no image data');
    const len = buf.readUInt16BE(pos + 2);
    const end = pos + 2 + len;
    if (len < 2 || end > buf.length) throw new BadFileError('jpeg: segment overflow');
    const segment = buf.subarray(pos, end);

    if (marker === 0xda) {
      // Начало данных изображения: дальше всё как есть.
      if (width === 0 || height === 0) throw new BadFileError('jpeg: no frame header');
      parts.push(buf.subarray(pos));
      break;
    }
    if (isSof(marker)) {
      if (len < 8) throw new BadFileError('jpeg: short frame header');
      height = buf.readUInt16BE(pos + 5);
      width = buf.readUInt16BE(pos + 7);
    }
    if (marker === 0xe1) {
      const o = exifOrientation(segment.subarray(4));
      if (o !== null) orientation = o;
      if (orientationSlot < 0) orientationSlot = parts.length;
    } else if ((marker >= 0xe0 && marker <= 0xef) || marker === 0xfe) {
      if (JPEG_KEEP_APP.has(marker)) parts.push(segment);
    } else {
      parts.push(segment);
    }
    pos = end;
  }

  if (orientation !== 1) {
    // Ставится туда, где стоял исходный блок Exif: сразу за JFIF.
    parts.splice(orientationSlot < 0 ? 1 : orientationSlot, 0, orientationApp1(orientation));
  }
  const swap = orientation >= 5 && orientation <= 8;
  return {
    bytes: Buffer.concat(parts),
    width: swap ? height : width,
    height: swap ? width : height,
  };
}

/** Тег 0x0112 из IFD0 блока Exif; `null` — нет тега или блок не Exif. */
export function exifOrientation(body: Buffer): number | null {
  if (!startsWith(body, [...ascii('Exif'), 0, 0])) return null;
  const tiff = body.subarray(6);
  if (tiff.length < 8) return null;
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!le && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return null;
  const u16 = (o: number): number => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number): number => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd = u32(4);
  if (ifd + 2 > tiff.length) return null;
  const count = u16(ifd);
  for (let i = 0; i < count; i += 1) {
    const at = ifd + 2 + i * 12;
    if (at + 12 > tiff.length) return null;
    if (u16(at) === 0x0112) {
      const v = u16(at + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/** Блок Exif из одного тега ориентации: 34 байта, ничего о снимке и авторе. */
export function orientationApp1(orientation: number): Buffer {
  const b = Buffer.alloc(36);
  b.writeUInt16BE(0xffe1, 0);
  b.writeUInt16BE(34, 2);
  b.write('Exif\0\0', 4, 'latin1');
  b.write('MM', 10, 'latin1');
  b.writeUInt16BE(42, 12);
  b.writeUInt32BE(8, 14); // IFD0 сразу за заголовком TIFF
  b.writeUInt16BE(1, 18); // одна запись
  b.writeUInt16BE(0x0112, 20);
  b.writeUInt16BE(3, 22); // SHORT
  b.writeUInt32BE(1, 24);
  b.writeUInt16BE(orientation, 28);
  b.writeUInt32BE(0, 32); // следующего IFD нет
  return b;
}

// ------------------------------------------------------------------- PNG

/** Текст, дата и Exif. Остальные блоки нужны для вывода и сохраняются. */
const PNG_DROP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);

function parsePng(buf: Buffer): Omit<ParsedFile, 'mime'> {
  const parts: Buffer[] = [buf.subarray(0, 8)];
  let pos = 8;
  let width = 0;
  let height = 0;
  let ended = false;
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const end = pos + 12 + len;
    if (end > buf.length) throw new BadFileError('png: chunk overflow');
    if (type === 'IHDR') {
      width = buf.readUInt32BE(pos + 8);
      height = buf.readUInt32BE(pos + 12);
    }
    if (!PNG_DROP.has(type)) parts.push(buf.subarray(pos, end));
    pos = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended || width === 0 || height === 0) throw new BadFileError('png: broken structure');
  return { bytes: Buffer.concat(parts), width, height };
}

// ------------------------------------------------------------------ WebP

function parseWebp(buf: Buffer): Omit<ParsedFile, 'mime'> {
  const declared = buf.readUInt32LE(4) + 8;
  if (declared > buf.length || declared < 20) throw new BadFileError('webp: broken size');
  const chunks: Buffer[] = [];
  let pos = 12;
  let width = 0;
  let height = 0;
  while (pos + 8 <= declared) {
    const type = buf.toString('latin1', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const end = pos + 8 + size + (size % 2);
    if (pos + 8 + size > declared) throw new BadFileError('webp: chunk overflow');
    const data = buf.subarray(pos + 8, pos + 8 + size);
    const chunk = Buffer.from(buf.subarray(pos, Math.min(end, declared)));
    if (type === 'VP8X' && size >= 10) {
      chunk[8] = (chunk[8] ?? 0) & ~0x0c; // флаги Exif и XMP сняты вместе с блоками
      width = data.readUIntLE(4, 3) + 1;
      height = data.readUIntLE(7, 3) + 1;
    } else if (type === 'VP8 ' && size >= 10 && width === 0) {
      width = data.readUInt16LE(6) & 0x3fff;
      height = data.readUInt16LE(8) & 0x3fff;
    } else if (type === 'VP8L' && size >= 5 && width === 0 && data[0] === 0x2f) {
      const bits = data.readUInt32LE(1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    }
    if (type !== 'EXIF' && type !== 'XMP ') chunks.push(chunk);
    pos = end;
  }
  if (width === 0 || height === 0) throw new BadFileError('webp: no image header');
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length + 4, 4);
  head.write('WEBP', 8, 'latin1');
  return { bytes: Buffer.concat([head, body]), width, height };
}
