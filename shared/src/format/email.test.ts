import { describe, expect, it } from 'vitest';
import { encodeHtmlEntities, mailtoLinkHtml } from './email.js';

describe('encodeHtmlEntities', () => {
  it('переводит каждый знак в числовую сущность', () => {
    expect(encodeHtmlEntities('a@b')).toBe('&#97;&#64;&#98;');
  });

  it('не оставляет в строке ни буквы, ни собачки, ни точки', () => {
    const encoded = encodeHtmlEntities('kpuzn07@gmail.com');
    expect(encoded).not.toMatch(/[a-z@.]/u);
  });
});

describe('mailtoLinkHtml', () => {
  const html = mailtoLinkHtml('kpuzn07@gmail.com');

  it('не содержит простого текстового mailto: (ТЗ 5.4, п. 7)', () => {
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('@');
  });

  it('содержит адрес и в ссылке, и в подписи', () => {
    const address = encodeHtmlEntities('kpuzn07@gmail.com');
    expect(html).toBe(`<a href="${encodeHtmlEntities('mailto:')}${address}">${address}</a>`);
  });

  it('допускает подпись, отличную от адреса', () => {
    expect(mailtoLinkHtml('a@b.ua', 'написати')).toContain(encodeHtmlEntities('написати'));
  });
});
