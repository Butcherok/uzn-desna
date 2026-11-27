import { describe, expect, it } from 'vitest';
import type { FeedFile, FeedItem } from '@uzn/shared';
import { feedCards, feedPages, newsPagePath, pageLinks } from './news';

function item(n: number, publishedAt: string, lang: 'uk' | 'en' = 'uk'): FeedItem {
  return {
    urlKey: `example.com/${n}`,
    url: `https://example.com/${n}/`,
    title: `Новина ${n}`,
    sourceId: lang === 'en' ? 'theconversation' : 'kyivzelenbud',
    sourceName: lang === 'en' ? 'The Conversation' : 'Київзеленбуд',
    sourceDomain: 'example.com',
    lang,
    publishedAt,
    excerpt: lang === 'en' ? 'Short excerpt' : null,
    category: null,
    imagePath: null,
    via: 'tag',
    fetchedAt: '2026-11-20T05:10:00.000Z',
  };
}

function file(items: FeedItem[], state: FeedFile['state'] = 'data'): FeedFile {
  return {
    schemaVersion: 1,
    generatedAt: '2026-11-20T05:10:00.000Z',
    source: 'sync',
    state,
    items,
    fetchedAt: '2026-11-20T05:10:00.000Z',
    lastSuccessAt: '2026-11-20T05:10:00.000Z',
    sourceErrors: [],
  };
}

describe('Новини (ТЗ 4.8)', () => {
  it('новые первыми, не больше лимита', () => {
    const items = Array.from({ length: 12 }, (_, i) =>
      item(i, new Date(Date.UTC(2026, 0, 1 + i)).toISOString()),
    );
    const cards = feedCards(file(items), 8);
    expect(cards).toHaveLength(8);
    expect(cards[0]?.title).toBe('Новина 11');
    expect(feedCards(file(items), 3)).toHaveLength(3);
  });

  it('язык оригинала словом, дата по формату сайта', () => {
    const [card] = feedCards(file([item(1, '2026-10-18T19:12:40.000Z', 'en')]), 8);
    expect(card).toMatchObject({ lang: 'en', langLabel: 'Англійською', isoDate: '2026-10-18' });
    expect(card?.excerpt).toBe('Short excerpt');
  });

  it('машинный перевод — только у неукраинских публикаций (решение 031)', () => {
    const [en] = feedCards(file([item(1, '2026-10-18T00:00:00.000Z', 'en')]), 8);
    const [uk] = feedCards(file([item(2, '2026-10-18T00:00:00.000Z', 'uk')]), 8);
    expect(en?.translateUrl).toBe(
      'https://translate.google.com/translate?sl=auto&tl=uk&u=https%3A%2F%2Fexample.com%2F1%2F',
    );
    expect(uk?.translateUrl).toBeNull();
  });

  it('дата по Киеву, а не по UTC', () => {
    const [card] = feedCards(file([item(1, '2026-11-08T22:30:00.000Z')]), 8);
    expect(card?.date).toBe('09.11.2026');
  });

  it('ошибка источника не очищает ленту; пустая лента — без карточек', () => {
    expect(feedCards(file([item(1, '2026-10-18T00:00:00.000Z')], 'unknown'), 8)).toHaveLength(1);
    expect(feedCards(file([], 'unknown'), 8)).toEqual([]);
  });

  it('скрытая карточка не выводится, её место занимает следующая (ТЗ 9.5; решение 043)', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      item(i, new Date(Date.UTC(2026, 0, 1 + i)).toISOString()),
    );
    const hidden = new Set(['example.com/9', 'example.com/7']);
    const cards = feedCards(file(items), 8, hidden);
    expect(cards).toHaveLength(8);
    expect(cards.map((c) => c.title)).not.toContain('Новина 9');
    expect(cards.map((c) => c.title)).not.toContain('Новина 7');
    expect(cards[0]?.title).toBe('Новина 8');
    expect(cards.at(-1)?.title).toBe('Новина 0');
    // Скрыты все — карточек нет, блок скрывается.
    const all = new Set(items.map((i) => i.urlKey));
    expect(feedCards(file(items), 3, all)).toEqual([]);
  });
});

describe('Новини: страницы (решение 055)', () => {
  it('все карточки по 24 на страницу, новые первыми, без потерь', () => {
    const items = Array.from({ length: 50 }, (_, i) =>
      item(i, new Date(Date.UTC(2026, 0, 1 + i)).toISOString()),
    );
    const pages = feedPages(feedCards(file(items)));
    expect(pages.map((p) => [p.page, p.total, p.cards.length])).toEqual([
      [1, 3, 24],
      [2, 3, 24],
      [3, 3, 2],
    ]);
    expect(pages[0]?.cards[0]?.title).toBe('Новина 49');
    expect(pages[2]?.cards.at(-1)?.title).toBe('Новина 0');
  });

  it('пустая лента — одна страница без карточек', () => {
    expect(feedPages([])).toEqual([{ page: 1, total: 1, cards: [] }]);
  });

  it('адреса страниц: первая — /news/', () => {
    expect([newsPagePath(1), newsPagePath(2), newsPagePath(17)]).toEqual([
      '/news/',
      '/news/2/',
      '/news/17/',
    ]);
  });

  const show = (current: number, total: number) =>
    pageLinks(current, total)
      .map((l) => ('gap' in l ? '…' : l.current ? `[${l.page}]` : String(l.page)))
      .join(' ');

  it('номера: первая, последняя, соседние с текущей; пропуск в одну страницу — номером', () => {
    expect(show(1, 1)).toBe('[1]');
    expect(show(1, 3)).toBe('[1] 2 3');
    expect(show(1, 10)).toBe('[1] 2 … 10');
    expect(show(4, 10)).toBe('1 2 3 [4] 5 … 10');
    expect(show(6, 10)).toBe('1 … 5 [6] 7 … 10');
    expect(show(10, 10)).toBe('1 … 9 [10]');
  });
});
