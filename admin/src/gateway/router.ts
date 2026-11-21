/**
 * Адрес страницы админки: чтение `location`, переходы через History API и
 * подтверждение ухода при несохранённых правках (ТЗ 9.3, решение 040).
 */
import { useEffect, useState } from 'react';
import { parseRoute, pathOf, type Route } from '../domain/routes';

export const LEAVE_CONFIRM = 'Є незбережені зміни. Вийти без збереження?';

/** Есть ли на открытой странице несохранённые правки. */
let dirty = false;
/** Возврат адреса после отказа уйти: следующий `popstate` — наш, не человека. */
let restoring = false;
const listeners = new Set<() => void>();

export function setDirty(value: boolean): void {
  dirty = value;
}

function confirmLeave(): boolean {
  if (!dirty) return true;
  if (!window.confirm(LEAVE_CONFIRM)) return false;
  dirty = false;
  return true;
}

export function navigate(route: Route, opts: { replace?: boolean; force?: boolean } = {}): void {
  if (!opts.force && !confirmLeave()) return;
  const path = pathOf(route);
  if (path !== window.location.pathname) {
    if (opts.replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
  }
  for (const l of listeners) l();
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.pathname));
    const onPop = () => {
      if (restoring) {
        restoring = false;
        return;
      }
      // Кнопку «назад» браузера отменить нельзя: адрес уже сменился. При отказе
      // уйти адрес возвращается вперёд, страница с правками остаётся на месте.
      if (dirty && !window.confirm(LEAVE_CONFIRM)) {
        restoring = true;
        window.history.forward();
        return;
      }
      dirty = false;
      update();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
    };
    listeners.add(update);
    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      listeners.delete(update);
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);
  return route;
}

/** Ссылка внутри админки: обычный `<a>`, переход без перезагрузки. */
export function linkProps(route: Route): {
  href: string;
  onClick: (e: {
    preventDefault: () => void;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
    button: number;
  }) => void;
} {
  return {
    href: pathOf(route),
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      navigate(route);
    },
  };
}
