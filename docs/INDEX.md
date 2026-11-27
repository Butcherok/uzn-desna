# Куда смотреть: задача → 1–3 файла

| Задача                                      | Файлы                                                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Состояние и следующий шаг                   | `docs/project-context.md`                                                                             |
| Очередь задач                               | `docs/roadmap.md`                                                                                     |
| Делалось ли это раньше                      | `docs/done.md`                                                                                        |
| Что замечено и не сделано                   | `docs/findings.md`                                                                                    |
| Раздел ТЗ по номерам строк                  | `docs/kb-map.md` → `sed -n 'A,Bp'`                                                                    |
| Почему так сделано                          | `docs/decisions/`                                                                                     |
| Документы базы знаний (копии)               | `docs/knowledge-base/`                                                                                |
| Симптом и что делать                        | `docs/lessons-learned.md`                                                                             |
| Добавить страницу                           | `site/src/pages/`, `site/src/config/site.ts` (меню)                                                   |
| Правка шапки или подвала                    | `site/src/components/SiteHeader.astro`, `SiteFooter.astro`                                            |
| Правка метаданных, `noindex`, CSP           | `site/src/layouts/BaseLayout.astro`                                                                   |
| Индексация, разметка, SEO                   | `config/site.ts` (`INDEXING_ENABLED`), `scripts/bin/seo-check.mjs`, решение 039                       |
| Цвет, шрифт, отступ, компонент              | `site/src/styles/tokens.css`, `components.css`                                                        |
| Базовый путь, адрес сайта                   | `site/astro.config.mjs`, `.env.example`                                                               |
| Схемы полей и формат данных                 | `shared/src/schemas/`, `shared/src/format/`                                                           |
| Проверки сборки                             | `scripts/bin/`, `package.json` (скрипт `ci`)                                                          |
| Сборка и публикация                         | `.github/workflows/ci.yml`, `deploy.yml`                                                              |
| Замер Lighthouse                            | `.github/workflows/lighthouse.yml`, ветка `metrics`                                                   |
| Бэкенд: вход, сессии, ошибки, CORS          | `server/src/app.ts`, `server/src/routes/`, `server/src/domain/`                                       |
| Хранилище БД и его тесты                    | `server/src/gateway/`, `store-contract.ts`                                                            |
| Контент: сущности, права, `slug`            | `server/src/domain/content-kinds.ts`, `content.ts`                                                    |
| Переменные бэкенда                          | `server/src/config/env.ts`, `.env.example`                                                            |
| Первый владелец, потерян пароль             | `docs/runbook-admin-access.md`                                                                        |
| Запуск бэкенда: Atlas и Render              | `docs/runbook-backend-deploy.md`, `render.yaml`                                                       |
| Админка: страницы, формы, поля              | `admin/src/pages/`, `admin/src/domain/forms.ts`, решение 040                                          |
| Будильник `/admin` на Pages                 | `site/src/pages/admin/index.astro`, `site/src/config/wake.ts`                                         |
| Публикация: кнопка, `/export`               | `server/src/domain/publish.ts`, `publish-content.yml`, решение 041                                    |
| Загрузка файлов: `/uploads`, `media/`       | `server/src/domain/uploads.ts`, `media-files.ts`, `shared/src/uploads.ts`, решение 042                |
| Модерация ленты: `/feed`, `moderation.json` | `server/src/domain/feed.ts`, `gateway/feed-source.ts`, `admin/src/pages/FeedPage.tsx`, решение 043    |
| Журнал действий: `/log`, «Журнал дій»       | `server/src/domain/action-log.ts`, `admin/src/domain/log.ts`, `LogPage.tsx`, решение 044              |
| Резервная копия, восстановление             | `.github/workflows/backup.yml`, `docs/runbook-restore.md`, `server/src/domain/backup.ts`, решение 045 |

## Задача → части ТЗ и дизайн-системы

Части лежат в базе знаний и копиями в `docs/knowledge-base/`. Читать срезом по `docs/kb-map.md`, не целиком.

| Задача                                       | Части                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------------- |
| Любая правка требования                      | своя часть + оглавление `10_tz-sait.md` (версия, строка «Правка») + журнал `10h` |
| Страница: состав, блоки, тексты              | `10b` (раздел 4), меню и адреса — `10a` (3)                                      |
| Английская версия, языки                     | `10b` (4.13), `10a` (3.2), `10c` (5)                                             |
| Поля данных, админка                         | `10c` (6), `10g` (13.1), `10d` (9)                                               |
| Лента, Prozorro, синхронизация               | `10c` (7)                                                                        |
| API бэкенда, роли, вход                      | `10d` (8, 9)                                                                     |
| Стек, сборка, CI, скорость, доступность, SEO | `10e` (10, 11)                                                                   |
| Приёмка, чек-листы версий                    | `10f` (12)                                                                       |
| Заглушки                                     | `10g` (13.2)                                                                     |
| Цвет, шрифт, отступ, фокус                   | `11a`; компоненты, первый экран — `11b`; движение — `11c`                        |
| Старое решение по ТЗ (до 27.11.2026)         | архив `10z`, поиском по слову                                                    |
| Закрытые документы 05–08, 14, 15             | `docs/archive/`                                                                  |
