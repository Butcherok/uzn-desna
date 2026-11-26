import { describe, expect, it } from 'vitest';
import type { NavItem } from '../config/site';
import { breadcrumbJsonLd, breadcrumbsFor } from './breadcrumbs';

const nav: NavItem[] = [
  {
    label: 'Про підприємство',
    path: '/about/',
    children: [{ label: 'Публічна інформація', path: '/about/public-info/' }],
  },
  { label: 'Послуги', path: '/services/' },
];

describe('breadcrumbsFor', () => {
  it('builds home → section → page for a submenu page', () => {
    expect(breadcrumbsFor(nav, '/about/public-info/')).toEqual([
      { label: 'Головна', path: '/' },
      { label: 'Про підприємство', path: '/about/' },
      { label: 'Публічна інформація', path: '/about/public-info/' },
    ]);
  });

  it('gives nothing to top-level pages, home and pages outside the menu', () => {
    expect(breadcrumbsFor(nav, '/about/')).toEqual([]);
    expect(breadcrumbsFor(nav, '/services/')).toEqual([]);
    expect(breadcrumbsFor(nav, '/')).toEqual([]);
    expect(breadcrumbsFor(nav, '/accessibility/')).toEqual([]);
  });
});

describe('breadcrumbJsonLd', () => {
  it('numbers items from 1 with absolute addresses', () => {
    const data = breadcrumbJsonLd(
      breadcrumbsFor(nav, '/about/public-info/'),
      (p) => `https://x.org/s${p}`,
    );
    expect(data['@type']).toBe('BreadcrumbList');
    expect(data.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Головна', item: 'https://x.org/s/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Про підприємство',
        item: 'https://x.org/s/about/',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'Публічна інформація',
        item: 'https://x.org/s/about/public-info/',
      },
    ]);
  });
});
