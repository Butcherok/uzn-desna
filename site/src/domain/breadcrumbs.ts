/**
 * Навигационная цепочка вложенных страниц (ТЗ 3.1; решение 054).
 *
 * Цепочка строится из верхнего меню (`NAV`), а не пишется на каждой странице:
 * подпункт меню и есть вложенная страница, и правка меню сразу правит цепочку.
 * Страницы верхнего уровня и главная цепочки не получают — на них она
 * повторяла бы меню («Головна › Послуги»).
 */
import type { NavItem } from '../config/site';

export interface Crumb {
  readonly label: string;
  readonly path: string;
}

export const HOME_LABEL = 'Головна';

/** Головна → раздел → страница, или `[]` для страницы не из подпунктов меню. */
export function breadcrumbsFor(nav: readonly NavItem[], path: string): Crumb[] {
  for (const parent of nav) {
    const child = parent.children?.find((item) => item.path === path);
    if (child) {
      return [
        { label: HOME_LABEL, path: '/' },
        { label: parent.label, path: parent.path },
        { label: child.label, path: child.path },
      ];
    }
  }
  return [];
}

/** Разметка `BreadcrumbList` Schema.org; адреса абсолютные. */
export function breadcrumbJsonLd(
  crumbs: readonly Crumb[],
  absolute: (path: string) => string,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.label,
      item: absolute(crumb.path),
    })),
  };
}
