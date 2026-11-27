/**
 * Разделы админки (ТЗ 9.3; решение 040): только сущности, у которых есть
 * эндпоинты 5в. Порядок и подписи — как в меню ТЗ 9.3.
 */
import { formatPhone, type BlockKey, type PublishedWhere } from '@uzn/shared';

export type Role = 'owner' | 'editor';

/** Ответ `/auth/me` и `/auth/login` (ТЗ 8.2). */
export interface User {
  login: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

export type ListKind =
  'contacts' | 'leaders' | 'services' | 'public-docs' | 'vacancies' | 'static-blocks';

export type SingletonKind = 'enterprise' | 'feed-rules';

export type Kind = ListKind | SingletonKind;

export interface Section {
  kind: Kind;
  label: string;
  /** Одна запись: сразу форма, без списка. */
  singleton: boolean;
  /** Есть порядок записей: кнопки «Вище» и «Нижче». */
  ordered: boolean;
  /** Новую запись может добавить редактор. */
  creatable: boolean;
  /** Только владельцу (ТЗ 9.1: словарь ленты). */
  ownerOnly: boolean;
  /** Пояснение под заголовком раздела: где это на сайте. */
  where: string;
  /** Подпись кнопки новой записи. */
  addLabel: string;
}

const list = (
  kind: ListKind,
  label: string,
  addLabel: string,
  where: string,
  extra: Partial<Section> = {},
): Section => ({
  kind,
  label,
  addLabel,
  where,
  singleton: false,
  ordered: true,
  creatable: true,
  ownerOnly: false,
  ...extra,
});

export const SECTIONS: readonly Section[] = [
  {
    kind: 'enterprise',
    label: 'Підприємство',
    where: 'Назва, реквізити, довідка й цифри — сторінка «Про підприємство» і підвал сайту.',
    addLabel: '',
    singleton: true,
    ordered: false,
    creatable: false,
    ownerOnly: false,
  },
  list('contacts', 'Контакти', 'Додати контакт', 'Телефони — сторінка «Контакти» і підвал сайту.'),
  list(
    'leaders',
    'Керівництво',
    'Додати картку',
    'Картки керівників — сторінка «Про підприємство».',
  ),
  list('services', 'Послуги', 'Додати послугу', 'Картки послуг — сторінка «Послуги».'),
  list(
    'public-docs',
    'Публічна інформація',
    'Додати документ',
    'Перелік документів — сторінка «Публічна інформація».',
  ),
  list('vacancies', 'Вакансії', 'Додати вакансію', 'Оголошення — сторінка «Вакансії».'),
  list(
    'static-blocks',
    'Тексти сторінок',
    'Додати текст',
    'Пояснювальні тексти на окремих сторінках сайту.',
    {
      ordered: false,
    },
  ),
  {
    kind: 'feed-rules',
    label: 'Словник стрічки',
    where: 'Слова, за якими добирається «Стрічка новин», і перелік джерел.',
    addLabel: '',
    singleton: true,
    ordered: false,
    creatable: false,
    ownerOnly: true,
  },
];

export function sectionsFor(role: Role): Section[] {
  return SECTIONS.filter((s) => role === 'owner' || !s.ownerOnly);
}

export function sectionOf(kind: string): Section | undefined {
  return SECTIONS.find((s) => s.kind === kind);
}

/**
 * Тексты сторінок, які сайт справді виводить. Ключі схеми без місця на сайті
 * (`home.intro`, `home.numbers`, `news.fb.note`) не пропонуються: текст
 * нікуди б не потрапив.
 */
export const BLOCK_LABELS: Partial<Record<BlockKey, string>> = {
  'about.history': 'Історія підприємства — «Про підприємство»',
  'public-info.note': 'Примітка — «Публічна інформація»',
  'tenders.note': 'Примітка — «Наші закупівлі»',
  'news.feed.note': 'Примітка до стрічки — «Новини»',
};

/**
 * Место публикации документа. Подписи совпадают с сайтом
 * (`site/src/domain/public-docs.ts`, `PLACE_LABELS`) — сверяет тест.
 */
export const PLACE_LABELS: Record<PublishedWhere, string> = {
  own: 'На цьому сайті',
  parent: 'На чинній сторінці підприємства',
  balans: 'У системі «Баланс» органу управління',
  prozorro: 'У Prozorro',
  edata: 'На порталі Є-data',
  request: 'Надається за запитом на інформацію',
};

export interface RecordView<D = Record<string, unknown>> {
  id: string;
  status: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  firstPublishedAt: string | null;
  data: D;
}

const uk = (v: unknown): string =>
  typeof v === 'object' && v !== null && typeof (v as { uk?: unknown }).uk === 'string'
    ? (v as { uk: string }).uk
    : '';

const phoneText = (v: unknown): string => {
  if (typeof v !== 'string') return '';
  try {
    return formatPhone(v);
  } catch {
    return v;
  }
};

/** Название записи в списке и в заголовке формы. */
export function titleOf(kind: Kind, data: Record<string, unknown>): string {
  switch (kind) {
    case 'contacts':
      return [uk(data['purpose']), phoneText(data['phone'])].filter(Boolean).join(' · ');
    case 'leaders':
      return [uk(data['fullName']), uk(data['position'])].filter(Boolean).join(' · ');
    case 'services':
    case 'public-docs':
      return uk(data['title']);
    case 'vacancies':
      return uk(data['position']);
    case 'static-blocks': {
      const key = data['blockKey'] as BlockKey;
      return BLOCK_LABELS[key] ?? String(key);
    }
    case 'enterprise':
      return 'Підприємство';
    case 'feed-rules':
      return 'Словник стрічки';
  }
}

/** Дата и время по-киевски: «21.11.2026, 14:05». */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
