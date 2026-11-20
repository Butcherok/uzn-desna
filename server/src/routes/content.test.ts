import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, CSRF_VALUE } from '../app.js';
import { loadConfig } from '../config/env.js';
import { KINDS } from '../domain/content-kinds.js';
import { seedContent } from '../domain/content-seed.js';
import { CONTENT_KINDS, type Role } from '../domain/model.js';
import { openSession } from '../domain/sessions.js';
import { INITIAL_DATA } from '../gateway/initial-data.js';
import { MemoryStore } from '../gateway/memory-store.js';
import { newUser } from '../gateway/store-contract.js';

const T0 = Date.parse('2026-11-20T10:00:00Z');
const H = { 'x-requested-with': CSRF_VALUE };

let opened: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of opened) await a.close();
  opened = [];
});

interface Ctx {
  app: FastifyInstance;
  store: MemoryStore;
  clock: { t: number };
  as: (role: Role) => (opts: InjectOptions) => Promise<LightMyRequestResponse>;
}

async function setup({ seed = true } = {}): Promise<Ctx> {
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://unused',
    SITE_ORIGIN: 'https://butcherok.github.io',
    BUILD_VERSION: 'test-1',
  });
  const store = new MemoryStore();
  const clock = { t: T0 };
  const now = () => new Date(clock.t);
  const app = await buildApp({ config, store, now, startedAt: now() });
  opened.push(app);
  if (seed) await seedContent(store, INITIAL_DATA, now());

  // Сессии открываются напрямую: вход с bcrypt проверяют тесты app.test.ts.
  const cookies = new Map<Role, string>();
  for (const role of ['owner', 'editor'] as const) {
    const user = await store.createUser(newUser(role, { role }));
    cookies.set(role, (await openSession(store, user.id, now())).token);
  }
  const as = (role: Role) => (opts: InjectOptions) =>
    app.inject({
      ...opts,
      headers: { ...H, ...(opts.headers ?? {}) },
      cookies: { [config.cookieName]: cookies.get(role) ?? '' },
    });
  return { app, store, clock, as };
}

const tick = (ctx: Ctx, ms = 1000) => {
  ctx.clock.t += ms;
};

async function firstId(ctx: Ctx, kind: string): Promise<string> {
  const res = await ctx.as('owner')({ method: 'GET', url: `/api/v1/${kind}` });
  return res.json().items[0].id as string;
}

const newContact = {
  purpose: { uk: 'Диспетчерська служба' },
  phone: '+380443373501',
  roundClock: true,
  confirmed: false,
  showInFooter: false,
};

describe('content registry', () => {
  it('covers every content kind exactly once', () => {
    expect(KINDS.map((k) => k.kind).sort()).toEqual([...CONTENT_KINDS].sort());
  });
});

describe('initial data (ТЗ 8.3, п. 10)', () => {
  it('loads data/*.json once, as published, with nothing pending', async () => {
    const store = new MemoryStore();
    const now = new Date(T0);
    const outcome = await seedContent(store, INITIAL_DATA, now);
    expect(outcome.status).toBe('seeded');
    const counts = outcome.status === 'seeded' ? outcome.counts : {};
    for (const kind of CONTENT_KINDS) {
      const items = (INITIAL_DATA[kind] as { items: unknown[] }).items;
      expect(counts[kind], kind).toBe(items.length);
    }
    // Вакансии держат свой статус (решение 026), остальное — опубликовано.
    const vacancies = (INITIAL_DATA.vacancies as { items: { status: string }[] }).items;
    const drafts = vacancies.filter((v) => v.status === 'draft').length;
    expect((await store.listContent('vacancies')).filter((r) => r.status === 'draft')).toHaveLength(
      drafts,
    );
    expect(
      (await store.listContent('leaders')).every(
        (r) => r.status === 'published' && r.firstPublishedAt?.getTime() === T0,
      ),
    ).toBe(true);
    expect(
      await store.countContentChangedSince((await store.getContentMeta()).lastPublishedAt),
    ).toBe(0);
    expect(store.log.at(-1)?.action).toBe('content.seed');

    // Повторный запуск — даже после удаления записей — ничего не загружает.
    store.content.clear();
    expect((await seedContent(store, INITIAL_DATA, new Date(T0 + 1000))).status).toBe(
      'skipped-already-seeded',
    );
    expect(store.content.size).toBe(0);
  });

  it('does not duplicate records after an interrupted load', async () => {
    const store = new MemoryStore();
    await seedContent(store, { contacts: INITIAL_DATA.contacts }, new Date(T0));
    store.meta = { ...store.meta, seededAt: null };
    const again = await seedContent(store, INITIAL_DATA, new Date(T0 + 1000));
    expect(again.status === 'seeded' && again.counts['contacts']).toBe(0);
    expect(await store.listContent('contacts')).toHaveLength(
      (INITIAL_DATA.contacts as { items: unknown[] }).items.length,
    );
  });
});

describe('access', () => {
  it('requires a session, the CSRF header, and a reachable database', async () => {
    const ctx = await setup();
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/contacts' })).statusCode).toBe(401);
    const noCsrf = await ctx.as('owner')({
      method: 'POST',
      url: '/api/v1/contacts',
      headers: { 'x-requested-with': '' },
      payload: newContact,
    });
    expect(noCsrf.statusCode).toBe(403);
    ctx.store.available = false;
    const down = await ctx.as('owner')({ method: 'GET', url: '/api/v1/contacts' });
    expect(down.statusCode).toBe(503);
    expect(down.json().error.code).toBe('DB_UNAVAILABLE');
  });

  it('green-zones and equipment are not served yet (version 3)', async () => {
    const ctx = await setup();
    for (const url of ['/api/v1/green-zones', '/api/v1/equipment']) {
      expect((await ctx.as('owner')({ method: 'GET', url })).statusCode).toBe(404);
    }
  });
});

describe('lists and reading', () => {
  it('lists active records in order, the trash separately', async () => {
    const ctx = await setup();
    const res = await ctx.as('editor')({ method: 'GET', url: '/api/v1/services' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(body.items.length);
    expect(body.pendingChanges).toBe(0);
    const orders = body.items.map((i: { data: { order: number } }) => i.data.order);
    expect(orders).toEqual([...orders].sort((a: number, b: number) => a - b));
    expect(body.items[0]).toMatchObject({ status: 'published', deletedAt: null });
    expect(Object.keys(body.items[0]).sort()).toEqual(
      ['createdAt', 'data', 'deletedAt', 'firstPublishedAt', 'id', 'status', 'updatedAt'].sort(),
    );

    const trash = await ctx.as('editor')({ method: 'GET', url: '/api/v1/services?trashed=1' });
    expect(trash.json().total).toBe(0);
  });

  it('reads one record with an ETag; unknown id is 404 in Ukrainian', async () => {
    const ctx = await setup();
    const id = await firstId(ctx, 'leaders');
    const one = await ctx.as('owner')({ method: 'GET', url: `/api/v1/leaders/${id}` });
    expect(one.statusCode).toBe(200);
    expect(one.headers.etag).toBe(`"${one.json().updatedAt}"`);
    const missing = await ctx.as('owner')({ method: 'GET', url: '/api/v1/leaders/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toEqual({ code: 'NOT_FOUND', message: 'Запис не знайдено' });
  });
});

describe('create', () => {
  it('builds slug and order, starts as draft, counts a pending change, logs field names', async () => {
    const ctx = await setup();
    tick(ctx);
    const res = await ctx.as('editor')({
      method: 'POST',
      url: '/api/v1/contacts',
      payload: newContact,
    });
    expect(res.statusCode).toBe(201);
    const { item, pendingChanges } = res.json();
    expect(item.data.slug).toBe('dyspetcherska-sluzhba');
    expect(item.data.order).toBe((INITIAL_DATA.contacts as { items: unknown[] }).items.length + 1);
    expect(item.status).toBe('draft');
    expect(pendingChanges).toBe(1);
    const entry = ctx.store.log.at(-1);
    expect(entry).toMatchObject({ action: 'content.create', entity: 'contacts', result: 'ok' });
    expect(entry?.details['fields']).toContain('phone');
    // Значения полей в журнал не пишутся (ТЗ 8.3, п. 9).
    expect(JSON.stringify(entry?.details)).not.toContain('+380443373501');

    const again = await ctx.as('owner')({
      method: 'POST',
      url: '/api/v1/contacts',
      payload: newContact,
    });
    expect(again.json().item.data.slug).toBe('dyspetcherska-sluzhba-2');
  });

  it('rejects invalid data with 422 and Ukrainian field messages', async () => {
    const ctx = await setup();
    const res = await ctx.as('owner')({
      method: 'POST',
      url: '/api/v1/contacts',
      payload: { ...newContact, purpose: undefined, phone: '044 337 35 01' },
    });
    expect(res.statusCode).toBe(422);
    const { error } = res.json();
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('Перевірте заповнені поля');
    expect(error.fields['purpose']).toBe("Обов'язкове поле");
    expect(error.fields['phone']).toBe('Невірний формат');
    // Автоматический slug не построился без названия — об этом говорит поле названия.
    expect(error.fields['slug']).toBeUndefined();

    const notObject = await ctx.as('owner')({
      method: 'POST',
      url: '/api/v1/contacts',
      payload: [1, 2],
    });
    expect(notObject.statusCode).toBe(400);
  });

  it('lets only the owner set slug; a taken slug is 409', async () => {
    const ctx = await setup();
    const denied = await ctx.as('editor')({
      method: 'POST',
      url: '/api/v1/contacts',
      payload: { ...newContact, slug: 'dyspetcher' },
    });
    expect(denied.statusCode).toBe(403);
    expect(ctx.store.log.at(-1)).toMatchObject({ result: 'denied', details: { reason: 'slug' } });

    const ok = await ctx.as('owner')({
      method: 'POST',
      url: '/api/v1/contacts',
      payload: { ...newContact, slug: 'dyspetcher' },
    });
    expect(ok.json().item.data.slug).toBe('dyspetcher');
    const taken = await ctx.as('owner')({
      method: 'POST',
      url: '/api/v1/contacts',
      payload: { ...newContact, slug: 'pryimalnia' },
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.fields).toEqual({ slug: 'Вже існує' });
  });

  it('checks that contactId points at an existing contact', async () => {
    const ctx = await setup();
    const res = await ctx.as('owner')({
      method: 'POST',
      url: '/api/v1/vacancies',
      payload: {
        position: { uk: 'Садівник' },
        requirements: { uk: 'Досвід роботи' },
        contactId: 'nemaie',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.fields).toEqual({ contactId: 'Такого контакту немає' });
  });
});

describe('patch', () => {
  it('merges fields, null removes one, an empty change does not touch updatedAt', async () => {
    const ctx = await setup();
    const id = await firstId(ctx, 'contacts');
    tick(ctx);
    const res = await ctx.as('editor')({
      method: 'PATCH',
      url: `/api/v1/contacts/${id}`,
      payload: { hours: null, showInFooter: false },
    });
    expect(res.statusCode).toBe(200);
    const { item, pendingChanges } = res.json();
    expect(item.data.hours).toBeUndefined();
    expect(item.data.purpose.uk).toBe('Приймальня');
    expect(pendingChanges).toBe(1);

    tick(ctx);
    const same = await ctx.as('editor')({
      method: 'PATCH',
      url: `/api/v1/contacts/${id}`,
      payload: { purpose: item.data.purpose },
    });
    expect(same.json().item.updatedAt).toBe(item.updatedAt);
  });

  it('If-Match: stale version is 409, current passes', async () => {
    const ctx = await setup();
    const id = await firstId(ctx, 'scenarios');
    const before = await ctx.as('owner')({ method: 'GET', url: `/api/v1/scenarios/${id}` });
    const seen = before.headers.etag as string;
    const emergency = before.json().data.emergency as boolean;
    tick(ctx);
    const changed = await ctx.as('owner')({
      method: 'PATCH',
      url: `/api/v1/scenarios/${id}`,
      payload: { emergency: !emergency },
    });
    expect(changed.json().item.updatedAt).not.toBe(before.json().updatedAt);
    const stale = await ctx.as('owner')({
      method: 'PATCH',
      url: `/api/v1/scenarios/${id}`,
      headers: { 'if-match': seen },
      payload: { emergency },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.message).toBe('Запис змінився або вже існує. Оновіть сторінку');
    const fresh = (await ctx.as('owner')({ method: 'GET', url: `/api/v1/scenarios/${id}` })).headers
      .etag as string;
    const ok = await ctx.as('owner')({
      method: 'PATCH',
      url: `/api/v1/scenarios/${id}`,
      headers: { 'if-match': fresh },
      payload: { emergency },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('a published slug changes only with confirmation and is logged', async () => {
    const ctx = await setup();
    const id = await firstId(ctx, 'services');
    const url = `/api/v1/services/${id}`;
    const denied = await ctx.as('editor')({ method: 'PATCH', url, payload: { slug: 'nove' } });
    expect(denied.statusCode).toBe(403);
    const unconfirmed = await ctx.as('owner')({ method: 'PATCH', url, payload: { slug: 'nove' } });
    expect(unconfirmed.statusCode).toBe(409);
    expect(unconfirmed.json().error.fields).toEqual({ slug: 'Потрібне підтвердження' });
    const ok = await ctx.as('owner')({
      method: 'PATCH',
      url: `${url}?confirmSlugChange=1`,
      payload: { slug: 'nove' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ctx.store.log.at(-1)?.details).toMatchObject({ slugTo: 'nove' });
  });

  it('only the owner marks a leader card as confirmed (ТЗ 9.1)', async () => {
    const ctx = await setup();
    const id = await firstId(ctx, 'leaders');
    const mark = { confirmedAt: '2026-11-21T09:00:00.000Z', confirmedBy: 'Карп Є. А.' };
    const url = `/api/v1/leaders/${id}`;
    expect((await ctx.as('editor')({ method: 'PATCH', url, payload: mark })).statusCode).toBe(403);
    // Остальные поля карточки редактор правит.
    const bio = await ctx.as('editor')({
      method: 'PATCH',
      url,
      payload: { position: { uk: 'Директор підприємства' } },
    });
    expect(bio.statusCode).toBe(200);
    const ok = await ctx.as('owner')({ method: 'PATCH', url, payload: mark });
    expect(ok.json().item.data.confirmedBy).toBe('Карп Є. А.');
  });
});

describe('status', () => {
  it('publishing sets firstPublishedAt; a vacancy mirrors status and gets publishedAt', async () => {
    const ctx = await setup();
    const created = await ctx.as('editor')({
      method: 'POST',
      url: '/api/v1/vacancies',
      payload: {
        position: { uk: 'Садівник' },
        requirements: { uk: 'Досвід роботи' },
        contactId: 'viddil-kadriv',
        status: 'published',
      },
    });
    const item = created.json().item;
    expect(item.data.status).toBe('draft');
    tick(ctx);
    const pub = await ctx.as('editor')({
      method: 'POST',
      url: `/api/v1/vacancies/${item.id}/status`,
      payload: { status: 'published' },
    });
    expect(pub.statusCode).toBe(200);
    const next = pub.json().item;
    expect(next.status).toBe('published');
    expect(next.data.status).toBe('published');
    expect(next.data.publishedAt).toBe(new Date(ctx.clock.t).toISOString());
    expect(next.firstPublishedAt).toBe(new Date(ctx.clock.t).toISOString());

    const bad = await ctx.as('editor')({
      method: 'POST',
      url: `/api/v1/vacancies/${item.id}/status`,
      payload: { status: 'archived' },
    });
    expect(bad.statusCode).toBe(422);
  });

  it('a leader without confirmedAt and a scenario without phone can be published (ТЗ 3.29)', async () => {
    const ctx = await setup();
    for (const [kind, payload] of [
      ['leaders', { fullName: { uk: 'Тестовий Т. Т.' }, position: { uk: 'Інженер' } }],
      ['scenarios', { situation: { uk: 'Впало дерево' }, emergency: true }],
    ] as const) {
      const id = (await ctx.as('owner')({ method: 'POST', url: `/api/v1/${kind}`, payload })).json()
        .item.id;
      const res = await ctx.as('owner')({
        method: 'POST',
        url: `/api/v1/${kind}/${id}/status`,
        payload: { status: 'published' },
      });
      expect(res.statusCode, kind).toBe(200);
    }
  });
});

describe('trash', () => {
  it('soft delete, trash list, restore; trashed records are read-only', async () => {
    const ctx = await setup();
    const id = await firstId(ctx, 'public-docs');
    tick(ctx);
    const del = await ctx.as('editor')({ method: 'DELETE', url: `/api/v1/public-docs/${id}` });
    expect(del.statusCode).toBe(200);
    expect(del.json().item.deletedAt).not.toBeNull();
    expect(del.json().pendingChanges).toBe(1);
    const trash = await ctx.as('editor')({ method: 'GET', url: '/api/v1/public-docs?trashed=1' });
    expect(trash.json().items.map((i: { id: string }) => i.id)).toEqual([id]);
    const patch = await ctx.as('editor')({
      method: 'PATCH',
      url: `/api/v1/public-docs/${id}`,
      payload: { featured: false },
    });
    expect(patch.statusCode).toBe(409);
    const back = await ctx.as('editor')({
      method: 'POST',
      url: `/api/v1/public-docs/${id}/restore`,
    });
    expect(back.json().item.deletedAt).toBeNull();
  });

  it('a contact in use is not deleted and keeps its slug', async () => {
    const ctx = await setup();
    const contacts = (await ctx.as('owner')({ method: 'GET', url: '/api/v1/contacts' })).json()
      .items as { id: string; data: { slug: string } }[];
    const hr = contacts.find((c) => c.data.slug === 'viddil-kadriv');
    const del = await ctx.as('owner')({ method: 'DELETE', url: `/api/v1/contacts/${hr?.id}` });
    expect(del.statusCode).toBe(409);
    expect(del.json().error.message).toMatch(/^Контакт використовується: Вакансії — \d+/u);
    const rename = await ctx.as('owner')({
      method: 'PATCH',
      url: `/api/v1/contacts/${hr?.id}?confirmSlugChange=1`,
      payload: { slug: 'kadry' },
    });
    expect(rename.statusCode).toBe(409);
  });

  it('a record whose contact is gone cannot be restored', async () => {
    const ctx = await setup();
    const contact = (
      await ctx.as('owner')({ method: 'POST', url: '/api/v1/contacts', payload: newContact })
    ).json().item;
    const service = (
      await ctx.as('owner')({
        method: 'POST',
        url: '/api/v1/services',
        payload: {
          title: { uk: 'Обстеження дерев' },
          summary: { uk: 'Огляд стану' },
          group: { uk: 'Догляд' },
          contactId: contact.data.slug,
        },
      })
    ).json().item;
    await ctx.as('owner')({ method: 'DELETE', url: `/api/v1/services/${service.id}` });
    // Корзина не держит ссылку: контакт удаляется.
    const del = await ctx.as('owner')({ method: 'DELETE', url: `/api/v1/contacts/${contact.id}` });
    expect(del.statusCode).toBe(200);
    const back = await ctx.as('owner')({
      method: 'POST',
      url: `/api/v1/services/${service.id}/restore`,
    });
    expect(back.statusCode).toBe(409);
    expect(back.json().error.message).toMatch(/Спочатку відновіть контакт/u);
  });

  it('permanent delete: owner only, only from the trash, still counted until published', async () => {
    const ctx = await setup();
    const id = await firstId(ctx, 'scenarios');
    const url = `/api/v1/scenarios/${id}`;
    const notTrashed = await ctx.as('owner')({ method: 'DELETE', url: `${url}?permanent=1` });
    expect(notTrashed.statusCode).toBe(409);
    tick(ctx);
    await ctx.as('owner')({ method: 'DELETE', url });
    const editor = await ctx.as('editor')({ method: 'DELETE', url: `${url}?permanent=1` });
    expect(editor.statusCode).toBe(403);
    const ok = await ctx.as('owner')({ method: 'DELETE', url: `${url}?permanent=1` });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ pendingChanges: 1 });
    expect((await ctx.as('owner')({ method: 'GET', url })).statusCode).toBe(404);
    expect(ctx.store.log.at(-1)).toMatchObject({ action: 'content.purge', result: 'ok' });
  });
});

describe('order', () => {
  it('takes the whole list, numbers from 1, touches only moved records', async () => {
    const ctx = await setup();
    const list = (await ctx.as('editor')({ method: 'GET', url: '/api/v1/leaders' })).json()
      .items as { id: string }[];
    const ids = list.map((i) => i.id);
    const partial = await ctx.as('editor')({
      method: 'PATCH',
      url: '/api/v1/leaders/order',
      payload: { ids: ids.slice(1) },
    });
    expect(partial.statusCode).toBe(422);
    const dup = await ctx.as('editor')({
      method: 'PATCH',
      url: '/api/v1/leaders/order',
      payload: { ids: [...ids.slice(1), ids[1]] },
    });
    expect(dup.statusCode).toBe(422);

    tick(ctx);
    const swapped = [ids[1], ids[0], ...ids.slice(2)];
    const res = await ctx.as('editor')({
      method: 'PATCH',
      url: '/api/v1/leaders/order',
      payload: { ids: swapped },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual(swapped);
    expect(body.items.map((i: { data: { order: number } }) => i.data.order)).toEqual(
      swapped.map((_, n) => n + 1),
    );
    expect(body.pendingChanges).toBe(2);
  });

  it('static blocks have no order and keep their key', async () => {
    const ctx = await setup();
    const order = await ctx.as('owner')({
      method: 'PATCH',
      url: '/api/v1/static-blocks/order',
      payload: { ids: [] },
    });
    // `order` здесь — не путь порядка, а идентификатор записи, которой нет.
    expect(order.statusCode).toBe(404);
    const id = await firstId(ctx, 'static-blocks');
    const res = await ctx.as('owner')({
      method: 'PATCH',
      url: `/api/v1/static-blocks/${id}`,
      payload: { blockKey: 'tenders.note' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.fields).toEqual({ blockKey: 'Ключ блоку не змінюється' });
  });
});

describe('singletons', () => {
  it('enterprise: GET and PATCH for both roles; no list routes', async () => {
    const ctx = await setup();
    const got = await ctx.as('editor')({ method: 'GET', url: '/api/v1/enterprise' });
    expect(got.statusCode).toBe(200);
    expect(got.json().data.edrpou).toBe('04589645');
    const bad = await ctx.as('editor')({
      method: 'PATCH',
      url: '/api/v1/enterprise',
      payload: { edrpou: '123' },
    });
    expect(bad.statusCode).toBe(422);
    expect(
      (await ctx.as('editor')({ method: 'POST', url: '/api/v1/enterprise', payload: {} }))
        .statusCode,
    ).toBe(404);
  });

  it('feed-rules: the editor reads, only the owner edits (ТЗ 9.1)', async () => {
    const ctx = await setup();
    const got = await ctx.as('editor')({ method: 'GET', url: '/api/v1/feed-rules' });
    expect(got.statusCode).toBe(200);
    const sources = got.json().data.sources;
    const denied = await ctx.as('editor')({
      method: 'PATCH',
      url: '/api/v1/feed-rules',
      payload: { sources },
    });
    expect(denied.statusCode).toBe(403);
    expect(ctx.store.log.at(-1)).toMatchObject({ entity: 'feed-rules', result: 'denied' });
    const ok = await ctx.as('owner')({
      method: 'PATCH',
      url: '/api/v1/feed-rules',
      payload: { sources: sources.slice(0, 1) },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('a singleton missing before the first load is created by PATCH', async () => {
    const ctx = await setup({ seed: false });
    expect((await ctx.as('owner')({ method: 'GET', url: '/api/v1/enterprise' })).statusCode).toBe(
      404,
    );
    const [data = {}] = (INITIAL_DATA.enterprise as { items: Record<string, unknown>[] }).items;
    const res = await ctx.as('owner')({
      method: 'PATCH',
      url: '/api/v1/enterprise',
      payload: data,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.status).toBe('published');
  });
});
