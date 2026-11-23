/**
 * Строка таблицы телефонов на странице «Контакти» (ТЗ 4.6): назначение
 * номера и ссылка-телефон с часами.
 */
import { PhoneLink } from './PhoneLink';

export interface ContactRowProps {
  purpose: string;
  phone: string;
  hours?: string | undefined;
}

export function ContactRow({ purpose, phone, hours }: ContactRowProps) {
  return (
    <tr>
      <th scope="row">{purpose}</th>
      <td>
        <PhoneLink phone={phone} hint={hours} />
      </td>
    </tr>
  );
}
