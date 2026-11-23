/** Карточка послуги на странице «Послуги» (ТЗ 4.4). */
export interface ServiceCardProps {
  title: string;
  summary: string;
}

export function ServiceCard({ title, summary }: ServiceCardProps) {
  return (
    <article className="card">
      <h3 className="card__title">{title}</h3>
      <p className="card__text mt-2">{summary}</p>
    </article>
  );
}
