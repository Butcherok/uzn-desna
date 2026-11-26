import { describe, expect, it } from 'vitest';
import { MemoryStore } from './gateway/memory-store.js';
import { newContent } from './gateway/store-contract.js';
import type { ContentKind } from './domain/model.js';
import { purgeRetiredContent } from './domain/content-retired.js';

const now = new Date('2026-11-26T18:00:00Z');

describe('purgeRetiredContent', () => {
  it('removes retired records once, logs it once, keeps the rest', async () => {
    const store = new MemoryStore();
    const retired = 'scenarios' as ContentKind;
    await store.insertContent(newContent('fallen-tree', { kind: retired }));
    await store.insertContent(newContent('dead-tree', { kind: retired, deletedAt: now }));
    await store.insertContent(newContent('pryimalnia'));

    expect(await purgeRetiredContent(store, now)).toEqual({ scenarios: 2 });
    expect(await purgeRetiredContent(store, now)).toEqual({});
    expect((await store.listContent('contacts')).map((r) => r.key)).toEqual(['pryimalnia']);
    expect((await store.getContentMeta()).purgedPending).toBe(0);

    const log = await store.listLog({ skip: 0, limit: 10 });
    expect(log.items.map((e) => [e.action, e.details])).toEqual([
      ['content.purge-retired', { scenarios: 2 }],
    ]);
  });
});
