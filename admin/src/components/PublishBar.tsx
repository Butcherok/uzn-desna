/**
 * Полоса публикации внизу экрана (ТЗ 8.5, п. 6; ТЗ 9.3; решения 040, 041):
 * число неопубликованных правок, время последней публикации, кнопка
 * «Опублікувати зміни» и ход прогона. Если публикация не запущена из-за
 * записей с ошибками — перечень со ссылками на эти записи.
 */
import type { AnchorHTMLAttributes } from 'react';
import { formatDateTime } from '../domain/kinds';
import { barView, type PublishProblem, type PublishStatus } from '../domain/publish';
import { pluralChanges } from '../domain/text';

type LinkProps = Pick<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>;

interface Props {
  status: PublishStatus | null;
  busy: boolean;
  /** Ответ на нажатие: ошибка запуска или «зміни з'являться…». */
  message: { text: string; error: boolean } | null;
  problems: PublishProblem[];
  /** Ссылка на прогон в GitHub — только владельцу (ТЗ 8.5: «ссылка на прогон»). */
  showRunLink: boolean;
  onPublish: () => void;
  onCloseProblems: () => void;
  /** Ссылка на форму записи; `null` — раздела в админке нет. */
  problemLink: (p: PublishProblem) => LinkProps | null;
}

export function PublishBar({
  status,
  busy,
  message,
  problems,
  showRunLink,
  onPublish,
  onCloseProblems,
  problemLink,
}: Props) {
  const view = barView(status, pluralChanges);
  const run = status?.run ?? null;
  // Перечень сам говорит, что публикация остановлена: строку не повторяем.
  const shown = problems.length > 0 ? null : message;
  const tone = shown?.error ? 'error' : view.tone;
  return (
    <aside className={`publish publish--${tone}`} aria-label="Стан публікації">
      {problems.length > 0 && (
        <div className="publish__problems" role="alert">
          <p className="publish__line">
            <strong>Публікацію зупинено.</strong> Виправте записи:
          </p>
          <ul>
            {problems.map((p) => {
              const link = problemLink(p);
              const name = `${p.label}: ${p.title}`;
              return (
                <li key={`${p.kind}:${p.id ?? ''}`}>
                  {link ? <a {...link}>{name}</a> : name} — {p.message}
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn btn--ghost btn--inline" onClick={onCloseProblems}>
            Сховати перелік
          </button>
        </div>
      )}
      <div className="publish__state" role="status" aria-live="polite">
        <p className="publish__line">
          {busy ? 'Запускаємо публікацію…' : (shown?.text ?? view.text)}
        </p>
        <p className="publish__line publish__muted">
          Остання публікація: {formatDateTime(status?.lastPublishedAt ?? null)}
          {showRunLink && run?.runUrl ? (
            <>
              {' · '}
              <a href={run.runUrl} target="_blank" rel="noopener noreferrer">
                Хід публікації на GitHub
              </a>
            </>
          ) : null}
        </p>
      </div>
      {view.showButton && (
        <button
          type="button"
          className="btn btn--inline publish__button"
          onClick={onPublish}
          disabled={busy}
          aria-disabled={busy}
        >
          Опублікувати зміни
        </button>
      )}
    </aside>
  );
}
