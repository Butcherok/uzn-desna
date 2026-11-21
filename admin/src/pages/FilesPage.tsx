/**
 * «Файли» (ТЗ 8.4, п. 8; 9.1; решение 042): загруженные фото и документы,
 * где каждый используется и есть ли он уже на сайте. Удаляет только владелец
 * и только файл, который нигде не используется.
 */
import { useEffect, useState } from 'react';
import { ErrorBox } from '../components/Status';
import { formatDateTime, sectionOf } from '../domain/kinds';
import { api, uploadUrl, type UploadListItem } from '../gateway/admin-api';
import { linkProps } from '../gateway/router';
import { useAdmin } from './context';
import { useFailure } from './ListPage';

const STATE_LABEL: Record<UploadListItem['state'], string> = {
  pending: 'Ще не на сайті: з’явиться після «Опублікувати зміни»',
  published: 'На сайті',
  deleting: 'Видалено: зникне із сайту з наступною публікацією',
};

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

const sizeOf = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`;

export function FilesPage() {
  const { user, onSlow, notify } = useAdmin();
  const failure = useFailure();
  const [items, setItems] = useState<UploadListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    api
      .uploads({ onSlow })
      .then((r) => alive && setItems(r.items))
      .catch((err: unknown) => alive && setError(failure(err)));
    return () => {
      alive = false;
    };
  }, [onSlow, failure, attempt]);

  const remove = async (f: UploadListItem) => {
    if (busy) return;
    const name = fileName(f.path);
    if (!window.confirm(`Видалити файл «${name}»? Відновити його буде неможливо.`)) return;
    setBusy(true);
    setError(null);
    try {
      const { outcome } = await api.removeUpload(f.path, { onSlow });
      setItems(
        (list) =>
          list
            ?.map((x) => (x.path === f.path ? { ...x, state: 'deleting' as const } : x))
            .filter((x) => !(x.path === f.path && outcome === 'removed')) ?? null,
      );
      notify({
        text:
          outcome === 'removed'
            ? `Файл «${name}» видалено.`
            : `Файл «${name}» видалено. Із сайту він зникне з наступною публікацією.`,
      });
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Файли</h1>
      <p className="lead">
        Фото й документи, завантажені в картках. Файл додається в самій картці — полем «Фото» або
        «Файл документа».
      </p>
      {error && <ErrorBox text={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {items === null && !error && <p>Завантажуємо…</p>}
      {items?.length === 0 && <p>Завантажених файлів ще немає.</p>}
      <ul className="rows" aria-busy={busy}>
        {(items ?? []).map((f) => {
          const name = fileName(f.path);
          const unused = f.usedBy.length === 0;
          return (
            <li key={f.path} className="row">
              <div className="file-row">
                {f.width !== null && (
                  <img
                    className="row__thumb"
                    src={uploadUrl(f.path)}
                    alt=""
                    width={56}
                    height={56}
                    loading="lazy"
                  />
                )}
                <div className="row__main">
                  <p className="row__title">
                    <a href={uploadUrl(f.path)} target="_blank" rel="noopener noreferrer">
                      {name}
                    </a>
                  </p>
                  <p className="row__meta">
                    {sizeOf(f.bytes)}
                    {f.width !== null && ` · ${f.width}×${f.height}`} · {f.uploadedBy},{' '}
                    {formatDateTime(f.uploadedAt)}
                  </p>
                  <p className="row__meta">{STATE_LABEL[f.state]}</p>
                  <p className="row__meta">
                    {unused ? (
                      'Ніде не використовується'
                    ) : (
                      <>
                        Використовується:{' '}
                        {f.usedBy.map((u, i) => {
                          const section = sectionOf(u.kind);
                          return (
                            <span key={u.id}>
                              {i > 0 && ', '}
                              {section ? (
                                <a {...linkProps({ page: 'edit', kind: section.kind, id: u.id })}>
                                  {u.title}
                                </a>
                              ) : (
                                u.title
                              )}
                              {u.inTrash && ' (у кошику)'}
                            </span>
                          );
                        })}
                      </>
                    )}
                  </p>
                </div>
              </div>
              {user.role === 'owner' && unused && f.state !== 'deleting' && (
                <div className="row__actions">
                  <button
                    type="button"
                    className="btn btn--quiet btn--inline btn--danger"
                    disabled={busy}
                    onClick={() => void remove(f)}
                  >
                    Видалити<span className="visually-hidden">: {name}</span>
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
