/**
 * Шаг `contrast:check` (ТЗ 11.3, п. 1; дизайн-система, раздел 3; решение 024):
 * контраст пар «цвет / фон», которые реально встречаются в `components.css`,
 * считается по обоим наборам токенов — светлому и тёмному.
 *
 * Значения читаются из `tokens.css`, а не дублируются здесь: правка цвета
 * в токенах сразу проверяется. Светлый набор — блок `:root, .site-footer,
 * .hero__panel`, тёмный — блок `@media screen and (prefers-color-scheme: dark)`.
 *
 * Пороги WCAG 2.1: текст — 4,5:1, границы элементов управления, иконки,
 * контур фокуса — 3:1. Пары подвала и панели первого экрана проверяются
 * только по светлому набору: в тёмной теме эти области его сохраняют.
 */
import { readFile } from 'node:fs/promises';

const TOKENS = 'site/src/styles/tokens.css';
const TEXT = 4.5;
const UI = 3;

/** [цвет, фон, порог, где встречается] — пары страницы, оба набора. */
const PAGE = [
  ['ink', 'bg', TEXT, 'основной текст'],
  ['ink', 'surface', TEXT, 'текст в карточке'],
  ['ink', 'pale', TEXT, 'метка, hover, текущий пункт меню'],
  ['deep', 'bg', TEXT, 'второстепенный текст'],
  ['deep', 'surface', TEXT, 'второстепенный текст в карточке, иконка телефона'],
  ['deep', 'pale', TEXT, 'подпись в блоке цифр'],
  ['mid', 'bg', TEXT, 'ссылка'],
  ['mid', 'surface', TEXT, 'ссылка в карточке'],
  ['mid', 'pale', TEXT, 'ссылка-карточка при наведении'],
  ['surface', 'deep', TEXT, 'главная кнопка'],
  ['surface', 'ink', TEXT, 'главная кнопка при наведении'],
  ['ink', 'mint', TEXT, 'акцентная кнопка'],
  ['surface', 'alert', TEXT, 'плашка аварийного сценария'],
  ['olive', 'bg', UI, 'граница элемента управления'],
  ['olive', 'surface', UI, 'граница элемента управления в карточке'],
  ['alert', 'surface', UI, 'граница аварийного сценария'],
  ['ink', 'bg', UI, 'контур фокуса'],
  ['ink', 'surface', UI, 'контур фокуса в карточке'],
  ['mid', 'pale', UI, 'метка текущего пункта меню'],
  ['deep', 'bg', UI, 'знак: круг на фоне шапки'],
  ['mint', 'deep', UI, 'знак: дерево на круге'],
];

/** Пары тёмных поверхностей (подвал, панель первого экрана) — только светлый набор. */
const DEEP_SURFACE = [
  ['bg', 'deep', TEXT, 'текст и ссылки подвала, заголовок панели'],
  ['mint', 'deep', TEXT, 'ссылка подвала при наведении'],
  ['sand', 'deep', TEXT, 'подпись-часы и примечание подвала'],
  ['bg', 'deep', UI, 'контур фокуса на тёмной поверхности'],
  ['mint', 'deep', UI, 'граница и иконка телефона в подвале'],
];

/** Значения `--c-*: #RRGGBB` из куска CSS. */
function readColors(block) {
  const out = {};
  for (const m of block.matchAll(/--c-([a-z-]+):\s*(#[0-9A-Fa-f]{6})\b/g)) out[m[1]] = m[2];
  return out;
}

/** Тело блока `{ … }`, начинающегося после `start`, с учётом вложенных скобок. */
function blockAfter(css, start) {
  const at = css.indexOf(start);
  if (at < 0) return null;
  let i = css.indexOf('{', at);
  const from = i + 1;
  for (let depth = 1; depth > 0;) {
    i += 1;
    if (i >= css.length) return null;
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') depth -= 1;
  }
  return css.slice(from, i);
}

function luminance(hex) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const css = (await readFile(TOKENS, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
const lightBlock = blockAfter(css, ':root,');
const darkBlock = blockAfter(css, '@media screen and (prefers-color-scheme: dark)');
if (!lightBlock || !darkBlock) {
  console.error(`contrast:check: в ${TOKENS} не найден светлый или тёмный блок цветов`);
  process.exit(1);
}
const light = readColors(lightBlock);
const dark = { ...light, ...readColors(darkBlock) };

let failed = 0;
const check = (setName, set, pairs) => {
  for (const [fg, bg, min, where] of pairs) {
    if (!set[fg] || !set[bg]) {
      console.error(`✗ ${setName}: нет токена --c-${set[fg] ? bg : fg}`);
      failed += 1;
      continue;
    }
    const r = ratio(set[fg], set[bg]);
    const ok = r >= min;
    if (!ok) failed += 1;
    const line = `${ok ? '✓' : '✗'} ${setName.padEnd(7)} ${r.toFixed(2).padStart(5)}:1 ≥ ${min}  --c-${fg} / --c-${bg} — ${where}`;
    (ok ? console.log : console.error)(line);
  }
};

check('светлая', light, [...PAGE, ...DEEP_SURFACE]);
check('тёмная', dark, PAGE);

if (failed) {
  console.error(`\ncontrast:check: ${failed} пар(ы) ниже порога`);
  process.exit(1);
}
console.log('\ncontrast:check: все пары проходят в обеих темах');
