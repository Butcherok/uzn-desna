import { describe, expect, it } from 'vitest';
import { slugify } from './format/translit.js';
import { UPLOAD_PATH_RE, provisionalSlug } from './uploads.js';

describe('provisionalSlug (decision 042, fix 21.11.2026)', () => {
  it('builds the file slug of a new record from its title, as the server will', () => {
    expect(provisionalSlug('Статут підприємства')).toBe(slugify('Статут підприємства'));
    expect(provisionalSlug('Статут підприємства')).toBe('statut-pidpryiemstva');
    const path = `media/public-docs/${provisionalSlug('Звіт за 2026 рік') ?? ''}-0a1b2c3d.pdf`;
    expect(path).toMatch(UPLOAD_PATH_RE);
  });

  it('gives nothing without a title', () => {
    expect(provisionalSlug('')).toBeNull();
    expect(provisionalSlug('   ')).toBeNull();
  });
});
