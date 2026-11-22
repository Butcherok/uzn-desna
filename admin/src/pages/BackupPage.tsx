/**
 * «Резервні копії» (ТЗ 9.6; 9.1 — только владелец; решение 045). Копию
 * делает рабочий процесс `backup` — 1-го числа ночью и по этой кнопке.
 * Файл зашифрован ключом владельца; скачивается со страницы прогона.
 */
import { useCallback, useEffect, useState } from 'react';
import { ErrorBox } from '../components/Status';
import { BACKUP_POLL_MS, STATE_LABEL, type BackupStatus } from '../domain/backup';
import { formatDateTime } from '../domain/kinds';
import { api } from '../gateway/admin-api';
import { useAdmin } from './context';
import { useFailure } from './ListPage';

export function BackupPage() {
  const { onSlow, notify } = useAdmin();
  const failure = useFailure();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(
    () =>
      api
        .backupStatus({ onSlow })
        .then((s) => {
          setStatus(s);
          setError(null);
        })
        .catch((err: unknown) => setError(failure(err))),
    [onSlow, failure],
  );

  useEffect(() => {
    void load();
  }, [load, attempt]);

  const running = status?.last?.state === 'in_progress';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => void load(), BACKUP_POLL_MS);
    return () => clearInterval(t);
  }, [running, load]);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const last = await api.backup({ onSlow });
      setStatus((s) => (s ? { ...s, last } : s));
      notify({ text: 'Резервна копія створюється. Стан оновиться на цій сторінці сам.' });
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  };

  const last = status?.last ?? null;

  return (
    <>
      <h1>Резервні копії</h1>
      <p className="lead">
        Копія бази даних створюється 1-го числа щомісяця вночі та за кнопкою нижче. Вона зашифрована
        вашим ключем: без нього файл не відкрити. Кожну копію одразу перевіряють — розшифровують,
        піднімають базу й звіряють кількість записів.
      </p>
      <ul>
        <li>
          Що входить: усі записи, користувачі, журнал дій, приховані картки стрічки, файли, що ще не
          на сайті.
        </li>
        <li>Сесії входу не копіюються: після відновлення всі входять заново.</li>
        <li>
          Файл зберігається на GitHub 90 днів. Завантажуйте копію й тримайте у себе три останні.
        </li>
        <li>
          Обов’язково зробіть копію перед оновленням сервісу, зміною структури даних і перед
          передачею адміністрування редактору.
        </li>
      </ul>

      {error && <ErrorBox text={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {status === null && !error && <p>Завантажуємо…</p>}

      {status && (
        <>
          <h2>Остання копія за кнопкою</h2>
          {last ? (
            <div role="status" aria-live="polite">
              <p className="row__meta">
                {formatDateTime(last.startedAt)}
                {last.startedBy && ` · ${last.startedBy}`}
              </p>
              <p>{STATE_LABEL[last.state]}</p>
              <p>
                <a href={last.runUrl} target="_blank" rel="noopener noreferrer">
                  Відкрити прогін на GitHub
                  <span className="visually-hidden"> (відкриється в новій вкладці)</span>
                </a>
                {last.state === 'success' && ' — файл унизу сторінки, у блоці «Artifacts».'}
              </p>
            </div>
          ) : (
            <p>За кнопкою копій ще не робили.</p>
          )}
          <p>
            <a href={status.workflowUrl} target="_blank" rel="noopener noreferrer">
              Усі копії, зокрема щомісячні
              <span className="visually-hidden"> (відкриється в новій вкладці)</span>
            </a>
          </p>
          {status.configured ? (
            <button
              type="button"
              className="btn btn--inline"
              disabled={busy || running}
              onClick={() => void start()}
            >
              Створити резервну копію
            </button>
          ) : (
            <p>Резервні копії ще не налаштовано: на сервері немає токена GitHub.</p>
          )}
        </>
      )}
    </>
  );
}
