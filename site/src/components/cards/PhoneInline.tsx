/**
 * Телефон ссылкой внутри строки текста: номер не разрывается переносом
 * (дизайн-система 1.1, раздел 7, `.tel-text`). Крупная цель полной ширины —
 * `PhoneLink` (ТЗ 11.1, п. 4).
 */
import { formatPhone } from '@uzn/shared';

export interface PhoneInlineProps {
  /** Телефон в виде хранения +380XXXXXXXXX */
  phone: string;
}

export function PhoneInline({ phone }: PhoneInlineProps) {
  return (
    <a className="tel-text" href={`tel:${phone}`}>
      {formatPhone(phone)}
    </a>
  );
}
