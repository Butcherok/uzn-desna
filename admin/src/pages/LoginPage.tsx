/** Форма входа (ТЗ 8.2, 9.2): логин и пароль, одна ошибка на оба поля. */
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ErrorBox } from '../components/Status';
import type { User } from '../domain/kinds';
import { api } from '../gateway/admin-api';

interface Props {
  wake: ReactNode;
  onSlow: (slow: boolean) => void;
  onDone: (u: User) => void;
}

export function LoginPage({ wake, onSlow, onDone }: Props) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const loginRef = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!login.trim() || !password) {
      setError('Введіть логін і пароль');
      loginRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await api.login(login.trim(), password, { onSlow }));
    } catch (err) {
      // Пароль не стирается: при обрыве связи повтор отправит то же (ТЗ 8.7, п. 4).
      setError(err instanceof Error ? err.message : 'Щось пішло не так. Спробуйте ще раз');
      loginRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="boot" id="main">
      <h1>Вхід в адміністрування</h1>
      <p className="lead">Сайт КП УЗН Деснянського району</p>
      {wake}
      <form className="form form--narrow" onSubmit={(e) => void submit(e)} noValidate>
        {error && <ErrorBox text={error} />}
        <div className="field">
          <label className="field__label" htmlFor="login">
            Логін
          </label>
          <input
            id="login"
            ref={loginRef}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="password">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn" disabled={busy} aria-disabled={busy}>
          {busy ? 'Входимо…' : 'Увійти'}
        </button>
        <p className="field__hint">
          Забули пароль? Зверніться до власника сайту: відновлення через пошту немає.
        </p>
      </form>
    </main>
  );
}
