/**
 * Предпросмотр карточки (ТЗ 9.3; решение 046): что нарисовать из состояния
 * формы и почему записи сейчас нет на сайте. Слой domain: чистая функция над
 * переданными данными; карточки рисует `components/Preview` теми же
 * React-компонентами, что сайт.
 *
 * Правила видимости берутся из слоя domain сайта, а не копируются: админка и
 * сборка решают одинаково, показывать ли запись.
 */
import { parseStoredPhone, type PublishedWhere } from '@uzn/shared';
import { isProcurement, PLACE_TAGS } from '../../../site/src/domain/public-docs';
import { isExpired } from '../../../site/src/domain/vacancies';
import { formFields, type Field } from './forms';
import type { FormState, FormValue, Lang } from './form-values';
import type { Kind } from './kinds';

export type PreviewLang = 'uk' | 'en';

/** Ссылка документа — та же форма, что у `DocLink` сайта. */
export type PreviewDocTarget =
  | { kind: 'file'; href: string; fileKind: 'PDF' | 'Word'; updatedAt?: string | undefined }
  | { kind: 'external'; href: string | undefined };

export type PreviewCard =
  | { type: 'service'; title: string; summary: string }
  | {
      type: 'leader';
      fullName: string;
      position: string;
      since?: string | undefined;
      bio?: string | undefined;
      photo?: { src: string; alt: string } | undefined;
    }
  | {
      type: 'vacancy';
      position: string;
      unit?: string | undefined;
      requirements: string;
      phone: string;
    }
  | { type: 'doc'; title: string; target: PreviewDocTarget; place: string }
  | { type: 'contact'; purpose: string; phone: string; hours?: string | undefined };

export interface PreviewResult {
  /** Карточка; `null` — не хватает обязательного, вместо неё `prompt`. */
  card: PreviewCard | null;
  /** Что заполнить, чтобы карточка появилась. */
  prompt: string | null;
  /** Почему записи сейчас нет на сайте (или её части). */
  hidden: string[];
  /** Полезное «к сведению», запись при этом видна. */
  info: string[];
  /** Карточки сейчас на сайте нет совсем (а не только её части, как фото). */
  offSite: boolean;
}

/** Контакт из раздела «Контакти» — для телефона вакансии. */
export interface ContactInfo {
  slug: string;
  label: string;
  phone: string;
  confirmed: boolean;
  published: boolean;
}

export interface PreviewContext {
  lang: PreviewLang;
  /** Состояние сохранённой записи; `null` — новая, ещё не сохранена. */
  status: 'draft' | 'published' | null;
  /** Киевская дата `ГГГГ-ММ-ДД`. */
  today: string;
  contacts: readonly ContactInfo[];
  fileUrl: (path: string) => string;
}

/** Разделы, где есть предпросмотр (решение 046, п. 1). */
export const PREVIEW_KINDS: ReadonlySet<Kind> = new Set<Kind>([
  'services',
  'leaders',
  'vacancies',
  'public-docs',
  'contacts',
]);

export const hasPreview = (kind: Kind): boolean => PREVIEW_KINDS.has(kind);

const str = (v: FormValue | undefined): string => (typeof v === 'string' ? v.trim() : '');
const bool = (v: FormValue | undefined): boolean => v === true;
const lang = (v: FormValue | undefined, l: PreviewLang): string =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && 'uk' in v
    ? ((v as Lang)[l] ?? '').trim()
    : '';

/** Телефон в виде хранения или `null`, пока номер набран не до конца. */
function phoneOf(raw: string): string | null {
  if (!raw) return null;
  try {
    return parseStoredPhone(raw);
  } catch {
    return null;
  }
}

/** «31.12.2026» из `2026-12-31`. */
const dmy = (iso: string): string => iso.split('-').reverse().join('.');

const quote = (labels: readonly string[]): string => labels.map((l) => `«${l}»`).join(', ');

function labelsOf(kind: Kind): Map<string, string> {
  return new Map(formFields(kind, 'owner').map((f: Field) => [f.name, f.label]));
}

/**
 * Что сказать, когда не хватает обязательного. На закладке English без единого
 * английского слова — отдельная фраза: обязательного там нет (ТЗ 6.1, п. 4).
 */
function promptFor(missing: readonly string[], l: PreviewLang, anyEn: boolean): string {
  if (l === 'en' && !anyEn) {
    return 'Англійською ще не заповнено. Англійська версія сайту з’явиться пізніше — тоді тут буде картка англійською.';
  }
  const how = l === 'en' ? 'заповніть англійською' : 'заповніть';
  return `Щоб побачити картку, ${how}: ${quote(missing)}.`;
}

/** Строит предпросмотр; `null` — у раздела предпросмотра нет. */
export function previewOf(kind: Kind, form: FormState, ctx: PreviewContext): PreviewResult | null {
  if (!hasPreview(kind)) return null;
  const label = labelsOf(kind);
  const l = ctx.lang;
  const hidden: string[] = [];
  const info: string[] = [];
  const missing: string[] = [];
  let offSite = ctx.status !== 'published';
  const need = (name: string, value: string): string => {
    if (!value) missing.push(label.get(name) ?? name);
    return value;
  };
  const text = (name: string): string => lang(form[name], l);
  // Есть ли хоть одно английское слово в полях карточки.
  const anyEnIn = (names: readonly string[]): boolean =>
    names.some((n) => lang(form[n], 'en') !== '');

  if (ctx.status === null) {
    hidden.push(
      'Новий запис з’явиться на сайті після кнопки «Зберегти й опублікувати» та публікації змін.',
    );
  } else if (ctx.status === 'draft') {
    hidden.push(
      'Це чернетка — на сайті її ще немає. З’явиться після кнопки «Зберегти й опублікувати» та публікації змін.',
    );
  }

  let card: PreviewCard | null = null;
  let langNames: string[] = [];

  switch (kind) {
    case 'services': {
      langNames = ['title', 'summary'];
      const title = need('title', text('title'));
      const summary = need('summary', text('summary'));
      const group = text('group');
      if (group) info.push(`На сторінці «Послуги» картка стоїть у групі «${group}».`);
      card = { type: 'service', title, summary };
      break;
    }

    case 'leaders': {
      langNames = ['fullName', 'position', 'bio', 'photoAlt'];
      const fullName = need('fullName', text('fullName'));
      const position = need('position', text('position'));
      const since = str(form['since']) || undefined;
      const bio = text('bio') || undefined;
      const photoPath = str(form['photoPath']);
      const alt = text('photoAlt');
      let photo: { src: string; alt: string } | undefined;
      if (photoPath && alt) photo = { src: ctx.fileUrl(photoPath), alt };
      // Подсказка о фото — только когда карточка будет нарисована.
      else if (photoPath && fullName && position) {
        hidden.push(
          `Фото на сайті не показується, доки не заповнено ${quote([label.get('photoAlt') ?? 'Опис фото'])}${l === 'en' ? ' англійською' : ''}: без опису його не побачать люди, які користуються читанням з екрана.`,
        );
      }
      card = { type: 'leader', fullName, position, since, bio, photo };
      break;
    }

    case 'vacancies': {
      langNames = ['position', 'unit', 'requirements'];
      const position = need('position', text('position'));
      const requirements = need('requirements', text('requirements'));
      const unit = text('unit') || undefined;
      const slug = str(form['contactId']);
      const contact = ctx.contacts.find((c) => c.slug === slug);
      let phone = '';
      if (!slug) need('contactId', '');
      else if (!contact) {
        offSite = true;
        hidden.push(
          'Телефон не знайдено: вибраний номер видалено з розділу «Контакти». Виберіть інший у полі «Куди телефонувати».',
        );
        missing.push(label.get('contactId') ?? 'Куди телефонувати');
      } else {
        phone = contact.phone;
        if (!contact.confirmed || !contact.published) {
          offSite = true;
          hidden.push(
            `Вакансія на сайт не потрапить: номер «${contact.label}» у розділі «Контакти» ${contact.published ? 'не позначено «Номер перевірено»' : 'ще чернетка'}. Виправте це там або виберіть інший номер.`,
          );
        }
      }
      const until = str(form['validThrough']);
      if (isExpired(until || undefined, ctx.today)) {
        offSite = true;
        hidden.push(
          `Вакансія на сайті не показується: минув строк ${quote([label.get('validThrough') ?? 'Показувати до'])} (${dmy(until)}). Щоб показати знову, змініть дату або очистьте поле.`,
        );
      } else if (until) {
        info.push(`Картка сама зникне з сайту ${dmy(until)}.`);
      }
      card = { type: 'vacancy', position, unit, requirements, phone };
      break;
    }

    case 'public-docs': {
      langNames = ['title', 'normRef'];
      const title = need('title', text('title'));
      const where = str(form['publishedWhere']) as PublishedWhere | '';
      if (!where) need('publishedWhere', '');
      const filePath = str(form['filePath']);
      const url = str(form['externalUrl']);
      let target: PreviewDocTarget = { kind: 'external', href: url || undefined };
      if (where === 'own') {
        if (filePath) {
          target = {
            kind: 'file',
            href: ctx.fileUrl(filePath),
            fileKind: filePath.toLowerCase().endsWith('.pdf') ? 'PDF' : 'Word',
            updatedAt: str(form['docUpdatedAt']) || undefined,
          };
        } else need('filePath', '');
      } else if (where && where !== 'request' && !url) need('externalUrl', '');
      const inCards = bool(form['featured']) || (where !== '' && isProcurement(where));
      if (where && !inCards) {
        offSite = true;
        const row = lang(form['normRef'], 'uk')
          ? ' Документ видно лише рядком у таблиці «Перелік відомостей».'
          : ' Документ на сторінці ніде не видно: немає ні картки, ні рядка в таблиці («Норма закону» порожня).';
        hidden.push(
          `Картки цього документа на сайті немає: не позначено ${quote([label.get('featured') ?? 'У блоці документів'])}.${row}`,
        );
      } else if (where && isProcurement(where)) {
        info.push('Картка стоїть у блоці «Закупівлі та договори» сторінки «Публічна інформація».');
      }
      card = { type: 'doc', title, target, place: where ? PLACE_TAGS[where] : '' };
      break;
    }

    case 'contacts': {
      langNames = ['purpose', 'hours'];
      const purpose = need('purpose', text('purpose'));
      const raw = str(form['phone']);
      const phone = phoneOf(raw);
      if (!phone) missing.push(`${label.get('phone') ?? 'Телефон'}${raw ? ' (повністю)' : ''}`);
      if (!bool(form['confirmed'])) {
        offSite = true;
        hidden.push(
          `Цей номер на сайті не показується: не позначено ${quote([label.get('confirmed') ?? 'Номер перевірено'])}. Позначте, коли номер перевірено дзвінком.`,
        );
      } else if (bool(form['showInFooter'])) {
        info.push('Номер показується також унизу кожної сторінки сайту (у підвалі).');
      }
      card = { type: 'contact', purpose, phone: phone ?? '', hours: text('hours') || undefined };
      break;
    }
  }

  if (missing.length > 0) {
    return {
      card: null,
      prompt: promptFor(missing, l, anyEnIn(langNames)),
      hidden,
      info,
      offSite,
    };
  }
  return { card, prompt: null, hidden, info, offSite };
}
