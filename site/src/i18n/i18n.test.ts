import { describe, expect, it } from 'vitest';
import { localizedPath, splitLangPath } from './lang';
import { UI } from './ui';
import { ENTERPRISE, OG_IMAGE_ALT, SITE_NAME } from '../config/site';

describe('языковые пути (ТЗ 3.2, п. 2 и 4)', () => {
  it('украинский без префикса, английский — /en/, слаг не переводится', () => {
    expect(localizedPath('/services/', 'uk')).toBe('/services/');
    expect(localizedPath('/services/', 'en')).toBe('/en/services/');
    expect(localizedPath('/', 'en')).toBe('/en/');
  });

  it('splitLangPath — обратное', () => {
    expect(splitLangPath('/en/')).toEqual({ lang: 'en', path: '/' });
    expect(splitLangPath('/en/contacts/')).toEqual({ lang: 'en', path: '/contacts/' });
    expect(splitLangPath('/contacts/')).toEqual({ lang: 'uk', path: '/contacts/' });
  });
});

describe('словарь подписей (решение 056)', () => {
  it('украинские подписи совпадают с настройками сайта — одна правда', () => {
    expect(UI.uk.nameShort).toBe(ENTERPRISE.nameShort);
    expect(UI.uk.nameShort).toBe(SITE_NAME);
    expect(`${UI.uk.brandMain} ${UI.uk.brandSub}`).toBe(UI.uk.nameShort);
    expect(UI.uk.address).toBe(ENTERPRISE.address);
    expect(UI.uk.ogImageAlt).toBe(OG_IMAGE_ALT);
  });

  it('в английских подписях нет кириллицы', () => {
    expect(JSON.stringify(UI.en)).not.toMatch(/\p{Script=Cyrillic}/u);
  });

  it('английское название из двух частей шапки', () => {
    expect(`${UI.en.brandMain} ${UI.en.brandSub}`).toBe(UI.en.nameShort);
  });
});
