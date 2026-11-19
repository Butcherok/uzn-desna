import { describe, expect, it } from 'vitest';
import { SourceError, fetchText } from './http.js';
import type { FetchDeps } from './http.js';
import { mask, secretValues } from './mask.js';
import { dateFromTenderId, parseSearch } from './prozorro.js';
import { runSync } from './run.js';
import type { RunIo } from './run.js';

const ITEM = {
  tenderID: 'UA-2026-11-12-006460-a',
  title: ' Послуги з обрізування дерев ',
  status: 'active.tendering',
  value: { amount: 125000.5, currency: 'UAH', valueAddedTaxIncluded: true },
  tenderPeriod: { endDate: '2026-11-20T00:00:00+02:00' },
  procuringEntity: { name: 'КП УЗН' },
};

const COMPLETE = {
  tenderID: 'UA-2026-10-01-000123-b',
  title: 'Бензин',
  status: 'complete',
  value: { amount: 9000, currency: 'UAH', valueAddedTaxIncluded: false },
};

function body(items: unknown[]): string {
  return JSON.stringify({ page: 1, per_page: 20, total: items.length, data: items });
}

describe('prozorro: разбор поиска портала', () => {
  it('разбирает поля карточки и дату из номера', () => {
    const [tender, done] = parseSearch(body([ITEM, COMPLETE]));
    expect(tender).toEqual({
      tenderID: 'UA-2026-11-12-006460-a',
      title: 'Послуги з обрізування дерев',
      status: 'active.tendering',
      amount: 125000.5,
      currency: 'UAH',
      vatIncluded: true,
      datePublished: '2026-11-12',
      tenderEndDate: '2026-11-20T00:00:00+02:00',
      url: 'https://prozorro.gov.ua/tender/UA-2026-11-12-006460-a',
    });
    // У завершённой закупки срока подачи в выдаче нет — это не ошибка.
    expect(done?.tenderEndDate).toBeNull();
  });

  it('хранит не больше 20 записей', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...COMPLETE,
      tenderID: `UA-2026-10-01-${String(i).padStart(6, '0')}-a`,
    }));
    expect(parseSearch(body(many))).toHaveLength(20);
  });

  it('пустая выдача — пустой массив, не ошибка', () => {
    expect(parseSearch(body([]))).toEqual([]);
  });

  it.each([
    ['не JSON', '<html>'],
    ['нет data', JSON.stringify({ items: [] })],
    ['нет tenderID', body([{ title: 'x', status: 'complete' }])],
    ['номер чужого формата', body([{ ...COMPLETE, tenderID: '12345' }])],
  ])('%s — SRC_PARSE', (_, input) => {
    expect(() => parseSearch(input)).toThrow(SourceError);
    try {
      parseSearch(input);
    } catch (error) {
      expect((error as SourceError).code).toBe('SRC_PARSE');
    }
  });

  it('дата из номера', () => {
    expect(dateFromTenderId('UA-2023-03-27-000001-c')).toBe('2023-03-27');
  });
});

function deps(responses: (Response | Error)[]): FetchDeps & { sleeps: number[]; lines: string[] } {
  const queue = [...responses];
  const sleeps: number[] = [];
  const lines: string[] = [];
  return {
    sleeps,
    lines,
    fetch: async () => {
      const next = queue.shift();
      if (next === undefined) throw new Error('no more responses');
      if (next instanceof Error) throw next;
      return next;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    log: (line) => lines.push(line),
  };
}

describe('http: повторы и коды ошибок (ТЗ 7.5)', () => {
  it('5xx повторяется с паузами 1, 5, 25 с и даёт SRC_HTTP_5XX', async () => {
    const d = deps([1, 2, 3, 4].map(() => new Response('oops', { status: 503 })));
    await expect(fetchText('t', 'https://x', {}, d)).rejects.toMatchObject({
      code: 'SRC_HTTP_5XX',
    });
    expect(d.sleeps).toEqual([1000, 5000, 25000]);
  });

  it('429 — SRC_RATE_LIMIT, успех после повтора возвращает тело', async () => {
    const d = deps([new Response('', { status: 429 }), new Response('ok', { status: 200 })]);
    await expect(fetchText('t', 'https://x', {}, d)).resolves.toBe('ok');
    expect(d.sleeps).toEqual([1000]);
  });

  it('404 не повторяется', async () => {
    const d = deps([new Response('nope', { status: 404 })]);
    await expect(fetchText('t', 'https://x', {}, d)).rejects.toMatchObject({
      code: 'SRC_HTTP_4XX',
    });
    expect(d.sleeps).toEqual([]);
  });

  it('таймаут — SRC_TIMEOUT', async () => {
    const timeout = new DOMException('timed out', 'TimeoutError');
    const d = deps([timeout, timeout, timeout, timeout]);
    await expect(fetchText('t', 'https://x', {}, d)).rejects.toMatchObject({ code: 'SRC_TIMEOUT' });
  });

  it('в журнал идут код и длина, но не тело', async () => {
    const d = deps([new Response('SECRET-BODY-CONTENT', { status: 200 })]);
    await fetchText('t', 'https://x', {}, d);
    expect(d.lines.join('\n')).not.toContain('SECRET-BODY-CONTENT');
    expect(d.lines[0]).toContain('код 200, длина 19');
  });
});

describe('mask (ТЗ 7.5, п. 6)', () => {
  it('значения секретов заменяются целиком', () => {
    const secrets = secretValues({ FB_PAGE_TOKEN: 'EAAB-very-secret-1234' }, ['FB_PAGE_TOKEN']);
    expect(mask('token EAAB-very-secret-1234 failed', secrets)).toBe('token *** failed');
  });

  it('шаблоны: заголовок авторизации, строка подключения, токен в адресе', () => {
    const out = mask(
      'Authorization: Bearer abc.def mongodb+srv://u:p@h/db https://g?access_token=zzz&x=1',
      [],
    );
    expect(out).not.toMatch(/abc\.def|u:p@h|zzz/u);
  });
});

function memoryIo(
  files: Record<string, unknown>,
  fetchTenders: RunIo['fetchTenders'],
  now = '2026-11-20T05:10:00.000Z',
): RunIo & { files: Record<string, unknown>; writes: string[] } {
  const writes: string[] = [];
  return {
    files,
    writes,
    readJson: async (name) => (name in files ? structuredClone(files[name]) : undefined),
    writeJson: async (name, value) => {
      writes.push(name);
      files[name] = structuredClone(value);
    },
    fetchTenders,
    now: () => now,
    log: () => {},
    secrets: [],
  };
}

const ok = (items: unknown[]) => async () => parseSearch(body(items));
const fail = (code: 'SRC_HTTP_4XX' | 'SRC_TIMEOUT') => async () => {
  throw new SourceError(code, 'x');
};

describe('runSync: состояния (ТЗ 6.5) и сбои подряд (ТЗ 7.5, п. 3)', () => {
  it('первый успешный прогон: state data, оба файла записаны', async () => {
    const io = memoryIo({}, ok([ITEM, COMPLETE]));
    const result = await runSync(['prozorro'], io);
    expect(result).toMatchObject({ siteChanged: true, anyChanged: true, failed: false });
    expect(io.files['tenders.json']).toMatchObject({ state: 'data', sourceErrors: [] });
  });

  it('ошибка источника: unknown, прежние карточки и fetchedAt сохранены', async () => {
    const io = memoryIo({}, ok([ITEM]));
    await runSync(['prozorro'], io);
    const before = io.files['tenders.json'] as { items: unknown[]; fetchedAt: string };

    const io2 = memoryIo(io.files, fail('SRC_HTTP_4XX'), '2026-11-21T05:10:00.000Z');
    const result = await runSync(['prozorro'], io2);
    const after = io2.files['tenders.json'] as typeof before & {
      state: string;
      sourceErrors: unknown;
    };
    expect(result.failed).toBe(false);
    expect(after.state).toBe('unknown');
    expect(after.items).toEqual(before.items);
    expect(after.fetchedAt).toBe(before.fetchedAt);
    expect(after.sourceErrors).toEqual([{ source: 'prozorro', code: 'SRC_HTTP_4XX' }]);
  });

  it('третий сбой подряд роняет прогон, восстановление возвращает data', async () => {
    const files: Record<string, unknown> = {};
    await runSync(['prozorro'], memoryIo(files, ok([ITEM])));
    let last;
    for (const day of ['21', '22', '23']) {
      last = await runSync(
        ['prozorro'],
        memoryIo(files, fail('SRC_TIMEOUT'), `2026-11-${day}T05:10:00.000Z`),
      );
    }
    expect(last?.failed).toBe(true);
    const state = (files['sync-state.json'] as { items: { consecutiveFailures: number }[] })
      .items[0];
    expect(state?.consecutiveFailures).toBe(3);

    const back = await runSync(
      ['prozorro'],
      memoryIo(files, ok([ITEM]), '2026-11-24T05:10:00.000Z'),
    );
    expect(back.failed).toBe(false);
    expect(files['tenders.json']).toMatchObject({ state: 'data', sourceErrors: [] });
    expect(
      (files['sync-state.json'] as { items: { consecutiveFailures: number }[] }).items[0]
        ?.consecutiveFailures,
    ).toBe(0);
  });

  it('ответ без изменений не меняет файлы — коммита нет', async () => {
    const files: Record<string, unknown> = {};
    await runSync(['prozorro'], memoryIo(files, ok([ITEM])));
    const io = memoryIo(files, ok([ITEM]), '2026-11-21T05:10:00.000Z');
    const result = await runSync(['prozorro'], io);
    expect(result).toMatchObject({ siteChanged: false, anyChanged: false });
    expect(io.writes).toEqual([]);
  });

  it('пустая выдача — empty, записи очищены', async () => {
    const files: Record<string, unknown> = {};
    await runSync(['prozorro'], memoryIo(files, ok([ITEM])));
    await runSync(['prozorro'], memoryIo(files, ok([]), '2026-11-21T05:10:00.000Z'));
    expect(files['tenders.json']).toMatchObject({ state: 'empty', items: [] });
  });

  it('повторный сбой с тем же кодом не меняет файл блока', async () => {
    const files: Record<string, unknown> = {};
    await runSync(['prozorro'], memoryIo(files, ok([ITEM])));
    await runSync(['prozorro'], memoryIo(files, fail('SRC_TIMEOUT'), '2026-11-21T05:10:00.000Z'));
    const io = memoryIo(files, fail('SRC_TIMEOUT'), '2026-11-22T05:10:00.000Z');
    const result = await runSync(['prozorro'], io);
    expect(result.siteChanged).toBe(false);
    expect(io.writes).toEqual(['sync-state.json']);
  });
});
