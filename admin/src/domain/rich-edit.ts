/**
 * Кнопки разметки над полем (решение 047): вставляют знаки в текст, ничего не
 * хранят сами. Чистые функции: значение и выделение → новое значение и
 * выделение, которое ставится в поле после вставки.
 */
export type RichAction = 'bold' | 'link' | 'list';

export interface Edit {
  value: string;
  start: number;
  end: number;
}

const BOLD_HOLDER = 'текст';
const LINK_HOLDER = 'текст посилання';
const URL_HOLDER = 'https://';

export function applyRich(action: RichAction, e: Edit): Edit {
  const { value, start, end } = e;
  const before = value.slice(0, start);
  const sel = value.slice(start, end);
  const after = value.slice(end);
  switch (action) {
    case 'bold': {
      // Повторное нажатие на уже выделенный полужирный снимает его.
      if (sel.length > 4 && sel.startsWith('**') && sel.endsWith('**')) {
        const inner = sel.slice(2, -2);
        return { value: before + inner + after, start, end: start + inner.length };
      }
      if (before.endsWith('**') && after.startsWith('**') && sel) {
        return {
          value: before.slice(0, -2) + sel + after.slice(2),
          start: start - 2,
          end: end - 2,
        };
      }
      const inner = sel || BOLD_HOLDER;
      return {
        value: `${before}**${inner}**${after}`,
        start: start + 2,
        end: start + 2 + inner.length,
      };
    }
    case 'link': {
      // Выделен адрес — он становится адресом, текст ссылки выделяется для ввода.
      if (/^(https?:\/\/|tel:|mailto:)\S+$/iu.test(sel)) {
        return {
          value: `${before}[${LINK_HOLDER}](${sel})${after}`,
          start: start + 1,
          end: start + 1 + LINK_HOLDER.length,
        };
      }
      const label = sel || LINK_HOLDER;
      const urlAt = start + label.length + 3;
      return {
        value: `${before}[${label}](${URL_HOLDER})${after}`,
        start: sel ? urlAt : start + 1,
        end: sel ? urlAt + URL_HOLDER.length : start + 1 + label.length,
      };
    }
    case 'list': {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      // Выделение до конца строки вместе с переводом строки не задевает следующую.
      const last = end > start && value[end - 1] === '\n' ? end - 1 : end;
      const nl = value.indexOf('\n', last);
      const lineEnd = nl === -1 ? value.length : nl;
      const lines = value.slice(lineStart, lineEnd).split('\n');
      const marked = lines.every((l) => /^\s*[-•]\s/u.test(l) || !l.trim());
      const next = lines.map((l) => {
        if (!l.trim()) return l;
        return marked ? l.replace(/^\s*[-•]\s+/u, '') : `- ${l.trimStart()}`;
      });
      const block = next.join('\n');
      const out = value.slice(0, lineStart) + block + value.slice(lineEnd);
      return { value: out, start: lineStart, end: lineStart + block.length };
    }
  }
}

/** Есть ли в тексте разметка — тогда под полем без карточки показывается образец. */
export function hasRichMarkup(text: string): boolean {
  return /\*\*\S|\[[^\]\n]+\]\(|^\s*[-•]\s/mu.test(text);
}
