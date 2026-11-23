/**
 * Ссылка на документ «Публічної інформації» (ТЗ 4.3). Внешний адрес
 * открывается в новой вкладке со значком выхода; файл на этом сайте
 * (`own`, решение 042) — обычной ссылкой с типом файла и датой обновления.
 */
import { formatDate } from '@uzn/shared';

export type DocTarget =
  | { kind: 'file'; href: string; fileKind: 'PDF' | 'Word'; updatedAt?: string | undefined }
  | { kind: 'external'; href: string | undefined };

export interface DocLinkProps {
  label: string;
  target: DocTarget;
}

export function DocLink({ label, target }: DocLinkProps) {
  if (target.kind === 'file') {
    return (
      <>
        <a href={target.href} type={target.fileKind === 'PDF' ? 'application/pdf' : undefined}>
          {label}
        </a>{' '}
        <span>
          ({target.fileKind}
          {target.updatedAt && <>, оновлено {formatDate(target.updatedAt)}</>})
        </span>
      </>
    );
  }
  return (
    <a className="ext" href={target.href} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}
