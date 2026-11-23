/**
 * Разметка текста в полях (ТЗ 9.8, п. 1 и 2; решение 047).
 *
 * Закрытый набор: полужирный `**текст**`, ссылка `[текст](адреса)` и
 * маркированный список одного уровня — строка начинается с `- ` (или с `• `:
 * так приходит список, вставленный из Word). Хранится сама разметка, а не
 * готовый HTML: редактор правит текст, а вид задаёт дизайн-система.
 *
 * Разбор не падает: незакрытые `**`, скобки без адреса и ссылка с запрещённым
 * началом адреса остаются обычным текстом. Отказ при сохранении даёт
 * `richTextProblems` — по нему схема `richLangText` и форма админки.
 */

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type Block = { type: 'p'; children: Inline[] } | { type: 'ul'; items: Inline[][] };

const LIST_ITEM = /^[-•]\s+/u;
const LINK = /^\[([^\]\n]+)\]\(([^()\s]+)\)/u;

/** Разрешённые начала адреса (ТЗ 9.8, п. 2). */
const HREF_OK = [
  /^https?:\/\/[^\s/?#]+\.[^\s]+$/iu,
  /^tel:\+?\d[\d-]{4,19}$/iu,
  /^mailto:[^\s@/]+@[^\s@/]+\.[^\s@/]+$/iu,
];

export function isAllowedHref(href: string): boolean {
  return HREF_OK.some((re) => re.test(href));
}

function pushText(out: Inline[], value: string): void {
  if (!value) return;
  const last = out[out.length - 1];
  if (last?.type === 'text') last.value += value;
  else out.push({ type: 'text', value });
}

/**
 * Строка → узлы. Полужирный внутри себя допускает ссылку, ссылка — полужирный;
 * полужирный в полужирном и ссылка в ссылке не разбираются.
 */
function parseInline(s: string, bold = true, link = true): Inline[] {
  const out: Inline[] = [];
  let i = 0;
  let plainFrom = 0;
  while (i < s.length) {
    if (bold && s.startsWith('**', i)) {
      const close = s.indexOf('**', i + 2);
      if (close > i + 2 && s.slice(i + 2, close).trim()) {
        pushText(out, s.slice(plainFrom, i));
        out.push({ type: 'bold', children: parseInline(s.slice(i + 2, close), false, link) });
        i = close + 2;
        plainFrom = i;
        continue;
      }
    }
    if (link && s[i] === '[') {
      const m = LINK.exec(s.slice(i));
      if (m && isAllowedHref(m[2] as string) && (m[1] as string).trim()) {
        pushText(out, s.slice(plainFrom, i));
        out.push({
          type: 'link',
          href: m[2] as string,
          children: parseInline(m[1] as string, bold, false),
        });
        i += m[0].length;
        plainFrom = i;
        continue;
      }
    }
    i += 1;
  }
  pushText(out, s.slice(plainFrom));
  return out;
}

/**
 * Текст → блоки. Абзац — непустая строка, как и до разметки (`paragraphs`):
 * текст без разметки разбирается в те же абзацы, что раньше.
 */
export function parseRichText(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const item = LIST_ITEM.exec(line);
    if (item && line.length > item[0].length) {
      const inline = parseInline(line.slice(item[0].length));
      const last = blocks[blocks.length - 1];
      if (last?.type === 'ul') last.items.push(inline);
      else blocks.push({ type: 'ul', items: [inline] });
      continue;
    }
    blocks.push({ type: 'p', children: parseInline(line) });
  }
  return blocks;
}

/** Текст без знаков разметки — для мест, где нужна одна строка. */
export function richPlainText(text: string): string {
  const flat = (nodes: Inline[]): string =>
    nodes.map((n) => (n.type === 'text' ? n.value : flat(n.children))).join('');
  return parseRichText(text)
    .map((b) => (b.type === 'p' ? flat(b.children) : b.items.map(flat).join('; ')))
    .join(' ');
}

const HREF_HINT = 'адреса має починатися з https://, http://, tel: або mailto:';

/**
 * Ссылки, которые не будут ссылками: начало адреса вне ТЗ 9.8, п. 2 или адрес
 * неполный. Тексты — по-украински, для формы (ТЗ 9.4, п. 2).
 */
export function richTextProblems(text: string): string[] {
  const problems: string[] = [];
  const re = /\[([^\]\n]+)\]\(([^)\n]*)\)/gu;
  for (const m of text.matchAll(re)) {
    const label = (m[1] as string).trim();
    const href = (m[2] as string).trim();
    if (!href) problems.push(`Посилання «${label}» без адреси`);
    else if (/\s/u.test(href)) problems.push(`Посилання «${label}»: в адресі не має бути пробілів`);
    else if (!isAllowedHref(href)) problems.push(`Посилання «${label}»: ${HREF_HINT}`);
  }
  return problems;
}
