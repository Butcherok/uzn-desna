import { describe, expect, it } from 'vitest';
import { isAllowedHref, parseRichText, richPlainText, richTextProblems } from './rich-text.js';
import { richLangText } from '../schemas/lang-text.js';

const t = (value: string) => ({ type: 'text', value });

describe('parseRichText', () => {
  it('текст без разметки — те же абзацы, что раньше', () => {
    expect(parseRichText('Перший.\n\n  Другий.  \n')).toEqual([
      { type: 'p', children: [t('Перший.')] },
      { type: 'p', children: [t('Другий.')] },
    ]);
  });

  it('полужирный и ссылка в строке', () => {
    expect(parseRichText('Дзвоніть **цілодобово**: [диспетчер](tel:+380443373501).')).toEqual([
      {
        type: 'p',
        children: [
          t('Дзвоніть '),
          { type: 'bold', children: [t('цілодобово')] },
          t(': '),
          { type: 'link', href: 'tel:+380443373501', children: [t('диспетчер')] },
          t('.'),
        ],
      },
    ]);
  });

  it('ссылка в полужирном и полужирный в ссылке', () => {
    const [p] = parseRichText('**див. [сайт](https://kyiv.ua)** [**тут**](https://a.ua/b)');
    expect(p).toEqual({
      type: 'p',
      children: [
        {
          type: 'bold',
          children: [t('див. '), { type: 'link', href: 'https://kyiv.ua', children: [t('сайт')] }],
        },
        t(' '),
        {
          type: 'link',
          href: 'https://a.ua/b',
          children: [{ type: 'bold', children: [t('тут')] }],
        },
      ],
    });
  });

  it('подряд идущие пункты — один список; «•» из Word тоже пункт', () => {
    expect(parseRichText('Вимоги:\n- освіта\n•\tдосвід\nДалі')).toEqual([
      { type: 'p', children: [t('Вимоги:')] },
      { type: 'ul', items: [[t('освіта')], [t('досвід')]] },
      { type: 'p', children: [t('Далі')] },
    ]);
  });

  it('дефис без пробела и одиночный дефис — не список', () => {
    expect(parseRichText('-5 °C\n-')).toEqual([
      { type: 'p', children: [t('-5 °C')] },
      { type: 'p', children: [t('-')] },
    ]);
  });

  it('незакрытое, пустое и запрещённое остаётся текстом', () => {
    for (const s of [
      '**не закрито',
      '****',
      '[текст](javascript:alert(1))',
      '[текст]',
      '[](https://a.ua)',
    ]) {
      expect(parseRichText(s)).toEqual([{ type: 'p', children: [t(s)] }]);
    }
  });
});

describe('isAllowedHref', () => {
  it('http, https, tel, mailto — да; прочее — нет', () => {
    for (const h of [
      'https://kyiv.ua',
      'http://a.ua/x?y=1',
      'tel:+380443373501',
      'tel:0443373501',
      'mailto:a@b.ua',
    ]) {
      expect(isAllowedHref(h), h).toBe(true);
    }
    for (const h of [
      'javascript:alert(1)',
      'data:text/html,x',
      'ftp://a.ua',
      'kyiv.ua',
      'https://',
      'tel:абв',
      'mailto:ab.ua',
      '//a.ua',
    ]) {
      expect(isAllowedHref(h), h).toBe(false);
    }
  });
});

describe('richTextProblems', () => {
  it('называет ссылку и причину', () => {
    expect(
      richTextProblems('[сайт](kyiv.ua) [x]() [y](https://a b.ua) [ok](https://a.ua)'),
    ).toEqual([
      'Посилання «сайт»: адреса має починатися з https://, http://, tel: або mailto:',
      'Посилання «x» без адреси',
      'Посилання «y»: в адресі не має бути пробілів',
    ]);
  });

  it('обычные квадратные скобки не трогает', () => {
    expect(richTextProblems('[заглушка] (див. нижче)')).toEqual([]);
  });
});

describe('richPlainText', () => {
  it('снимает знаки разметки', () => {
    expect(richPlainText('**Ж** [с](https://a.ua)\n- один\n- два')).toBe('Ж с один; два');
  });
});

describe('richLangText', () => {
  it('отказ по ссылке — по-украински, с признаком для формы', () => {
    const r = richLangText(100).safeParse({ uk: 'ok', en: '[site](www.a.ua)' });
    expect(r.success).toBe(false);
    const issue = r.error?.issues[0];
    expect(issue?.path).toEqual(['en']);
    expect(issue?.message).toBe(
      'Англійською: Посилання «site»: адреса має починатися з https://, http://, tel: або mailto:',
    );
    expect(issue && 'params' in issue ? issue.params : undefined).toEqual({ ui: true });
  });

  it('предел длины считается вместе с разметкой', () => {
    expect(richLangText(10).safeParse({ uk: '**12345678**' }).success).toBe(false);
  });
});
