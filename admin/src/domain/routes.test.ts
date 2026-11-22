import { describe, expect, it } from 'vitest';
import { parseRoute, pathOf, type Route } from './routes';

describe('admin routes', () => {
  it('parses known pages and round-trips paths', () => {
    const cases: [string, Route][] = [
      ['/admin/', { page: 'home' }],
      ['/admin/help', { page: 'help' }],
      ['/admin/trash', { page: 'trash' }],
      ['/admin/files', { page: 'files' }],
      ['/admin/feed', { page: 'feed' }],
      ['/admin/contacts', { page: 'list', kind: 'contacts' }],
      ['/admin/contacts/new', { page: 'new', kind: 'contacts' }],
      ['/admin/contacts/abc123', { page: 'edit', kind: 'contacts', id: 'abc123' }],
      ['/admin/enterprise', { page: 'edit', kind: 'enterprise', id: null }],
    ];
    for (const [path, route] of cases) {
      expect(parseRoute(path), path).toEqual(route);
      expect(pathOf(route)).toBe(path);
    }
  });

  it('rejects unknown sections and singleton sub-pages', () => {
    expect(parseRoute('/admin/green-zones').page).toBe('not-found');
    expect(parseRoute('/admin/enterprise/x').page).toBe('not-found');
    expect(parseRoute('/admin/enterprise/new').page).toBe('not-found');
    expect(parseRoute('/admin/a/b/c').page).toBe('not-found');
    expect(parseRoute('/other').page).toBe('not-found');
  });
});
