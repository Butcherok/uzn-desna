import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, CSRF_VALUE } from '../app.js';
import { loadConfig } from '../config/env.js';
import { mediaPathsIn, seedContent } from '../domain/content-seed.js';
import type { Role } from '../domain/model.js';
import type { RunState, WorkflowRunner } from '../domain/publish.js';
import { openSession } from '../domain/sessions.js';
import { INITIAL_DATA } from '../gateway/initial-data.js';
import { MemoryStore } from '../gateway/memory-store.js';
import { newUser } from '../gateway/store-contract.js';

const T0 = Date.parse('2026-11-21T10:00:00Z');
const EXPORT_TOKEN = 'e'.repeat(40);
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

let opened: FastifyInstance[] = [];
afterEach(async () => {
  for (const a of opened) await a.close();
  opened = [];
});

class FakeRunner implements WorkflowRunner {
  next = 1000;
  states = new Map<number, RunState>();
  async dispatch() {
    const runId = (this.next += 1);
    this.states.set(runId, 'in_progress');
    return { runId, runUrl: this.runUrl(runId) };
  }
  async getRun(runId: number) {
    return this.states.get(runId) ?? 'missing';
  }
  runUrl(runId: number) {
    return `https://github.com/o/r/actions/runs/${runId}`;
  }
}

type Send = (opts: InjectOptions) => Promise<LightMyRequestResponse>;

async function setup() {
  const config = loadConfig({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://unused',
    SITE_ORIGIN: 'https://butcherok.github.io',
    EXPORT_TOKEN,
  });
  const store = new MemoryStore();
  const runner = new FakeRunner();
  const clock = { t: T0 };
  const now = () => new Date(clock.t);
  const app = await buildApp({
    config,
    store,
    now,
    startedAt: now(),
    runner,
    repoMedia: mediaPathsIn(INITIAL_DATA),
  });
  opened.push(app);
  await seedContent(store, INITIAL_DATA, now());
  const cookies = new Map<Role, string>();
  for (const role of ['owner', 'editor'] as const) {
    const user = await store.createUser(newUser(role, { role, displayName: `Ім'я ${role}` }));
    cookies.set(role, (await openSession(store, user.id, now())).token);
  }
  const as =
    (role: Role): Send =>
    (opts) =>
      app.inject({
        ...opts,
        headers: { 'x-requested-with': CSRF_VALUE, ...(opts.headers ?? {}) },
        cookies: { [config.cookieName]: cookies.get(role) ?? '' },
      });
  const exportGet = (url: string) =>
    app.inject({ url, headers: { authorization: `Bearer ${EXPORT_TOKEN}` } });
  const tick = (ms = 1000) => {
    clock.t += ms;
  };
  return { app, store, runner, as, exportGet, tick };
}

/** Тело `multipart/form-data` руками: браузер шлёт ровно так. */
function form(
  fields: Record<string, string>,
  file: { data: Buffer; filename: string; type: string } | null,
): Pick<InjectOptions, 'payload' | 'headers'> {
  const boundary = '----uzn' + 'x'.repeat(16);
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
          `Content-Type: ${file.type}\r\n\r\n`,
      ),
      file.data,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

const photo = (artist = 'Ivan Petrenko', background = '#42703b') =>
  sharp({ create: { width: 400, height: 400, channels: 3, background } })
    .jpeg()
    .withExif({ IFD0: { Artist: artist } })
    .toBuffer();

const docx = () =>
  Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('[Content_Types].xml\0word/document.xml\0'),
  ]);

const upload = (
  send: Send,
  file: { data: Buffer; filename: string; type: string } | null,
  fields: Record<string, string> = { entity: 'leaders', slug: 'karp-ye-a', alt: 'Фото' },
) => send({ method: 'POST', url: '/api/v1/uploads', ...form(fields, file) });

const jpegFile = async () => ({
  data: await photo(),
  filename: 'IMG 2026-11-21 Карп.JPG',
  type: 'image/jpeg',
});

async function firstLeader(send: Send): Promise<{ id: string }> {
  return (await send({ method: 'GET', url: '/api/v1/leaders' })).json().items[0];
}

describe('POST /uploads (TZ 8.4)', () => {
  it('accepts a photo from any editor, names it on the server, strips EXIF', async () => {
    const ctx = await setup();
    const res = await upload(ctx.as('editor'), await jpegFile());
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.path).toMatch(/^media\/leaders\/karp-ye-a-[0-9a-f]{8}\.jpg$/u);
    expect(body).toMatchObject({ width: 400, height: 400, state: 'pending', mime: 'image/jpeg' });

    const preview = await ctx.as('editor')({ method: 'GET', url: `/api/v1/uploads/${body.path}` });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers['content-type']).toBe('image/jpeg');
    expect(preview.rawPayload.includes('Ivan Petrenko')).toBe(false);
    expect((await sharp(preview.rawPayload).metadata()).exif).toBeUndefined();
    expect(ctx.store.log.at(-1)).toMatchObject({ action: 'upload.create', result: 'ok' });
  });

  it('keeps one copy when the same file comes twice', async () => {
    const ctx = await setup();
    const file = await jpegFile();
    const a = (await upload(ctx.as('editor'), file)).json();
    const b = (await upload(ctx.as('owner'), file)).json();
    expect(b.path).toBe(a.path);
    expect(ctx.store.uploads.size).toBe(1);
  });

  it('checks the type by content, not by name or header', async () => {
    const ctx = await setup();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    const r1 = await upload(ctx.as('owner'), { data: svg, filename: 'a.jpg', type: 'image/jpeg' });
    expect(r1.statusCode).toBe(422);
    expect(r1.json().error.code).toBe('UNSUPPORTED_FILE_TYPE');
    expect(r1.json().error.message).toMatch(/JPEG, PNG чи WebP/u);

    // Фото не принимается как документ и наоборот.
    const r2 = await upload(
      ctx.as('editor'),
      { data: await photo(), filename: 'doc.pdf', type: 'application/pdf' },
      { entity: 'public-docs', slug: 'statut' },
    );
    expect(r2.json().error.code).toBe('UNSUPPORTED_FILE_TYPE');
    const r3 = await upload(ctx.as('editor'), {
      data: Buffer.from('%PDF-1.7\n'),
      filename: 'a.jpg',
      type: 'image/jpeg',
    });
    expect(r3.json().error.code).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('takes PDF and .docx for public documents', async () => {
    const ctx = await setup();
    const fields = { entity: 'public-docs', slug: 'statut' };
    const pdf = await upload(
      ctx.as('editor'),
      { data: Buffer.from('%PDF-1.7\n%%EOF\n'), filename: 'x', type: 'application/octet-stream' },
      fields,
    );
    expect(pdf.json()).toMatchObject({ width: null, mime: 'application/pdf' });
    expect(pdf.json().path).toMatch(/^media\/public-docs\/statut-[0-9a-f]{8}\.pdf$/u);
    const word = await upload(
      ctx.as('editor'),
      { data: docx(), filename: 'x.docx', type: DOCX },
      fields,
    );
    expect(word.json().path).toMatch(/\.docx$/u);
  });

  it('refuses files over the limit with an action message', async () => {
    const ctx = await setup();
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 0);
    big.set([0xff, 0xd8, 0xff], 0);
    const r1 = await upload(ctx.as('editor'), { data: big, filename: 'a.jpg', type: 'image/jpeg' });
    expect(r1.statusCode).toBe(413);
    expect(r1.json().error.message).toBe(
      'Файл більший за 2 МБ. Зменшіть зображення й спробуйте ще раз',
    );
    const huge = Buffer.alloc(10 * 1024 * 1024 + 10, 0x20);
    huge.write('%PDF-1.7', 0);
    const r2 = await upload(
      ctx.as('editor'),
      { data: huge, filename: 'a.pdf', type: 'application/pdf' },
      { entity: 'public-docs', slug: 'statut' },
    );
    expect(r2.statusCode).toBe(413);
    expect(r2.json().error.message).toMatch(/більший за 10 МБ/u);
    expect(ctx.store.uploads.size).toBe(0);
  });

  it('needs a known section, a slug, a file and the CSRF header', async () => {
    const ctx = await setup();
    const file = await jpegFile();
    const bad = await upload(ctx.as('editor'), file, { entity: 'contacts', slug: 'x' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.fields.entity).toBeDefined();
    const noSlug = await upload(ctx.as('editor'), file, { entity: 'leaders', slug: '' });
    expect(noSlug.json().error.fields.slug).toBeDefined();
    const noFile = await upload(ctx.as('editor'), null);
    expect(noFile.json().error.fields.file).toBeDefined();
    const csrf = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/uploads',
      ...form({ entity: 'leaders', slug: 'a' }, file),
    });
    expect(csrf.statusCode).toBe(403);
  });
});

describe('GET and DELETE /uploads (TZ 8.4, 9.1)', () => {
  it('lists where a file is used and refuses to delete a used one', async () => {
    const ctx = await setup();
    const { path } = (await upload(ctx.as('editor'), await jpegFile())).json();
    const leader = await firstLeader(ctx.as('owner'));
    const patch = await ctx.as('editor')({
      method: 'PATCH',
      url: `/api/v1/leaders/${leader.id}`,
      payload: { photoPath: path, photoAlt: { uk: 'Портрет' } },
    });
    expect(patch.statusCode).toBe(200);

    const list = (await ctx.as('editor')({ method: 'GET', url: '/api/v1/uploads' })).json();
    expect(list.items[0]).toMatchObject({ path, state: 'pending' });
    expect(list.items[0].usedBy[0]).toMatchObject({ kind: 'leaders', id: leader.id });

    const del = (role: Role) => ctx.as(role)({ method: 'DELETE', url: `/api/v1/uploads/${path}` });
    expect((await del('editor')).statusCode).toBe(403);
    const used = await del('owner');
    expect(used.statusCode).toBe(409);
    expect(used.json().error.message).toMatch(/Файл використовується/u);
  });

  it('deletes an unused unpublished file at once', async () => {
    const ctx = await setup();
    const { path } = (await upload(ctx.as('editor'), await jpegFile())).json();
    const res = await ctx.as('owner')({ method: 'DELETE', url: `/api/v1/uploads/${path}` });
    expect(res.json()).toEqual({ outcome: 'removed' });
    const gone = await ctx.as('owner')({ method: 'GET', url: `/api/v1/uploads/${path}` });
    expect(gone.statusCode).toBe(404);
    const odd = await ctx.as('owner')({ method: 'DELETE', url: '/api/v1/uploads/../etc/passwd' });
    expect(odd.statusCode).toBe(404);
    // Фото из начальных данных — из `main`.
    const [seed] = [...mediaPathsIn(INITIAL_DATA)];
    const fromMain = await ctx.as('editor')({ method: 'GET', url: `/api/v1/uploads/${seed}` });
    expect(fromMain.statusCode).toBe(302);
    expect(fromMain.headers.location).toMatch(/\/uzn-desna\/main\/media\/leaders\//u);
  });
});

describe('uploads in the publication cycle (decision 042)', () => {
  it('exports referenced files, settles them on success, removes deleted ones next time', async () => {
    const ctx = await setup();
    const editor = ctx.as('editor');
    const owner = ctx.as('owner');
    const used = (await upload(editor, await jpegFile())).json().path as string;
    const stray = (
      await upload(editor, {
        data: await photo('Other', '#2f583f'),
        filename: 'x.jpg',
        type: 'image/jpeg',
      })
    ).json().path as string;
    const leader = await firstLeader(owner);
    await editor({
      method: 'PATCH',
      url: `/api/v1/leaders/${leader.id}`,
      payload: { photoPath: used, photoAlt: { uk: 'Портрет' } },
    });

    ctx.tick();
    expect((await editor({ method: 'POST', url: '/api/v1/publish' })).statusCode).toBe(202);
    ctx.tick();
    const exp = (await ctx.exportGet('/api/v1/export?runId=1001')).json();
    // Файл, который никто не использует, в публичный репозиторий не уходит.
    expect(exp.media.map((m: { path: string }) => m.path)).toEqual([used]);
    expect(exp.media[0].sha256).toMatch(/^[0-9a-f]{64}$/u);
    const bytes = await ctx.exportGet(`/api/v1/export/media?path=${encodeURIComponent(used)}`);
    expect(bytes.statusCode).toBe(200);
    expect(bytes.rawPayload.length).toBe(exp.media[0].bytes);
    const noToken = await ctx.app.inject({ url: `/api/v1/export/media?path=${used}` });
    expect(noToken.statusCode).toBe(401);

    ctx.runner.states.set(1001, 'success');
    ctx.tick();
    await editor({ method: 'GET', url: '/api/v1/publish/status' });
    expect(await ctx.store.readUploadData(used)).toBeNull();
    expect((await ctx.store.findUpload(used))?.publishedAt).not.toBeNull();
    expect(await ctx.store.readUploadData(stray)).not.toBeNull();
    const preview = await editor({ method: 'GET', url: `/api/v1/uploads/${used}` });
    expect(preview.statusCode).toBe(302);
    expect(preview.headers.location).toBe(
      `https://raw.githubusercontent.com/Butcherok/uzn-desna/content-data/${used}`,
    );

    // Фото убрали из карточки, владелец удалил файл: он уходит со следующей публикацией.
    await editor({
      method: 'PATCH',
      url: `/api/v1/leaders/${leader.id}`,
      payload: { photoPath: null, photoAlt: null },
    });
    const del = await owner({ method: 'DELETE', url: `/api/v1/uploads/${used}` });
    expect(del.json()).toEqual({ outcome: 'deleting' });
    ctx.tick();
    expect((await editor({ method: 'POST', url: '/api/v1/publish' })).statusCode).toBe(202);
    ctx.tick();
    const exp2 = (await ctx.exportGet('/api/v1/export?runId=1002')).json();
    expect(exp2.media).toEqual([]);
    ctx.runner.states.set(1002, 'success');
    ctx.tick();
    await editor({ method: 'GET', url: '/api/v1/publish/status' });
    expect(await ctx.store.findUpload(used)).toBeNull();
  });

  it('does not publish a record pointing to a missing file', async () => {
    const ctx = await setup();
    const leader = await firstLeader(ctx.as('owner'));
    await ctx.as('editor')({
      method: 'PATCH',
      url: `/api/v1/leaders/${leader.id}`,
      payload: { photoPath: 'media/leaders/nobody-0a1b2c3d.jpg', photoAlt: { uk: 'Портрет' } },
    });
    const res = await ctx.as('editor')({ method: 'POST', url: '/api/v1/publish' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.problems[0]).toMatchObject({
      kind: 'leaders',
      id: leader.id,
      message: 'Файл не знайдено. Відкрийте запис і завантажте файл ще раз',
    });
  });
});
