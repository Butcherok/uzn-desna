/**
 * Образец карточки «Так виглядатиме на сайті» (ТЗ 9.3; решение 046).
 *
 * Карточку рисуют те же React-компоненты, что сайт (`site/src/components/cards`).
 * Она стоит в теневом DOM со стилями сайта: у админки свои `.card` и
 * `.card__text`, и без изоляции образец выглядел бы не как на сайте. Стили —
 * файлом (`style-src 'self'`), встроенных нет.
 *
 * Образец не нажимается (`inert`): телефон и ссылки в нём не срабатывают,
 * случайное нажатие не уводит со страницы с несохранёнными правками. Заголовок,
 * подсказки и причины скрытия — вне `inert`, их читает экранный диктор.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ContactRow } from '../../../site/src/components/cards/ContactRow';
import { DocCard } from '../../../site/src/components/cards/DocCard';
import { LeaderCard } from '../../../site/src/components/cards/LeaderCard';
import { ServiceCard } from '../../../site/src/components/cards/ServiceCard';
import { VacancyCard } from '../../../site/src/components/cards/VacancyCard';
import type { PreviewCard, PreviewResult } from '../domain/preview';
import siteCss from '../styles/preview-site.css?url';

export function SiteFrame({ children, off }: { children: ReactNode; off: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    setRoot(el.shadowRoot ?? el.attachShadow({ mode: 'open' }));
  }, []);
  return (
    <div ref={host} className={off ? 'preview__frame preview__frame--off' : 'preview__frame'} inert>
      {root &&
        createPortal(
          <>
            <link rel="stylesheet" href={siteCss} />
            <div className="preview-site">{children}</div>
          </>,
          root,
        )}
    </div>
  );
}

function Card({ card }: { card: PreviewCard }) {
  switch (card.type) {
    case 'service':
      return <ServiceCard title={card.title} summary={card.summary} />;
    case 'leader':
      return (
        <LeaderCard
          fullName={card.fullName}
          position={card.position}
          since={card.since}
          bio={card.bio}
          photo={card.photo}
          bioOpen
        />
      );
    case 'vacancy':
      return (
        <ul className="list-bare">
          <VacancyCard
            position={card.position}
            unit={card.unit}
            requirements={card.requirements}
            phone={card.phone}
          />
        </ul>
      );
    case 'doc':
      return (
        <ul className="list-bare">
          <DocCard title={card.title} target={card.target} place={card.place} />
        </ul>
      );
    case 'contact':
      return (
        <table className="specs">
          <tbody>
            <ContactRow purpose={card.purpose} phone={card.phone} hours={card.hours} />
          </tbody>
        </table>
      );
  }
}

export function Preview({ result }: { result: PreviewResult }) {
  return (
    <aside className="preview" aria-labelledby="preview-title">
      <h2 className="preview__title" id="preview-title">
        Так виглядатиме на сайті
      </h2>
      <p className="preview__hint">
        Змінюється одразу, поки ви друкуєте. Тут лише картка — всю сторінку видно на сайті після
        публікації.
      </p>
      {result.hidden.length > 0 && (
        <ul className="preview__notes preview__notes--hidden">
          {result.hidden.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
      {result.card ? (
        <>
          {result.offSite && <p className="preview__off">Зараз цієї картки на сайті немає.</p>}
          <SiteFrame off={result.offSite}>
            <Card card={result.card} />
          </SiteFrame>
        </>
      ) : (
        <p className="preview__empty">{result.prompt}</p>
      )}
      {result.info.length > 0 && (
        <ul className="preview__notes">
          {result.info.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}
