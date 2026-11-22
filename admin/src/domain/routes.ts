/**
 * Адреса админки (решение 040): `/admin/…` через History API. Разбор адреса —
 * чистая функция; чтение и смена адреса — `gateway/router`.
 */
import { sectionOf, type Kind } from './kinds';

export type Route =
  | { page: 'home' }
  | { page: 'login' }
  | { page: 'password' }
  | { page: 'help' }
  | { page: 'trash' }
  | { page: 'files' }
  | { page: 'feed' }
  | { page: 'list'; kind: Kind }
  | { page: 'edit'; kind: Kind; id: string | null }
  | { page: 'new'; kind: Kind }
  | { page: 'not-found' };

export const BASE = '/admin';

export function parseRoute(pathname: string): Route {
  if (!pathname.startsWith(`${BASE}/`) && pathname !== BASE) return { page: 'not-found' };
  const parts = pathname
    .slice(BASE.length)
    .split('/')
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));
  const [first, second, ...rest] = parts;
  if (rest.length > 0) return { page: 'not-found' };
  if (first === undefined) return { page: 'home' };
  if (second === undefined) {
    if (
      first === 'login' ||
      first === 'password' ||
      first === 'help' ||
      first === 'trash' ||
      first === 'files' ||
      first === 'feed'
    ) {
      return { page: first };
    }
  }
  const section = sectionOf(first);
  if (!section) return { page: 'not-found' };
  if (section.singleton) {
    return second === undefined
      ? { page: 'edit', kind: section.kind, id: null }
      : { page: 'not-found' };
  }
  if (second === undefined) return { page: 'list', kind: section.kind };
  if (second === 'new')
    return section.creatable ? { page: 'new', kind: section.kind } : { page: 'not-found' };
  return { page: 'edit', kind: section.kind, id: second };
}

export function pathOf(route: Route): string {
  switch (route.page) {
    case 'home':
      return `${BASE}/`;
    case 'login':
    case 'password':
    case 'help':
    case 'trash':
    case 'files':
    case 'feed':
      return `${BASE}/${route.page}`;
    case 'list':
      return `${BASE}/${route.kind}`;
    case 'new':
      return `${BASE}/${route.kind}/new`;
    case 'edit':
      return route.id === null
        ? `${BASE}/${route.kind}`
        : `${BASE}/${route.kind}/${encodeURIComponent(route.id)}`;
    case 'not-found':
      return `${BASE}/`;
  }
}
