import { describe, expect, it } from 'vitest';
import { LOG_PAGE_SIZE, kyivDayStart, toQuery } from './action-log.js';
import { ApiError } from './errors.js';

describe('action log filter (TZ 9.7)', () => {
  it('Kyiv day starts: winter +2, summer +3, both DST change days', () => {
    expect(kyivDayStart('2026-11-22').toISOString()).toBe('2026-11-21T22:00:00.000Z');
    expect(kyivDayStart('2026-07-01').toISOString()).toBe('2026-06-30T21:00:00.000Z');
    // 29.03.2026 часы переводятся в 03:00, полночь ещё зимняя.
    expect(kyivDayStart('2026-03-29').toISOString()).toBe('2026-03-28T22:00:00.000Z');
    expect(kyivDayStart('2026-03-30').toISOString()).toBe('2026-03-29T21:00:00.000Z');
    // 25.10.2026 — обратно, полночь ещё летняя.
    expect(kyivDayStart('2026-10-25').toISOString()).toBe('2026-10-24T21:00:00.000Z');
    expect(kyivDayStart('2026-10-26').toISOString()).toBe('2026-10-25T22:00:00.000Z');
  });

  it('"to" is inclusive: up to the start of the next Kyiv day', () => {
    const q = toQuery({ from: '2026-11-20', to: '2026-11-22', page: 3 });
    expect(q.from?.toISOString()).toBe('2026-11-19T22:00:00.000Z');
    expect(q.to?.toISOString()).toBe('2026-11-22T22:00:00.000Z');
    expect(q).toMatchObject({ skip: 2 * LOG_PAGE_SIZE, limit: 50 });
    expect(toQuery({ to: '2026-12-31' }).to?.toISOString()).toBe('2026-12-31T22:00:00.000Z');
  });

  it('user filter: id, "none" for entries without a user, empty for everyone', () => {
    expect(toQuery({ user: 'abc' }).userId).toBe('abc');
    expect(toQuery({ user: 'none' }).userId).toBeNull();
    expect('userId' in toQuery({ user: '' })).toBe(false);
    expect('userId' in toQuery({})).toBe(false);
  });

  it('bad dates are an error with the field, not an empty list', () => {
    for (const f of [
      { from: '2026-02-30' },
      { to: '22.11.2026' },
      { from: '2026-11-22', to: '2026-11-01' },
    ]) {
      try {
        toQuery(f);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).fields).toBeDefined();
      }
    }
  });
});
