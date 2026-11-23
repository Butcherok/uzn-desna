/**
 * Карточка в готовый HTML при сборке сайта (решение 046): React-компонент
 * выполняется один раз на сервере сборки, на страницу идёт только разметка.
 * Интеграция `@astrojs/react` не включается — она положила бы в сборку
 * клиентский рантайм React (220 КБ), который ни одна страница не загружает
 * (решение 004). Админка рисует те же компоненты в браузере (ТЗ 9.3, 10.2).
 */
import { createElement, type FunctionComponent } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

export function renderStatic<P extends object>(component: FunctionComponent<P>, props: P): string {
  return renderToStaticMarkup(createElement(component, props));
}
