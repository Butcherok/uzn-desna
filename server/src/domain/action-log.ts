/**
 * Журнал действий для владельца (ТЗ 9.7): страницы по 50, новые первыми,
 * фильтр по пользователю и датам. Даты фильтра — календарные дни по Киеву.
 */
import { ApiError } from './errors.js';
import type { ActionLogRecord, LogQuery, Store } from './model.js';

export const LOG_PAGE_SIZE = 50;

/** Фильтр пользователя «без пользователя»: неизвестный логин, расписание, система. */
export const NO_USER = 'none';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;

/** Смещение Киева от UTC в этот момент, в минутах (зимой +120, летом +180). */
function kyivOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'));
  return Math.round((local - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

/** Начало календарного дня `YYYY-MM-DD` по Киеву как момент UTC. */
export function kyivDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  // Смещение берётся на сам момент полуночи по Киеву: в дни перевода часов оно другое.
  const guess = new Date(utcMidnight - kyivOffsetMinutes(new Date(utcMidnight)) * 60_000);
  return new Date(utcMidnight - kyivOffsetMinutes(guess) * 60_000);
}

function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function isRealDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export interface LogFilter {
  user?: string;
  from?: string;
  to?: string;
  page?: number;
}

export interface LogPage {
  items: (Omit<ActionLogRecord, 'at' | 'userId'> & {
    at: string;
    user: { id: string; name: string } | null;
  })[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  users: { id: string; name: string }[];
}

/** Неверный фильтр — 422 с полем, а не пустой список: иначе ошибка выглядит как «записей нет». */
export function toQuery(f: LogFilter): LogQuery {
  const fields: Record<string, string> = {};
  if (f.from !== undefined && !isRealDay(f.from)) fields['from'] = 'Невірна дата';
  if (f.to !== undefined && !isRealDay(f.to)) fields['to'] = 'Невірна дата';
  if (f.from && f.to && isRealDay(f.from) && isRealDay(f.to) && f.from > f.to) {
    fields['to'] = 'Кінцева дата раніша за початкову';
  }
  if (Object.keys(fields).length > 0) {
    throw new ApiError('VALIDATION_FAILED', 'Перевірте дати', { fields });
  }
  const page = Math.max(1, f.page ?? 1);
  // «По» включительно: граница — начало следующего дня по Киеву.
  const to = f.to === undefined ? undefined : kyivDayStart(nextDay(f.to));
  return {
    ...(f.user === undefined || f.user === ''
      ? {}
      : { userId: f.user === NO_USER ? null : f.user }),
    ...(f.from !== undefined ? { from: kyivDayStart(f.from) } : {}),
    ...(to !== undefined ? { to } : {}),
    skip: (page - 1) * LOG_PAGE_SIZE,
    limit: LOG_PAGE_SIZE,
  };
}

export async function readLog(store: Store, f: LogFilter): Promise<LogPage> {
  const query = toQuery(f);
  const [{ items, total }, users] = await Promise.all([store.listLog(query), store.listUsers()]);
  const names = new Map(users.map((u) => [u.id, u.displayName]));
  const page = Math.max(1, f.page ?? 1);
  return {
    items: items.map(({ at, userId, ...rest }) => ({
      ...rest,
      at: at.toISOString(),
      user:
        userId === null ? null : { id: userId, name: names.get(userId) ?? 'Видалений користувач' },
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / LOG_PAGE_SIZE)),
    pageSize: LOG_PAGE_SIZE,
    users: users
      .map((u) => ({ id: u.id, name: u.displayName }))
      .sort((a, b) => a.name.localeCompare(b.name, 'uk')),
  };
}
