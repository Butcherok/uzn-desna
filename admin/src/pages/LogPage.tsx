/**
 * «Журнал дій» (ТЗ 9.7; 9.1 — только владелец): новые записи первыми, по
 * 50 на странице, фильтр по пользователю и датам. Журнал только читается:
 * ни правки, ни чистки из интерфейса нет.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { ErrorBox } from '../components/Status';
import { formatDateTime, sectionOf } from '../domain/kinds';
import {
  NO_USER,
  RESULT_LABEL,
  actionLabel,
  detailsText,
  entityLabel,
  filterQuery,
  subjectOf,
  type LogFilter,
  type LogPage as Page,
} from '../domain/log';
import { api } from '../gateway/admin-api';
import { ApiRequestError } from '../gateway/api';
import { linkProps } from '../gateway/router';
import { useAdmin } from './context';
import { useFailure } from './ListPage';

const EMPTY: LogFilter = { user: '', from: '', to: '' };

export function LogPage() {
  const { onSlow } = useAdmin();
  const failure = useFailure();
  const [draft, setDraft] = useState<LogFilter>(EMPTY);
  const [filter, setFilter] = useState<LogFilter>(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api
      .log(filterQuery(filter, page), { onSlow })
      .then((r) => {
        if (!alive) return;
        setData(r);
        setFieldErrors({});
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setFieldErrors(err instanceof ApiRequestError ? err.failure.fields : {});
        setError(failure(err));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [filter, page, onSlow, failure, attempt]);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    setFilter(draft);
  };

  const reset = () => {
    setDraft(EMPTY);
    setPage(1);
    setFilter(EMPTY);
  };

  const filtered = filter.user !== '' || filter.from !== '' || filter.to !== '';

  return (
    <>
      <h1>Журнал дій</h1>
      <p className="lead">
        Хто, що й коли зробив в адмініструванні. Записи не редагуються й не видаляються; старші за
        180 днів зникають автоматично.
      </p>

      <form className="log-filter" onSubmit={apply} noValidate>
        <div className="field">
          <label className="field__label" htmlFor="log-user">
            Користувач
          </label>
          <select
            id="log-user"
            value={draft.user}
            onChange={(e) => setDraft({ ...draft, user: e.target.value })}
          >
            <option value="">Усі</option>
            {(data?.users ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
            <option value={NO_USER}>Без користувача (невідомий логін, система)</option>
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="log-from">
            З дати
          </label>
          <input
            id="log-from"
            type="date"
            value={draft.from}
            aria-invalid={fieldErrors['from'] ? true : undefined}
            aria-describedby={fieldErrors['from'] ? 'log-from-err' : undefined}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          />
          {fieldErrors['from'] && (
            <p className="field__error" id="log-from-err">
              {fieldErrors['from']}
            </p>
          )}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="log-to">
            По дату
          </label>
          <input
            id="log-to"
            type="date"
            value={draft.to}
            aria-invalid={fieldErrors['to'] ? true : undefined}
            aria-describedby={fieldErrors['to'] ? 'log-to-err' : undefined}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          />
          {fieldErrors['to'] && (
            <p className="field__error" id="log-to-err">
              {fieldErrors['to']}
            </p>
          )}
        </div>
        <div className="log-filter__actions">
          <button type="submit" className="btn btn--inline">
            Показати
          </button>
          {filtered && (
            <button type="button" className="btn btn--ghost btn--inline" onClick={reset}>
              Скинути фільтр
            </button>
          )}
        </div>
      </form>

      {error && (
        <ErrorBox
          text={error}
          // Неверные даты повтором не исправить: ошибка показана у поля.
          {...(Object.keys(fieldErrors).length > 0
            ? {}
            : { onRetry: () => setAttempt((a) => a + 1) })}
        />
      )}
      {data === null && !error && <p>Завантажуємо…</p>}
      {data && (
        <p className="row__meta" role="status">
          {data.total === 0
            ? filtered
              ? 'За цим фільтром записів немає.'
              : 'Записів ще немає.'
            : `Записів: ${data.total}. Сторінка ${data.page} з ${data.pages}.`}
        </p>
      )}

      <ul className="rows" aria-busy={loading}>
        {(data?.items ?? []).map((e) => {
          const subject = subjectOf(e);
          const section = e.entity ? sectionOf(e.entity) : undefined;
          const canOpen =
            section !== undefined &&
            e.entityId !== null &&
            e.action !== 'content.purge' &&
            (section.singleton || /^[0-9a-f]{24}$/u.test(e.entityId));
          const details = detailsText(e.details);
          return (
            <li key={e.id} className="row">
              <div className="row__main">
                <p className="row__title">
                  {actionLabel(e)}
                  {e.result !== 'ok' && (
                    <span className="badge badge--draft log__result">{RESULT_LABEL[e.result]}</span>
                  )}
                </p>
                <p className="row__meta">
                  {formatDateTime(e.at)} · {e.user?.name ?? 'Без користувача'}
                </p>
                {(e.entity !== null || subject !== null) && (
                  <p className="row__meta">
                    {entityLabel(e.entity)}
                    {subject !== null && (
                      <>
                        {e.entity !== null && ': '}
                        {canOpen && section ? (
                          <a
                            {...linkProps({
                              page: 'edit',
                              kind: section.kind,
                              id: section.singleton ? null : e.entityId,
                            })}
                          >
                            {subject}
                          </a>
                        ) : (
                          subject
                        )}
                      </>
                    )}
                  </p>
                )}
                {details !== '' && <p className="row__meta">{details}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      {data && data.pages > 1 && (
        <nav className="pager" aria-label="Сторінки журналу">
          <button
            type="button"
            className="btn btn--ghost btn--inline"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Новіші
          </button>
          <span>
            {data.page} / {data.pages}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--inline"
            disabled={page >= data.pages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Старіші
          </button>
        </nav>
      )}
    </>
  );
}
