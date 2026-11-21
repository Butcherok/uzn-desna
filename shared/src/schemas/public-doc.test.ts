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

  it('принимает формулировку пункта на пределе 200 знаков', () => {
    expect(
      publicDocSchema.safeParse({ ...base, externalUrl: url, normRef: { uk: 'я'.repeat(200) } })
        .success,
    ).toBe(true);
  });

  it('отвергает формулировку пункта длиннее 200 знаков', () => {
    expect(
      publicDocSchema.safeParse({ ...base, externalUrl: url, normRef: { uk: 'я'.repeat(201) } })
        .success,
    ).toBe(false);
  });

  it('отвергает слаг кириллицей', () => {
    expect(
      publicDocSchema.safeParse({ ...base, slug: 'оплата-праці', externalUrl: url }).success,
    ).toBe(false);
  });

  describe('пункт с файлом на этом сайте (own)', () => {
    const own = { ...base, publishedWhere: 'own' as const };
    const file = 'media/public-docs/statut-1a2b3c4d.pdf';

    it('принимает файл без адреса, в том числе в блоке документов', () => {
      expect(publicDocSchema.safeParse({ ...own, filePath: file, featured: true }).success).toBe(
        true,
      );
      expect(
        publicDocSchema.safeParse({ ...own, filePath: file, docUpdatedAt: '2026-11-21' }).success,
      ).toBe(true);
    });

    it('требует файл и не пускает адрес', () => {
      expect(publicDocSchema.safeParse(own).success).toBe(false);
      expect(publicDocSchema.safeParse({ ...own, filePath: file, externalUrl: url }).success).toBe(
        false,
      );
    });

    it('не пускает файл у других пунктов и чужие пути', () => {
      expect(publicDocSchema.safeParse({ ...base, externalUrl: url, filePath: file }).success).toBe(
        false,
      );
      expect(
        publicDocSchema.safeParse({ ...own, filePath: 'media/leaders/x-1a2b3c4d.jpg' }).success,
      ).toBe(false);
    });
  });
});
