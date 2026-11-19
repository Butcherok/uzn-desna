/**
 * Шаг Prozorro (ТЗ 7.3): поиск портала по ЄДРПОУ, 20 последних закупок.
 *
 * Адрес не документирован (отчёт 05, раздел 1, п. 3), поэтому разбор строгий:
 * любое расхождение с ожидаемой формой — `SRC_PARSE`, а не тихий пустой блок.
 * Планы и договоры не запрашиваются (ТЗ 7.3, п. 6).
 */
import { TENDER_ID, tenderSchema } from '@uzn/shared';
import type { Tender } from '@uzn/shared';
import { z } from 'zod';
import { SourceError, defaultDeps, fetchText } from './http.js';
import type { FetchDeps } from './http.js';

export const EDRPOU = '04589645';
export const SEARCH_URL = `https://prozorro.gov.ua/api/search/tenders?buyer%5B0%5D=${EDRPOU}`;
export const TENDERS_KEPT = 20;

const searchItemSchema = z.object({
  tenderID: z.string(),
  title: z.string(),
  status: z.string(),
  value: z
    .object({
      amount: z.number().nullish(),
      currency: z.string().nullish(),
      valueAddedTaxIncluded: z.boolean().nullish(),
    })
    .nullish(),
  tenderPeriod: z.object({ endDate: z.string().nullish() }).nullish(),
});

const searchResponseSchema = z.object({ data: z.array(searchItemSchema) });

/** Дата публикации из номера `UA-ГГГГ-ММ-ДД-…` (ТЗ 7.3, п. 2). */
export function dateFromTenderId(tenderID: string): string {
  const match = TENDER_ID.exec(tenderID);
  if (match === null) throw new SourceError('SRC_PARSE', `unexpected tenderID format`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function parseSearch(body: string): Tender[] {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new SourceError('SRC_PARSE', 'body is not JSON');
  }

  const parsed = searchResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new SourceError(
      'SRC_PARSE',
      `unexpected shape at ${parsed.error.issues[0]?.path.join('.')}`,
    );
  }

  return parsed.data.data.slice(0, TENDERS_KEPT).map((item) => {
    const tender: Tender = {
      tenderID: item.tenderID,
      title: item.title.trim(),
      status: item.status,
      amount: item.value?.amount ?? null,
      currency: item.value?.currency ?? null,
      vatIncluded: item.value?.valueAddedTaxIncluded ?? null,
      datePublished: dateFromTenderId(item.tenderID),
      tenderEndDate: item.tenderPeriod?.endDate ?? null,
      url: `https://prozorro.gov.ua/tender/${item.tenderID}`,
    };
    const checked = tenderSchema.safeParse(tender);
    if (!checked.success) {
      throw new SourceError('SRC_PARSE', `field ${checked.error.issues[0]?.path.join('.')}`);
    }
    return checked.data;
  });
}

/**
 * `url` подменяется только для проверки чек-листа 12.3 «прогон с намеренно
 * испорченным адресом» и только адресом того же портала.
 */
export function searchUrl(override: string | undefined): string {
  if (override === undefined || override === '') return SEARCH_URL;
  if (!override.startsWith('https://prozorro.gov.ua/')) {
    throw new Error('PROZORRO_SEARCH_URL: допускается только адрес https://prozorro.gov.ua/');
  }
  return override;
}

export async function fetchTenders(
  deps: FetchDeps = defaultDeps,
  url: string = SEARCH_URL,
): Promise<Tender[]> {
  // Тело пустое, GET отвечает 405 (отчёт 05, раздел 3).
  const body = await fetchText(
    'prozorro',
    url,
    { method: 'POST', headers: { accept: 'application/json' } },
    deps,
  );
  return parseSearch(body);
}
