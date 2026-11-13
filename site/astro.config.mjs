import { defineConfig } from 'astro/config';

/**
 * Базовый путь и адрес сайта берутся из переменных окружения (ТЗ 3.2, п. 1):
 * смена адреса не требует правок в коде страниц.
 */
const base = process.env.PUBLIC_BASE_PATH ?? '/uzn-desna';
const site = process.env.PUBLIC_SITE_ORIGIN ?? 'https://butcherok.github.io';

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: {
    format: 'directory',
    inlineStylesheets: 'never',
  },
  // Интеграция React включается в задаче, где появится первый остров:
  // предпросмотр карточек в админке (ТЗ 9.3). В версии 1 островов нет, а
  // включённая интеграция кладёт в сборку клиентский рантайм React (220 КБ),
  // который ни одна страница не запрашивает. Зависимости уже установлены.
  integrations: [],
  i18n: {
    defaultLocale: 'uk',
    locales: ['uk', 'en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
  devToolbar: {
    enabled: false,
  },
});
