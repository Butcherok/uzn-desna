import {
  contactSchema,
  enterpriseSchema,
  feedRulesSchema,
  leaderSchema,
  publicDocSchema,
  serviceSchema,
  staticBlockSchema,
  vacancySchema,
} from '@uzn/shared';
import type { z } from 'zod';
import type { ContentKind } from './model.js';

/**
 * Реестр редактируемых сущностей (ТЗ 6.2, 8.3; решение 038). Маршруты и
 * правила строятся по нему: новая сущность версии 3 — строка здесь и схема в
 * `shared/`.
 */
export interface KindDef {
  kind: ContentKind;
  /** Подпись в сообщениях об ошибках — по-украински, как в меню админки (ТЗ 9.3). */
  label: string;
  /** Та же схема, что проверяет `data/*.json` при сборке (ТЗ 6.1, п. 8). */
  schema: z.ZodType<Record<string, unknown>>;
  /**
   * Откуда берётся ключ записи: `slug` (с поля `titleField`), `blockKey` из
   * закрытого перечня или `singleton`.
   */
  key: 'slug' | 'blockKey' | 'singleton';
  /** Языковое поле, из украинского текста которого строится `slug`. */
  titleField?: string;
  /** Есть ли `order` и `PATCH /order` (ТЗ 6.1, п. 6). */
  ordered: boolean;
  /** Правит только владелец (ТЗ 9.1: `FeedRule`). */
  ownerOnly: boolean;
  /** Поля, которые меняет только владелец (ТЗ 9.1: отметка подтверждения `Leader`). */
  ownerOnlyFields: readonly string[];
  /** Есть ли ссылка `contactId` на `Contact.slug` (ТЗ 6.2, решение 2). */
  refersToContact: boolean;
  /**
   * `status` — поле самих данных (решение 026): у `Vacancy` его пишет сервер
   * вместе со статусом записи, а `publishedAt` — при первой публикации.
   */
  statusInData: boolean;
}

const list = (
  d: Pick<KindDef, 'kind' | 'label' | 'schema' | 'titleField'> & Partial<KindDef>,
): KindDef => ({
  key: 'slug',
  ordered: true,
  ownerOnly: false,
  ownerOnlyFields: [],
  refersToContact: false,
  statusInData: false,
  ...d,
});

const asRecord = <S extends z.ZodType>(s: S): z.ZodType<Record<string, unknown>> =>
  s as unknown as z.ZodType<Record<string, unknown>>;

export const KINDS: readonly KindDef[] = [
  list({
    kind: 'contacts',
    label: 'Контакти',
    schema: asRecord(contactSchema),
    titleField: 'purpose',
  }),
  list({
    kind: 'leaders',
    label: 'Керівництво',
    schema: asRecord(leaderSchema),
    titleField: 'fullName',
    ownerOnlyFields: ['confirmedAt', 'confirmedBy'],
  }),
  list({
    kind: 'services',
    label: 'Послуги',
    schema: asRecord(serviceSchema),
    titleField: 'title',
    refersToContact: true,
  }),
  list({
    kind: 'vacancies',
    label: 'Вакансії',
    schema: asRecord(vacancySchema),
    titleField: 'position',
    refersToContact: true,
    statusInData: true,
  }),
  list({
    kind: 'public-docs',
    label: 'Публічна інформація',
    schema: asRecord(publicDocSchema),
    titleField: 'title',
  }),
  list({
    kind: 'static-blocks',
    label: 'Тексти сторінок',
    schema: asRecord(staticBlockSchema),
    key: 'blockKey',
    ordered: false,
  }),
  {
    kind: 'enterprise',
    label: 'Підприємство',
    schema: asRecord(enterpriseSchema),
    key: 'singleton',
    ordered: false,
    ownerOnly: false,
    ownerOnlyFields: [],
    refersToContact: false,
    statusInData: false,
  },
  {
    kind: 'feed-rules',
    label: 'Словник стрічки',
    schema: asRecord(feedRulesSchema),
    key: 'singleton',
    ordered: false,
    ownerOnly: true,
    ownerOnlyFields: [],
    refersToContact: false,
    statusInData: false,
  },
];

export const SINGLETON_KEY = 'singleton';

export function kindDef(kind: ContentKind): KindDef {
  const d = KINDS.find((k) => k.kind === kind);
  if (!d) throw new Error(`unknown content kind: ${kind}`);
  return d;
}
