import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { BadFileError, exifOrientation, parseFile, sniffMime } from './media-files.js';

const rgb = { width: 40, height: 20, channels: 3 as const, background: '#2f583f' };

/** Снимок «с телефона»: автор и ориентация 6 (повёрнут на 90°). */
async function phoneJpeg(orientation = 6): Promise<Buffer> {
  const img = sharp({ create: rgb })
    .jpeg()
    .withExif({ IFD0: { Artist: 'Ivan Petrenko', Copyright: 'Ivan' } });
  return (orientation === 1 ? img : img.withMetadata({ orientation })).toBuffer();
}

const has = (buf: Buffer, s: string): boolean => buf.includes(s, 0, 'latin1');

describe('sniffMime', () => {
  it('определяет тип по содержимому, а не по имени', async () => {
    expect(sniffMime(await sharp({ create: rgb }).jpeg().toBuffer())).toBe('image/jpeg');
    expect(sniffMime(await sharp({ create: rgb }).png().toBuffer())).toBe('image/png');
    expect(sniffMime(await sharp({ create: rgb }).webp().toBuffer())).toBe('image/webp');
    expect(sniffMime(Buffer.from('%PDF-1.7\n%…'))).toBe('application/pdf');
    expect(sniffMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffMime(Buffer.from('GIF89a'))).toBeNull();
  });

  it('отличает .docx от другого архива ZIP', () => {
    const zip = (names: string[]) =>
      Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(names.join('\0'))]);
    expect(sniffMime(zip(['[Content_Types].xml', 'word/document.xml']))).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(sniffMime(zip(['[Content_Types].xml', 'xl/workbook.xml']))).toBeNull();
  });
});

describe('parseFile: JPEG', () => {
  it('вырезает автора, оставляет ориентацию', async () => {
    const src = await phoneJpeg();
    expect(has(src, 'Ivan Petrenko')).toBe(true);
    const out = parseFile(src);
    expect(has(out.bytes, 'Ivan')).toBe(false);
    expect(out.bytes.length).toBeLessThan(src.length);

    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.orientation).toBe(6);
    expect(meta.exif && exifOrientation(meta.exif)).toBe(6);
    // Размеры — как на экране: при ориентации 6 стороны меняются местами.
    expect([out.width, out.height]).toEqual([20, 40]);
    // Файл декодируется целиком.
    const { info } = await sharp(out.bytes).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([40, 20]);
  });

  it('без ориентации не оставляет блока Exif вовсе', async () => {
    const out = parseFile(await phoneJpeg(1));
    const meta = await sharp(out.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect([out.width, out.height]).toEqual([40, 20]);
  });

  it('отклоняет обрезанный файл', async () => {
    const src = await phoneJpeg();
    expect(() => parseFile(src.subarray(0, 60))).toThrow(BadFileError);
  });
});

describe('parseFile: PNG и WebP', () => {
  it('PNG: убирает текст и Exif, картинка цела', async () => {
    const src = await sharp({ create: { ...rgb, channels: 4 } })
      .png()
      .withExif({ IFD0: { Artist: 'Ivan Petrenko' } })
      .toBuffer();
    expect(has(src, 'Ivan Petrenko')).toBe(true);
    const out = parseFile(src);
    expect(has(out.bytes, 'Ivan')).toBe(false);
    expect([out.width, out.height]).toEqual([40, 20]);
    expect((await sharp(out.bytes).metadata()).format).toBe('png');
    await sharp(out.bytes).raw().toBuffer();
  });

  it('WebP: убирает Exif и XMP, исправляет размер RIFF', async () => {
    const src = await sharp({ create: rgb })
      .webp()
      .withExif({ IFD0: { Artist: 'Ivan Petrenko' } })
      .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><Author>Ivan</Author></x:xmpmeta>')
      .toBuffer();
    expect(has(src, 'Ivan')).toBe(true);
    const out = parseFile(src);
    expect(has(out.bytes, 'Ivan')).toBe(false);
    expect(out.bytes.readUInt32LE(4)).toBe(out.bytes.length - 8);
    expect([out.width, out.height]).toEqual([40, 20]);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    await sharp(out.bytes).raw().toBuffer();
  });

  it('WebP без метаданных и без полосы прозрачности', async () => {
    const src = await sharp({ create: rgb }).webp({ lossless: true }).toBuffer();
    const out = parseFile(src);
    expect([out.width, out.height]).toEqual([40, 20]);
    expect(out.bytes.equals(src)).toBe(true);
  });
});
