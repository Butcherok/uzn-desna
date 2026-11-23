/**
 * Карточка вакансии (ТЗ 4.10): должность, подразделение, требования,
 * телефон. Формы отклика нет. Пункт списка — страница выводит карточки
 * перечнем `ul`.
 */
import { PhoneInline } from './PhoneInline';
import { RichText } from './RichText';

export interface VacancyCardProps {
  position: string;
  unit?: string | undefined;
  requirements: string;
  phone: string;
}

export function VacancyCard({ position, unit, requirements, phone }: VacancyCardProps) {
  return (
    <li className="card">
      <h3 className="card__title">{position}</h3>
      {unit && (
        <p className="card__text">
          <span className="tag">{unit}</span>
        </p>
      )}
      <RichText text={requirements} className="card__text" />
      <p className="card__text">
        Телефон: <PhoneInline phone={phone} />
      </p>
    </li>
  );
}
