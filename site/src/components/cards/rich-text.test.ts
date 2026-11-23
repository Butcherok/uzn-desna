/** Вывод разметки полей (решение 047). */
import { describe, expect, it } from 'vitest';
import { renderStatic } from './render-static';
import { RichText } from './RichText';
import { ServiceCard } from './ServiceCard';
import { VacancyCard } from './VacancyCard';

describe('RichText', () => {
  it('текст без разметки — абзацы, как прежде', () => {
    expect(renderStatic(RichText, { text: 'Один.\nДва.', firstClassName: 'lead' })).toBe(
      '<p class="lead">Один.</p><p>Два.</p>',
    );
  });

  it('полужирный, ссылка, список', () => {
    expect(
      renderStatic(RichText, {
        text: '**Увага:** [Prozorro](https://prozorro.gov.ua)\n- один\n- [дзвінок](tel:+380443373501)',
        className: 'card__text',
      }),
    ).toBe(
      '<p class="card__text"><strong>Увага:</strong> <a href="https://prozorro.gov.ua">Prozorro</a></p>' +
        '<ul class="card__text"><li>один</li><li><a href="tel:+380443373501">дзвінок</a></li></ul>',
    );
  });

  it('почта — сущностями, без открытого mailto: и букв адреса (решение 008)', () => {
    const html = renderStatic(RichText, {
      text: 'Пишіть: [**kpuzn07@gmail.com**](mailto:kpuzn07@gmail.com)',
    });
    expect(html).not.toMatch(/mailto|kpuzn|@/u);
    expect(html).toContain('<a href="&#109;&#97;&#105;');
    expect(html).toContain('<strong>&#107;');
  });

  it('HTML в тексте экранируется, запрещённая ссылка — текстом', () => {
    const html = renderStatic(RichText, { text: '<b>x</b> [y](javascript:alert(1))' });
    expect(html).toBe('<p>&lt;b&gt;x&lt;/b&gt; [y](javascript:alert(1))</p>');
  });

  it('карточки: список в описании послуги и требованиях вакансии', () => {
    expect(renderStatic(ServiceCard, { title: 'Т', summary: 'Що:\n- обрізка' })).toContain(
      '<p class="card__text mt-2">Що:</p><ul class="card__text mt-2"><li>обрізка</li></ul>',
    );
    const v = renderStatic(VacancyCard, {
      position: 'П',
      requirements: '- освіта',
      phone: '+380443373501',
    });
    expect(v).toContain('<ul class="card__text"><li>освіта</li></ul>');
  });
});
