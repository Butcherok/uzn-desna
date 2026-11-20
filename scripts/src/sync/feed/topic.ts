/**
 * Словарь тем для записей, пришедших запасным путём через RSS
 * (ТЗ 7.4, пп. 2–3; отчёт 08, разделы 6 и 12.2).
 *
 * Корень совпадает с началом слова, многословный корень — с началом
 * слов подряд. Слова выделяются явными классами букв: `\w` кириллицу
 * не покрывает. Стоп-слова — только по заголовку и только если в
 * заголовке нет тематического корня. Слова, вошедшие в найденную
 * стоп-фразу, тематическими не считаются: иначе `theme park` или
 * `парк техніки` проходили бы по корню `park`/`парк` (решение 027).
 */
import type { FeedRules } from '@uzn/shared';

type Dictionary = FeedRules['dictionary']['uk'];

const LETTERS = /[a-zа-щьюяґєії']+/gu;

export function words(text: string): string[] {
  return text.toLowerCase().replace(/[’ʼ`]/gu, "'").match(LETTERS) ?? [];
}

/** Начала вхождений фразы: каждый корень — начало очередного слова. */
function phraseStarts(tokens: readonly (string | null)[], phrase: readonly string[]): number[] {
  const starts: number[] = [];
  if (phrase.length === 0) return starts;
  for (let i = 0; i + phrase.length <= tokens.length; i += 1) {
    if (phrase.every((root, j) => tokens[i + j]?.startsWith(root) === true)) starts.push(i);
  }
  return starts;
}

function hasAny(tokens: readonly (string | null)[], phrases: readonly (readonly string[])[]): boolean {
  return phrases.some((phrase) => phraseStarts(tokens, phrase).length > 0);
}

/** Слова, покрытые стоп-фразами, заменяются пустым местом. */
function withoutStop(
  tokens: readonly string[],
  stop: readonly (readonly string[])[],
): { rest: (string | null)[]; hit: boolean } {
  const rest: (string | null)[] = [...tokens];
  let hit = false;
  for (const phrase of stop) {
    for (const start of phraseStarts(tokens, phrase)) {
      hit = true;
      for (let j = 0; j < phrase.length; j += 1) rest[start + j] = null;
    }
  }
  return { rest, hit };
}

function topicPhrases(dictionary: Dictionary): string[][] {
  return [...dictionary.topics.map((root) => root.split(' ')), ...dictionary.pairs];
}

export function matchesTopic(dictionary: Dictionary, title: string, description: string): boolean {
  const topics = topicPhrases(dictionary);
  const { rest, hit } = withoutStop(
    words(title),
    dictionary.stop.map((root) => root.split(' ')),
  );
  if (hasAny(rest, topics)) return true;
  if (hit) return false;
  return hasAny(words(description), topics);
}
