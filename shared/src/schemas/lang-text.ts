import { z } from 'zod';

/**
 * Языковое поле (ТЗ 6.1, п. 4): `uk` обязательно, `en` допускает
 * отсутствие или пустую строку — это одно и то же состояние «перевода нет».
 */
export function langText(max: number) {
  return z.object({
    uk: z.string().min(1).max(max),
    en: z.string().max(max).optional(),
  });
}

export type LangText = z.infer<ReturnType<typeof langText>>;
