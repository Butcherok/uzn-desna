/**
 * Разбор ответов источников ленты: WordPress REST, RSS 2.0, Atom.
 *
 * `Content-Type` не учитывается: сайты WordPress отдают ленту как
 * `text/plain` (отчёт 08, раздел 12.1). Запись без адреса, заголовка или
 * даты пропускается; ответ, в котором не разобралось ничего, хотя записи
 * были, — `SRC_PARSE`, а не тихая пустая лента.
 */
import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { SourceError } from '../http.js';
import { cleanTitle } from './text.js';

export interface RawEntry {
  url: string;
  title: string;
  publishedAt: string;
  /** Описание или содержимое записи в HTML: для словаря и отрывка. */
  html: string;
}

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ['item', 'entry', 'link', 'category'].includes(name),
});

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value !== null && typeof value === 'object' && '#text' in value) {
    return text((value as Record<string, unknown>)['#text']);
  }
  return '';
}

function isoDate(raw: string): string | null {
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function httpsUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function entry(url: string, title: string, date: string, html: string): RawEntry | null {
  const safeUrl = httpsUrl(url);
  const cleanName = cleanTitle(title);
  const publishedAt = isoDate(date);
  if (safeUrl === null || cleanName === '' || publishedAt === null) return null;
  return { url: safeUrl, title: cleanName.slice(0, 300), publishedAt, html };
}

function finish(found: number, entries: (RawEntry | null)[]): RawEntry[] {
  const ok = entries.filter((item): item is RawEntry => item !== null);
  if (found > 0 && ok.length === 0) {
    throw new SourceError('SRC_PARSE', `0 of ${found} entries parsed`);
  }
  return ok;
}

const wpPostSchema = z.object({
  date_gmt: z.string(),
  link: z.string(),
  title: z.object({ rendered: z.string() }),
  excerpt: z.object({ rendered: z.string() }).optional(),
});

/** `GET /wp-json/wp/v2/posts`: `date_gmt` приходит без пояса — это UTC. */
export function parseWpPosts(body: string): RawEntry[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new SourceError('SRC_PARSE', 'body is not JSON');
  }
  const parsed = z.array(wpPostSchema).safeParse(json);
  if (!parsed.success) {
    throw new SourceError('SRC_PARSE', `unexpected shape at ${parsed.error.issues[0]?.path.join('.')}`);
  }
  return finish(
    parsed.data.length,
    parsed.data.map((post) =>
      entry(post.link, post.title.rendered, `${post.date_gmt}Z`, post.excerpt?.rendered ?? ''),
    ),
  );
}

function parseXml(body: string): Record<string, unknown> {
  try {
    return xml.parse(body) as Record<string, unknown>;
  } catch {
    throw new SourceError('SRC_PARSE', 'body is not XML');
  }
}

export function parseRss(body: string): RawEntry[] {
  const doc = parseXml(body);
  const channel = (doc['rss'] as Record<string, unknown> | undefined)?.['channel'] as
    Record<string, unknown> | undefined;
  if (channel === undefined) throw new SourceError('SRC_PARSE', 'no rss/channel');
  const items = (channel['item'] as Record<string, unknown>[] | undefined) ?? [];
  return finish(
    items.length,
    items.map((item) => {
      const links = (item['link'] as unknown[] | undefined) ?? [];
      return entry(
        text(links[0]),
        text(item['title']),
        text(item['pubDate']),
        text(item['description']),
      );
    }),
  );
}

export function parseAtom(body: string): RawEntry[] {
  const doc = parseXml(body);
  const feed = doc['feed'] as Record<string, unknown> | undefined;
  if (feed === undefined) throw new SourceError('SRC_PARSE', 'no atom feed');
  const entries = (feed['entry'] as Record<string, unknown>[] | undefined) ?? [];
  return finish(
    entries.length,
    entries.map((item) => {
      const links = (item['link'] as Record<string, unknown>[] | undefined) ?? [];
      const alternate =
        links.find((link) => (link['@_rel'] ?? 'alternate') === 'alternate') ?? links[0];
      return entry(
        text(alternate?.['@_href']),
        text(item['title']),
        text(item['published']) || text(item['updated']),
        text(item['summary']) || text(item['content']),
      );
    }),
  );
}
