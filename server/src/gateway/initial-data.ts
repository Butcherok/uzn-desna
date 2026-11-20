/**
 * Файлы данных версии 1 для однократной загрузки в БД (решение 038).
 * `esbuild` вшивает их в `dist/index.js`: от рабочего каталога Render
 * загрузка не зависит.
 */
import contacts from '../../../data/contacts.json';
import enterprise from '../../../data/enterprise.json';
import feedRules from '../../../data/feed-rules.json';
import leaders from '../../../data/leaders.json';
import publicDocs from '../../../data/public-docs.json';
import scenarios from '../../../data/scenarios.json';
import services from '../../../data/services.json';
import staticBlocks from '../../../data/static-blocks.json';
import vacancies from '../../../data/vacancies.json';
import type { InitialData } from '../domain/content-seed.js';

export const INITIAL_DATA: InitialData = {
  contacts,
  enterprise,
  'feed-rules': feedRules,
  leaders,
  'public-docs': publicDocs,
  scenarios,
  services,
  'static-blocks': staticBlocks,
  vacancies,
};
