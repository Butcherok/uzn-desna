/** Первая страница после входа: разделы с пояснением, что где на сайте. */
import { sectionsFor } from '../domain/kinds';
import { linkProps } from '../gateway/router';
import { useAdmin } from './context';

export function HomePage() {
  const { user } = useAdmin();
  return (
    <>
      <h1>Вітаємо, {user.displayName}</h1>
      <p className="lead">
        Виберіть, що змінити. Зміни зберігаються одразу, а на сайті з’являються після публікації.
      </p>
      <ul className="cards">
        {sectionsFor(user.role).map((s) => (
          <li key={s.kind} className="card">
            <a className="card__link" {...linkProps({ page: 'list', kind: s.kind })}>
              {s.label}
            </a>
            <p className="card__text">{s.where}</p>
          </li>
        ))}
        <li className="card">
          <a className="card__link" {...linkProps({ page: 'help' })}>
            Допомога
          </a>
          <p className="card__text">
            Короткі інструкції: як виправити телефон, додати вакансію тощо.
          </p>
        </li>
      </ul>
    </>
  );
}
