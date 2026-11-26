/**
 * Строка таблицы телефонов на странице «Контакти» (ТЗ 4.6): назначение
 * номера, ссылка-телефон с часами и под ней — роль номера, если она задана
 * (решение 052). Роль стоит вне ссылки: это пояснение, а не часть номера.
 */
import { textLines } from '@uzn/shared';
import { PhoneLink } from './PhoneLink';

export interface ContactRowProps {
  purpose: string;
  phone: string;
  hours?: string | undefined;
  /** Что делает этот номер; строка данных — абзац */
  role?: string | undefined;
}

export function ContactRow({ purpose, phone, hours, role }: ContactRowProps) {
  return (
    <tr>
      <th scope="row">{purpose}</th>
      <td>
        <PhoneLink phone={phone} hint={hours} />
        {textLines(role).map((line) => (
          <p className="contact__role" key={line}>
            {line}
          </p>
        ))}
      </td>
    </tr>
  );
}
