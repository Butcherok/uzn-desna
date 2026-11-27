import { describe, expect, it } from 'vitest';
import { checkLanguages, cyrillicOutsideUk, fileOf, mainTextLength } from './check.js';

const OPTS = { base: '/uzn-desna', origin: 'https://example.org' };
const abs = (path: string): string => `https://example.org/uzn-desna${path}`;

function page(lang: 'uk' | 'en', main: string, alternates = '', extra = ''): string {
  return `<!doctype html><html lang="${lang}"><head><title>x</title>${alternates}</head><body>${extra}<main id="main">${main}</main></body></html>`;
}

const pair = (path: string): string =>
  `<link rel="alternate" hreflang="uk" href="${abs(path)}">` +
  `<link rel="alternate" hreflang="en" href="${abs(`/en${path}`)}">` +
  `<link rel="alternate" hreflang="x-default" href="${abs(path)}">`;

describe('lang:check — разбор', () => {
  it('текст main считается без тегов, скриптов и пробелов', () => {
    expect(mainTextLength('<main><p>Аб в</p><script>xxxx</script><b>г</b></main>')).toBe(4);
  });

  it('кириллица внутри lang="uk" разрешена, вне — нет, и в атрибутах тоже', () => {
    const html =
      '<html lang="en"><body><p>Hello</p><a lang="uk" hreflang="uk">UA<span> — українська</span></a>' +
      '<img alt="Фото"><p>Привіт</p></body></html>';
    expect(cyrillicOutsideUk(html)).toEqual(['img[alt]: Фото', 'Привіт']);
  });

  it('адрес → файл сборки', () => {
    expect(fileOf(abs('/en/'), OPTS.base, OPTS.origin)).toBe('en/index.html');
    expect(fileOf('/uzn-desna/contacts/#x', OPTS.base, OPTS.origin)).toBe('contacts/index.html');
    expect(fileOf('https://other.org/', OPTS.base, OPTS.origin)).toBeUndefined();
  });
});

describe('lang:check — правила', () => {
  const good = new Map([
    ['index.html', page('uk', 'Головна сторінка', pair('/'))],
    ['contacts/index.html', page('uk', 'Контакти підприємства')],
    ['en/index.html', page('en', 'Home page', pair('/'))],
  ]);

  it('правильная сборка — без нарушений', () => {
    expect(checkLanguages(good, OPTS)).toEqual({ errors: [], ukPages: 2, enPages: 1 });
  });

  it('английского текста больше украинского — нарушение (Закон № 2704-VIII, ст. 27 ч. 6)', () => {
    const pages = new Map(good);
    pages.set('en/index.html', page('en', 'Home page with much longer English text', pair('/')));
    expect(checkLanguages(pages, OPTS).errors.join()).toMatch(/больше, чем в украинской/);
  });

  it('английская страница без украинской и английских больше — нарушения', () => {
    const pages = new Map([
      ['index.html', page('uk', 'Головна', pair('/'))],
      ['en/index.html', page('en', 'Home', pair('/'))],
      ['en/jobs/index.html', page('en', 'Jobs')],
    ]);
    const { errors } = checkLanguages(pages, OPTS);
    expect(errors.join('\n')).toMatch(/нет украинской страницы jobs\/index.html/);
    expect(errors.join('\n')).toMatch(/английских страниц 2 больше украинских 1/);
  });

  it('неверный lang, нет hreflang у пары, hreflang у страницы без пары', () => {
    const pages = new Map(good);
    pages.set('en/index.html', page('uk', 'Home'));
    pages.set('contacts/index.html', page('uk', 'Контакти', pair('/contacts/')));
    const errors = checkLanguages(pages, OPTS).errors.join('\n');
    expect(errors).toMatch(/en\/index.html: html lang = uk, нужен en/);
    expect(errors).toMatch(/en\/index.html: нет hreflang="en"/);
    expect(errors).toMatch(/contacts\/index.html: hreflang у страницы без языковой пары/);
  });

  it('непереведённая подпись на английской странице — нарушение (ТЗ 12.4)', () => {
    const pages = new Map(good);
    pages.set('en/index.html', page('en', 'Home', pair('/'), '<a href="#main">Перейти</a>'));
    expect(checkLanguages(pages, OPTS).errors.join()).toMatch(/кириллица без lang="uk": «Перейти»/);
  });

  it('ссылка на несобранную английскую страницу — нарушение', () => {
    const pages = new Map(good);
    pages.set(
      'contacts/index.html',
      page('uk', 'Контакти', '', '<a href="/uzn-desna/en/contacts/">EN</a>'),
    );
    expect(checkLanguages(pages, OPTS).errors.join()).toMatch(
      /несобранную \/uzn-desna\/en\/contacts\//,
    );
  });
});
