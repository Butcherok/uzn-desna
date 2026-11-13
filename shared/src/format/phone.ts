import { z } from 'zod';

/**
 * Телефон хранится как +380XXXXXXXXX (ТЗ 6.1, п. 8),
 * выводится как +38 (0XX) XXX-XX-XX (ТЗ 5.1, п. 6).
 */
export const storedPhoneSchema = z.string().regex(/^\+380\d{9}$/u, 'Очікується +380XXXXXXXXX');

export function parseStoredPhone(input: string): string {
  const digits = input.replace(/\D+/gu, '');
  const normalized = digits.startsWith('380')
    ? `+${digits}`
    : digits.startsWith('80')
      ? `+3${digits}`
      : digits.startsWith('0')
        ? `+38${digits}`
        : `+${digits}`;

  return storedPhoneSchema.parse(normalized);
}

export function formatPhone(stored: string): string {
  const value = storedPhoneSchema.parse(stored);
  const area = value.slice(3, 6);
  const first = value.slice(6, 9);
  const second = value.slice(9, 11);
  const third = value.slice(11, 13);

  return `+38 (${area}) ${first}-${second}-${third}`;
}
