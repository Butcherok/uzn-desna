/**
 * Картинки для ссылок и экрана телефона (решение 054). Запускается руками
 * при смене баннера или знака: `node scripts/bin/social-images.mjs`; результат
 * коммитится в `site/public/` — сборка сайта их не пересчитывает.
 *
 * - `og-image.jpg` 1200×630 — дневной баннер `media/banner/banner-day.png`
 *   (1600×900) с подрезкой по высоте до 1,905:1, середина кадра (ТЗ 11.4).
 * - `apple-touch-icon.png` 180×180, `icon-192.png`, `icon-512.png` — знак
 *   `favicon.svg` на фоне страницы, 80 % стороны; iPhone прозрачность
 *   заливает чёрным, поэтому фон непрозрачный.
 * - `icon-maskable-512.png` — знак 64 %: Android обрезает значок по своей
 *   маске, безопасная зона — круг 80 % стороны.
 */
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const OUT = 'site/public';
const BG = '#F5F1E4'; // --c-bg светлой темы (дизайн-система, раздел 3)

await sharp('media/banner/banner-day.png')
  .resize(1200, 630, { fit: 'cover', position: 'centre' })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(`${OUT}/og-image.jpg`);

const svg = await readFile(`${OUT}/favicon.svg`);
async function icon(size, share, file) {
  const mark = Math.round(size * share);
  const art = await sharp(svg, { density: Math.ceil((72 * mark) / 32) })
    .resize(mark, mark)
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: BG } })
    .composite([{ input: art, gravity: 'centre' }])
    .png({ compressionLevel: 9, palette: true })
    .toFile(`${OUT}/${file}`);
}
await icon(180, 0.8, 'apple-touch-icon.png');
await icon(192, 0.8, 'icon-192.png');
await icon(512, 0.8, 'icon-512.png');
await icon(512, 0.64, 'icon-maskable-512.png');
console.log('social-images: og-image.jpg, apple-touch-icon.png, icon-192/512, icon-maskable-512');
