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
  it('names actions in Ukrainian, failed login separately, unknown code without the code', () => {
    expect(actionLabel(e({ action: 'auth.login' }))).toBe('Вхід');
    expect(actionLabel(e({ action: 'auth.login', result: 'denied' }))).toBe('Невдала спроба входу');
    expect(actionLabel(e({ action: 'feed.hide' }))).toBe('Приховано картку стрічки');
    expect(actionLabel(e({ action: 'x.new' }))).toBe('Інша дія');
  });

  it('details in words, title shown as the subject', () => {
    expect(detailsText({ reason: 'unknown-login' })).toBe('Причина: невідомий логін');
    expect(detailsText({ status: 'published', title: 'Т' })).toBe('Стан: опубліковано');
    expect(
      detailsText(
        { fields: 'position,requirements,slug,order', slugFrom: 'a', slugTo: 'b' },
        'vacancies',
      ),
    ).toBe('Поля: посада, вимоги, адреса сторінки, порядок · Адреса: a → b');
    expect(subjectOf(e({ details: { title: 'Озеленювач' } }))).toBe('Озеленювач');
    expect(subjectOf(e({ entity: 'user', entityId: 'u1' }))).toBeNull();
    expect(subjectOf(e({ action: 'publish.finish', entity: null, entityId: '45' }))).toBe(
      'прогін 45',
    );
    expect(detailsText({ state: 'success' })).toBe('Підсумок: успіх');
    expect(actionLabel(e({ action: 'backup.start' }))).toBe('Запуск резервної копії');
  });

  it('entity as the admin section; filter sends only what is set', () => {
    expect(entityLabel('vacancies')).toBe('Вакансії');
    expect(entityLabel('feed')).toBe('Стрічка новин');
    expect(entityLabel(null)).toBeNull();
    expect(filterQuery({ user: '', from: '2026-11-01', to: '' }, 1)).toEqual({
      from: '2026-11-01',
    });
    expect(filterQuery({ user: 'none', from: '', to: '' }, 3)).toEqual({ user: 'none', page: '3' });
  });

  it('no service codes from the live log (12.3, defect D1)', () => {
    const lines = [
      detailsText({ fields: 'slug,title,publishedWhere,filePath,featured,order' }, 'public-docs'),
      detailsText({ fields: 'docUpdatedAt,featured' }, 'public-docs'),
      detailsText({ outcome: 'deleting' }, 'public-docs'),
      detailsText({ outcome: 'removed' }, 'leaders'),
      detailsText({ key: 'perevirka-publikatsii' }, 'public-docs'),
      detailsText({ bytes: 1000, mime: 'application/pdf' }, 'public-docs'),
      detailsText({ reason: 'slug' }, 'services'),
      detailsText({ services: 15, leaders: 5 }, null),
      detailsText({ login: 'owner1', role: 'owner' }, 'user'),
      detailsText({ unknownKey: 'x' }, 'services'),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(/[a-z]{3,}[A-Z]|slug|outcome|key:|mime|application\//u);
    }
    expect(lines[2]).toBe('Файл: зникне з сайту після публікації');
    expect(lines[5]).toBe('Розмір: 1 КБ · Тип: PDF');
    expect(lines[6]).toBe('Причина: адресу сторінки змінює лише власник');
    expect(lines[7]).toBe('Послуги: 15 · Керівництво: 5');
    expect(lines[9]).toBe('');
  });

  it('subject: file name for files, no raw id for records', () => {
    expect(
      subjectOf(
        e({
          action: 'upload.delete',
          entity: 'public-docs',
          entityId: 'media/public-docs/a-c9.pdf',
        }),
      ),
    ).toBe('a-c9.pdf');
    expect(subjectOf(e({ entity: 'public-docs', entityId: '6b02cbb50f586298f66f0234' }))).toBe(
      'запис без назви',
    );
    expect(subjectOf(e({ entity: 'enterprise', entityId: 'enterprise' }))).toBeNull();
  });
});
