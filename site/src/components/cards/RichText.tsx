/**
 * Текст поля с разметкой (ТЗ 9.8, п. 1; решение 047): абзацы, маркированный
 * список, полужирный, ссылки. Разбор — `parseRichText` из `shared`; здесь
 * только вывод теми же элементами, что задаёт дизайн-система.
 *
 * Ссылка на почту выводится числовыми HTML-сущностями (решение 008): в
 * исходном коде страницы нет открытого `mailto:`. React экранировал бы
 * амперсанды сущностей, поэтому такая ссылка вставляется готовой разметкой —
 * она целиком из сущностей, текст записи в неё не попадает как HTML.
 */
import { Fragment, type ReactNode } from 'react';
import { encodeHtmlEntities, parseRichText, type RichInline } from '@uzn/shared';

function inlineHtml(nodes: RichInline[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'text') return encodeHtmlEntities(n.value);
      if (n.type === 'bold') return `<strong>${inlineHtml(n.children)}</strong>`;
      return inlineHtml(n.children);
    })
    .join('');
}

function Inlines({ nodes }: { nodes: RichInline[] }): ReactNode {
  return nodes.map((n, i) => {
    if (n.type === 'text') return <Fragment key={i}>{n.value}</Fragment>;
    if (n.type === 'bold') {
      return (
        <strong key={i}>
          <Inlines nodes={n.children} />
        </strong>
      );
    }
    if (/^mailto:/iu.test(n.href)) {
      const html = `<a href="${encodeHtmlEntities(n.href)}">${inlineHtml(n.children)}</a>`;
      return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
    }
    return (
      <a key={i} href={n.href}>
        <Inlines nodes={n.children} />
      </a>
    );
  });
}

export interface RichTextProps {
  text: string;
  /** Класс абзацев и списков. */
  className?: string | undefined;
  /** Класс первого абзаца, если он отличается («Про підприємство»: `lead`). */
  firstClassName?: string | undefined;
}

export function RichText({ text, className, firstClassName }: RichTextProps) {
  return parseRichText(text).map((block, i) => {
    const cls = i === 0 && firstClassName !== undefined ? firstClassName : className;
    if (block.type === 'p') {
      return (
        <p key={i} className={cls || undefined}>
          <Inlines nodes={block.children} />
        </p>
      );
    }
    return (
      <ul key={i} className={cls || undefined}>
        {block.items.map((item, j) => (
          <li key={j}>
            <Inlines nodes={item} />
          </li>
        ))}
      </ul>
    );
  });
}
