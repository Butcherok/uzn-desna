import { z } from 'zod';
import { richTextProblems } from '../format/rich-text.js';

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

/**
 * Языковое поле с разметкой (ТЗ 9.8, п. 1 и 2; решение 047): к `langText`
 * добавлена проверка ссылок. Тексты отказа — для формы, по-украински; сервер
 * отдаёт их как есть по признаку `params.ui`.
 */
export function richLangText(max: number) {
  return langText(max).superRefine((value, ctx) => {
    for (const lang of ['uk', 'en'] as const) {
      const text = value[lang];
      if (!text) continue;
      const [first] = richTextProblems(text);
      if (first) {
        ctx.addIssue({
          code: 'custom',
          path: [lang],
          message: lang === 'en' ? `Англійською: ${first}` : first,
          params: { ui: true },
        });
      }
    }
  });
}
