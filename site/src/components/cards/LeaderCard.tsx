/**
 * Карточка руководителя на странице «Про підприємство» (ТЗ 4.2). Биография
 * раскрывается элементом `details`, без JavaScript (ТЗ 11.7, п. 4).
 *
 * Фото приходит готовыми адресами: сайт передаёт WebP, нарезанные сборкой
 * (ТЗ 5.3), админка — загруженный файл (решение 046).
 */
import { formatDate } from '@uzn/shared';
import { paragraphs } from '../../domain/text';

export interface LeaderPhoto {
  src: string;
  srcSet?: string | undefined;
  alt: string;
}

export interface LeaderCardProps {
  fullName: string;
  position: string;
  /** Дата `ГГГГ-ММ-ДД`: «на посаді з …». */
  since?: string | undefined;
  bio?: string | undefined;
  photo?: LeaderPhoto | undefined;
  /** Биография открыта сразу — в предпросмотре админки. */
  bioOpen?: boolean;
}

export function LeaderCard({ fullName, position, since, bio, photo, bioOpen }: LeaderCardProps) {
  return (
    <article className="card leader">
      <div className="leader__head">
        {photo && (
          <img
            src={photo.src}
            srcSet={photo.srcSet}
            alt={photo.alt}
            loading="lazy"
            decoding="async"
            width="88"
            height="88"
            className="leader__photo"
          />
        )}
        <div>
          <h3 className="leader__name">{fullName}</h3>
          <p className="leader__post">
            {position}
            {since && <> · на посаді з {formatDate(since)}</>}
          </p>
        </div>
      </div>

      {bio && (
        <details className="leader__bio" open={bioOpen || undefined}>
          <summary>Біографія</summary>
          {paragraphs(bio).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </details>
      )}
    </article>
  );
}
