import { describe, expect, it } from 'vitest';
import { MemoryStore } from './gateway/memory-store.js';
import { newContent } from './gateway/store-contract.js';
import { INITIAL_DATA } from './gateway/initial-data.js';
import { backfillContent } from './domain/content-backfill.js';
import { seedContent } from './domain/content-seed.js';

const now = new Date('2026-11-26T19:00:00Z');
const published = new Date('2026-11-25T10:00:00Z');

/** Запись «Підприємства», как в рабочей БД до решения 053: без новых полей. */
async function storeWithOldEnterprise(extra: Record<string, unknown> = {}) {
  const store = new MemoryStore();
  const seed = INITIAL_DATA.enterprise as { items: Record<string, unknown>[] };
  const old = { ...seed.items[0]! };
  delete old['staffCount'];
  delete old['areas'];
  const rec = await store.insertContent(
    newContent('singleton', {
      kind: 'enterprise',
      data: { ...old, ...extra },
      status: 'published',
      updatedAt: published,
    }),
  );
  return { store, rec };
}

describe('backfillContent', () => {
  it('fills missing enterprise figures once, logs it and leaves an unpublished change', async () => {
    const { store, rec } = await storeWithOldEnterprise();
    expect(await store.countContentChangedSince(published)).toBe(0);

    expect(await backfillContent(store, INITIAL_DATA, now)).toEqual({
      '2026-11-enterprise-figures': ['staffCount', 'areas'],
    });
    const got = await store.findContent('enterprise', rec.id);
    expect(got?.data.staffCount).toBe(223);
    expect((got?.data.areas as unknown[]).length).toBe(9);
    expect(got?.data.infoReference).toEqual(rec.data.infoReference); // текст не трогается
    expect(await store.countContentChangedSince(published)).toBe(1);

    const log = await store.listLog({ skip: 0, limit: 10 });
    expect(log.items.map((e) => [e.action, e.entity, e.details])).toEqual([
      ['content.backfill', 'enterprise', { fields: 'staffCount, areas' }],
    ]);

    // Повторный запуск ничего не делает и журнал не пишет.
    expect(await backfillContent(store, INITIAL_DATA, now)).toEqual({});
    expect((await store.listLog({ skip: 0, limit: 10 })).total).toBe(1);
  });

  it('keeps what the editor entered and does not return a field cleared after the mark', async () => {
    const { store, rec } = await storeWithOldEnterprise({ staffCount: 230 });
    expect(await backfillContent(store, INITIAL_DATA, now)).toEqual({
      '2026-11-enterprise-figures': ['areas'],
    });
    const got = await store.findContent('enterprise', rec.id);
    expect(got?.data.staffCount).toBe(230);

    // Заказчик очистил перечень в админке — он не возвращается.
    const cleared = { ...got!.data };
    delete cleared['areas'];
    await store.replaceContent({ ...got!, data: cleared }, got!.updatedAt);
    expect(await backfillContent(store, INITIAL_DATA, now)).toEqual({});
    expect((await store.findContent('enterprise', rec.id))?.data.areas).toBeUndefined();
  });

  it('only marks a fresh database seeded with the new fields', async () => {
    const store = new MemoryStore();
    await seedContent(store, INITIAL_DATA, now);
    expect(await backfillContent(store, INITIAL_DATA, now)).toEqual({});
    expect((await store.listBackfills()).sort()).toEqual([
      '2026-11-enterprise-figures',
      '2026-11-feed-sources',
    ]);
    const log = await store.listLog({ skip: 0, limit: 10 });
    expect(log.items.map((e) => e.action)).toEqual(['content.seed']);
  });

  it('waits for the next start when there is no record yet', async () => {
    const store = new MemoryStore();
    expect(await backfillContent(store, INITIAL_DATA, now)).toEqual({});
    expect(await store.listBackfills()).toEqual([]);
  });

  it('feed sources: drops КМДА and GDELT, adds district sites, enables Хмарочос, keeps owner settings', async () => {
    const store = new MemoryStore();
    const seed = INITIAL_DATA['feed-rules'] as { items: Record<string, unknown>[] };
    // Перечень, как в рабочей БД до решения 055 (уривок у Київзеленбуду включил владелец).
    const old = {
      ...seed.items[0]!,
      sources: [
        { id: 'kmda', name: 'КМДА', enabled: false, excerptAllowed: true, note: 'x' },
        { id: 'kyivzelenbud', name: 'Київзеленбуд', enabled: true, excerptAllowed: true },
        { id: 'theconversation', name: 'The Conversation', enabled: true, excerptAllowed: true },
        { id: 'hmarochos', name: 'Хмарочос', enabled: false, excerptAllowed: false, note: 'y' },
        { id: 'gdelt', name: 'GDELT Project', enabled: false, excerptAllowed: false, note: 'z' },
      ],
    };
    const rec = await store.insertContent(
      newContent('singleton', {
        kind: 'feed-rules',
        data: old,
        status: 'published',
        updatedAt: published,
      }),
    );
    expect(await backfillContent(store, INITIAL_DATA, now)).toEqual({
      '2026-11-feed-sources': ['sources'],
    });
    const got = await store.findContent('feed-rules', rec.id);
    expect(got?.data.sources).toEqual([
      { id: 'kyivzelenbud', name: 'Київзеленбуд', enabled: true, excerptAllowed: true },
      { id: 'theconversation', name: 'The Conversation', enabled: true, excerptAllowed: true },
      { id: 'hmarochos', name: 'Хмарочос', enabled: true, excerptAllowed: false },
      { id: 'desna', name: 'КП УЗН Деснянського району', enabled: true, excerptAllowed: true },
      { id: 'podol', name: 'КП УЗН Подільського району', enabled: true, excerptAllowed: false },
      { id: 'dnipro', name: 'КП УЗН Дніпровського району', enabled: true, excerptAllowed: false },
    ]);
    expect(got?.data.dictionary).toEqual(seed.items[0]!['dictionary']);
    expect(await store.countContentChangedSince(published)).toBe(1);
    const log = await store.listLog({ skip: 0, limit: 10 });
    expect(log.items.map((e) => [e.action, e.entity])).toEqual([['content.patch', 'feed-rules']]);

    // Владелец потом выключил Хмарочос — повторный запуск это не отменяет.
    const off = (got!.data.sources as Record<string, unknown>[]).map((x) =>
      x['id'] === 'hmarochos' ? { ...x, enabled: false } : x,
    );
    await store.replaceContent({ ...got!, data: { ...got!.data, sources: off } }, got!.updatedAt);
    expect(await backfillContent(store, INITIAL_DATA, now)).toEqual({});
    const again = await store.findContent('feed-rules', rec.id);
    expect(
      (again?.data.sources as { id: string; enabled: boolean }[]).find((x) => x.id === 'hmarochos')
        ?.enabled,
    ).toBe(false);
  });
});
