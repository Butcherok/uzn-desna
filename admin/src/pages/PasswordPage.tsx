/**
 * Смена своего пароля (ТЗ 9.2, п. 3; 8.2, п. 4): с вводом текущего, не
 * короче 12 знаков. Смена закрывает остальные сеансы этого пользователя.
 */
import { useRef, useState, type FormEvent } from 'react';
import { ErrorBox } from '../components/Status';
import { api } from '../gateway/admin-api';
import { ApiRequestError } from '../gateway/api';
import { useAdmin } from './context';

export const PASSWORD_MIN = 12;

export function PasswordPage({ forced = false, onDone }: { forced?: boolean; onDone: () => void }) {
  const { onSlow, notify, signedOut } = useAdmin();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<{ text: string; field: 'current' | 'next' | 'repeat' } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const refs = {
    current: useRef<HTMLInputElement>(null),
    next: useRef<HTMLInputElement>(null),
    repeat: useRef<HTMLInputElement>(null),
  };

  const fail = (text: string, field: 'current' | 'next' | 'repeat') => {
    setError({ text, field });
    refs[field].current?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!current) return fail('Введіть поточний пароль', 'current');
    if (next.length < PASSWORD_MIN)
      return fail(`Новий пароль — не коротше ${PASSWORD_MIN} знаків`, 'next');
    if (next !== repeat) return fail('Паролі не збігаються', 'repeat');
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next, { onSlow });
      notify({ text: 'Пароль змінено. Інші входи з цим логіном закрито.' });
      onDone();
    } catch (err) {
      if (err instanceof ApiRequestError && err.failure.status === 401) return signedOut();
      const fields = err instanceof ApiRequestError ? err.failure.fields : {};
      if (fields['newPassword']) return fail(fields['newPassword'], 'next');
      fail(
        fields['currentPassword'] ?? (err instanceof Error ? err.message : 'Щось пішло не так'),
        'current',
      );
    } finally {
      setBusy(false);
    }
  };

  const input = (
    key: 'current' | 'next' | 'repeat',
    label: string,
    value: string,
    set: (v: string) => void,
    hint?: string,
  ) => {
    const id = `pw-${key}`;
    const err = error?.field === key ? error.text : undefined;
    return (
      <div className="field">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        <input
          id={id}
          ref={refs[key]}
          type="password"
          autoComplete={key === 'current' ? 'current-password' : 'new-password'}
          value={value}
          onChange={(e) => set(e.target.value)}
          aria-invalid={err ? true : undefined}
          aria-describedby={
            [hint ? `${id}-hint` : '', err ? `${id}-err` : ''].filter(Boolean).join(' ') ||
            undefined
          }
        />
        {hint && (
          <p className="field__hint" id={`${id}-hint`}>
            {hint}
          </p>
        )}
        {err && (
          <p className="field__error" id={`${id}-err`}>
            {err}
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      <h1>{forced ? 'Змініть тимчасовий пароль' : 'Змінити пароль'}</h1>
      {forced && <p className="lead">Перед роботою задайте власний пароль.</p>}
      <form className="form form--narrow" onSubmit={(e) => void submit(e)} noValidate>
        {error && <ErrorBox text={error.text} />}
        {input('current', 'Поточний пароль', current, setCurrent)}
        {input(
          'next',
          'Новий пароль',
          next,
          setNext,
          `Не коротше ${PASSWORD_MIN} знаків. Найкраще — кілька слів, які легко запам’ятати.`,
        )}
        {input('repeat', 'Новий пароль ще раз', repeat, setRepeat)}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Зберігаємо…' : 'Змінити пароль'}
        </button>
      </form>
    </>
  );
}
