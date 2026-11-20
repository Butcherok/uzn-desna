/**
 * Источники ленты (ТЗ 7.4): основной путь — тематическая выборка, запасной —
 * RSS через словарь. Какие источники опрашиваются, решает `feed-rules.json`
 * (п. 1), а не этот файл.
 *
 * Не сделано нарочно (решение 027):
 * - HTML-выборка КМДА по тегу 19: раннерам GitHub kyivcity.gov.ua отвечает
 *   проверкой Cloudflare (403), разметку выдачи с раннера не получить, а
 *   разбор вслепую не проверить. Описан только запасной путь — RSS.
 * - GDELT: выключен до удачного повторного прогона (ТЗ 7.4).
 */
import type { FeedRules, FeedSourceId } from '@uzn/shared';
import { SourceError, fetchText } from '../http.js';
import type { FetchDeps } from '../http.js';
import { parseAtom, parseRss, parseWpPosts } from './parse.js';
import type { RawEntry } from './parse.js';
import { matchesTopic } from './topic.js';
import { stripHtml } from './text.js';

export type FeedVia = 'tag' | 'rss';

export interface SourceFetch {
  via: FeedVia;
  entries: RawEntry[];
  /** Код сбоя основного пути, если сработал запасной. */
  mainError: SourceError | null;
}

export interface SourceSpec {
  domain: string;
  lang: 'uk' | 'en';
  main?: (deps: FetchDeps, now: Date) => Promise<RawEntry[]>;
  rss?: (deps: FetchDeps) => Promise<RawEntry[]>;
}

/**
 * Окно выборки по датам. Большое нарочно: сохранённые записи окном не
 * ограничены, а при запуске и после долгого сбоя оно добирает ленту
 * (у Київзеленбуду около 0,5 материала в неделю, отчёт 08, раздел 12.4).
 */
const WINDOW_DAYS = 180;

const HEADERS = {
  'user-agent': 'uzn-desna-sync/1.0 (+https://github.com/Butcherok/uzn-desna)',
};

function get(deps: FetchDeps, label: string, url: string): Promise<string> {
  return fetchText(label, url, { headers: HEADERS }, deps);
}

function wpRest(base: string, query: string) {
  return async (deps: FetchDeps, now: Date): Promise<RawEntry[]> => {
    const after = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 19);
    const url = `${base}/wp-json/wp/v2/posts?after=${after}&per_page=20${query}&_fields=date_gmt,link,title,excerpt`;
    return parseWpPosts(await get(deps, new URL(base).hostname, url));
  };
}

function rss(url: string) {
  return async (deps: FetchDeps): Promise<RawEntry[]> =>
    parseRss(await get(deps, `${new URL(url).hostname} rss`, url));
}

/** Темы The Conversation — отчёт 08, раздел 12.1. */
export const CONVERSATION_TOPICS = [
  'urban-greening-31678',
  'green-infrastructure-22601',
  'urban-trees-58019',
  'green-space-5295',
  'urban-green-space-91262',
  'green-cities-15363',
  'urban-heat-25654',
] as const;

/** Источник ответил, если ответила хоть одна тема; иначе — сбой первой темы. */
async function conversation(deps: FetchDeps): Promise<RawEntry[]> {
  const results = await Promise.allSettled(
    CONVERSATION_TOPICS.map(async (topic) =>
      parseAtom(
        await get(
          deps,
          `theconversation ${topic}`,
          `https://theconversation.com/topics/${topic}/articles.atom`,
        ),
      ),
    ),
  );
  const ok = results.filter(
    (r): r is PromiseFulfilledResult<RawEntry[]> => r.status === 'fulfilled',
  );
  if (ok.length === 0) {
    const first = results[0];
    throw first?.status === 'rejected' && first.reason instanceof SourceError
      ? first.reason
      : new SourceError('SRC_PARSE', 'no topic parsed');
  }
  return ok.flatMap((r) => r.value);
}

export const SOURCES: Readonly<Partial<Record<FeedSourceId, SourceSpec>>> = {
  kmda: {
    domain: 'kyivcity.gov.ua',
    lang: 'uk',
    rss: rss('https://kyivcity.gov.ua/rss/'),
  },
  kyivzelenbud: {
    domain: 'kyivzelenbud.com',
    lang: 'uk',
    main: wpRest('https://kyivzelenbud.com', ''),
    rss: rss('https://kyivzelenbud.com/feed/'),
  },
  theconversation: {
    domain: 'theconversation.com',
    lang: 'en',
    main: (deps) => conversation(deps),
  },
  hmarochos: {
    domain: 'hmarochos.kiev.ua',
    lang: 'uk',
    main: wpRest('https://hmarochos.kiev.ua', '&tags=317,5445,1705,1644'),
    rss: rss('https://hmarochos.kiev.ua/tag/ozelenennya/feed/'),
  },
};

/** Записи RSS проходят словарь языка источника (ТЗ 7.4, п. 2). */
export function filterByTopic(
  rules: FeedRules,
  lang: 'uk' | 'en',
  entries: readonly RawEntry[],
): RawEntry[] {
  const dictionary = rules.dictionary[lang];
  return entries.filter((item) => matchesTopic(dictionary, item.title, stripHtml(item.html)));
}

/**
 * Основной путь, при его сбое — запасной. Сбой обоих — ошибка основного
 * пути: она точнее говорит, что сломалось у источника.
 */
export async function fetchSource(
  id: FeedSourceId,
  rules: FeedRules,
  deps: FetchDeps,
  now: Date,
): Promise<SourceFetch> {
  const spec = SOURCES[id];
  if (spec === undefined) throw new SourceError('SRC_PARSE', `source ${id}: no fetcher`);
  let mainError: SourceError | null = null;
  if (spec.main !== undefined) {
    try {
      return { via: 'tag', entries: await spec.main(deps, now), mainError: null };
    } catch (error) {
      mainError =
        error instanceof SourceError ? error : new SourceError('SRC_PARSE', (error as Error).name);
      if (spec.rss === undefined) throw mainError;
      deps.log(`${id}: основной путь — ${mainError.code}, пробую RSS`);
    }
  }
  if (spec.rss === undefined) throw new SourceError('SRC_PARSE', `source ${id}: no path`);
  try {
    const entries = filterByTopic(rules, spec.lang, await spec.rss(deps));
    return { via: 'rss', entries, mainError };
  } catch (error) {
    throw mainError ?? error;
  }
}
