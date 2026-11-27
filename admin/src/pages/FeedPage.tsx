/**
 * «Стрічка новин» (ТЗ 9.5; 9.1; решение 043): карточки ленты, которые пишет
 * синхронизация. Редактор только скрывает и возвращает карточку; текст
 * чужой публикации здесь не правится. Скрытие сразу предлагает публикацию:
 * счётчик в полосе внизу растёт, сообщение говорит, куда нажать (ТЗ 8.5).
 */
import { useEffect, useState } from 'react';
import { ErrorBox } from '../components/Status';
import {
  FEED_HINT,
  FEED_PLACE_HINT,
  LANG_LABEL,
  placeLabel,
  applyHidden,
  formatDay,
  hiddenNotice,
  shownNotice,
  type FeedList,
  type FeedItemView,
} from '../domain/feed';
import { formatDateTime } from '../domain/kinds';
import { api } from '../gateway/admin-api';
import { useAdmin } from './context';
import { useFailure } from './ListPage';

export function FeedPage() {
  const { onSlow, notify, setPending } = useAdmin();
  const failure = useFailure();
  const [list, setList] = useState<FeedList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .feed({ onSlow })
      .then((r) => {
        if (!alive) return;
        setList(r);
        setPending(r.pendingChanges);
      })
      .catch((err: unknown) => alive && setError(failure(err)));
    return () => {
      alive = false;
    };
  }, [onSlow, failure, attempt, setPending]);

  const decide = async (card: FeedItemView, hidden: boolean, withUndo = true): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.setFeedHidden(card.urlKey, hidden, { onSlow });
      setPending(res.pendingChanges);
      setList((l) =>
        l
          ? { ...l, items: applyHidden(l.items, card.urlKey, hidden, new Date().toISOString()) }
          : l,
      );
      notify({
        text: hidden ? hiddenNotice(card.title) : shownNotice(card.title),
        ...(withUndo
          ? {
              undo: {
                label: hidden ? 'Повернути' : 'Приховати знову',
                run: () => void decide(card, !hidden, false),
              },
            }
          : {}),
      });
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  };

  const items = list?.items ?? [];
  const hiddenCount = items.filter((i) => i.hidden).length;

  return (
    <>
      <h1>Стрічка новин</h1>
      <p className="lead">{FEED_HINT}</p>
      {error && <ErrorBox text={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {list === null && !error && <p>Завантажуємо…</p>}
      {list?.state === 'unknown' && (
        <ErrorBox
          text={
            items.length > 0
              ? 'Не вдалося оновити стрічку. Показано останню завантажену копію'
              : 'Не вдалося завантажити стрічку. Спробуйте пізніше'
          }
          onRetry={() => setAttempt((a) => a + 1)}
        />
      )}
      {list?.state === 'empty' && <p>У стрічці ще немає публікацій.</p>}
      {items.length > 0 && (
        <p className="row__meta">
          {FEED_PLACE_HINT} Карток: {items.length}, приховано: {hiddenCount}.
        </p>
      )}
      <ul className="rows" aria-busy={busy}>
        {items.map((card) => (
          <li key={card.urlKey} className="row">
            <div className="row__main">
              <p className="row__title">
                <a href={card.url} target="_blank" rel="noopener noreferrer">
                  {card.title}
                  <span className="visually-hidden"> (відкриється в новій вкладці)</span>
                </a>
              </p>
              <p className="row__meta">
                {card.sourceName} · {formatDay(card.publishedAt)}
                {card.lang !== 'uk' && ` · ${LANG_LABEL[card.lang]}`}
              </p>
              <p className="row__meta">
                {card.hidden ? (
                  <>
                    <span className="badge badge--draft">Приховано</span>
                    {formatDateTime(card.hiddenAt)}
                  </>
                ) : (
                  card.place && placeLabel(card.place, card.page)
                )}
              </p>
            </div>
            <div className="row__actions">
              <button
                type="button"
                className="btn btn--quiet btn--inline"
                disabled={busy}
                onClick={() => void decide(card, !card.hidden)}
              >
                {card.hidden ? 'Повернути' : 'Приховати'}
                <span className="visually-hidden">: {card.title}</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
