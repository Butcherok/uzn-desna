/**
 * Карточка документа в блоках «Документи підприємства» и «Закупівлі та
 * договори» (ТЗ 4.3): название-ссылка и метка места публикации.
 */
import { DocLink, type DocTarget } from './DocLink';

export interface DocCardProps {
  title: string;
  target: DocTarget;
  /** Короткая метка места публикации (`PLACE_TAGS`). */
  place: string;
}

export function DocCard({ title, target, place }: DocCardProps) {
  return (
    <li className="card">
      <h3 className="card__title">
        <DocLink label={title} target={target} />
      </h3>
      <p className="card__text">
        <span className="tag">{place}</span>
      </p>
    </li>
  );
}
