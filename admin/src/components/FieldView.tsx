/**
 * Поле формы админки (ТЗ 9.3, 9.4): подпись, подсказка под полем, ошибка
 * действием, `aria-invalid` и связь с подсказкой. Только вывод: значение и
 * обработчик приходят параметрами.
 */
import type { ReactNode } from 'react';
import { FileField, type FileApi } from './FileField';
import { RICH_HINT, RichField, RichPreview } from './RichField';
import type { Field, Option } from '../domain/forms';
import type { Confirm, FieldErrors, FormGroupItem, FormValue, Lang } from '../domain/form-values';
import { formatDateTime } from '../domain/kinds';

export type Tab = 'uk' | 'en';

/** Идентификатор поля в разметке по ключу формы: `kved.0.title` → `f-kved-0-title`. */
export const fieldId = (key: string, lang?: Tab): string =>
  `f-${key.replace(/[^a-zA-Z0-9]+/gu, '-')}${lang ? `-${lang}` : ''}`;

/** Есть ли у поля языковой текст: на закладке English показываются только такие. */
export function hasLang(f: Field): boolean {
  if (f.type === 'lang' || f.type === 'langList') return true;
  if (f.type === 'group') return f.fields.some(hasLang);
  return false;
}

interface Props {
  field: Field;
  /** Ключ в состоянии формы; у пунктов группы — с номером: `kved.0.code`. */
  fieldKey: string;
  value: FormValue | undefined;
  onChange: (v: FormValue) => void;
  errors: FieldErrors;
  tab: Tab;
  contacts: readonly Option[];
  /** `slug` для имени файла; `null` — у записи ещё нет названия. */
  slug?: string | null;
  /** Загрузка файлов; без неё поле файла не выводится. */
  files?: FileApi;
}

function Describe({ id, hint, error }: { id: string; hint: string; error?: string | undefined }) {
  return (
    <>
      {hint && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </>
  );
}

const describedBy = (id: string, hint: string, error?: string) =>
  [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;

function Label({ htmlFor, field, tab }: { htmlFor: string; field: Field; tab: Tab }) {
  return (
    <label className="field__label" htmlFor={htmlFor}>
      {field.label}
      {tab === 'en' && <span className="field__optional"> (англійською, необов’язково)</span>}
      {tab === 'uk' && field.required && (
        <span className="field__req" aria-hidden="true">
          {' '}
          *
        </span>
      )}
      {tab === 'uk' && field.required && <span className="visually-hidden"> (обов’язкове)</span>}
    </label>
  );
}

function LangInput(p: Props & { field: Extract<Field, { type: 'lang' }> }) {
  const v = (p.value as Lang | undefined) ?? { uk: '', en: '' };
  const id = fieldId(p.fieldKey, p.tab);
  const error = p.tab === 'uk' ? p.errors[p.fieldKey] : undefined;
  const common = {
    id,
    value: v[p.tab],
    maxLength: p.field.max,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(id, p.field.hint, error),
    'aria-required': p.tab === 'uk' && p.field.required ? true : undefined,
    onChange: (e: { target: { value: string } }) => p.onChange({ ...v, [p.tab]: e.target.value }),
    lang: p.tab,
  };
  return (
    <div className="field">
      <Label htmlFor={id} field={p.field} tab={p.tab} />
      {p.tab === 'en' && (
        <p className="field__source">Українською: {v.uk ? v.uk : <em>ще не заповнено</em>}</p>
      )}
      {p.field.rich ? (
        <RichField
          id={id}
          value={common.value}
          onChange={(text) => p.onChange({ ...v, [p.tab]: text })}
          maxLength={p.field.max}
          lang={p.tab}
          fieldLabel={p.field.label}
          ariaInvalid={common['aria-invalid']}
          ariaDescribedBy={[common['aria-describedby'], `${id}-rich`].filter(Boolean).join(' ')}
          ariaRequired={common['aria-required']}
        />
      ) : p.field.multiline ? (
        <textarea rows={4} {...common} />
      ) : (
        <input type="text" {...common} />
      )}
      <Describe id={id} hint={p.tab === 'uk' ? p.field.hint : ''} error={error} />
      {p.field.rich && (
        <p className="field__hint" id={`${id}-rich`}>
          {RICH_HINT}
        </p>
      )}
      {p.field.rich === 'field' && <RichPreview text={common.value} lang={p.tab} />}
    </div>
  );
}

function SimpleInput(p: Props) {
  const f = p.field;
  const id = fieldId(p.fieldKey);
  const error = p.errors[p.fieldKey];
  const value = typeof p.value === 'string' ? p.value : '';
  const aria = {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy(id, f.hint, error),
    'aria-required': f.required ? true : undefined,
  };
  const set = (e: { target: { value: string } }) => p.onChange(e.target.value);
  let control: ReactNode;
  switch (f.type) {
    case 'phone':
      control = (
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={value}
          onChange={set}
          {...aria}
        />
      );
      break;
    case 'email':
      control = (
        <input id={id} type="email" maxLength={f.max} value={value} onChange={set} {...aria} />
      );
      break;
    case 'url':
      control = (
        <input
          id={id}
          type="url"
          inputMode="url"
          maxLength={f.max}
          value={value}
          onChange={set}
          {...aria}
        />
      );
      break;
    case 'date':
      control = <input id={id} type="date" value={value} onChange={set} {...aria} />;
      break;
    case 'number':
      control = (
        <input
          id={id}
          type="text"
          inputMode={f.digits === 0 ? 'numeric' : 'decimal'}
          maxLength={24}
          value={value}
          onChange={set}
          {...aria}
        />
      );
      break;
    case 'text':
      control = (
        <input id={id} type="text" maxLength={f.max} value={value} onChange={set} {...aria} />
      );
      break;
    case 'words':
    case 'pairs':
      control = <textarea id={id} rows={6} value={value} onChange={set} {...aria} />;
      break;
    case 'enum':
    case 'contact': {
      const options = f.type === 'enum' ? f.options : p.contacts;
      control = (
        <select id={id} value={value} onChange={set} {...aria}>
          <option value="">{f.required ? 'Виберіть…' : '— не вибрано —'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
      break;
    }
    default:
      return null;
  }
  return (
    <div className="field">
      <Label htmlFor={id} field={f} tab="uk" />
      {control}
      <Describe id={id} hint={f.hint} error={error} />
    </div>
  );
}

function BoolInput(p: Props) {
  const id = fieldId(p.fieldKey);
  const error = p.errors[p.fieldKey];
  return (
    <div className="field field--check">
      <input
        id={id}
        type="checkbox"
        checked={p.value === true}
        onChange={(e) => p.onChange(e.target.checked)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, p.field.hint, error)}
      />
      <label htmlFor={id} className="field__label">
        {p.field.label}
      </label>
      <Describe id={id} hint={p.field.hint} error={error} />
    </div>
  );
}

function ConfirmInput(p: Props) {
  const v = (p.value as Confirm | undefined) ?? { checked: false, at: '', by: '' };
  const id = fieldId(p.fieldKey);
  const byId = fieldId(`${p.fieldKey}.by`);
  const byError = p.errors[`${p.fieldKey}.by`];
  return (
    <div className="field field--check">
      <input
        id={id}
        type="checkbox"
        checked={v.checked}
        onChange={(e) => p.onChange({ ...v, checked: e.target.checked })}
        aria-describedby={`${id}-hint`}
      />
      <label htmlFor={id} className="field__label">
        {p.field.label}
      </label>
      <Describe id={id} hint={p.field.hint} />
      {v.checked && (
        <div className="field field--nested">
          <label className="field__label" htmlFor={byId}>
            Хто підтвердив
          </label>
          <input
            id={byId}
            type="text"
            maxLength={120}
            value={v.by}
            onChange={(e) => p.onChange({ ...v, by: e.target.value })}
            aria-invalid={byError ? true : undefined}
            aria-describedby={describedBy(byId, '', byError)}
          />
          <Describe
            id={byId}
            hint={v.at ? `Позначку поставлено ${formatDateTime(v.at)}` : ''}
            error={byError}
          />
        </div>
      )}
    </div>
  );
}

function LangListInput(p: Props & { field: Extract<Field, { type: 'langList' }> }) {
  const items = (p.value as Lang[] | undefined) ?? [];
  const set = (i: number, l: Lang) => p.onChange(items.map((x, n) => (n === i ? l : x)));
  const sub: Extract<Field, { type: 'lang' }> = {
    name: '',
    type: 'lang',
    max: p.field.max,
    required: true,
    label: '',
    hint: '',
  };
  return (
    <fieldset className="field group">
      <legend className="field__label">{p.field.label}</legend>
      {p.tab === 'uk' && <p className="field__hint">{p.field.hint}</p>}
      {p.errors[p.fieldKey] && <p className="field__error">{p.errors[p.fieldKey]}</p>}
      {items.map((item, i) => (
        <div className="group__item" key={i}>
          <LangInput
            {...p}
            field={{ ...sub, label: `Пункт ${i + 1}` }}
            fieldKey={`${p.fieldKey}.${i}`}
            value={item}
            onChange={(v) => set(i, v as Lang)}
          />
          {p.tab === 'uk' && (
            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => p.onChange(items.filter((_, n) => n !== i))}
            >
              Прибрати пункт {i + 1}
            </button>
          )}
        </div>
      ))}
      {p.tab === 'uk' && items.length < p.field.maxItems && (
        <button
          type="button"
          className="btn btn--ghost btn--inline"
          onClick={() => p.onChange([...items, { uk: '', en: '' }])}
        >
          Додати пункт
        </button>
      )}
    </fieldset>
  );
}

function GroupInput(p: Props & { field: Extract<Field, { type: 'group' }> }) {
  const items = (p.value as FormGroupItem[] | undefined) ?? [];
  const blank = (): FormGroupItem =>
    Object.fromEntries(
      p.field.fields.map((f) => [
        f.name,
        f.type === 'lang' ? { uk: '', en: '' } : f.type === 'bool' ? false : '',
      ]),
    );
  const visible = p.field.fields.filter((f) => p.tab === 'uk' || hasLang(f));
  if (p.tab === 'en' && visible.length === 0) return null;
  return (
    <fieldset className="field group">
      <legend className="field__label">{p.field.label}</legend>
      {p.tab === 'uk' && <p className="field__hint">{p.field.hint}</p>}
      {p.errors[p.fieldKey] && <p className="field__error">{p.errors[p.fieldKey]}</p>}
      {items.map((item, i) => {
        const name = typeof item['name'] === 'string' && item['name'] ? item['name'] : null;
        return (
          <fieldset className="group__item" key={i}>
            <legend>{name ?? `${p.field.itemLabel} ${i + 1}`}</legend>
            {visible.map((sub) => (
              <FieldView
                key={sub.name}
                {...p}
                field={sub}
                fieldKey={`${p.fieldKey}.${i}.${sub.name}`}
                value={item[sub.name]}
                onChange={(v) =>
                  p.onChange(items.map((x, n) => (n === i ? { ...x, [sub.name]: v } : x)))
                }
              />
            ))}
            {!p.field.fixed && p.tab === 'uk' && (
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => p.onChange(items.filter((_, n) => n !== i))}
              >
                Прибрати: {p.field.itemLabel.toLowerCase()} {i + 1}
              </button>
            )}
          </fieldset>
        );
      })}
      {!p.field.fixed && p.tab === 'uk' && items.length < p.field.maxItems && (
        <button
          type="button"
          className="btn btn--ghost btn--inline"
          onClick={() => p.onChange([...items, blank()])}
        >
          Додати: {p.field.itemLabel.toLowerCase()}
        </button>
      )}
    </fieldset>
  );
}

export function FieldView(p: Props) {
  const f = p.field;
  if (p.tab === 'en' && !hasLang(f)) return null;
  switch (f.type) {
    case 'lang':
      return <LangInput {...p} field={f} />;
    case 'langList':
      return <LangListInput {...p} field={f} />;
    case 'group':
      return <GroupInput {...p} field={f} />;
    case 'bool':
      return <BoolInput {...p} />;
    case 'confirm':
      return <ConfirmInput {...p} />;
    case 'file':
      if (!p.files) return null;
      return (
        <FileField
          api={p.files}
          id={fieldId(p.fieldKey)}
          label={f.label}
          hint={f.hint}
          entity={f.entity}
          accept={f.accept}
          slug={p.slug ?? null}
          value={typeof p.value === 'string' ? p.value : ''}
          error={p.errors[p.fieldKey]}
          onChange={p.onChange}
        />
      );
    default:
      return <SimpleInput {...p} />;
  }
}
