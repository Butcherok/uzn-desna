/**
 * Раскладка админки (ТЗ 9.3, 9.4): шапка, меню разделов, содержимое, полоса
 * публикации внизу. На телефоне меню раскрывается кнопкой, с 1024 px —
 * колонка слева. Заголовок страницы получает фокус после перехода.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { sectionsFor } from '../domain/kinds';
import type { Route } from '../domain/routes';
import { api } from '../gateway/admin-api';
import { linkProps } from '../gateway/router';
import { useAdmin, type Notice } from './context';

interface Props {
  route: Route;
  wake: ReactNode;
  notice: Notice | null;
  publishBar: ReactNode;
  children: ReactNode;
}

const isCurrent = (route: Route, kind: string) =>
  (route.page === 'list' || route.page === 'edit' || route.page === 'new') && route.kind === kind;

export function Layout({ route, wake, notice, publishBar, children }: Props) {
  const { user } = useAdmin();
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const sections = sectionsFor(user.role);
  const content = sections.filter((s) => !s.ownerOnly);
  const service = sections.filter((s) => s.ownerOnly);

  useEffect(() => {
    setMenuOpen(false);
    // Фокус на заголовок новой страницы: экранный диктор начнёт с него.
    const h1 = mainRef.current?.querySelector('h1');
    if (h1 instanceof HTMLElement) {
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: false });
    }
  }, [route]);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      window.location.assign('/admin/');
    }
  };

  const item = (r: Route, label: string, current: boolean) => (
    <li key={label}>
      <a {...linkProps(r)} aria-current={current ? 'page' : undefined}>
        {label}
      </a>
    </li>
  );

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Перейти до вмісту
      </a>
      <header className="top">
        <a className="top__title" {...linkProps({ page: 'home' })}>
          Адміністрування сайту
        </a>
        <button
          type="button"
          className="top__menu btn btn--ghost btn--inline"
          aria-expanded={menuOpen}
          aria-controls="admin-nav"
          onClick={() => setMenuOpen((o) => !o)}
        >
          Розділи
        </button>
      </header>

      <nav id="admin-nav" className={`nav${menuOpen ? ' nav--open' : ''}`} aria-label="Розділи">
        <ul>
          {content.map((s) =>
            item({ page: 'list', kind: s.kind }, s.label, isCurrent(route, s.kind)),
          )}
          {item({ page: 'feed' }, 'Новини галузі', route.page === 'feed')}
          {item({ page: 'files' }, 'Файли', route.page === 'files')}
          {item({ page: 'trash' }, 'Кошик', route.page === 'trash')}
        </ul>
        {service.length > 0 && (
          <>
            <p className="nav__group">Службове</p>
            <ul>
              {service.map((s) =>
                item({ page: 'list', kind: s.kind }, s.label, isCurrent(route, s.kind)),
              )}
              {user.role === 'owner' && item({ page: 'log' }, 'Журнал дій', route.page === 'log')}
            </ul>
          </>
        )}
        <p className="nav__group">{user.displayName}</p>
        <ul>
          {item({ page: 'help' }, 'Допомога', route.page === 'help')}
          {item({ page: 'password' }, 'Змінити пароль', route.page === 'password')}
          <li>
            <button type="button" className="nav__button" onClick={() => void logout()}>
              Вийти
            </button>
          </li>
        </ul>
      </nav>

      <main id="main" className="main" ref={mainRef}>
        {wake}
        <div className="notice" role="status" aria-live="polite">
          {notice && (
            <p className="notice__text">
              {notice.text}
              {notice.undo && (
                <button
                  type="button"
                  className="btn btn--ghost btn--inline"
                  onClick={notice.undo.run}
                >
                  {notice.undo.label}
                </button>
              )}
            </p>
          )}
        </div>
        {children}
      </main>

      {publishBar}
    </div>
  );
}
