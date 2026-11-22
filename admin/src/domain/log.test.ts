import { describe, expect, it } from 'vitest';
import {
  actionLabel,
  detailsText,
  entityLabel,
  filterQuery,
  subjectOf,
  type LogEntryView,
} from './log';

const e = (over: Partial<LogEntryView>): LogEntryView => ({
  id: '1',
  at: '2026-11-22T10:00:00.000Z',
  user: null,
  action: 'content.update',
  entity: 'vacancies',
  entityId: 'abc',
  result: 'ok',
  details: {},
  ...over,
});

describe('action log labels (TZ 9.7)', () => {
  it('names actions in Ukrainian, failed login separately, unknown code as is', () => {
    expect(actionLabel(e({ action: 'auth.login' }))).toBe('Вхід');
    expect(actionLabel(e({ action: 'auth.login', result: 'denied' }))).toBe('Невдала спроба входу');
    expect(actionLabel(e({ action: 'feed.hide' }))).toBe('Приховано картку стрічки');
    expect(actionLabel(e({ action: 'x.new' }))).toBe('x.new');
  });

  it('details in words, title shown as the subject', () => {
    expect(detailsText({ reason: 'unknown-login' })).toBe('Причина: невідомий логін');
    expect(detailsText({ status: 'published', title: 'Т' })).toBe('Стан: опубліковано');
    expect(detailsText({ fields: 'title,salary', slugFrom: 'a', slugTo: 'b' })).toBe(
      'Поля: title, salary · Адреса: a → b',
    );
    expect(subjectOf(e({ details: { title: 'Озеленювач' } }))).toBe('Озеленювач');
    expect(subjectOf(e({ entity: 'user', entityId: 'u1' }))).toBeNull();
  });

  it('entity as the admin section; filter sends only what is set', () => {
    expect(entityLabel('vacancies')).toBe('Вакансії');
    expect(entityLabel('feed')).toBe('Новини галузі');
    expect(entityLabel(null)).toBeNull();
    expect(filterQuery({ user: '', from: '2026-11-01', to: '' }, 1)).toEqual({
      from: '2026-11-01',
    });
    expect(filterQuery({ user: 'none', from: '', to: '' }, 3)).toEqual({ user: 'none', page: '3' });
  });
});
