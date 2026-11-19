import { describe, expect, it } from 'vitest';
import type { Tender, TendersFile } from '@uzn/shared';
import { STATUS_UNKNOWN, formatAmount, formatDeadline, statusLabel, tendersView } from './tenders';

const tender = (i: number): Tender => ({
  tenderID: `UA-2026-11-${String((i % 28) + 1).padStart(2, '0')}-${String(i).padStart(6, '0')}-a`,
  title: `Закупівля ${i}`,
  status: 'complete',
  amount: 1000 + i,
  currency: 'UAH',
  vatIncluded: true,
  datePublished: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
  tenderEndDate: null,
  url: `https://prozorro.gov.ua/tender/UA-2026-11-01-${String(i).padStart(6, '0')}-a`,
});

const file = (over: Partial<TendersFile>): TendersFile => ({
  schemaVersion: 1,
  generatedAt: '2026-11-20T05:10:00.000Z',
  source: 'sync',
  state: 'data',
  items: Array.from({ length: 20 }, (_, i) => tender(i)),
  fetchedAt: '2026-11-20T05:10:00.000Z',
  lastSuccessAt: '2026-11-20T05:10:00.000Z',
  sourceErrors: [],
  ...over,
});

describe('tenders: вывод карточек (ТЗ 4.9, 3.3)', () => {
  it('data: 10 карточек из 20, без пометки о давности', () => {
    const view = tendersView(file({}));
    expect(view.kind).toBe('cards');
    if (view.kind === 'cards') {
      expect(view.cards).toHaveLength(10);
      expect(view.stale).toBeNull();
    }
  });

  it('unknown с прежними записями: карточки и дата получения', () => {
    const view = tendersView(file({ state: 'unknown' }));
    expect(view).toMatchObject({ kind: 'cards', stale: '20.11.2026' });
  });

  it('unknown без записей: «Дані тимчасово недоступні», а не «пусто»', () => {
    expect(tendersView(file({ state: 'unknown', items: [], fetchedAt: null }))).toEqual({
      kind: 'unavailable',
    });
  });

  it('empty: пусто', () => {
    expect(tendersView(file({ state: 'empty', items: [] }))).toEqual({ kind: 'empty' });
  });

  it('сумма с пробелами между тысячами и «грн»', () => {
    expect(formatAmount(829833.33, 'UAH')).toBe('829 833,33 грн');
    expect(formatAmount(1317.6, 'UAH')).toBe('1 317,60 грн');
    expect(formatAmount(1000000, 'USD')).toBe('1 000 000,00 USD');
    expect(formatAmount(null, 'UAH')).toBeNull();
  });

  it('срок подачи — дата и время', () => {
    expect(formatDeadline('2026-11-23T10:00:00+02:00')).toBe('23.11.2026, 10:00');
    expect(formatDeadline(null)).toBeNull();
  });

  it('статус словами; незнакомый не выдумывается', () => {
    expect(statusLabel('active.tendering')).toBe('Очікування пропозицій');
    expect(statusLabel('active.qualification.stand-still')).toBe(STATUS_UNKNOWN);
  });
});
