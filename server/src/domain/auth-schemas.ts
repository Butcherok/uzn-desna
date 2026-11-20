import { z } from 'zod';

/** Логин: латиница в нижнем регистре, цифры, `.`, `_`, `-`; 3–32 знака (ТЗ 6.4). */
export const LOGIN_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

/**
 * Тело входа. Формат логина здесь не проверяется: неверный формат должен
 * давать то же «Невірний логін або пароль», что и неверный пароль (ТЗ 8.2, п. 3).
 * Верхние пределы длины — только чтобы не гонять bcrypt по мегабайтам.
 */
export const loginBodySchema = z.object({
  login: z.string().max(256),
  password: z.string().max(1024),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().max(1024),
  newPassword: z.string().max(1024),
});
