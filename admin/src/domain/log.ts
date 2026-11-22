/**
 * Журнал действий для владельца (ТЗ 9.7): подписи по-украински, без
 * служебных кодов. Слой domain: чистые функции.
 */
import { sectionOf } from './kinds';

export interface LogEntryView {
  id: string;
  at: string;
  user: { id: string; name: string } | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  result: 'ok' | 'denied' | 'error';
  details: Record<string, string | number | boolean | null>;
}

export interface LogPage {
  items: LogEntryView[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
  users: { id: string; name: string }[];
}

export interface LogFilter {
  user: string;
  from: string;
  to: string;
}

/** Значение фильтра «без користувача»: неизвестный логин, расписание, система. */
export const NO_USER = 'none';

const ACTIONS: Record<string, string> = {
  'auth.login': 'Вхід',
  'auth.logout': 'Вихід',
  'auth.password': 'Зміна пароля',
  'content.create': 'Створення запису',
  'content.update': 'Зміна запису',
  'content.status': 'Зміна стану публікації',
  'content.delete': 'Переміщення в кошик',
  'content.restore': 'Відновлення з кошика',
  'content.purge': 'Остаточне видалення',
  'content.order': 'Зміна порядку',
  'content.seed': 'Завантаження початкових даних',
  'upload.create': 'Завантаження файлу',
  'upload.delete': 'Видалення файлу',
  'feed.hide': 'Приховано картку стрічки',
  'feed.show': 'Повернуто картку стрічки',
  'publish.start': 'Запуск публікації',
  'publish.finish': 'Завершення публікації',
  'user.bootstrap': 'Створення першого власника',
  'backup.start': 'Запуск резервної копії',
};

const DENIED: Record<string, string> = {
  'auth.login': 'Невдала спроба входу',
  'auth.password': 'Невдала зміна пароля',
};

export function actionLabel(e: Pick<LogEntryView, 'action' | 'result'>): string {
  const denied = e.result === 'denied' ? DENIED[e.action] : undefined;
  return denied ?? ACTIONS[e.action] ?? e.action;
}

export const RESULT_LABEL: Record<LogEntryView['result'], string> = {
  ok: 'Успішно',
  denied: 'Відмовлено',
  error: 'Помилка',
};

const REASONS: Record<string, string> = {
  'bad-password': 'невірний пароль',
  inactive: 'обліковий запис заблоковано',
  'unknown-login': 'невідомий логін',
  'bad-current-password': 'невірний поточний пароль',
};

const STATUS: Record<string, string> = { published: 'опубліковано', draft: 'чернетка' };

const RUN_STATE: Record<string, string> = {
  success: 'успіх',
  failure: 'помилка',
  missing: 'прогін не знайдено',
};

/** Действия, у которых идентификатор — номер прогона GitHub Actions. */
const RUN_ACTIONS = new Set(['publish.start', 'publish.finish', 'backup.start']);

const ENTITIES: Record<string, string> = {
  feed: 'Новини галузі',
  user: 'Обліковий запис',
};

/** Раздел, к которому относится запись: как в меню админки. */
export function entityLabel(entity: string | null): string | null {
  if (entity === null) return null;
  return sectionOf(entity)?.label ?? ENTITIES[entity] ?? entity;
}

/** Краткие детали строкой: известные поля — словами, остальные — как есть. */
export function detailsText(d: LogEntryView['details']): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === '' || k === 'title') continue;
    switch (k) {
      case 'reason':
        out.push(`Причина: ${REASONS[String(v)] ?? String(v)}`);
        break;
      case 'status':
        out.push(`Стан: ${STATUS[String(v)] ?? String(v)}`);
        break;
      case 'fields':
        out.push(`Поля: ${String(v).split(',').join(', ')}`);
        break;
      case 'slugFrom':
        out.push(`Адреса: ${String(v)} → ${String(d['slugTo'] ?? '')}`);
        break;
      case 'slugTo':
        break;
      case 'source':
        out.push(`Джерело: ${String(v)}`);
        break;
      case 'state':
        out.push(`Підсумок: ${RUN_STATE[String(v)] ?? String(v)}`);
        break;
      case 'moved':
        out.push(`Записів: ${String(v)}`);
        break;
      case 'problems':
        out.push(`Записів із помилками: ${String(v)}`);
        break;
      case 'bytes':
        out.push(`Розмір: ${Math.max(1, Math.round(Number(v) / 1024))} КБ`);
        break;
      default:
        out.push(`${k}: ${String(v)}`);
    }
  }
  return out.join(' · ');
}

/** Что именно: название записи, если оно есть, иначе идентификатор. */
export function subjectOf(e: LogEntryView): string | null {
  const title = e.details['title'];
  if (typeof title === 'string' && title !== '') return title;
  if (e.entity === 'user' || e.entityId === null) return null;
  if (RUN_ACTIONS.has(e.action)) return `прогін ${e.entityId}`;
  return e.entityId;
}

/** Параметры запроса: пустые поля не отправляются. */
export function filterQuery(f: LogFilter, page: number): Record<string, string> {
  return {
    ...(f.user ? { user: f.user } : {}),
    ...(f.from ? { from: f.from } : {}),
    ...(f.to ? { to: f.to } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  };
}
