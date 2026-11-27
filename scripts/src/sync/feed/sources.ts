/**
 * Источники ленты (ТЗ 7.4; решение 055): основной путь — выборка по датам
 * (у Хмарочоса и The Conversation — по тематическим тегам), запасной — RSS.
 * Какие источники опрашиваются, решает `feed-rules.json` (п. 1), а не этот
 * файл. Сайты сети «Київзеленбуд» тематических рубрик не имеют: их записи
 * проходят словарь и основным путём (`topicFilter`).
 */
import type { FeedRules, FeedSourceId } from '@uzn/shared';
import { SourceError, fetchText } from '../http.js';
import type { FetchDeps } from '../http.js';
import { parseAtom, parseRss, parseWpPosts } from './parse.js';
import type { RawEntry } from './parse.js';
import { matchesTopic } from './topic.js';
import { stripHtml, urlKey } from './text.js';

export type FeedVia = 'tag' | 'rss';

export interface SourceFetch {
  via: FeedVia;
  entries: RawEntry[];
  /** Адреса записей, отсеянных словарём: такие уходят и из сохранённых. */
  rejected: string[];
  /** Код сбоя основного пути, если сработал запасной. */
  mainError: SourceError | null;
}

export interface SourceSpec {
  domain: string;
  lang: 'uk' | 'en';
  /** Записи основного пути тоже проходят словарь: у источника нет тематических тегов. */
  topicFilter: boolean;
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
    const url = `${base}/wp-json/wp/v2/posts?after=${after}&per_page=100${query}&_fields=date_gmt,link,title,excerpt`;
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

/** Сайт сети «Київзеленбуд»: один WordPress, рубрик по теме нет (исследование 15, раздел 2). */
function network(domain: string): SourceSpec {
  return {
    domain,
    lang: 'uk',
    topicFilter: true,
    main: wpRest(`https://${domain}`, ''),
    rss: rss(`https://${domain}/feed/`),
  };
}

export const SOURCES: Readonly<Record<FeedSourceId, SourceSpec>> = {
  kyivzelenbud: network('kyivzelenbud.com'),
  desna: network('desna.kyivzelenbud.com'),
  podol: network('podol.kyivzelenbud.com'),
  dnipro: network('dnipro.kyivzelenbud.com'),
  theconversation: {
    domain: 'theconversation.com',
    lang: 'en',
    topicFilter: false,
    main: (deps) => conversation(deps),
  },
  hmarochos: {
    domain: 'hmarochos.kiev.ua',
    lang: 'uk',
    topicFilter: false,
    main: wpRest('https://hmarochos.kiev.ua', '&tags=317,5445,1705,1644'),
    rss: rss('https://hmarochos.kiev.ua/tag/ozelenennya/feed/'),
  },
};

/** Записи без тематического тега проходят словарь языка источника (ТЗ 7.4, п. 2). */
export function filterByTopic(
  rules: FeedRules,
  lang: 'uk' | 'en',
  entries: readonly RawEntry[],
): { entries: RawEntry[]; rejected: string[] } {
  const dictionary = rules.dictionary[lang];
  const kept: RawEntry[] = [];
  const rejected: string[] = [];
  for (const item of entries) {
    if (matchesTopic(dictionary, item.title, stripHtml(item.html))) kept.push(item);
    else rejected.push(urlKey(item.url));
  }
  return { entries: kept, rejected };
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
  let mainError: SourceError | null = null;
  if (spec.main !== undefined) {
    try {
      const entries = await spec.main(deps, now);
      if (!spec.topicFilter) return { via: 'tag', entries, rejected: [], mainError: null };
      return { via: 'tag', ...filterByTopic(rules, spec.lang, entries), mainError: null };
    } catch (error) {
      mainError =
        error instanceof SourceError ? error : new SourceError('SRC_PARSE', (error as Error).name);
      if (spec.rss === undefined) throw mainError;
      deps.log(`${id}: основной путь — ${mainError.code}, пробую RSS`);
    }
  }
  if (spec.rss === undefined) throw new SourceError('SRC_PARSE', `source ${id}: no path`);
  try {
    return { via: 'rss', ...filterByTopic(rules, spec.lang, await spec.rss(deps)), mainError };
  } catch (error) {
    throw mainError ?? error;
  }
}
