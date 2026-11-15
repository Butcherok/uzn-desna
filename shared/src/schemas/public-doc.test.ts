import { describe, expect, it } from 'vitest';
import { publicDocSchema } from './public-doc.js';

const base = {
  slug: 'director-remuneration',
  title: { uk: 'Інформація про оплату праці' },
  publishedWhere: 'parent' as const,
  featured: false,
  order: 7,
};

const url = 'https://desna.kyivzelenbud.com/about/publichna-informatsiya/';

describe('publicDocSchema', () => {
  it('принимает опубликованный пункт с адресом', () => {
    expect(publicDocSchema.safeParse({ ...base, externalUrl: url, featured: true }).success).toBe(
      true,
    );
  });

  it('требует адрес у опубликованного пункта', () => {
    expect(publicDocSchema.safeParse(base).success).toBe(false);
  });

  it('запрещает адрес у пункта, который выдаётся по запросу', () => {
    expect(
      publicDocSchema.safeParse({ ...base, publishedWhere: 'request', externalUrl: url }).success,
    ).toBe(false);
  });

  it('принимает пункт без адреса, который выдаётся по запросу', () => {
    expect(
      publicDocSchema.safeParse({ ...base, slug: 'statute', publishedWhere: 'request' }).success,
    ).toBe(true);
  });

  it('не пускает в блок документов запись без адреса', () => {
    expect(
      publicDocSchema.safeParse({ ...base, publishedWhere: 'request', featured: true }).success,
    ).toBe(false);
  });

  it('отвергает адрес без https', () => {
    expect(
      publicDocSchema.safeParse({ ...base, externalUrl: 'http://desna.kyivzelenbud.com/' }).success,
    ).toBe(false);
  });

  it('отвергает слаг кириллицей', () => {
    expect(
      publicDocSchema.safeParse({ ...base, slug: 'оплата-праці', externalUrl: url }).success,
    ).toBe(false);
  });
});
