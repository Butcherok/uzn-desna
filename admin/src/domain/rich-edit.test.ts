import { describe, expect, it } from 'vitest';
import { applyRich, hasRichMarkup } from './rich-edit';

const sel = (value: string, from: string, len = from.length) => {
  const start = value.indexOf(from);
  return { value, start, end: start + len };
};
const picked = (e: { value: string; start: number; end: number }) => e.value.slice(e.start, e.end);

describe('applyRich', () => {
  it('полужирный: оборачивает выделенное и снимает повторным нажатием', () => {
    const on = applyRich('bold', sel('Дзвоніть цілодобово', 'цілодобово'));
    expect(on.value).toBe('Дзвоніть **цілодобово**');
    expect(picked(on)).toBe('цілодобово');
    expect(applyRich('bold', on).value).toBe('Дзвоніть цілодобово');
  });

  it('полужирный без выделения — заготовка «текст» выделена', () => {
    const r = applyRich('bold', { value: 'А ', start: 2, end: 2 });
    expect(r.value).toBe('А **текст**');
    expect(picked(r)).toBe('текст');
  });

  it('ссылка: выделен текст — выделяется адрес для ввода', () => {
    const r = applyRich('link', sel('див. Prozorro', 'Prozorro'));
    expect(r.value).toBe('див. [Prozorro](https://)');
    expect(picked(r)).toBe('https://');
  });

  it('ссылка: выделен адрес — выделяется текст ссылки', () => {
    const r = applyRich('link', sel('тут tel:+380443373501', 'tel:+380443373501'));
    expect(r.value).toBe('тут [текст посилання](tel:+380443373501)');
    expect(picked(r)).toBe('текст посилання');
  });

  it('список: строки выделения становятся пунктами и обратно', () => {
    const v = 'Вимоги:\nосвіта\nдосвід\nДалі';
    const on = applyRich('list', sel(v, 'освіта\nдосвід\n'));
    expect(on.value).toBe('Вимоги:\n- освіта\n- досвід\nДалі');
    expect(applyRich('list', on).value).toBe(v);
  });

  it('список без выделения — пунктом становится строка курсора', () => {
    const v = 'один\nдва';
    expect(applyRich('list', { value: v, start: 6, end: 6 }).value).toBe('один\n- два');
  });
});

describe('hasRichMarkup', () => {
  it('видит знаки и не путает дефис в тексте', () => {
    expect(hasRichMarkup('**ж**')).toBe(true);
    expect(hasRichMarkup('a\n- b')).toBe(true);
    expect(hasRichMarkup('[x](https://a.ua)')).toBe(true);
    expect(hasRichMarkup('Пн–Пт, 8-17, [заглушка]')).toBe(false);
  });
});
