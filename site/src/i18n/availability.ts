/**
 * Какие английские страницы есть в этой сборке (решение 056). Одно место на
 * весь сайт: его читают маршрут `/en/…`, меню, переключатель языка и
 * `hreflang`, поэтому ссылки на несобранную страницу не бывает.
 */
import { contacts, enterprise, leaders, services, staticBlockText } from '../gateway/data';
import { englishPages } from '../domain/translation';
import { EN_SECTIONS, localizedPath, type EnSection, type Lang } from './lang';
import { ABOUT_COPY } from './copy/about';
import { CONTACTS_COPY } from './copy/contacts';
import { HOME_COPY } from './copy/home';
import { SERVICES_COPY } from './copy/services';

export const EN_PAGES: ReadonlySet<EnSection> = englishPages(EN_SECTIONS, {
  contacts,
  enterprise,
  leaders,
  services,
  history: staticBlockText('about.history'),
  copy: {
    '/': HOME_COPY.en !== undefined,
    '/about/': ABOUT_COPY.en !== undefined,
    '/services/': SERVICES_COPY.en !== undefined,
    '/contacts/': CONTACTS_COPY.en !== undefined,
  },
});

/** Есть ли у страницы (путь без языка) английская версия */
export function hasEnglish(path: string): boolean {
  return (EN_PAGES as ReadonlySet<string>).has(path);
}

/** Есть ли английская версия вообще: без неё переключателя нет */
export const ENGLISH_ENABLED = EN_PAGES.size > 0;

/**
 * Куда ведёт переключатель на язык `target` со страницы `path` (путь без
 * языка). Украинская версия есть у каждой страницы; английской нет —
 * на английскую главную (ТЗ 3.2, п. 6); английской версии нет вовсе — `undefined`.
 */
export function switchTarget(path: string, target: Lang): string | undefined {
  if (target === 'uk') return localizedPath(path, 'uk');
  if (!ENGLISH_ENABLED) return undefined;
  return localizedPath(hasEnglish(path) ? path : '/', 'en');
}
