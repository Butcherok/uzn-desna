/**
 * Сообщения админки: ожидание пробуждения (ТЗ 8.7, п. 2), итог действия с
 * отменой (ТЗ 9.4, п. 3) и ошибка действием (ТЗ 9.4, п. 2).
 */
import { WAKING_UP } from '../domain/retry';

export function WakeNotice({ show }: { show: boolean }) {
  // Область живая всегда: экранный диктор объявит текст, когда он появится.
  return (
    <div className="wake" role="status" aria-live="polite">
      {show && (
        <p className="wake__text">
          <span className="spinner" aria-hidden="true" />
          {WAKING_UP}
        </p>
      )}
    </div>
  );
}

export function ErrorBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="alert" role="alert">
      <p>{text}</p>
      {onRetry && (
        <button type="button" className="btn btn--ghost btn--inline" onClick={onRetry}>
          Спробувати ще раз
        </button>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  return (
    <span className={`badge badge--${status}`}>
      {status === 'published' ? 'Опубліковано' : 'Чернетка'}
    </span>
  );
}
