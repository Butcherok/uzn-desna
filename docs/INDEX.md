# Куда смотреть: задача → 1–3 файла

| Задача                             | Файлы                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Состояние и следующий шаг          | `docs/project-context.md`                                                       |
| Очередь задач                      | `docs/roadmap.md`                                                               |
| Делалось ли это раньше             | `docs/done.md`                                                                  |
| Что замечено и не сделано          | `docs/findings.md`                                                              |
| Раздел ТЗ по номерам строк         | `docs/kb-map.md` → `sed -n 'A,Bp'`                                              |
| Почему так сделано                 | `docs/decisions/`                                                               |
| Документы базы знаний (копии)      | `docs/knowledge-base/`                                                          |
| Симптом и что делать               | `docs/lessons-learned.md`                                                       |
| Добавить страницу                  | `site/src/pages/`, `site/src/config/site.ts` (меню)                             |
| Правка шапки или подвала           | `site/src/components/SiteHeader.astro`, `SiteFooter.astro`                      |
| Правка метаданных, `noindex`, CSP  | `site/src/layouts/BaseLayout.astro`                                             |
| Индексация, разметка, SEO          | `config/site.ts` (`INDEXING_ENABLED`), `scripts/bin/seo-check.mjs`, решение 039 |
| Цвет, шрифт, отступ, компонент     | `site/src/styles/tokens.css`, `components.css`                                  |
| Базовый путь, адрес сайта          | `site/astro.config.mjs`, `.env.example`                                         |
| Схемы полей и формат данных        | `shared/src/schemas/`, `shared/src/format/`                                     |
| Проверки сборки                    | `scripts/bin/`, `package.json` (скрипт `ci`)                                    |
| Сборка и публикация                | `.github/workflows/ci.yml`, `deploy.yml`                                        |
| Замер Lighthouse                   | `.github/workflows/lighthouse.yml`, ветка `metrics`                             |
| Бэкенд: вход, сессии, ошибки, CORS | `server/src/app.ts`, `server/src/routes/`, `server/src/domain/`                 |
| Хранилище БД и его тесты           | `server/src/gateway/`, `store-contract.ts`                                      |
| Контент: сущности, права, `slug`   | `server/src/domain/content-kinds.ts`, `content.ts`                              |
| Переменные бэкенда                 | `server/src/config/env.ts`, `.env.example`                                      |
| Первый владелец, потерян пароль    | `docs/runbook-admin-access.md`                                                  |
| Запуск бэкенда: Atlas и Render     | `docs/runbook-backend-deploy.md`, `render.yaml`                                 |
| Админка: страницы, формы, поля     | `admin/src/pages/`, `admin/src/domain/forms.ts`, решение 040                    |
| Будильник `/admin` на Pages        | `site/src/pages/admin/index.astro`, `site/src/config/wake.ts`                   |
| Публикация: кнопка, `/export`      | `server/src/domain/publish.ts`, `publish-content.yml`, решение 041              |
