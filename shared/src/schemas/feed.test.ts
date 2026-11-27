import { describe, expect, it } from 'vitest';
import { FEED_SOURCES, feedRulesSchema, normalizeFeedSources } from './feed.js';

const dictionary = {
  uk: { topics: ['парк'], pairs: [], stop: [] },
  en: { topics: ['park'], pairs: [], stop: [] },
};

describe('feed sources list (decision 055)', () => {
  it('a file saved before the change passes: retired sources dropped, new ones added', () => {
    const rules = feedRulesSchema.parse({
      dictionary,
      sources: [
        { id: 'kmda', name: 'КМДА', enabled: false, excerptAllowed: true },
        { id: 'kyivzelenbud', name: 'Київзеленбуд', enabled: false, excerptAllowed: true },
        { id: 'gdelt', name: 'GDELT Project', enabled: false, excerptAllowed: false },
      ],
    });
    expect(rules.sources.map((s) => s.id)).toEqual([
      'kyivzelenbud',
      'desna',
      'podol',
      'dnipro',
      'hmarochos',
      'theconversation',
    ]);
    // Настройки владельца у оставшегося источника не теряются.
    expect(rules.sources[0]).toMatchObject({ enabled: false, excerptAllowed: true });
  });

  it('a full list is left as it is; a non-list is left to the schema', () => {
    const full = FEED_SOURCES.map((s) => ({ ...s }));
    expect(normalizeFeedSources(full)).toEqual(full);
    expect(normalizeFeedSources('x')).toBe('x');
    expect(feedRulesSchema.safeParse({ dictionary, sources: 'x' }).success).toBe(false);
  });
});
