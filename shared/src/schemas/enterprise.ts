import { z } from 'zod';
import { envelopeSchema } from './envelope.js';

/**
 * Реквизиты предприятия — сущность `Enterprise` (ТЗ 6.2, 13.1), синглтон.
 *
 * Схема описывает те поля, значения которых подтверждены Заказчиком и уже
 * выводятся. Остальные поля ТЗ 13.1 (`legalForm`, `ownerBody`, `governedBy`,
 * `kved`, `legalBasis`, `infoReference`, `structure`, названия) приходят
 * задачей «Про підприємство» (ТЗ 4.2) расширением этой схемы: их значения
 * пока за заглушками 5–8 реестра 13.2, а выдумывать их нельзя
 * (инструкции проекта, п. 5). Так же поступили с `PublicDoc` (решение 007).
 *
 * `email` — поле ТЗ 13.1 версии 3.4: строка, не языковое, предел 120,
 * не обязательное. Нет адреса — блок почты на «Контактах» скрывается
 * (ТЗ 4.6). Поле не обязательное, поэтому версия конверта остаётся 1
 * (ТЗ 6.6, п. 3).
 */
export const enterpriseSchema = z.object({
  email: z.email().max(120).optional(),
});

export type Enterprise = z.infer<typeof enterpriseSchema>;

export const enterpriseFileSchema = envelopeSchema.extend({
  items: z.array(enterpriseSchema).length(1, 'Enterprise — синглтон: ровно одна запись'),
});
