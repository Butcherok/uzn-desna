import { describe, expect, it } from 'vitest';
import { formFields } from './forms';
import { toForm, type FormState } from './form-values';
import { hasPreview, previewOf, type ContactInfo, type PreviewContext } from './preview';
import type { Kind } from './kinds';

const HR: ContactInfo = {
  slug: 'viddil-kadriv',
  label: 'Відділ кадрів · +38 (044) 337-35-02',
  phone: '+380443373502',
  confirmed: true,
  published: true,
};

const ctx = (over: Partial<PreviewContext> = {}): PreviewContext => ({
  lang: 'uk',
  status: 'published',
  today: '2026-11-23',
  contacts: [HR],
  fileUrl: (p) => `/api/v1/uploads/${p}`,
  ...over,
});

const form = (kind: Kind, data: Record<string, unknown>): FormState =>
  toForm(formFields(kind, 'owner'), data);

const t = (uk: string, en = '') => ({ uk, en });

describe('previewOf', () => {
  it('лише п’ять розділів мають образець', () => {
    expect(
      ['services', 'leaders', 'vacancies', 'public-docs', 'contacts'].every((k) =>
        hasPreview(k as Kind),
      ),
    ).toBe(true);
    for (const k of ['scenarios', 'static-blocks', 'enterprise', 'feed-rules'] as Kind[]) {
      expect(hasPreview(k)).toBe(false);
      expect(previewOf(k, {}, ctx())).toBeNull();
    }
  });

  it('послуга: картка з даних форми, без зайвих приміток', () => {
    const r = previewOf(
      'services',
      form('services', { title: t('Кронування'), summary: t('Опис'), group: t('Дерева') }),
      ctx(),
    );
    expect(r).toEqual({
      card: { type: 'service', title: 'Кронування', summary: 'Опис' },
      prompt: null,
      hidden: [],
      info: ['На сторінці «Послуги» картка стоїть у групі «Дерева».'],
      offSite: false,
    });
  });

  it('порожня нова форма — підказка, що заповнити, і примітка про публікацію', () => {
    const r = previewOf('services', form('services', {}), ctx({ status: null }))!;
    expect(r.card).toBeNull();
    expect(r.prompt).toBe('Щоб побачити картку, заповніть: «Назва послуги», «Опис».');
    expect(r.hidden[0]).toMatch(/Новий запис з’явиться на сайті/u);
  });

  it('чернетка — причина вгорі', () => {
    const r = previewOf(
      'services',
      form('services', { title: t('А'), summary: t('Б') }),
      ctx({ status: 'draft' }),
    )!;
    expect(r.card).not.toBeNull();
    expect(r.hidden).toEqual([expect.stringMatching(/^Це чернетка/u)]);
    expect(r.offSite).toBe(true);
  });

  it('English: порожньо — окрема фраза; частково — що дописати', () => {
    const data = { title: t('Кронування'), summary: t('Опис') };
    const empty = previewOf('services', form('services', data), ctx({ lang: 'en' }))!;
    expect(empty.card).toBeNull();
    expect(empty.prompt).toMatch(/^Англійською ще не заповнено/u);
    const part = previewOf(
      'services',
      form('services', { title: t('Кронування', 'Crown reduction'), summary: t('Опис') }),
      ctx({ lang: 'en' }),
    )!;
    expect(part.prompt).toBe('Щоб побачити картку, заповніть англійською: «Опис».');
    const full = previewOf(
      'services',
      form('services', { title: t('К', 'Crown'), summary: t('О', 'Text') }),
      ctx({ lang: 'en' }),
    )!;
    expect(full.card).toEqual({ type: 'service', title: 'Crown', summary: 'Text' });
  });

  it('керівник: фото з адреси завантаження; без опису фото не показується', () => {
    const base = {
      fullName: t('Іваненко Іван'),
      position: t('Директор'),
      since: '2020-03-01',
      photoPath: 'media/leaders/i.jpg',
    };
    const withAlt = previewOf(
      'leaders',
      form('leaders', { ...base, photoAlt: t('Фотопортрет') }),
      ctx(),
    )!;
    expect(withAlt.card).toMatchObject({
      type: 'leader',
      since: '2020-03-01',
      photo: { src: '/api/v1/uploads/media/leaders/i.jpg', alt: 'Фотопортрет' },
    });
    const noAlt = previewOf('leaders', form('leaders', base), ctx())!;
    expect(noAlt.card).toMatchObject({ type: 'leader', photo: undefined });
    expect(noAlt.offSite).toBe(false);
    expect(noAlt.hidden[0]).toMatch(
      /^Фото на сайті не показується, доки не заповнено «Опис фото»/u,
    );
    // На закладці English без тексту — лише підказка, без зайвої примітки про фото.
    const en = previewOf('leaders', form('leaders', base), ctx({ lang: 'en' }))!;
    expect(en.card).toBeNull();
    expect(en.hidden).toEqual([]);
  });

  it('вакансія: телефон з контакту; минув строк — причина; строк попереду — коли зникне', () => {
    const base = {
      position: t('Озеленювач'),
      requirements: t('Досвід'),
      contactId: 'viddil-kadriv',
    };
    const ok = previewOf(
      'vacancies',
      form('vacancies', { ...base, validThrough: '2026-12-31' }),
      ctx(),
    )!;
    expect(ok.card).toMatchObject({ type: 'vacancy', phone: '+380443373502' });
    expect(ok.hidden).toEqual([]);
    expect(ok.info).toEqual(['Картка сама зникне з сайту 31.12.2026.']);
    const today = previewOf(
      'vacancies',
      form('vacancies', { ...base, validThrough: '2026-11-23' }),
      ctx(),
    )!;
    expect(ok.offSite).toBe(false);
    expect(today.offSite).toBe(true);
    expect(today.hidden[0]).toMatch(/минув строк «Показувати до» \(23\.11\.2026\)/u);
  });

  it('вакансія: номер не перевірено — причина; номер не вибрано — підказка', () => {
    const base = { position: t('Озеленювач'), requirements: t('Досвід') };
    const unchecked = previewOf(
      'vacancies',
      form('vacancies', { ...base, contactId: 'viddil-kadriv' }),
      ctx({ contacts: [{ ...HR, confirmed: false }] }),
    )!;
    expect(unchecked.hidden[0]).toMatch(/не позначено «Номер перевірено»/u);
    const none = previewOf('vacancies', form('vacancies', base), ctx())!;
    expect(none.card).toBeNull();
    expect(none.prompt).toBe('Щоб побачити картку, заповніть: «Куди телефонувати».');
  });

  it('документ: файл на сайті, зовнішнє посилання, поза блоками карток', () => {
    const own = previewOf(
      'public-docs',
      form('public-docs', {
        title: t('Статут'),
        publishedWhere: 'own',
        featured: true,
        filePath: 'media/public-docs/s.pdf',
        docUpdatedAt: '2026-11-01',
      }),
      ctx(),
    )!;
    expect(own.card).toEqual({
      type: 'doc',
      title: 'Статут',
      place: 'Цей сайт',
      target: {
        kind: 'file',
        href: '/api/v1/uploads/media/public-docs/s.pdf',
        fileKind: 'PDF',
        updatedAt: '2026-11-01',
      },
    });
    const ownNoFile = previewOf(
      'public-docs',
      form('public-docs', { title: t('Статут'), publishedWhere: 'own', featured: true }),
      ctx(),
    )!;
    expect(ownNoFile.prompt).toBe('Щоб побачити картку, заповніть: «Файл документа».');
    const prozorro = previewOf(
      'public-docs',
      form('public-docs', {
        title: t('Закупівлі'),
        publishedWhere: 'prozorro',
        externalUrl: 'https://prozorro.gov.ua/',
      }),
      ctx(),
    )!;
    expect(prozorro.hidden).toEqual([]);
    expect(prozorro.info[0]).toMatch(/«Закупівлі та договори»/u);
    const tableOnly = previewOf(
      'public-docs',
      form('public-docs', {
        title: t('Звіт'),
        publishedWhere: 'parent',
        externalUrl: 'https://x.ua/',
        normRef: t('п. 1'),
      }),
      ctx(),
    )!;
    expect(tableOnly.offSite).toBe(true);
    expect(tableOnly.hidden[0]).toMatch(
      /не позначено «У блоці документів»\. Документ видно лише рядком/u,
    );
  });

  it('контакт: телефон у будь-якому вигляді; недонабраний — підказка; не перевірено — причина', () => {
    const ok = previewOf(
      'contacts',
      {
        ...form('contacts', { purpose: t('Приймальня'), confirmed: true, showInFooter: true }),
        phone: '(044) 337 35 01',
      },
      ctx(),
    )!;
    expect(ok.card).toEqual({
      type: 'contact',
      purpose: 'Приймальня',
      phone: '+380443373501',
      hours: undefined,
    });
    expect(ok.info[0]).toMatch(/у підвалі/u);
    const partial = previewOf(
      'contacts',
      { ...form('contacts', { purpose: t('Приймальня') }), phone: '044 33' },
      ctx(),
    )!;
    expect(partial.prompt).toBe('Щоб побачити картку, заповніть: «Телефон (повністю)».');
    expect(partial.hidden[0]).toMatch(/не позначено «Номер перевірено»/u);
  });
});
