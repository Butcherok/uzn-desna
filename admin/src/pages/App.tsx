/**
 * Корень админки: проверка сессии (`/auth/me` первым делом, ТЗ 8.2), вход,
 * обязательная смена временного пароля (8.2, п. 6), раскладка и страницы.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PublishBar } from '../components/PublishBar';
import { ErrorBox, WakeNotice } from '../components/Status';
import { sectionOf, type User } from '../domain/kinds';
import {
  POLL_INTERVAL_MS,
  PUBLISH_STARTED,
  barView,
  type PublishProblem,
  type PublishStatus,
} from '../domain/publish';
import { pluralChanges } from '../domain/text';
import { api } from '../gateway/admin-api';
import { ApiRequestError } from '../gateway/api';
import { pathOf } from '../domain/routes';
import { linkProps, navigate, useRoute } from '../gateway/router';
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
  const [publish, setPublish] = useState<PublishStatus | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [problems, setProblems] = useState<PublishProblem[]>([]);
  const setPending = useCallback(
    (n: number) => setPublish((s) => (s ? { ...s, pendingChanges: n } : s)),
    [],
  );
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

  const refreshPublish = useCallback(
    () =>
      api
        .publishStatus({ onSlow })
        .then((s) => {
          setPublish(s);
          // Прогон закончился — сообщение «зміни з'являться…» больше не нужно.
          if (s.run?.result !== 'in_progress') setPublishMsg((m) => (m?.error ? m : null));
        })
        .catch(() => undefined),
    [onSlow],
  );

  useEffect(() => {
    if (signedIn) void refreshPublish();
  }, [signedIn, refreshPublish, route]);

  const polling = signedIn && barView(publish, pluralChanges).poll;
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => void refreshPublish(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [polling, refreshPublish]);

  const startPublish = useCallback(async () => {
    setPublishBusy(true);
    setProblems([]);
    setPublishMsg(null);
    try {
      const res = await api.publish({ onSlow });
      setPublish((s) => (s ? { ...s, run: res.run } : s));
      setPublishMsg({ text: PUBLISH_STARTED, error: false });
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.failure.status === 401) {
          setUser(null);
          return;
        }
        setProblems(err.failure.problems);
        setPublishMsg({ text: err.failure.message, error: true });
        if (err.failure.code === 'PUBLISH_IN_PROGRESS') void refreshPublish();
      } else {
        setPublishMsg({ text: "Не вдалося з'єднатися. Спробуйте ще раз", error: true });
      }
    } finally {
      setPublishBusy(false);
    }
  }, [onSlow, refreshPublish]);

  const signedOut = useCallback(() => {
    setUser(null);
    navigate({ page: 'login' }, { replace: true, force: true });
  }, []);

  const ctx = useMemo<AdminCtx | null>(
    () => (user ? { user, setPending, notify: setNotice, onSlow, signedOut } : null),
    [user, onSlow, signedOut, setNotice, setPending],
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
        publishBar={
          <PublishBar
            status={publish}
            busy={publishBusy}
            message={publishMsg}
            problems={problems}
            showRunLink={user.role === 'owner'}
            onPublish={() => void startPublish()}
            onCloseProblems={() => setProblems([])}
            problemLink={(p) => {
              const section = sectionOf(p.kind);
              if (!section) return null;
              return linkProps({
                page: 'edit',
                kind: section.kind,
                id: section.singleton ? null : p.id,
              });
            }}
          />
        }
      >
        {page}
      </Layout>
    </Ctx.Provider>
  );
}
