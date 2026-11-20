/**
 * Полоса публикации внизу экрана (ТЗ 9.3; решение 040). До задачи 5д —
 * без кнопки: число неопубликованных правок и время последней публикации.
 */
import { formatDateTime } from '../domain/kinds';
import { pluralChanges } from '../domain/text';

interface Props {
  pending: number | null;
  lastPublishedAt: string | null;
}

export function PublishBar({ pending, lastPublishedAt }: Props) {
  return (
    <aside className="publish" aria-label="Стан публікації">
      <p className="publish__line">
        {pending === null ? (
          'Стан публікації завантажується…'
        ) : pending === 0 ? (
          'Усі зміни опубліковано.'
        ) : (
          <>
            Не опубліковано: <strong>{pluralChanges(pending)}</strong> — на сайті ще не видно.
          </>
        )}
      </p>
      <p className="publish__line publish__muted">
        Остання публікація: {formatDateTime(lastPublishedAt)}
      </p>
    </aside>
  );
}
