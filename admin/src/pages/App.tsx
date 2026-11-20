/**
 * Корень админки: проверка сессии (`/auth/me` первым делом, ТЗ 8.2), вход,
 * обязательная смена временного пароля (8.2, п. 6), раскладка и страницы.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBox, WakeNotice } from '../components/Status';
import type { User } from '../domain/kinds';
import { api } from '../gateway/admin-api';
import { ApiRequestError } from '../gateway/api';
import { pathOf } from '../domain/routes';
import { navigate, useRoute } from '../gateway/router';
import { Ctx, type AdminCtx, type Notice } from './context';
import { EditPage } from './EditPage';
import { HelpPage } from './HelpPage';
import { HomePage } from './HomePage';
import { Layout } from './Layout';
import { ListPage } from './ListPage';
import { LoginPage } from './LoginPage';
import { PasswordPage } from './PasswordPage';
import { TrashPage } from './TrashPage';

export function App() {
  const route = useRoute();
  /** `undefined` — ещё проверяем сессию, `null` — не вошли. */
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [slowCount, setSlowCount] = useState(0);
  const [bootError, setBootError] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  /** Сообщение привязано к адресу, на котором его показали. */
  const [notice, setNoticeAt] = useState<{ notice: Notice; path: string } | null>(null);
  const setNotice = useCallback(
    (n: Notice | null) => setNoticeAt(n ? { notice: n, path: window.location.pathname } : null),
    [],
  );
  const [attempt, setAttempt] = useState(0);

  const onSlow = useCallback(
    (slow: boolean) => setSlowCount((c) => Math.max(0, c + (slow ? 1 : -1))),
    [],
  );

  useEffect(() => {
    let alive = true;
    setBootError(null);
    api
      .me({ onSlow })
      .then((u) => alive && setUser(u))
      .catch((err: unknown) => {
        if (!alive) return;
        if (err instanceof ApiRequestError && err.failure.status === 401) setUser(null);
        else
          setBootError(
            err instanceof Error ? err.message : "Не вдалося з'єднатися. Спробуйте ще раз",
          );
      });
    return () => {
      alive = false;
    };
  }, [onSlow, attempt]);

  const signedIn = user && !user.mustChangePassword;

  useEffect(() => {
    if (!signedIn) return;
    api
      .publishStatus({ onSlow })
      .then((s) => {
        setPending(s.pendingChanges);
        setLastPublishedAt(s.lastPublishedAt);
      })
      .catch(() => setPending(null));
  }, [signedIn, onSlow, route]);

  const signedOut = useCallback(() => {
    setUser(null);
    navigate({ page: 'login' }, { replace: true, force: true });
  }, []);

  const ctx = useMemo<AdminCtx | null>(
    () => (user ? { user, setPending, notify: setNotice, onSlow, signedOut } : null),
    [user, onSlow, signedOut, setNotice],
  );

  const wake = <WakeNotice show={slowCount > 0} />;

  if (user === undefined) {
    return (
      <main className="boot" id="main">
        <h1>Адміністрування</h1>
        {wake}
        {bootError ? (
          <ErrorBox text={bootError} onRetry={() => setAttempt((a) => a + 1)} />
        ) : (
          slowCount === 0 && <p>Перевіряємо вхід…</p>
        )}
      </main>
    );
  }

  if (user === null || !ctx) {
    return (
      <>
        <LoginPage
          wake={wake}
          onSlow={onSlow}
          onDone={(u) => {
            setUser(u);
            if (route.page === 'login') navigate({ page: 'home' }, { replace: true, force: true });
          }}
        />
      </>
    );
  }

  if (user.mustChangePassword) {
    return (
      <Ctx.Provider value={ctx}>
        <main className="boot" id="main">
          {wake}
          <PasswordPage forced onDone={() => setUser({ ...user, mustChangePassword: false })} />
        </main>
      </Ctx.Provider>
    );
  }

  let page;
  switch (route.page) {
    case 'home':
    case 'login':
      page = <HomePage />;
      break;
    case 'help':
      page = <HelpPage />;
      break;
    case 'password':
      page = <PasswordPage onDone={() => navigate({ page: 'home' })} />;
      break;
    case 'trash':
      page = <TrashPage />;
      break;
    case 'list':
      page = <ListPage key={route.kind} kind={route.kind} />;
      break;
    case 'new':
      page = <EditPage key={`${route.kind}/new`} kind={route.kind} id={null} isNew />;
      break;
    case 'edit':
      page = (
        <EditPage
          key={`${route.kind}/${route.id ?? ''}`}
          kind={route.kind}
          id={route.id}
          isNew={false}
        />
      );
      break;
    case 'not-found':
      page = (
        <>
          <h1 tabIndex={-1}>Сторінку не знайдено</h1>
          <p>Виберіть розділ у меню.</p>
        </>
      );
      break;
  }

  return (
    <Ctx.Provider value={ctx}>
      <Layout
        route={route}
        wake={wake}
        notice={notice && notice.path === pathOf(route) ? notice.notice : null}
        pending={pending}
        lastPublishedAt={lastPublishedAt}
      >
        {page}
      </Layout>
    </Ctx.Provider>
  );
}
