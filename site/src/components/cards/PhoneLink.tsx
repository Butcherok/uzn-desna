/**
 * Ссылка-телефон — главный элемент сайта (ТЗ 2.1, дизайн-система 1.0, раздел 7).
 * Цель на всю ширину, подпись-часы — `.tel__hint`. Выводит переданные данные,
 * ввода-вывода не делает (ТЗ 10.2).
 */
import { formatPhone } from '@uzn/shared';

export interface PhoneLinkProps {
  /** Телефон в виде хранения +380XXXXXXXXX */
  phone: string;
  /** Часы ответа или другая подпись под номером */
  hint?: string | undefined;
}

export function PhoneLink({ phone, hint }: PhoneLinkProps) {
  return (
    <a className="tel" href={`tel:${phone}`}>
      <svg
        className="ico"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v4a16 16 0 0 1-16-16Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        ></path>
      </svg>
      <span>
        <span className="tel__num">{formatPhone(phone)}</span>
        {hint && <span className="tel__hint">{hint}</span>}
      </span>
    </a>
  );
}
