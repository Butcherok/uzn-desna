/**
 * «Стан системи» (ТЗ 8.6, 9.1 — только владелец; решение 049): работают ли
 * синхронизации и что с сервисом. Только чтение.
 */
import { useCallback, useEffect, useState } from 'react';
import { ErrorBox } from '../components/Status';
import { formatDateTime } from '../domain/kinds';
import {
  countLabel,
  failuresWarning,
  resultText,
  RUN_EVENT,
  RUN_STATE,
  scheduleSilent,
  sinceText,
  sourceLabel,
  type SyncStatus,
  type SystemInfo,
} from '../domain/system';
import { api } from '../gateway/admin-api';
import { useAdmin } from './context';
import { useFailure } from './ListPage';

const NEW_TAB = <span className="visually-hidden"> (відкриється в новій вкладці)</span>;

export function SystemPage() {
  const { onSlow } = useAdmin();
  const failure = useFailure();
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(
    () =>
      Promise.all([api.systemSync({ onSlow }), api.systemInfo({ onSlow })])
        .then(([s, i]) => {
          setSync(s);
          setInfo(i);
          setError(null);
        })
        .catch((err: unknown) => setError(failure(err))),
    [onSlow, failure],
  );

  useEffect(() => {
    void load();
  }, [load, attempt]);

  const silent = sync ? scheduleSilent(sync.runs, new Date()) : null;

  return (
    <>
      <h1>Стан системи</h1>
      <p className="lead">
        Чи оновлюються «Наші закупівлі» та «Новини галузі», і що з сервісом адміністрування.
        Сторінка лише показує стан — нічого не змінює.
      </p>

      {error && <ErrorBox text={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {sync === null && !error && <p>Завантажуємо…</p>}

      {sync && (
        <section aria-labelledby="sys-sources">
          <h2 id="sys-sources">Джерела</h2>
          {!sync.sourcesFresh && (
            <p className="field__error">
              {sync.sources === null
                ? 'Не вдалося дізнатися стан джерел: GitHub не відповів. Спробуйте пізніше.'
                : 'GitHub зараз не відповідає — показано останні відомі дані.'}
            </p>
          )}
          {sync.sources && (
            <ul className="rows">
              {sync.sources.map((s) => {
                const warning = failuresWarning(s);
                return (
                  <li key={s.source} className="row">
                    <div className="row__main">
                      <p className="row__title">{sourceLabel(s.source)}</p>
                      <p className={s.result === 'ok' ? 'row__meta' : 'row__meta sys__bad'}>
                        {resultText(s)}
                      </p>
                      <p className="row__meta">{sinceText(s)}</p>
                      {warning && <p className="sys__warn">{warning}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="row__meta">
            Стан джерела записується, коли він змінюється: з’явився збій або джерело знову
            запрацювало. Час кожного прогону — у списку нижче.
          </p>

          <h2>Останні прогони синхронізації</h2>
          {silent === true && (
            <p className="sys__warn">
              За розкладом прогонів не було понад 30 годин. Дані оновлює запасний щоденний запуск;
              якщо так триває кілька днів — зверніться до розробника.
            </p>
          )}
          {sync.runs === null ? (
            <p>
              {sync.runsFresh
                ? 'Список прогонів недоступний: на сервері немає токена GitHub.'
                : 'Не вдалося отримати список прогонів: GitHub не відповів.'}
            </p>
          ) : sync.runs.length === 0 ? (
            <p>Прогонів ще не було.</p>
          ) : (
            <ul className="rows">
              {sync.runs.map((r) => (
                <li key={r.id} className="row">
                  <div className="row__main">
                    <p className="row__title">
                      {formatDateTime(r.createdAt)} · {RUN_STATE[r.state]}
                    </p>
                    <p className="row__meta">
                      {RUN_EVENT[r.event]} ·{' '}
                      <a href={r.url} target="_blank" rel="noopener noreferrer">
                        Відкрити прогін на GitHub{NEW_TAB}
                      </a>
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {info && (
        <section aria-labelledby="sys-service">
          <h2 id="sys-service">Сервіс</h2>
          <dl className="sys__facts">
            <dt>Версія</dt>
            <dd>{info.version}</dd>
            <dt>Запущено</dt>
            <dd>{formatDateTime(info.startedAt)}</dd>
            <dt>Остання публікація</dt>
            <dd>{info.lastPublishedAt ? formatDateTime(info.lastPublishedAt) : 'ще не було'}</dd>
            <dt>Неопубліковані зміни</dt>
            <dd>{info.pendingChanges}</dd>
          </dl>
          <h3>Записи за розділами</h3>
          <table className="sys__table">
            <thead>
              <tr>
                <th scope="col">Розділ</th>
                <th scope="col">Усього</th>
                <th scope="col">Опубліковано</th>
              </tr>
            </thead>
            <tbody>
              {info.counts.map((c) => (
                <tr key={c.kind}>
                  <th scope="row">{countLabel(c.kind)}</th>
                  <td>{c.total}</td>
                  <td>{c.published}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="row__meta">Записи в «Кошику» не враховано.</p>
        </section>
      )}
    </>
  );
}
