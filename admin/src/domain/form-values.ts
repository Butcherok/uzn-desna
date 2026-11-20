/**
 * Перевод между данными записи и состоянием формы (ТЗ 9.3; решение 040).
 *
 * Состояние формы — строки и флажки, как их вводит человек: телефон в любом
 * виде, корни словаря — текстом по строкам. `fromForm` приводит их к формату
 * данных и собирает ошибки по полям; `buildPatch` строит JSON Merge Patch
 * (RFC 7386, решение 038): изменённые поля, `null` — очищенное поле.
 */
import { parseStoredPhone } from '@uzn/shared';
import type { Field } from './forms';

export type Lang = { uk: string; en: string };
export type FormValue = string | boolean | Lang | Lang[] | FormGroupItem[] | Confirm;
export type FormGroupItem = Record<string, FormValue>;
export type Confirm = { checked: boolean; at: string; by: string };
export type FormState = Record<string, FormValue>;
export type FieldErrors = Record<string, string>;

/** Ключ пункта группы с его полями вне формы — JSON-строкой. */
export const KEEP = '__keep';

type Data = Record<string, unknown>;

export function getPath(obj: unknown, path: string): unknown {
  let v: unknown = obj;
  for (const p of path.split('.')) {
    if (typeof v !== 'object' || v === null) return undefined;
    v = (v as Data)[p];
  }
  return v;
}

function setPath(obj: Data, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Data = obj;
  for (const p of parts.slice(0, -1)) {
    const next = cur[p];
    if (typeof next !== 'object' || next === null) cur[p] = {};
    cur = cur[p] as Data;
  }
  const last = parts[parts.length - 1] as string;
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

const toLang = (v: unknown): Lang => ({
  uk: str(getPath(v, 'uk')),
  en: str(getPath(v, 'en')),
});

function phoneToForm(v: unknown): string {
  const s = str(v);
  // Хранится как +380XXXXXXXXX; в поле — привычный вид «044 337-35-01».
  const m = /^\+38(0\d{2})(\d{3})(\d{2})(\d{2})$/u.exec(s);
  return m ? `${m[1]} ${m[2]}-${m[3]}-${m[4]}` : s;
}

function fieldToForm(f: Field, data: unknown): FormValue {
  const v = getPath(data, f.name);
  switch (f.type) {
    case 'lang':
      return toLang(v);
    case 'phone':
      return phoneToForm(v);
    case 'bool':
      return v === true;
    case 'confirm':
      return {
        checked: typeof v === 'string',
        at: str(v),
        by: str(getPath(data, 'confirmedBy')),
      };
    case 'langList':
      return Array.isArray(v) ? v.map(toLang) : [];
    case 'group':
      return Array.isArray(v)
        ? v.map((item) => {
            const out: FormGroupItem = {};
            for (const sub of f.fields) out[sub.name] = fieldToForm(sub, item);
            // Поля пункта вне формы (`id` источника ленты) едут обратно как были.
            const rest = Object.fromEntries(
              Object.entries(item as Data).filter(([k]) => !f.fields.some((sub) => sub.name === k)),
            );
            if (Object.keys(rest).length > 0) out[KEEP] = JSON.stringify(rest);
            return out;
          })
        : [];
    case 'words':
      return Array.isArray(v) ? v.map(String).join('\n') : '';
    case 'pairs':
      return Array.isArray(v)
        ? v.map((p) => (Array.isArray(p) ? p.map(String).join(' ') : '')).join('\n')
        : '';
    default:
      return str(v);
  }
}

export function toForm(fields: readonly Field[], data: Data): FormState {
  const state: FormState = {};
  for (const f of fields) state[f.name] = fieldToForm(f, data);
  return state;
}

/** Пустую форму новой записи даёт та же функция на пустых данных. */
export const emptyForm = (fields: readonly Field[]): FormState => toForm(fields, {});

// Как `z.string().max()`: длина в единицах UTF-16, а не в символах.
const length = (s: string) => s.length;
const tooLong = (max: number) => `Не довше ${max} знаків`;
const REQUIRED = 'Заповніть це поле';
const REQUIRED_UK = 'Заповніть українською';

interface Converted {
  value: unknown;
  errors: FieldErrors;
}

function convert(f: Field, raw: FormValue | undefined, key: string, now: () => Date): Converted {
  const errors: FieldErrors = {};
  const fail = (msg: string, at = key): Converted => {
    errors[at] = msg;
    return { value: undefined, errors };
  };
  switch (f.type) {
    case 'lang': {
      const l = (raw as Lang | undefined) ?? { uk: '', en: '' };
      const uk = l.uk.trim();
      const en = l.en.trim();
      if (!uk) {
        if (f.required) return fail(REQUIRED_UK);
        if (en) return fail('Спочатку заповніть українською');
        return { value: undefined, errors };
      }
      if (length(uk) > f.max || length(en) > f.max) return fail(tooLong(f.max));
      return { value: en ? { uk, en } : { uk }, errors };
    }
    case 'text':
    case 'email':
    case 'url': {
      const s = str(raw).trim();
      if (!s) return f.required ? fail(REQUIRED) : { value: undefined, errors };
      if (length(s) > f.max) return fail(tooLong(f.max));
      if (f.type === 'text' && f.pattern && !f.pattern.re.test(s)) return fail(f.pattern.message);
      if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(s)) {
        return fail('Адреса пошти має вигляд name@example.com');
      }
      if (f.type === 'url' && !/^https:\/\/[^\s]+\.[^\s]+/u.test(s)) {
        return fail('Адреса має починатися з https://');
      }
      return { value: s, errors };
    }
    case 'phone': {
      const s = str(raw).trim();
      if (!s) return f.required ? fail(REQUIRED) : { value: undefined, errors };
      try {
        return { value: parseStoredPhone(s), errors };
      } catch {
        return fail('Номер має 10 цифр, наприклад 044 337-35-01');
      }
    }
    case 'date': {
      const s = str(raw).trim();
      if (!s) return f.required ? fail(REQUIRED) : { value: undefined, errors };
      return /^\d{4}-\d{2}-\d{2}$/u.test(s) ? { value: s, errors } : fail('Виберіть дату');
    }
    case 'bool':
      return { value: raw === true, errors };
    case 'enum':
    case 'contact': {
      const s = str(raw);
      if (!s) return f.required ? fail('Виберіть зі списку') : { value: undefined, errors };
      return { value: s, errors };
    }
    case 'confirm': {
      const c = raw as Confirm | undefined;
      if (!c?.checked) return { value: { at: undefined, by: undefined }, errors };
      const by = c.by.trim();
      if (!by) return fail('Вкажіть, хто підтвердив', `${key}.by`);
      if (length(by) > 120) return fail(tooLong(120), `${key}.by`);
      return { value: { at: c.at || now().toISOString(), by }, errors };
    }
    case 'langList': {
      const items = ((raw as Lang[] | undefined) ?? []).filter((l) => l.uk.trim() || l.en.trim());
      if (items.length > f.maxItems) return fail(`Не більше ${f.maxItems} пунктів`);
      const out: unknown[] = [];
      items.forEach((l, i) => {
        const r = convert(
          { name: '', type: 'lang', max: f.max, required: true, label: '', hint: '' },
          l,
          `${key}.${i}`,
          now,
        );
        Object.assign(errors, r.errors);
        out.push(r.value);
      });
      return { value: out.length ? out : undefined, errors };
    }
    case 'group': {
      const items = (raw as FormGroupItem[] | undefined) ?? [];
      if (items.length > f.maxItems) return fail(`Не більше ${f.maxItems} пунктів`);
      const out: unknown[] = [];
      items.forEach((item, i) => {
        const kept = item[KEEP];
        const obj: Data = typeof kept === 'string' ? (JSON.parse(kept) as Data) : {};
        for (const sub of f.fields) {
          const r = convert(sub, item[sub.name], `${key}.${i}.${sub.name}`, now);
          Object.assign(errors, r.errors);
          if (r.value !== undefined) obj[sub.name] = r.value;
        }
        out.push(obj);
      });
      if (f.fixed) return { value: out, errors };
      return { value: out.length ? out : undefined, errors };
    }
    case 'words': {
      const words = str(raw)
        .split('\n')
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean);
      if (f.required && words.length < (f.min ?? 1)) return fail(REQUIRED);
      const bad = words.find((w) => !/^[a-zа-щьюяґєії' -]{2,40}$/u.test(w));
      if (bad) return fail(`«${bad}»: лише літери, апостроф, дефіс; від 2 до 40 знаків`);
      return { value: words, errors };
    }
    case 'pairs': {
      const lines = str(raw)
        .split('\n')
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean);
      const pairs: [string, string][] = [];
      for (const line of lines) {
        const parts = line.split(/\s+/u);
        if (parts.length !== 2 || parts.some((p) => !/^[a-zа-щьюяґєії'-]{2,40}$/u.test(p))) {
          return fail(`«${line}»: потрібно два корені через пробіл`);
        }
        pairs.push([parts[0] as string, parts[1] as string]);
      }
      return { value: pairs, errors };
    }
  }
}

export interface FromForm {
  data: Data;
  errors: FieldErrors;
}

/** Поля формы → данные записи. Поля вне формы не трогаются (их сохранит сервер). */
export function fromForm(
  fields: readonly Field[],
  state: FormState,
  now: () => Date = () => new Date(),
): FromForm {
  const data: Data = {};
  const errors: FieldErrors = {};
  for (const f of fields) {
    const r = convert(f, state[f.name], f.name, now);
    Object.assign(errors, r.errors);
    if (f.type === 'confirm') {
      const v = r.value as { at?: string; by?: string } | undefined;
      setPath(data, 'confirmedAt', v?.at);
      setPath(data, 'confirmedBy', v?.by);
      continue;
    }
    setPath(data, f.name, r.value);
  }
  return { data, errors };
}

/** Верхние ключи данных, которыми управляет форма. */
function ownedKeys(fields: readonly Field[]): string[] {
  const keys = new Set<string>();
  for (const f of fields) {
    if (f.type === 'confirm') {
      keys.add('confirmedAt');
      keys.add('confirmedBy');
    } else {
      keys.add(f.name.split('.')[0] as string);
    }
  }
  return [...keys];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * JSON Merge Patch от исходных данных к данным формы. Пустой объект —
 * изменений нет. Вложенные объекты (`dictionary`) отправляются целиком.
 */
export function buildPatch(fields: readonly Field[], original: Data, next: Data): Data {
  const patch: Data = {};
  for (const key of ownedKeys(fields)) {
    const before = original[key];
    const after = next[key];
    if (same(before, after)) continue;
    patch[key] = after === undefined ? null : after;
  }
  return patch;
}

/** Есть ли несохранённые правки (ТЗ 9.4, п. 5). */
export function isDirty(a: FormState, b: FormState): boolean {
  return !same(a, b);
}

/**
 * Ключ ошибки сервера → ключ поля формы. Сервер называет путь до значения
 * (`purpose.uk`, `kved.0.title.uk`), форма — до поля (`purpose`,
 * `kved.0.title`). Берётся самый длинный известный форме префикс.
 */
export function errorKeyFor(serverKey: string, known: ReadonlySet<string>): string | null {
  const parts = serverKey.split('.');
  for (let n = parts.length; n > 0; n -= 1) {
    const k = parts.slice(0, n).join('.');
    if (known.has(k)) return k;
  }
  if (serverKey === 'confirmedBy' && known.has('confirmedAt')) return 'confirmedAt.by';
  return null;
}

/** Все ключи полей, которые нарисует форма, — для привязки ошибок сервера. */
export function fieldKeys(fields: readonly Field[], state: FormState): Set<string> {
  const keys = new Set<string>();
  for (const f of fields) {
    keys.add(f.name);
    if (f.type === 'confirm') keys.add(`${f.name}.by`);
    if (f.type === 'langList') {
      ((state[f.name] as Lang[] | undefined) ?? []).forEach((_, i) => keys.add(`${f.name}.${i}`));
    }
    if (f.type === 'group') {
      ((state[f.name] as FormGroupItem[] | undefined) ?? []).forEach((_, i) => {
        for (const sub of f.fields) keys.add(`${f.name}.${i}.${sub.name}`);
      });
    }
  }
  return keys;
}

/** Перекрёстные правила записи, которые нельзя проверить полем отдельно. */
export function crossCheck(kind: string, data: Data): FieldErrors {
  const errors: FieldErrors = {};
  if (kind === 'public-docs') {
    const where = data['publishedWhere'];
    const url = data['externalUrl'];
    if (where === 'request' && url !== undefined) {
      errors['externalUrl'] = 'Для документа «за запитом» посилання не потрібне';
    } else if (where !== undefined && where !== 'request' && url === undefined) {
      errors['externalUrl'] = 'Додайте посилання на документ';
    }
    if (data['featured'] === true && url === undefined) {
      errors['featured'] = 'У блок документів потрапляє лише документ із посиланням';
    }
  }
  if (kind === 'leaders' && data['photoPath'] !== undefined && data['photoAlt'] === undefined) {
    errors['photoAlt'] = 'Є фото — додайте опис фото';
  }
  return errors;
}
