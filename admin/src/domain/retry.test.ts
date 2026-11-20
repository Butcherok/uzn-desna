import { describe, expect, it } from 'vitest';
import { retryDecision } from './retry';

describe('retryDecision (TZ 8.7)', () => {
  it('retries a timeout or a network failure once, at once', () => {
    expect(retryDecision({ kind: 'timeout' }, 0, 3000)).toEqual({ retry: true, delayMs: 0 });
    expect(retryDecision({ kind: 'network' }, 0, 3000)).toEqual({ retry: true, delayMs: 0 });
    expect(retryDecision({ kind: 'timeout' }, 1, 3000).retry).toBe(false);
  });

  it('does not repeat a create after a timeout: it may have reached the server', () => {
    expect(retryDecision({ kind: 'timeout' }, 0, 3000, false).retry).toBe(false);
    const db = { kind: 'http', status: 503, code: 'DB_UNAVAILABLE' } as const;
    expect(retryDecision(db, 0, 3000, false).retry).toBe(true);
  });

  it('retries DB_UNAVAILABLE once after the delay', () => {
    const f = { kind: 'http', status: 503, code: 'DB_UNAVAILABLE' } as const;
    expect(retryDecision(f, 0, 3000)).toEqual({ retry: true, delayMs: 3000 });
    expect(retryDecision(f, 1, 3000).retry).toBe(false);
  });

  it('does not retry data and rights errors', () => {
    for (const [status, code] of [
      [422, 'VALIDATION_FAILED'],
      [401, 'UNAUTHENTICATED'],
      [409, 'CONFLICT'],
      [500, 'INTERNAL'],
    ] as const) {
      expect(retryDecision({ kind: 'http', status, code }, 0, 3000).retry).toBe(false);
    }
  });
});
