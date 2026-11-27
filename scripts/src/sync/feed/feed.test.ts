import { readFileSync } from 'node:fs';
import { feedRulesFileSchema } from '@uzn/shared';
import type { FeedFile, FeedItem, FeedRuleSource, FeedRules } from '@uzn/shared';
import { describe, expect, it } from 'vitest';
import { SourceError } from '../http.js';
import type { FetchDeps } from '../http.js';
import { runSync } from '../run.js';
import type { RunIo } from '../run.js';
import { emptyFeedFile, mergeItems, nextFeedFile, toFeedItem } from './merge.js';
import { parseAtom, parseRss, parseWpPosts } from './parse.js';
import type { RawEntry } from './parse.js';
import { CONVERSATION_TOPICS, fetchSource } from './sources.js';
import { decodeEntities, excerptOf, normalizedTitle, stripHtml, urlKey } from './text.js';
import { matchesTopic } from './topic.js';

const RULES: FeedRules = (() => {
  const file = feedRulesFileSchema.parse(
    JSON.parse(readFileSync(new URL('../../../../data/feed-rules.json', import.meta.url), 'utf8')),
  );
  return file.items[0] as FeedRules;
})();
const UK = RULES.dictionary.uk;
const EN = RULES.dictionary.en;

describe('лента: словарь тем на украинских строках (ТЗ 7.4, п. 3)', () => {
  it.each([
    ['Відновлення зелених зон на Троєщині', true],
    ['Догляд за зеленими насадженнями восени', true],
    ['Листя має опадати, а не горіти', true],
    ['У мінісквері висадили клумбу', true],
    ['Президент Зеленський провів зустріч', false],
    ['Засідання відбудеться 12 квітня', false],
    ['Підсумки листопада у місті', false],
  ])('%s → %s', (title, expected) => {
    expect(matchesTopic(UK, title, '')).toBe(expected);
  });

  it('стоп-слово в заголовке без темы отсекает, даже если тема есть в описании', () => {
    expect(matchesTopic(UK, 'Новий автопарк комунальників', 'біля парку')).toBe(false);
    expect(matchesTopic(UK, 'Агрофорум у столиці', 'про озеленення')).toBe(false);
  });

  it('тема в заголовке отменяет стоп-слова (ложный отсев отчёта 08, 12.2)', () => {
    expect(matchesTopic(UK, 'Зелені зони потребують захисту від паркування', '')).toBe(true);
  });

  it('тема только в описании — проходит, если стоп-слов в заголовке нет', () => {
    expect(matchesTopic(UK, 'Новини району', 'У сквері висадили дерева')).toBe(true);
    expect(matchesTopic(UK, 'Новини району', 'Погода на вихідні')).toBe(false);
  });

  it('английский словарь: parking и theme park — не тема', () => {
    expect(matchesTopic(EN, 'New pocket park opens downtown', '')).toBe(true);
    expect(matchesTopic(EN, 'Parking fees rise again', '')).toBe(false);
    expect(matchesTopic(EN, 'Theme park ticket prices', '')).toBe(false);
    expect(matchesTopic(EN, 'Car park replaced by a pocket park', '')).toBe(true);
    expect(matchesTopic(UK, 'Індустріальний парк у Броварах', 'з деревами')).toBe(false);
  });
});

describe('лента: текст', () => {
  it('разбирает сущности WordPress', () => {
    expect(decodeEntities('Клени Фрімана &#171;Отем Блейз&#187; &amp; об&#8217;єкт')).toBe(
      'Клени Фрімана «Отем Блейз» & об’єкт',
    );
  });

  it('снимает разметку и выбрасывает подписи к фото', () => {
    expect(
      stripHtml(
        '<figure><img src="x"/><figcaption>Фото: Pexels</figcaption></figure><p>Текст <b>новини</b></p>',
      ),
    ).toBe('Текст новини');
  });

  it('отрывок — не длиннее 200 символов, по границе слова', () => {
    const text = excerptOf(`<p>${'слово '.repeat(80)}</p>`);
    expect(text?.length).toBeLessThanOrEqual(200);
    expect(text?.endsWith('…')).toBe(true);
    expect(excerptOf('<figure>фото</figure>')).toBeNull();
  });

  it('ключ адреса без схемы, www, параметров и косой черты', () => {
    expect(urlKey('https://www.Kyivzelenbud.com/news/abc/?utm_source=x#top')).toBe(
      'kyivzelenbud.com/news/abc',
    );
  });

  it('нормализованный заголовок для дублей', () => {
    expect(normalizedTitle('  Київ — «зелене» місто!  ')).toBe(
      normalizedTitle('київ зелене місто'),
    );
  });
});

const WP = JSON.stringify([
  {
    date_gmt: '2026-11-09T13:38:29',
    link: 'https://kyivzelenbud.com/news/tyulpany/',
    title: { rendered: 'Київ прикрасять 185 тисяч тюльпанів' },
    excerpt: { rendered: '<p>Опис</p>' },
  },
  {
    date_gmt: '2026-09-29T10:18:17',
    link: 'https://kyivzelenbud.com/news/kleny/',
    title: { rendered: 'У Куренівському парку висадили клени &#171;Отем Блейз&#187;' },
  },
]);

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>x</title>
<item><title>У парку висадили дерева</title><link>https://kyivzelenbud.com/news/a/</link>
<pubDate>Mon, 09 Nov 2026 13:38:29 +0000</pubDate><category><![CDATA[Новини]]></category>
<description><![CDATA[<p>Опис</p>]]></description></item>
<item><title>Графік прийому громадян</title><link>https://kyivzelenbud.com/news/b/</link>
<pubDate>Tue, 10 Nov 2026 08:00:00 +0000</pubDate><description><![CDATA[<p>Без теми</p>]]></description></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xml:lang="en-US" xmlns="http://www.w3.org/2005/Atom">
<id>tag:theconversation.com,2011:/topics/urban-trees-58019/articles</id><title>Urban trees</title>
<entry><id>tag:theconversation.com,2011:article/1</id>
<published>2026-10-18T19:12:40Z</published><updated>2026-10-18T19:12:40Z</updated>
<link rel="alternate" type="text/html" href="https://theconversation.com/a-botanist-on-trees-1"/>
<title>A botanist weighs in on city trees</title>
<content type="html">&lt;figure&gt;&lt;img src="https://images.theconversation.com/x.jpg" /&gt;&lt;figcaption&gt;Photo&lt;/figcaption&gt;&lt;/figure&gt;&lt;p&gt;Street trees cool cities.&lt;/p&gt;</content>
</entry></feed>`;

describe('лента: разбор ответов', () => {
  it('WordPress REST: дата GMT без пояса — UTC, сущности разобраны', () => {
    const [first, second] = parseWpPosts(WP);
    expect(first).toMatchObject({
      url: 'https://kyivzelenbud.com/news/tyulpany/',
      publishedAt: '2026-11-09T13:38:29.000Z',
    });
    expect(second?.title).toBe('У Куренівському парку висадили клени «Отем Блейз»');
  });

  it('RSS 2.0 и Atom', () => {
    expect(parseRss(RSS).map((e) => e.publishedAt)).toEqual([
      '2026-11-09T13:38:29.000Z',
      '2026-11-10T08:00:00.000Z',
    ]);
    const [entry] = parseAtom(ATOM);
    expect(entry).toMatchObject({
      url: 'https://theconversation.com/a-botanist-on-trees-1',
      title: 'A botanist weighs in on city trees',
      publishedAt: '2026-10-18T19:12:40.000Z',
    });
    expect(stripHtml(entry?.html ?? '')).toBe('Street trees cool cities.');
  });

  it('пустая выдача — пустой массив; чужой ответ — SRC_PARSE', () => {
    expect(parseWpPosts('[]')).toEqual([]);
    expect(() => parseWpPosts('<html>Just a moment...</html>')).toThrow(SourceError);
    expect(() => parseRss('<html><title>Just a moment...</title></html>')).toThrow(SourceError);
    expect(() => parseAtom('{"a":1}')).toThrow(SourceError);
  });

  it('записи без даты нет — ответ из одних таких записей это SRC_PARSE', () => {
    expect(() =>
      parseWpPosts(
        JSON.stringify([{ date_gmt: 'x', link: 'https://a.b/c', title: { rendered: 't' } }]),
      ),
    ).toThrow(SourceError);
  });
});

function respond(map: Record<string, string | number>): FetchDeps {
  return {
    fetch: (async (input: string | URL | Request) => {
      const url = String(input);
      const key = Object.keys(map).find((k) => url.includes(k));
      const value = key === undefined ? 404 : map[key];
      if (typeof value === 'number')
        return new Response('<html>Just a moment...</html>', { status: value });
      return new Response(value, { status: 200 });
    }) as typeof fetch,
    sleep: async () => {},
    log: () => {},
  };
}

const NOW = new Date('2026-11-20T05:10:00.000Z');

describe('лента: основной и запасной путь (ТЗ 7.4)', () => {
  it('сайт сети без рубрик: основной путь тоже через словарь, отсеянные — в rejected', async () => {
    const got = await fetchSource('kyivzelenbud', RULES, respond({ 'wp-json': WP }), NOW);
    expect(got.via).toBe('tag');
    expect(got.entries.map((e) => e.url)).toEqual(['https://kyivzelenbud.com/news/kleny/']);
    expect(got.rejected).toEqual(['kyivzelenbud.com/news/tyulpany']);
    expect(got.mainError).toBeNull();
  });

  it('источник с тематическими тегами — словарь не применяется', async () => {
    const got = await fetchSource('hmarochos', RULES, respond({ 'wp-json': WP }), NOW);
    expect(got.entries).toHaveLength(2);
    expect(got.rejected).toEqual([]);
  });

  it.each(['desna', 'podol', 'dnipro'] as const)(
    'районный сайт %s: свой адрес, словарь, запасной путь — /feed/',
    async (id) => {
      const urls: string[] = [];
      const deps = respond({ 'wp-json': 500, '/feed/': RSS });
      const spy: FetchDeps = {
        ...deps,
        fetch: (async (input: string | URL | Request, init?: RequestInit) => {
          urls.push(String(input));
          return deps.fetch(input, init);
        }) as typeof fetch,
      };
      const got = await fetchSource(id, RULES, spy, NOW);
      expect(urls.every((u) => u.startsWith(`https://${id}.kyivzelenbud.com/`))).toBe(true);
      expect(got.via).toBe('rss');
      expect(got.entries.map((e) => e.title)).toEqual(['У парку висадили дерева']);
    },
  );

  it('основной путь упал — RSS через словарь, с кодом сбоя основного', async () => {
    const got = await fetchSource(
      'kyivzelenbud',
      RULES,
      respond({ 'wp-json': 403, '/feed/': RSS }),
      NOW,
    );
    expect(got.via).toBe('rss');
    expect(got.entries.map((e) => e.title)).toEqual(['У парку висадили дерева']);
    expect(got.mainError?.code).toBe('SRC_HTTP_4XX');
  });

  it('упали оба пути — ошибка основного', async () => {
    await expect(
      fetchSource('kyivzelenbud', RULES, respond({ 'wp-json': 500, '/feed/': 403 }), NOW),
    ).rejects.toMatchObject({ code: 'SRC_HTTP_5XX' });
  });

  it('The Conversation: ответила хоть одна тема — источник ответил', async () => {
    const got = await fetchSource(
      'theconversation',
      RULES,
      respond({ [CONVERSATION_TOPICS[0]]: ATOM }),
      NOW,
    );
    expect(got.entries).toHaveLength(1);
    await expect(fetchSource('theconversation', RULES, respond({}), NOW)).rejects.toMatchObject({
      code: 'SRC_HTTP_4XX',
    });
  });

  it('запрос WordPress идёт окном по датам', async () => {
    const urls: string[] = [];
    const deps = respond({ 'wp-json': WP });
    const spy: FetchDeps = {
      ...deps,
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        urls.push(String(input));
        return deps.fetch(input, init);
      }) as typeof fetch,
    };
    await fetchSource('kyivzelenbud', RULES, spy, NOW);
    expect(urls[0]).toContain('after=2026-05-24T05:10:00');
    expect(urls[0]).toContain('per_page=100');
  });
});

const KZB = RULES.sources.find((s) => s.id === 'kyivzelenbud') as FeedRuleSource;
const TC = RULES.sources.find((s) => s.id === 'theconversation') as FeedRuleSource;

const MERGE_NOW = '2026-11-20T00:00:00.000Z';

function raw(n: number, date: string, host = 'kyivzelenbud.com'): RawEntry {
  return {
    url: `https://${host}/news/${n}/`,
    title: `Новина ${n}`,
    publishedAt: date,
    html: '<p>x</p>',
  };
}

function item(
  source: FeedRuleSource,
  n: number,
  date: string,
  at = '2026-11-01T00:00:00.000Z',
): FeedItem {
  const host = source.id === 'theconversation' ? 'theconversation.com' : 'kyivzelenbud.com';
  return toFeedItem(source, 'tag', raw(n, date, host), at);
}

describe('лента: слияние и вытеснение', () => {
  it('отрывок только у разрешающего источника', () => {
    expect(item(KZB, 1, '2026-11-01T00:00:00.000Z').excerpt).toBeNull();
    expect(item(TC, 1, '2026-11-01T00:00:00.000Z').excerpt).toBe('x');
  });

  it('дубли по адресу и заголовку; прежняя запись сохраняет дату получения', () => {
    const old = item(KZB, 1, '2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z');
    const again = item(KZB, 1, '2026-11-01T00:00:00.000Z', '2026-11-20T00:00:00.000Z');
    const sameTitle = { ...item(KZB, 2, '2026-11-02T00:00:00.000Z'), title: 'Новина 1!' };
    const merged = mergeItems([old], [again, sameTitle], new Set(['kyivzelenbud']), MERGE_NOW);
    expect(merged).toEqual([old]);
  });

  it('хранит публикации за год, новые первыми; выключенный источник уходит', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      item(KZB, i, new Date(Date.UTC(2026, 0, 1 + i * 5)).toISOString()),
    );
    const merged = mergeItems(
      [item(TC, 99, '2026-11-19T00:00:00.000Z')],
      many,
      new Set(['kyivzelenbud']),
      MERGE_NOW,
    );
    expect(merged).toHaveLength(60);
    expect(merged[0]?.title).toBe('Новина 59');
    expect(merged.some((i) => i.sourceId === 'theconversation')).toBe(false);
  });

  it('старше года — уходит и не возвращается следующим прогоном', () => {
    const fresh = item(KZB, 1, '2026-06-01T00:00:00.000Z');
    const edge = item(KZB, 2, '2025-11-21T00:00:00.000Z');
    const stale = item(KZB, 3, '2025-11-19T00:00:00.000Z');
    const oldOne = item(KZB, 100, '2020-01-01T00:00:00.000Z', '2026-11-20T00:00:00.000Z');
    const merged = mergeItems([fresh, edge, stale], [oldOne], new Set(['kyivzelenbud']), MERGE_NOW);
    expect(merged.map((i) => i.title)).toEqual(['Новина 1', 'Новина 2']);
  });

  it('сохранённая запись, отсеянная словарём в этом прогоне, уходит', () => {
    const offTopic = item(KZB, 1, '2026-11-01T00:00:00.000Z');
    const kept = item(KZB, 2, '2026-11-02T00:00:00.000Z');
    const next = nextFeedFile(
      { ...emptyFeedFile('2026-11-19T00:00:00.000Z'), state: 'data', items: [offTopic, kept] },
      [{ source: KZB, ok: true, via: 'tag', entries: [], rejected: [offTopic.urlKey] }],
      MERGE_NOW,
    );
    expect(next.items.map((i) => i.urlKey)).toEqual([kept.urlKey]);
  });

  it('не ответил ни один источник — unknown с прежними записями', () => {
    const previous: FeedFile = {
      ...emptyFeedFile('2026-11-19T00:00:00.000Z'),
      state: 'data',
      items: [item(KZB, 1, '2026-11-01T00:00:00.000Z')],
    };
    const next = nextFeedFile(
      previous,
      [{ source: KZB, ok: false, code: 'SRC_TIMEOUT' }],
      '2026-11-20T00:00:00.000Z',
    );
    expect(next.state).toBe('unknown');
    expect(next.items).toEqual(previous.items);
    expect(next.generatedAt).toBe(previous.generatedAt);
    expect(next.sourceErrors).toEqual([{ source: 'kyivzelenbud', code: 'SRC_TIMEOUT' }]);
  });

  it('содержимое не изменилось — файл прежний (коммита нет)', () => {
    const first = nextFeedFile(
      emptyFeedFile('2026-11-19T00:00:00.000Z'),
      [{ source: KZB, ok: true, via: 'tag', entries: [raw(1, '2026-11-01T00:00:00.000Z')] }],
      '2026-11-19T00:00:00.000Z',
    );
    const second = nextFeedFile(
      first,
      [{ source: KZB, ok: true, via: 'tag', entries: [raw(1, '2026-11-01T00:00:00.000Z')] }],
      '2026-11-20T00:00:00.000Z',
    );
    expect(second).toBe(first);
    expect(first.state).toBe('data');
  });
});

function feedIo(
  files: Record<string, unknown>,
  fetchFeedSource: RunIo['fetchFeedSource'],
): RunIo & { files: Record<string, unknown> } {
  return {
    files,
    readJson: async (name) => (name in files ? structuredClone(files[name]) : undefined),
    writeJson: async (name, value) => {
      files[name] = structuredClone(value);
    },
    fetchTenders: async () => [],
    readFeedRules: async () => RULES,
    fetchFeedSource,
    now: () => '2026-11-20T05:10:00.000Z',
    log: () => {},
    secrets: [],
  };
}

describe('лента: прогон sync-external', () => {
  it('опрашивает только включённые источники; запасной путь — partial', async () => {
    const asked: string[] = [];
    const io = feedIo({}, async (id) => {
      asked.push(id);
      return id === 'kyivzelenbud'
        ? {
            via: 'rss',
            entries: [raw(1, '2026-11-01T00:00:00.000Z')],
            rejected: [],
            mainError: new SourceError('SRC_HTTP_4XX', 'x'),
          }
        : {
            via: 'tag',
            entries: [raw(2, '2026-11-02T00:00:00.000Z', 'theconversation.com')],
            rejected: [],
            mainError: null,
          };
    });
    const result = await runSync(['feed'], io);
    expect(asked).toEqual([
      'kyivzelenbud',
      'desna',
      'podol',
      'dnipro',
      'hmarochos',
      'theconversation',
    ]);
    expect(result).toMatchObject({ siteChanged: true, anyChanged: true, failed: false });
    const state = io.files['sync-state.json'] as {
      items: { source: string; result: string; errorCode: string | null }[];
    };
    expect(state.items.find((s) => s.source === 'kyivzelenbud')).toMatchObject({
      result: 'partial',
      errorCode: 'SRC_HTTP_4XX',
    });
    expect((io.files['feed.json'] as FeedFile).items.map((i) => i.via)).toEqual(['tag', 'rss']);

    // Повтор той же выдачи: новых записей нет, коммита нет.
    const again = await runSync(['feed'], io);
    expect(again.anyChanged).toBe(false);
  });

  it('«новые» — только записи, вошедшие в файл впервые', async () => {
    // 50 записей за этот год и 10 старше года: в файл входят только первые.
    const deep = Array.from({ length: 60 }, (_, i) =>
      raw(
        i,
        new Date(Date.UTC(2026, 0, 1 + i) - (i >= 50 ? 400 : 0) * 86_400_000).toISOString(),
        'theconversation.com',
      ),
    );
    const io = feedIo({}, async (id) =>
      id === 'theconversation'
        ? { via: 'tag', entries: deep, rejected: [], mainError: null }
        : { via: 'tag', entries: [], rejected: [], mainError: null },
    );
    await runSync(['feed'], io);
    await runSync(['feed'], io);
    const state = io.files['sync-state.json'] as {
      items: { source: string; itemsNew: number; itemsFetched: number }[];
    };
    expect(state.items.find((s) => s.source === 'theconversation')).toMatchObject({
      itemsFetched: 60,
      itemsNew: 50,
    });
  });

  it('один источник упал — прогон успешен; упали все — прогон падает', async () => {
    const partial = await runSync(
      ['feed'],
      feedIo({}, async (id) => {
        if (id === 'kyivzelenbud') throw new SourceError('SRC_TIMEOUT', 'x');
        return { via: 'tag', entries: [], rejected: [], mainError: null };
      }),
    );
    expect(partial.failed).toBe(false);

    const io = feedIo({}, async () => {
      throw new SourceError('SRC_HTTP_5XX', 'x');
    });
    const all = await runSync(['feed'], io);
    expect(all.failed).toBe(true);
    expect(all.failReasons).toContain('feed: не ответил ни один источник ленты');
  });

  it('третий сбой подряд одного источника роняет прогон', async () => {
    const io = feedIo({}, async (id) => {
      if (id === 'kyivzelenbud') throw new SourceError('SRC_TIMEOUT', 'x');
      return { via: 'tag', entries: [], rejected: [], mainError: null };
    });
    expect((await runSync(['feed'], io)).failed).toBe(false);
    expect((await runSync(['feed'], io)).failed).toBe(false);
    const third = await runSync(['feed'], io);
    expect(third.failed).toBe(true);
    expect(third.failReasons[0]).toMatch(/^kyivzelenbud: 3 /u);
  });
});
