/**
 * Многострочное поле с разметкой (ТЗ 9.8, п. 1; решение 047): три кнопки над
 * полем вставляют знаки разметки в текст. Визуального редактора нет: в поле
 * виден сам текст со знаками, а вид показывает образец — карточка справа или,
 * в разделах без карточки, образец под полем.
 *
 * Ctrl+B — полужирный, Ctrl+K — ссылка, как в привычных редакторах.
 */
import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { RichText } from '../../../site/src/components/cards/RichText';
import { applyRich, hasRichMarkup, type RichAction } from '../domain/rich-edit';
import { SiteFrame } from './Preview';

export const RICH_HINT =
  'Оформлення: **жирний**, [текст](https://адреса) — посилання, «- » на початку рядка — пункт списку. Адреси посилань: https://, http://, tel: або mailto:.';

const BUTTONS: readonly { action: RichAction; label: string; title: string }[] = [
  { action: 'bold', label: 'Жирний', title: 'Жирний (Ctrl+B)' },
  { action: 'link', label: 'Посилання', title: 'Посилання (Ctrl+K)' },
  { action: 'list', label: 'Список', title: 'Пункт списку' },
];

export interface RichFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  lang: 'uk' | 'en';
  fieldLabel: string;
  ariaInvalid?: boolean | undefined;
  ariaDescribedBy?: string | undefined;
  ariaRequired?: boolean | undefined;
}

export function RichField(p: RichFieldProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const sel = pending.current;
    if (!el || !sel) return;
    pending.current = null;
    el.focus();
    el.setSelectionRange(sel.start, sel.end);
  });

  const run = (action: RichAction) => {
    const el = ref.current;
    if (!el) return;
    const next = applyRich(action, {
      value: p.value,
      start: el.selectionStart,
      end: el.selectionEnd,
    });
    if (next.value.length > p.maxLength) return;
    pending.current = { start: next.start, end: next.end };
    p.onChange(next.value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const key = e.key.toLowerCase();
    const action = key === 'b' || key === 'и' ? 'bold' : key === 'k' || key === 'л' ? 'link' : null;
    if (!action) return;
    e.preventDefault();
    run(action);
  };

  return (
    <>
      <div className="rich__bar" role="group" aria-label={`Оформлення: ${p.fieldLabel}`}>
        {BUTTONS.map((b) => (
          <button
            key={b.action}
            type="button"
            className={`btn btn--ghost btn--inline rich__btn rich__btn--${b.action}`}
            title={b.title}
            aria-controls={p.id}
            onClick={() => run(b.action)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        id={p.id}
        rows={6}
        lang={p.lang}
        value={p.value}
        maxLength={p.maxLength}
        aria-invalid={p.ariaInvalid}
        aria-describedby={p.ariaDescribedBy}
        aria-required={p.ariaRequired}
        onChange={(e) => p.onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </>
  );
}

/**
 * Образец под полем — в разделах без карточки предпросмотра («Підприємство»,
 * «Тексти сторінок»), и только когда в тексте есть разметка.
 */
export function RichPreview({ text, lang }: { text: string; lang: 'uk' | 'en' }) {
  if (!hasRichMarkup(text)) return null;
  return (
    <div className="rich__preview">
      <p className="rich__preview-title">Так виглядатиме на сайті</p>
      <SiteFrame off={false}>
        <div lang={lang}>
          <RichText text={text} />
        </div>
      </SiteFrame>
    </div>
  );
}
