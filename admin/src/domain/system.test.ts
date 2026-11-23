import { describe, expect, it } from 'vitest';
import { parseRoute, pathOf } from './routes';
import {
  countLabel,
  failuresWarning,
  resultText,
  scheduleSilent,
  sinceText,
  sourceLabel,
  type SyncRunView,
  type SyncSourceState,
} from './system';

const src = (over: Partial<SyncSourceState>): SyncSourceState => ({
  source: 'prozorro',
  lastRunAt: '2026-11-23T18:26:48.900Z',
  lastSuccessAt: null,
  result: 'ok',
  errorCode: null,
  itemsFetched: 20,
  itemsNew: 0,
  consecutiveFailures: 0,
  ...over,
});

const run = (event: SyncRunView['event'], createdAt: string): SyncRunView => ({
  id: 1,
  event,
  createdAt,
  state: 'success',
  url: 'https://github.com/o/r/actions/runs/1',
});

describe('«Стан системи» labels (решение 049)', () => {
  it('sources and results in words, no codes', () => {
    expect(sourceLabel('prozorro')).toBe('Закупівлі Prozorro');
    expect(sourceLabel('new-one')).toBe('Інше джерело');
    expect(resultText(src({}))).toBe('Працює');
    expect(resultText(src({ result: 'error', errorCode: 'SRC_HTTP_4XX' }))).toBe(
      'Не вдалося отримати дані: джерело відмовило в доступі або адреса змінилася',
    );
    expect(resultText(src({ result: 'error', errorCode: 'XYZ' }))).not.toContain('XYZ');
    expect(countLabel('services')).toBe('Послуги');
  });

  it('time from the state file: streak start or last failure', () => {
    expect(sinceText(src({}))).toBe('Без збоїв з 23.11.2026, 20:26');
    expect(sinceText(src({ result: 'error' }))).toBe('Останній збій: 23.11.2026, 20:26');
  });

  it('warns from the second failure in a row; the third means the letter was sent', () => {
    expect(failuresWarning(src({ consecutiveFailures: 1 }))).toBeNull();
    expect(failuresWarning(src({ consecutiveFailures: 2 }))).toContain('Після третього');
    expect(failuresWarning(src({ consecutiveFailures: 3 }))).toContain('надіслав лист');
  });

  it('schedule silence: no scheduled run within 30 h; unknown runs — no verdict', () => {
    const now = new Date('2026-11-24T12:00:00Z');
    expect(scheduleSilent(null, now)).toBeNull();
    expect(scheduleSilent([run('schedule', '2026-11-23T13:00:00Z')], now)).toBe(false);
    expect(scheduleSilent([run('schedule', '2026-11-23T05:59:00Z')], now)).toBe(true);
    expect(scheduleSilent([run('workflow_dispatch', '2026-11-24T02:30:00Z')], now)).toBe(true);
  });

  it('route /admin/system', () => {
    expect(parseRoute('/admin/system')).toEqual({ page: 'system' });
    expect(pathOf({ page: 'system' })).toBe('/admin/system');
  });
});
