/**
 * Журнал действий для владельца (ТЗ 9.7): подписи по-украински, без
 * служебных кодов. Слой domain: чистые функции.
 */
import { formFields } from './forms';
import { sectionOf, type Kind } from './kinds';

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
  'content.purge-retired': 'Видалення записів розділу, якого більше немає',
  'content.backfill': 'Доповнення запису новими полями з початкових даних',
  'content.patch': 'Оновлення запису за рішенням Замовника',
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
  return denied ?? ACTIONS[e.action] ?? 'Інша дія';
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
  'owner-only': 'дія лише для власника',
  'owner-only-kind': 'розділ лише для власника',
  'owner-only-field': 'позначку підтвердження ставить лише власник',
  slug: 'адресу сторінки змінює лише власник',
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
  feed: 'Стрічка новин',
  user: 'Обліковий запис',
};

/** Раздел, к которому относится запись: как в меню админки. */
export function entityLabel(entity: string | null): string | null {
  if (entity === null) return null;
  return sectionOf(entity)?.label ?? ENTITIES[entity] ?? entity;
}

/** Служебные поля записи, которых нет в формах. */
const EXTRA_FIELDS: Record<string, string> = {
  slug: 'адреса сторінки',
  blockKey: 'блок',
  order: 'порядок',
  status: 'стан',
  publishedAt: 'дата публікації',
  confirmedAt: 'позначка підтвердження',
  confirmedBy: 'позначка підтвердження',
};

/** Имя поля записи → подпись из формы раздела (как редактор видит поле). */
function fieldLabel(entity: string | null, name: string): string | null {
  const top = name.split('.')[0] as string;
  const section = entity ? sectionOf(entity) : undefined;
  if (section) {
    const f = formFields(section.kind as Kind, 'owner').find(
      (x) => x.name === name || x.name.split('.')[0] === top,
    );
    if (f) return f.label.toLowerCase();
  }
  return EXTRA_FIELDS[top] ?? null;
}

const MIME: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
};

const OUTCOME: Record<string, string> = {
  removed: 'видалено одразу',
  deleting: 'зникне з сайту після публікації',
};

/**
 * Краткие детали строкой, только словами (ТЗ 9.7, п. 4): имена полей — подписями
 * форм, служебные ключи без подписи не выводятся.
 */
export function detailsText(d: LogEntryView['details'], entity: string | null = null): string {
  const out: string[] = [];
  if (d['role'] === 'owner' && d['login'] !== undefined) {
    return `Логін: ${String(d['login'])} · Роль: власник`;
  }
  for (const [k, v] of Object.entries(d)) {
    if (v === null || v === '' || k === 'title') continue;
    switch (k) {
      case 'reason':
        out.push(`Причина: ${REASONS[String(v)] ?? 'інша'}`);
        break;
      case 'status':
        out.push(`Стан: ${STATUS[String(v)] ?? 'інший'}`);
        break;
      case 'fields': {
        const labels = [
          ...new Set(
            String(v)
              .split(',')
              .map((n) => fieldLabel(entity, n.trim())),
          ),
        ].filter((l): l is string => l !== null);
        if (labels.length > 0) out.push(`Поля: ${labels.join(', ')}`);
        break;
      }
      case 'slugFrom':
        out.push(`Адреса: ${String(v)} → ${String(d['slugTo'] ?? '')}`);
        break;
      case 'slugTo':
        break;
      case 'source':
        out.push(`Джерело: ${String(v)}`);
        break;
      case 'state':
        out.push(`Підсумок: ${RUN_STATE[String(v)] ?? 'невідомо'}`);
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
      case 'mime':
        out.push(`Тип: ${MIME[String(v)] ?? 'інший'}`);
        break;
      case 'outcome':
        if (OUTCOME[String(v)]) out.push(`Файл: ${OUTCOME[String(v)]}`);
        break;
      default: {
        // Завантаження початкових даних: число записей по разделам.
        const section = typeof v === 'number' ? sectionOf(k) : undefined;
        if (section) out.push(`${section.label}: ${String(v)}`);
      }
    }
  }
  return out.join(' · ');
}

/**
 * Что именно: название записи; у файла — имя файла; у прогона — его номер.
 * Внутренний идентификатор записи не показывается (ТЗ 9.7, п. 4).
 */
export function subjectOf(e: LogEntryView): string | null {
  const title = e.details['title'];
  if (typeof title === 'string' && title !== '') return title;
  if (e.entity === 'user' || e.entityId === null) return null;
  if (RUN_ACTIONS.has(e.action)) return `прогін ${e.entityId}`;
  if (e.entityId.startsWith('media/')) return e.entityId.slice(e.entityId.lastIndexOf('/') + 1);
  if (e.entity !== null && sectionOf(e.entity)?.singleton) return null;
  return 'запис без назви';
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
