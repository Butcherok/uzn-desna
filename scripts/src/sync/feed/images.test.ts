import { describe, expect, it } from 'vitest';
import type { FeedItem } from '@uzn/shared';
import { attachImages, imageFileName, ogImageUrl } from './images.js';
import type { ImageDeps } from './images.js';

describe('og:image (решение 034)', () => {
  it('берёт og:image при любом порядке атрибутов и раскрывает &amp;', () => {
    expect(
      ogImageUrl(
        '<meta content="https://img.example.com/a.jpg?w=1&amp;h=2" property="og:image">',
        'https://example.com/post/',
      ),
    ).toBe('https://img.example.com/a.jpg?w=1&h=2');
    expect(
      ogImageUrl(
        "<meta property='og:image' content='https://img.example.com/b.jpg' />",
        'https://example.com/',
      ),
    ).toBe('https://img.example.com/b.jpg');
  });

  it('относительный адрес — от страницы; http и отсутствие — null', () => {
    expect(ogImageUrl('<meta property="og:image" content="/i/c.png">', 'https://ex.com/p/')).toBe(
      'https://ex.com/i/c.png',
    );
    expect(
      ogImageUrl('<meta property="og:image" content="http://ex.com/c.png">', 'https://ex.com/'),
    ).toBeNull();
    expect(ogImageUrl('<title>нет</title>', 'https://ex.com/')).toBeNull();
  });

  it('запасной путь — twitter:image', () => {
    expect(
      ogImageUrl('<meta name="twitter:image" content="https://ex.com/t.jpg">', 'https://ex.com/'),
    ).toBe('https://ex.com/t.jpg');
  });
});

function item(n: number, imagePath: string | null = null): FeedItem {
  return {
    urlKey: `example.com/${n}`,
    url: `https://example.com/${n}/`,
    title: `Новина ${n}`,
    sourceId: 'theconversation',
    sourceName: 'The Conversation',
    sourceDomain: 'example.com',
    lang: 'en',
    publishedAt: new Date(Date.UTC(2026, 0, 1 + n)).toISOString(),
    excerpt: null,
    category: null,
    imagePath,
    via: 'tag',
    fetchedAt: '2026-11-20T05:10:00.000Z',
  };
}

function fakeDeps(files: string[], pages: Record<string, string>) {
  const written: string[] = [];
  const removed: string[] = [];
  const deps: ImageDeps = {
    fetchPage: async (url) => {
      const html = pages[url];
      if (html === undefined) throw Object.assign(new Error('x'), { name: 'SourceError' });
      return html;
    },
    fetchImage: async () => new Uint8Array([1, 2, 3]),
    toCardWebp: async (b) => b,
    listFiles: async () => [...files],
    writeFile: async (name) => void written.push(name),
    removeFile: async (name) => void removed.push(name),
    log: () => undefined,
  };
  return { deps, written, removed };
}

const og = '<meta property="og:image" content="https://img.example.com/x.jpg">';

describe('attachImages (решение 034)', () => {
  it('скачивает фото новым записям, свежие первыми, не больше лимита', async () => {
    const items = [item(1), item(2), item(3)];
    const pages = Object.fromEntries(items.map((i) => [i.url, og]));
    const { deps, written } = fakeDeps([], pages);
    const out = await attachImages(items, deps, 2);
    expect(written).toEqual([imageFileName('example.com/3'), imageFileName('example.com/2')]);
    expect(out.map((i) => i.imagePath)).toEqual([
      null,
      `media/feed/${imageFileName('example.com/2')}`,
      `media/feed/${imageFileName('example.com/3')}`,
    ]);
  });

  it('сбой страницы или нет og:image — запись без фото, не ошибка', async () => {
    const { deps, written } = fakeDeps([], { 'https://example.com/2/': '<p>без фото</p>' });
    const out = await attachImages([item(1), item(2)], deps);
    expect(written).toEqual([]);
    expect(out.every((i) => i.imagePath === null)).toBe(true);
  });

  it('файлы вытесненных записей удаляются, путь без файла сбрасывается и скачивается', async () => {
    const kept = imageFileName('example.com/1');
    const lost = imageFileName('example.com/2');
    const { deps, written, removed } = fakeDeps([kept, 'old000000000.webp'], {
      'https://example.com/2/': og,
    });
    const out = await attachImages(
      [item(1, `media/feed/${kept}`), item(2, `media/feed/${lost}`)],
      deps,
    );
    expect(removed).toEqual(['old000000000.webp']);
    expect(written).toEqual([lost]);
    expect(out[0]?.imagePath).toBe(`media/feed/${kept}`);
    expect(out[1]?.imagePath).toBe(`media/feed/${lost}`);
  });
});
