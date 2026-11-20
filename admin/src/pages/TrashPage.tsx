/**
 * «Кошик» (ТЗ 9.4, п. 4; 6.1, п. 7): удалённые записи всех разделов с кнопкой
 * «Відновити». Окончательное удаление — только владельцу (ТЗ 9.1), с
 * подтверждением. Автоочистка через 30 дней — задача 5ж, поэтому срок здесь
 * не обещается.
 */
import { useEffect, useState } from 'react';
import { ErrorBox } from '../components/Status';
import { SECTIONS, formatDateTime, titleOf, type Kind, type RecordView } from '../domain/kinds';
import { api } from '../gateway/admin-api';
import { useAdmin } from './context';
import { useFailure } from './ListPage';

interface Trashed {
  kind: Kind;
  label: string;
  record: RecordView;
}

const LIST_SECTIONS = SECTIONS.filter((s) => !s.singleton);

export function TrashPage() {
  const { user, onSlow, setPending, notify } = useAdmin();
  const failure = useFailure();
  const [items, setItems] = useState<Trashed[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    Promise.all(
      LIST_SECTIONS.map((s) =>
        api
          .list(s.kind, true, { onSlow })
          .then((r) => r.items.map((record) => ({ kind: s.kind, label: s.label, record }))),
      ),
    )
      .then((groups) => {
        if (!alive) return;
        const all = groups.flat();
        all.sort(
          (a, b) => Date.parse(b.record.deletedAt ?? '') - Date.parse(a.record.deletedAt ?? ''),
        );
        setItems(all);
      })
      .catch((err: unknown) => alive && setError(failure(err)));
    return () => {
      alive = false;
    };
  }, [onSlow, failure, attempt]);

  const drop = (t: Trashed) =>
    setItems((list) => list?.filter((x) => x.record.id !== t.record.id) ?? null);

  const act = async (t: Trashed, permanent: boolean) => {
    if (busy) return;
    const title = titleOf(t.kind, t.record.data) || 'запис';
    if (
      permanent &&
      !window.confirm(`Видалити «${title}» назавжди? Відновити його буде неможливо.`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = permanent
        ? await api.purge(t.kind, t.record.id, { onSlow })
        : await api.restore(t.kind, t.record.id, { onSlow });
      setPending(res.pendingChanges);
      drop(t);
      notify({
        text: permanent
          ? `«${title}» видалено назавжди.`
          : `«${title}» відновлено в розділі «${t.label}».`,
      });
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Кошик</h1>
      <p className="lead">Видалені записи. Помилково видалене можна відновити.</p>
      {error && <ErrorBox text={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {items === null && !error && <p>Завантажуємо…</p>}
      {items?.length === 0 && <p>Кошик порожній.</p>}
      <ul className="rows" aria-busy={busy}>
        {(items ?? []).map((t) => {
          const title = titleOf(t.kind, t.record.data) || 'Без назви';
          return (
            <li key={t.record.id} className="row">
              <div className="row__main">
                <p className="row__title">{title}</p>
                <p className="row__meta">
                  {t.label} · видалено {formatDateTime(t.record.deletedAt)}
                </p>
              </div>
              <div className="row__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--inline"
                  disabled={busy}
                  onClick={() => void act(t, false)}
                >
                  Відновити<span className="visually-hidden">: {title}</span>
                </button>
                {user.role === 'owner' && (
                  <button
                    type="button"
                    className="btn btn--quiet btn--inline btn--danger"
                    disabled={busy}
                    onClick={() => void act(t, true)}
                  >
                    Видалити назавжди<span className="visually-hidden">: {title}</span>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
