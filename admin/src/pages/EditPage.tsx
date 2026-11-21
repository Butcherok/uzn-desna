/**
 * Форма записи (ТЗ 9.3, 9.4): один столбец, закладки «Українська / English»,
 * «Зберегти», «Зберегти й опублікувати», «Скасувати»; «Не збережено», пока
 * есть правки; ошибка подсвечивает поле и ставит на него фокус. При неудачном
 * сохранении введённое не сбрасывается (ТЗ 8.7, п. 4).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { FieldView, fieldId, hasLang, type Tab } from '../components/FieldView';
import { ErrorBox, StatusBadge } from '../components/Status';
import { formFields, freeBlockKeys, type Option } from '../domain/forms';
import {
  buildPatch,
  crossCheck,
  errorKeyFor,
  fieldKeys,
  fromForm,
  isDirty,
  toForm,
  type FieldErrors,
  type FormState,
} from '../domain/form-values';
import { formatDateTime, sectionOf, titleOf, type Kind, type RecordView } from '../domain/kinds';
import { api } from '../gateway/admin-api';
import { ApiRequestError } from '../gateway/api';
import { navigate, setDirty } from '../gateway/router';
import { useAdmin } from './context';
import { useFailure } from './ListPage';

interface Props {
  kind: Kind;
  id: string | null;
  isNew: boolean;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function EditPage({ kind, id, isNew }: Props) {
  const section = sectionOf(kind);
  const { user, onSlow, setPending, notify } = useAdmin();
  const failure = useFailure();
  const fields = useMemo(() => formFields(kind, user.role), [kind, user.role]);
  const isOwner = user.role === 'owner';
  const singleton = section?.singleton ?? false;
  const hasSlug = !singleton && kind !== 'static-blocks';

  const [record, setRecord] = useState<RecordView | null>(null);
  const [etag, setEtag] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initial, setInitial] = useState<FormState>(() => toForm(fields, {}));
  const [form, setForm] = useState<FormState>(initial);
  const [slug, setSlug] = useState('');
  const [blockKey, setBlockKey] = useState('');
  const [blockOptions, setBlockOptions] = useState<Option[]>([]);
  const [contacts, setContacts] = useState<Option[]>([]);
  const [tab, setTab] = useState<Tab>('uk');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const focusAfterRender = useRef<string | null>(null);

  const accept = (r: RecordView) => {
    setRecord(r);
    const state = toForm(fields, r.data);
    setInitial(state);
    setForm(state);
    setSlug(typeof r.data['slug'] === 'string' ? r.data['slug'] : '');
  };

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    const tasks: Promise<unknown>[] = [];
    if (!isNew) {
      tasks.push(
        api.get(kind, id, { onSlow }).then((r) => {
          if (!alive) return;
          accept(r.data);
          setEtag(r.etag);
        }),
      );
    }
    if (fields.some((f) => f.type === 'contact')) {
      tasks.push(
        api.list('contacts', false, { onSlow }).then((r) => {
          if (!alive) return;
          setContacts(
            r.items.map((c) => ({
              value: String(c.data['slug']),
              label: titleOf('contacts', c.data),
            })),
          );
        }),
      );
    }
    if (isNew && kind === 'static-blocks') {
      tasks.push(
        api.list('static-blocks', false, { onSlow }).then((r) => {
          if (!alive) return;
          setBlockOptions(freeBlockKeys(r.items.map((x) => String(x.data['blockKey']))));
        }),
      );
    }
    Promise.all(tasks)
      .then(() => alive && setLoaded(true))
      .catch((err: unknown) => alive && setLoadError(failure(err)));
    return () => {
      alive = false;
    };
    // `accept` зависит только от `fields`, который уже в списке.
  }, [kind, id, isNew, fields, onSlow, failure, attempt]);

  const originalSlug = typeof record?.data['slug'] === 'string' ? record.data['slug'] : '';
  const dirty =
    isDirty(initial, form) ||
    (hasSlug && isOwner && !isNew && slug !== originalSlug) ||
    (isNew && blockKey !== '');

  useEffect(() => {
    setDirty(dirty);
  }, [dirty]);
  useEffect(() => () => setDirty(false), []);

  useEffect(() => {
    const key = focusAfterRender.current;
    if (!key) return;
    focusAfterRender.current = null;
    const el =
      document.getElementById(fieldId(key, 'uk')) ??
      document.getElementById(fieldId(key)) ??
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    el?.focus();
  });

  if (!section) return null;

  const showErrors = (errs: FieldErrors) => {
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      setTab('uk');
      focusAfterRender.current = first;
    }
  };

  const serverErrors = (err: ApiRequestError): boolean => {
    const known = fieldKeys(fields, form);
    if (hasSlug) known.add('slug');
    if (kind === 'static-blocks') known.add('blockKey');
    const mapped: FieldErrors = {};
    const loose: string[] = [];
    for (const [k, msg] of Object.entries(err.failure.fields)) {
      const key = errorKeyFor(k, known);
      if (key) mapped[key] ??= msg;
      else loose.push(msg);
    }
    if (Object.keys(mapped).length === 0) return false;
    showErrors(mapped);
    setSaveError(loose.length ? `${err.message}: ${loose.join('; ')}` : err.message);
    return true;
  };

  const save = async (publish: boolean) => {
    if (busy) return;
    setSaveError(null);
    const { data, errors: local } = fromForm(fields, form);
    const owned = new Set(Object.keys(toForm(fields, {})).map((k) => k.split('.')[0]));
    const merged: Record<string, unknown> = Object.fromEntries(
      Object.entries(record?.data ?? {}).filter(
        ([k]) => !owned.has(k) && k !== 'confirmedAt' && k !== 'confirmedBy',
      ),
    );
    Object.assign(merged, data);
    const errs: FieldErrors = { ...local, ...crossCheck(kind, merged) };
    if (isNew && kind === 'static-blocks' && !blockKey)
      errs['blockKey'] = 'Виберіть, для якої сторінки текст';
    const slugChanged = hasSlug && isOwner && !isNew && slug !== originalSlug;
    if (slugChanged && !SLUG_RE.test(slug)) {
      errs['slug'] = 'Лише малі латинські літери, цифри й дефіс між ними';
    }
    if (Object.keys(errs).length > 0) {
      showErrors(errs);
      setSaveError('Перевірте позначені поля');
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      if (isNew) {
        const body = kind === 'static-blocks' ? { ...data, blockKey } : data;
        let res = await api.create(kind, body, { onSlow });
        if (publish) res = await api.setStatus(kind, res.item.id, 'published', { onSlow });
        setPending(res.pendingChanges);
        setDirty(false);
        navigate({ page: 'edit', kind, id: res.item.id }, { replace: true, force: true });
        notify({
          text: publish ? 'Збережено й позначено до публікації.' : 'Збережено як чернетку.',
        });
        return;
      }
      const patch = buildPatch(fields, record?.data ?? {}, data);
      if (slugChanged) patch['slug'] = slug;
      let current = record;
      let pending: number | null = null;
      if (Object.keys(patch).length > 0) {
        let res;
        try {
          res = await api.patch(kind, id, patch, { onSlow, etag });
        } catch (err) {
          const slugConfirm =
            err instanceof ApiRequestError &&
            err.failure.code === 'CONFLICT' &&
            err.failure.fields['slug'];
          if (!slugConfirm) throw err;
          if (!window.confirm(`${err.message}. Змінити адресу?`)) {
            setBusy(false);
            return;
          }
          res = await api.patch(kind, id, patch, { onSlow, etag, confirmSlugChange: true });
        }
        current = res.data.item;
        pending = res.data.pendingChanges;
        setEtag(res.etag);
      }
      if (publish && current && current.status !== 'published' && !singleton) {
        const res = await api.setStatus(kind, current.id, 'published', { onSlow });
        current = res.item;
        pending = res.pendingChanges;
        // Статус меняет `updatedAt`: метка версии берётся заново при следующей правке.
        setEtag(`"${current.updatedAt}"`);
      }
      if (current) accept(current);
      if (pending !== null) setPending(pending);
      notify({
        text:
          pending === null && !publish
            ? 'Змін немає — зберігати нічого.'
            : publish
              ? 'Збережено. Зміни з’являться на сайті після публікації.'
              : 'Збережено.',
      });
    } catch (err) {
      if (
        err instanceof ApiRequestError &&
        err.failure.code === 'VALIDATION_FAILED' &&
        serverErrors(err)
      ) {
        return;
      }
      setSaveError(failure(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!record || busy) return;
    const title = titleOf(kind, record.data) || 'запис';
    if (
      !window.confirm(`Видалити «${title}»? Запис перейде в «Кошик», звідти його можна відновити.`)
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await api.remove(kind, record.id, { onSlow });
      setPending(res.pendingChanges);
      setDirty(false);
      navigate({ page: 'list', kind }, { force: true });
      notify({
        text: `«${title}» переміщено в кошик.`,
        undo: {
          label: 'Скасувати',
          run: () => {
            void api
              .restore(kind, record.id, { onSlow })
              .then((r) => {
                setPending(r.pendingChanges);
                navigate({ page: 'edit', kind, id: record.id }, { force: true });
                notify({ text: `«${title}» відновлено.` });
              })
              .catch((err: unknown) => notify({ text: failure(err) }));
          },
        },
      });
    } catch (err) {
      setSaveError(failure(err));
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next: Tab = tab === 'uk' ? 'en' : 'uk';
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  const title = isNew
    ? section.addLabel
    : record
      ? titleOf(kind, record.data) || section.label
      : section.label;
  const anyLang = fields.some(hasLang);

  return (
    <>
      <p className="crumbs">
        {singleton ? (
          section.label
        ) : (
          <a
            href={`/admin/${kind}`}
            onClick={(e) => {
              e.preventDefault();
              navigate({ page: 'list', kind });
            }}
          >
            ← {section.label}
          </a>
        )}
      </p>
      <h1>{title}</h1>
      {record && !singleton && (
        <p className="row__meta">
          <StatusBadge status={record.status} /> Змінено {formatDateTime(record.updatedAt)}
        </p>
      )}
      {singleton && <p className="lead">{section.where}</p>}

      {loadError && <ErrorBox text={loadError} onRetry={() => setAttempt((a) => a + 1)} />}
      {!loaded && !loadError && <p>Завантажуємо…</p>}

      {loaded && (
        <form ref={formRef} className="form" onSubmit={submit} noValidate>
          {saveError && <ErrorBox text={saveError} />}

          {isNew && kind === 'static-blocks' && (
            <div className="field">
              <label className="field__label" htmlFor={fieldId('blockKey')}>
                Сторінка <span aria-hidden="true">*</span>
              </label>
              <select
                id={fieldId('blockKey')}
                value={blockKey}
                onChange={(e) => setBlockKey(e.target.value)}
                aria-invalid={errors['blockKey'] ? true : undefined}
                aria-describedby={errors['blockKey'] ? `${fieldId('blockKey')}-err` : undefined}
              >
                <option value="">Виберіть…</option>
                {blockOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {errors['blockKey'] && (
                <p className="field__error" id={`${fieldId('blockKey')}-err`}>
                  {errors['blockKey']}
                </p>
              )}
            </div>
          )}

          {anyLang && (
            <div className="tabs" role="tablist" aria-label="Мова тексту">
              {(['uk', 'en'] as const).map((t) => (
                <button
                  key={t}
                  id={`tab-${t}`}
                  type="button"
                  role="tab"
                  className="tabs__tab"
                  aria-selected={tab === t}
                  aria-controls="form-panel"
                  tabIndex={tab === t ? 0 : -1}
                  onClick={() => setTab(t)}
                  onKeyDown={onTabKey}
                >
                  {t === 'uk' ? 'Українська' : 'English (необов’язково)'}
                </button>
              ))}
            </div>
          )}

          <div
            id="form-panel"
            role={anyLang ? 'tabpanel' : undefined}
            aria-labelledby={anyLang ? `tab-${tab}` : undefined}
          >
            {tab === 'en' && (
              <p className="field__hint">
                Англійський текст необов’язковий: без нього запис зберігається, а англійська версія
                сайту з’явиться пізніше.
              </p>
            )}
            {fields.map((f) => (
              <FieldView
                key={f.name}
                field={f}
                fieldKey={f.name}
                value={form[f.name]}
                onChange={(v) => setForm((s) => ({ ...s, [f.name]: v }))}
                errors={errors}
                tab={tab}
                contacts={contacts}
              />
            ))}

            {tab === 'uk' && hasSlug && isOwner && !isNew && (
              <details className="field service" open={Boolean(errors['slug'])}>
                <summary>Службове: адреса запису</summary>
                <label className="field__label" htmlFor={fieldId('slug')}>
                  Адреса запису
                </label>
                <input
                  id={fieldId('slug')}
                  value={slug}
                  maxLength={80}
                  spellCheck={false}
                  onChange={(e) => setSlug(e.target.value.trim())}
                  aria-invalid={errors['slug'] ? true : undefined}
                  aria-describedby={`${fieldId('slug')}-hint${errors['slug'] ? ` ${fieldId('slug')}-err` : ''}`}
                />
                <p className="field__hint" id={`${fieldId('slug')}-hint`}>
                  Латиниця, цифри й дефіс. Складається з назви автоматично. Зміна після публікації
                  ламає старі посилання.
                </p>
                {errors['slug'] && (
                  <p className="field__error" id={`${fieldId('slug')}-err`}>
                    {errors['slug']}
                  </p>
                )}
              </details>
            )}
          </div>

          <div className="actions">
            <button type="submit" className="btn btn--inline" disabled={busy}>
              {busy ? 'Зберігаємо…' : 'Зберегти'}
            </button>
            {!singleton && (
              <button
                type="button"
                className="btn btn--ghost btn--inline"
                disabled={busy}
                onClick={() => void save(true)}
              >
                Зберегти й опублікувати
              </button>
            )}
            <button
              type="button"
              className="btn btn--quiet btn--inline"
              onClick={() => navigate(singleton ? { page: 'home' } : { page: 'list', kind })}
            >
              Скасувати
            </button>
            <span className="actions__state" role="status" aria-live="polite">
              {dirty ? 'Не збережено' : ''}
            </span>
          </div>

          {!isNew && !singleton && record && (
            <div className="danger">
              <button
                type="button"
                className="btn btn--quiet btn--inline btn--danger"
                disabled={busy}
                onClick={() => void remove()}
              >
                Видалити в кошик
              </button>
            </div>
          )}
        </form>
      )}
    </>
  );
}
