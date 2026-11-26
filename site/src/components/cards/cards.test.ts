/**
 * Разметка общих карточек (решение 046): те же компоненты рисует сайт при
 * сборке и предпросмотр админки, поэтому разметка закреплена тестом — правка
 * карточки видна в обоих местах сразу и не уходит незамеченной.
 */
import { describe, expect, it } from 'vitest';
import { ContactRow } from './ContactRow';
import { DocCard } from './DocCard';
import { LeaderCard } from './LeaderCard';
import { PhoneInline } from './PhoneInline';
import { PhoneLink } from './PhoneLink';
import { renderStatic } from './render-static';
import { ServiceCard } from './ServiceCard';
import { VacancyCard } from './VacancyCard';

describe('cards', () => {
  it('PhoneLink: номер в читаемом виде, подпись — только если есть', () => {
    const html = renderStatic(PhoneLink, { phone: '+380443373501', hint: 'Пн–Пт' });
    expect(html).toContain('<a class="tel" href="tel:+380443373501">');
    expect(html).toContain('<span class="tel__num">+38 (044) 337-35-01</span>');
    expect(html).toContain('<span class="tel__hint">Пн–Пт</span>');
    expect(renderStatic(PhoneLink, { phone: '+380443373501' })).not.toContain('tel__hint');
  });

  it('PhoneInline', () => {
    expect(renderStatic(PhoneInline, { phone: '+380674480511' })).toBe(
      '<a class="tel-text" href="tel:+380674480511">+38 (067) 448-05-11</a>',
    );
  });

  it('ServiceCard', () => {
    expect(renderStatic(ServiceCard, { title: 'Кронування', summary: 'Зменшення крони.' })).toBe(
      '<article class="card"><h3 class="card__title">Кронування</h3>' +
        '<p class="card__text mt-2">Зменшення крони.</p></article>',
    );
  });

  it('VacancyCard: без підрозділу мітки немає', () => {
    const props = { position: 'Озеленювач', requirements: 'Досвід', phone: '+380443373501' };
    const html = renderStatic(VacancyCard, { ...props, unit: 'Дільниця 1' });
    expect(html).toContain('<span class="tag">Дільниця 1</span>');
    expect(html).toContain('Телефон: <a class="tel-text"');
    expect(renderStatic(VacancyCard, props)).not.toContain('tag');
  });

  it('ContactRow', () => {
    const html = renderStatic(ContactRow, { purpose: 'Приймальня', phone: '+380443373501' });
    expect(html).toMatch(/^<tr><th scope="row">Приймальня<\/th><td><a class="tel"/u);
    expect(html).not.toContain('contact__role');
    const duty = renderStatic(ContactRow, {
      purpose: 'Оперативний черговий',
      phone: '+380674480511',
      role: 'Координує роботу.\nЦілодобово.',
    });
    // Роль — після посилання, не всередині нього; рядок даних — абзац.
    expect(duty).toContain(
      '</a><p class="contact__role">Координує роботу.</p><p class="contact__role">Цілодобово.</p></td>',
    );
  });

  it('LeaderCard: дата, абзаци біографії, фото й відкрита біографія', () => {
    const base = { fullName: 'Іваненко Іван', position: 'Директор' };
    const plain = renderStatic(LeaderCard, base);
    expect(plain).not.toContain('<img');
    expect(plain).not.toContain('details');
    const full = renderStatic(LeaderCard, {
      ...base,
      since: '2020-03-01',
      bio: 'Перший.\n\nДругий.',
      photo: { src: '/a.webp', alt: 'Фотопортрет' },
      bioOpen: true,
    });
    expect(full).toContain('Директор · на посаді з 01.03.2020');
    expect(full).toContain('<details class="leader__bio" open="">');
    expect(full).toContain('<p>Перший.</p><p>Другий.</p>');
    expect(full).toContain('<img src="/a.webp" alt="Фотопортрет" loading="lazy"');
    expect(renderStatic(LeaderCard, { ...base, bio: 'Текст' })).toContain(
      '<details class="leader__bio"><summary>',
    );
  });

  it('DocCard: зовнішнє посилання й файл на сайті', () => {
    const ext = renderStatic(DocCard, {
      title: 'Звіт',
      target: { kind: 'external', href: 'https://example.org/' },
      place: 'Prozorro',
    });
    expect(ext).toContain(
      '<a class="ext" href="https://example.org/" target="_blank" rel="noopener noreferrer">Звіт</a>',
    );
    expect(ext).toContain('<span class="tag">Prozorro</span>');
    const own = renderStatic(DocCard, {
      title: 'Статут',
      target: { kind: 'file', href: '/s.pdf', fileKind: 'PDF', updatedAt: '2026-11-01' },
      place: 'Цей сайт',
    });
    expect(own).toContain(
      '<a href="/s.pdf" type="application/pdf">Статут</a> <span>(PDF, оновлено 01.11.2026)</span>',
    );
  });
});
