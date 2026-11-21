import { describe, expect, it } from 'vitest';
import { barView, type PublishStatus } from './publish';
import { pluralChanges } from './text';

const base: PublishStatus = {
  lastPublishedAt: '2026-11-21T10:00:00.000Z',
  pendingChanges: 2,
  configured: true,
  run: null,
};
const run = (result: 'in_progress' | 'success' | 'failure') => ({
  runId: 1,
  runUrl: 'https://github.com/o/r/actions/runs/1',
  startedAt: '2026-11-21T10:00:00.000Z',
  startedBy: 'Редактор',
  result,
  finishedAt: null,
});

describe('barView (TZ 8.5, decision 041)', () => {
  it('shows the button only when there is something to publish and publishing works', () => {
    expect(barView(base, pluralChanges)).toEqual({
      tone: 'plain',
      text: 'Не опубліковано: 2 зміни — на сайті ще не видно.',
      showButton: true,
      poll: false,
    });
    expect(barView({ ...base, pendingChanges: 0 }, pluralChanges).showButton).toBe(false);
    const off = barView({ ...base, configured: false }, pluralChanges);
    expect(off.showButton).toBe(false);
    expect(off.text).toContain('Публікацію ще не налаштовано');
  });

  it('hides the button and polls while a run is going', () => {
    const v = barView({ ...base, run: run('in_progress') }, pluralChanges);
    expect(v).toMatchObject({ tone: 'progress', showButton: false, poll: true });
    expect(v.text).toContain('протягом кількох хвилин');
  });

  it('says the last run failed and offers to repeat', () => {
    const v = barView({ ...base, run: run('failure') }, pluralChanges);
    expect(v).toMatchObject({ tone: 'error', showButton: true, poll: false });
    expect(v.text).toMatch(/^Остання публікація не вдалася/);
  });

  it('reads as done after a successful run with nothing pending', () => {
    expect(barView({ ...base, pendingChanges: 0, run: run('success') }, pluralChanges).text).toBe(
      'Усі зміни опубліковано.',
    );
    expect(barView(null, pluralChanges).text).toBe('Стан публікації завантажується…');
  });
});
