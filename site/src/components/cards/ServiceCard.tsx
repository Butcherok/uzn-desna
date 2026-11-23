import { RichText } from './RichText';

/** Карточка послуги на странице «Послуги» (ТЗ 4.4). */
export interface ServiceCardProps {
  title: string;
  summary: string;
}

export function ServiceCard({ title, summary }: ServiceCardProps) {
  return (
    <article className="card">
      <h3 className="card__title">{title}</h3>
      <RichText text={summary} className="card__text mt-2" />
    </article>
  );
}
