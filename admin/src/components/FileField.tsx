/**
 * Поле файла (ТЗ 8.4, 9.4; решение 042): фото руководителя или документ
 * «Публічної інформації». Файл отправляется сразу после выбора, в поле
 * записывается путь, который дал сервер; запись сохраняется обычной кнопкой.
 * У новой записи имя файла строится из названия; пока названия нет, поле
 * просит его заполнить.
 */
import { useId, useState } from 'react';
import {
  ACCEPT_ATTR,
  ACCEPT_HINT,
  maxBytesOf,
  tooLargeMessage,
  type UploadClass,
} from '@uzn/shared';

/** Связь поля с сервером: передаётся страницей (компонент не знает про API). */
export interface FileApi {
  /** Отправляет файл, отдаёт путь от сервера. Ошибка — с текстом для показа. */
  upload: (entity: string, slug: string, file: File) => Promise<string>;
  url: (path: string) => string;
}

interface Props {
  id: string;
  label: string;
  hint: string;
  entity: string;
  accept: UploadClass;
  /** `slug` для имени файла; `null` — у записи ещё нет названия. */
  slug: string | null;
  value: string;
  error: string | undefined;
  onChange: (path: string) => void;
  api: FileApi;
}

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

export function FileField(p: Props) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [broken, setBroken] = useState<string | null>(null);
  const statusId = useId();
  const error = localError ?? p.error;
  const isImage = p.accept === 'image';
  const hintId = `${p.id}-hint`;
  const errId = `${p.id}-err`;

  const choose = async (file: File | undefined) => {
    if (!file || !p.slug) return;
    setLocalError(null);
    if (file.size > maxBytesOf(p.accept)) {
      setLocalError(tooLargeMessage(p.accept));
      return;
    }
    setBusy(true);
    try {
      const path = await p.api.upload(p.entity, p.slug, file);
      setBroken(null);
      p.onChange(path);
    } catch (err) {
      setLocalError(
        err instanceof Error && err.message ? err.message : 'Не вдалося завантажити файл',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <p className="field__label" id={`${p.id}-label`}>
        {p.label}
      </p>
      <p className="field__hint" id={hintId}>
        {p.hint} {ACCEPT_HINT[p.accept]}.
      </p>

      {p.value && isImage && broken !== p.value && (
        <img
          className="file__preview"
          src={p.api.url(p.value)}
          alt=""
          width={88}
          height={88}
          onError={() => setBroken(p.value)}
        />
      )}
      {p.value && (
        <p className="file__name">
          {isImage ? (
            fileName(p.value)
          ) : (
            <a href={p.api.url(p.value)} target="_blank" rel="noopener noreferrer">
              {fileName(p.value)}
            </a>
          )}
        </p>
      )}

      {p.slug === null ? (
        <p className="field__hint">Спочатку заповніть назву, потім додайте файл.</p>
      ) : (
        <div className="file__actions">
          <label className="btn btn--ghost btn--inline file__pick">
            {p.value ? 'Замінити файл' : 'Вибрати файл'}
            <input
              id={p.id}
              type="file"
              className="visually-hidden"
              accept={ACCEPT_ATTR[p.accept]}
              disabled={busy}
              aria-labelledby={`${p.id}-label`}
              aria-describedby={[hintId, error ? errId : ''].filter(Boolean).join(' ')}
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                const input = e.currentTarget;
                void choose(input.files?.[0]).finally(() => {
                  input.value = '';
                });
              }}
            />
          </label>
          {p.value && (
            <button
              type="button"
              className="btn btn--quiet btn--inline"
              disabled={busy}
              onClick={() => {
                setLocalError(null);
                p.onChange('');
              }}
            >
              Прибрати файл
            </button>
          )}
        </div>
      )}
      <p className="visually-hidden" role="status" id={statusId}>
        {busy ? 'Завантажуємо файл…' : ''}
      </p>
      {busy && <p className="field__hint">Завантажуємо файл…</p>}
      {error && (
        <p className="field__error" id={errId}>
          {error}
        </p>
      )}
    </div>
  );
}
