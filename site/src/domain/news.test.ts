import { describe, expect, it } from 'vitest';
import type { FeedFile, FeedItem } from '@uzn/shared';
import { feedCards } from './news';

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

describe('Новини галузі (ТЗ 4.8)', () => {
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
});
