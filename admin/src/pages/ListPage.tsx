/**
 * Список записей раздела (ТЗ 9.3): название, состояние, дата изменения,
 * «Редагувати» и «Приховати» / «Показати на сайті», порядок кнопками.
 * Снятие с публикации — с подтверждением (ТЗ 9.4, п. 3).
 */
import { useCallback, useEffect, useState } from 'react';
import { ErrorBox, StatusBadge } from '../components/Status';
import { freeBlockKeys } from '../domain/forms';
import { formatDateTime, sectionOf, titleOf, type Kind, type RecordView } from '../domain/kinds';
import { api } from '../gateway/admin-api';
import { ApiRequestError } from '../gateway/api';
import { linkProps, navigate } from '../gateway/router';
import { useAdmin } from './context';

export function useFailure() {
  const { signedOut } = useAdmin();
  return useCallback(
    (err: unknown): string => {
      if (err instanceof ApiRequestError && err.failure.status === 401) {
        signedOut();
        return err.message;
      }
      return err instanceof Error ? err.message : 'Щось пішло не так. Спробуйте ще раз';
    },
    [signedOut],
  );
}

export function ListPage({ kind }: { kind: Kind }) {
  const section = sectionOf(kind);
  const { onSlow, setPending, notify } = useAdmin();
  const failure = useFailure();
  const [items, setItems] = useState<RecordView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDrafts, setShowDrafts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (section?.singleton) {
      navigate({ page: 'edit', kind, id: null }, { replace: true, force: true });
      return;
    }
    let alive = true;
    setLoadError(null);
    api
      .list(kind, false, { onSlow })
      .then((r) => {
        if (!alive) return;
        setItems(r.items);
        setPending(r.pendingChanges);
      })
      .catch((err: unknown) => alive && setLoadError(failure(err)));
    return () => {
      alive = false;
    };
  }, [kind, section, onSlow, setPending, failure, attempt]);

  if (!section || section.singleton) return null;

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(failure(err));
    } finally {
      setBusy(false);
    }
  };

  const replace = (item: RecordView) =>
    setItems((list) => list?.map((x) => (x.id === item.id ? item : x)) ?? null);

  const setStatus = (r: RecordView, status: 'draft' | 'published') =>
    run(async () => {
      const title = titleOf(kind, r.data);
      if (
        status === 'draft' &&
        !window.confirm(
          `Приховати «${title}»? Запис стане чернеткою і зникне з сайту після публікації змін.`,
        )
      ) {
        return;
      }
      const res = await api.setStatus(kind, r.id, status, { onSlow });
      replace(res.item);
      setPending(res.pendingChanges);
      notify({
        text: status === 'draft' ? `«${title}» приховано.` : `«${title}» буде показано на сайті.`,
      });
    });

  const move = (index: number, delta: -1 | 1) =>
    run(async () => {
      if (!items) return;
      const ids = items.map((x) => x.id);
      const target = index + delta;
      if (target < 0 || target >= ids.length) return;
      [ids[index], ids[target]] = [ids[target] as string, ids[index] as string];
      const res = await api.reorder(kind, ids, { onSlow });
      setItems(res.items);
      setPending(res.pendingChanges);
      notify({ text: 'Порядок змінено.' });
    });

  const canAdd =
    section.creatable &&
    (kind !== 'static-blocks' ||
      freeBlockKeys((items ?? []).map((x) => String(x.data['blockKey']))).length > 0);
  const shown = (items ?? []).filter((x) => showDrafts || x.status === 'published');

  return (
    <>
      <h1>{section.label}</h1>
      <p className="lead">{section.where}</p>

      <div className="toolbar">
        {canAdd && (
          <a className="btn btn--inline" {...linkProps({ page: 'new', kind })}>
            {section.addLabel}
          </a>
        )}
        <div className="field field--check field--inline">
          <input
            id="show-drafts"
            type="checkbox"
            checked={showDrafts}
            onChange={(e) => setShowDrafts(e.target.checked)}
          />
          <label htmlFor="show-drafts">Показати чернетки</label>
        </div>
      </div>

      {loadError && <ErrorBox text={loadError} onRetry={() => setAttempt((a) => a + 1)} />}
      {actionError && <ErrorBox text={actionError} />}
      {items === null && !loadError && <p>Завантажуємо…</p>}
      {items !== null && shown.length === 0 && (
        <p>{items.length === 0 ? 'Записів ще немає.' : 'Опублікованих записів немає.'}</p>
      )}

      <ul className="rows" aria-busy={busy}>
        {shown.map((r) => {
          const index = (items ?? []).findIndex((x) => x.id === r.id);
          const title = titleOf(kind, r.data) || 'Без назви';
          return (
            <li key={r.id} className="row">
              <div className="row__main">
                <a className="row__title" {...linkProps({ page: 'edit', kind, id: r.id })}>
                  {title}
                </a>
                <p className="row__meta">
                  <StatusBadge status={r.status} /> Змінено {formatDateTime(r.updatedAt)}
                </p>
              </div>
              <div className="row__actions">
                <a
                  className="btn btn--ghost btn--inline"
                  {...linkProps({ page: 'edit', kind, id: r.id })}
                >
                  Редагувати<span className="visually-hidden">: {title}</span>
                </a>
                {r.status === 'published' ? (
                  <button
                    type="button"
                    className="btn btn--ghost btn--inline"
                    disabled={busy}
                    onClick={() => void setStatus(r, 'draft')}
                  >
                    Приховати<span className="visually-hidden">: {title}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn--ghost btn--inline"
                    disabled={busy}
                    onClick={() => void setStatus(r, 'published')}
                  >
                    Показати на сайті<span className="visually-hidden">: {title}</span>
                  </button>
                )}
                {section.ordered && (
                  <>
                    <button
                      type="button"
                      className="btn btn--quiet btn--icon"
                      disabled={busy || index <= 0}
                      onClick={() => void move(index, -1)}
                      aria-label={`Вище: ${title}`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn--quiet btn--icon"
                      disabled={busy || index >= (items ?? []).length - 1}
                      onClick={() => void move(index, 1)}
                      aria-label={`Нижче: ${title}`}
                    >
                      ↓
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
