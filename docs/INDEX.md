# Куда смотреть: задача → 1–3 файла

| Задача                            | Файлы                                                      |
| --------------------------------- | ---------------------------------------------------------- |
| Состояние и следующий шаг         | `docs/project-context.md`                                  |
| Очередь задач                     | `docs/roadmap.md`                                          |
| Почему так сделано                | `docs/decisions/`                                          |
| Симптом и что делать              | `docs/lessons-learned.md`                                  |
| Добавить страницу                 | `site/src/pages/`, `site/src/config/site.ts` (меню)        |
| Правка шапки или подвала          | `site/src/components/SiteHeader.astro`, `SiteFooter.astro` |
| Правка метаданных, `noindex`, CSP | `site/src/layouts/BaseLayout.astro`                        |
| Цвет, шрифт, отступ, компонент    | `site/src/styles/tokens.css`, `components.css`             |
| Базовый путь, адрес сайта         | `site/astro.config.mjs`, `.env.example`                    |
| Схемы полей и формат данных       | `shared/src/schemas/`, `shared/src/format/`                |
| Проверки сборки                   | `scripts/bin/`, `package.json` (скрипт `ci`)               |
| Сборка и публикация               | `.github/workflows/ci.yml`, `deploy.yml`                   |
