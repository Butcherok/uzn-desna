import { describe, expect, it } from 'vitest';
import { applyHidden, formatDay, type FeedItemView } from './feed';

const item = (n: number): FeedItemView => ({
  urlKey: `e.com/${n}`,
  url: `https://e.com/${n}/`,
  title: `Новина ${n}`,
  sourceName: 'Київзеленбуд',
  lang: 'uk',
  publishedAt: new Date(Date.UTC(2026, 10, n)).toISOString(),
  hidden: false,
  hiddenAt: null,
  place: null,
});

describe('feed list in the admin (TZ 9.5)', () => {
  it('hiding moves the card to the end and shifts places like the build does', () => {
    const items = applyHidden([1, 2, 3, 4, 5, 6, 7, 8, 9].map(item), 'e.com/9', false, '');
    expect(items.map((i) => i.place)).toEqual([
      'home',
      'home',
      'home',
      'news',
      'news',
      'news',
      'news',
      'news',
      'reserve',
    ]);
    const after = applyHidden(items, 'e.com/9', true, '2026-11-22T10:00:00.000Z');
    expect(after.at(-1)).toMatchObject({ urlKey: 'e.com/9', hidden: true, place: null });
    expect(after[0]?.title).toBe('Новина 8');
    expect(after[7]).toMatchObject({ title: 'Новина 1', place: 'news' });
    const back = applyHidden(after, 'e.com/9', false, '');
    expect(back[0]).toMatchObject({
      urlKey: 'e.com/9',
      hidden: false,
      hiddenAt: null,
      place: 'home',
    });
  });

  it('dates are Kyiv dates', () => {
    expect(formatDay('2026-11-08T22:30:00.000Z')).toBe('09.11.2026');
  });
});
