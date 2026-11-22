/**
 * Сущности доступа (ТЗ 6.4) и порт хранилища. Слой domain знает только
 * этот интерфейс; MongoDB и хранилище в памяти лежат в gateway.
 */

export type Role = 'owner' | 'editor';

export interface User {
  id: string;
  /** Латиница, не адрес электронной почты (ТЗ 6.4). Хранится в нижнем регистре. */
  login: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  passwordChangedAt: Date | null;
}

export type NewUser = Omit<User, 'id'>;

export interface Session {
  id: string;
  /** SHA-256 от случайных 32 байт. Сам токен не хранится (ТЗ 6.4). */
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date;
}

export type NewSession = Omit<Session, 'id'>;

export type ActionResult = 'ok' | 'denied' | 'error';

export interface ActionLogEntry {
  at: Date;
  userId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  result: ActionResult;
  /** Без секретов и паролей (ТЗ 6.4). */
  details: Record<string, string | number | boolean | null>;
}

/** Запись журнала с идентификатором — для показа владельцу (ТЗ 9.7). */
export interface ActionLogRecord extends ActionLogEntry {
  id: string;
}

/** Выборка журнала: новые первыми; `userId: null` — записи без пользователя. */
export interface LogQuery {
  userId?: string | null;
  /** Включительно. */
  from?: Date;
  /** Не включительно. */
  to?: Date;
  skip: number;
  limit: number;
}

export interface UserPatch {
  passwordHash?: string;
  mustChangePassword?: boolean;
  lastLoginAt?: Date;
  passwordChangedAt?: Date;
}

/**
 * Редактируемый контент (ТЗ 6.2, 8.3). Запись — служебные поля и `data`:
 * `data` — ровно поля схемы из `shared/`, её же берёт выгрузка (решение 038).
 */
export const CONTENT_KINDS = [
  'contacts',
  'leaders',
  'services',
  'scenarios',
  'vacancies',
  'public-docs',
  'static-blocks',
  'enterprise',
  'feed-rules',
] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];

export type ContentStatus = 'draft' | 'published';

export interface ContentRecord {
  id: string;
  kind: ContentKind;
  /** Уникален в пределах `kind`: `slug`, `blockKey` или `singleton`. */
  key: string;
  data: Record<string, unknown>;
  status: ContentStatus;
  createdAt: Date;
  updatedAt: Date;
  /** Не `null` — запись в «Кошику» (ТЗ 6.1, п. 7). */
  deletedAt: Date | null;
  /** После первой публикации `slug` меняется только с подтверждением (ТЗ 8.3, п. 3). */
  firstPublishedAt: Date | null;
}

export type NewContentRecord = Omit<ContentRecord, 'id'>;

/** Служебная запись контента: загрузка начальных данных и последняя публикация. */
export interface ContentMeta {
  seededAt: Date | null;
  lastPublishedAt: Date | null;
  /** Окончательно удалённые записи, чьё удаление ещё не опубликовано. */
  purgedPending: number;
  /** Последний прогон публикации (ТЗ 8.5; решение 041). */
  lastRun: PublishRun | null;
}

export type PublishResult = 'in_progress' | 'success' | 'failure';

/** Прогон рабочего процесса `publish-content` (ТЗ 8.5; решение 041). */
export interface PublishRun {
  /** Номер прогона GitHub Actions. */
  runId: number;
  runUrl: string;
  startedAt: Date;
  /** Имя того, кто нажал кнопку; `null` — запуск по расписанию. */
  startedBy: string | null;
  result: PublishResult;
  finishedAt: Date | null;
  /**
   * Время выгрузки `GET /export`: правки до него уходят в эту публикацию.
   * `null` — выгрузки ещё не было.
   */
  snapshotAt: Date | null;
  /** Счётчик окончательно удалённых на момент выгрузки. */
  purgedAtSnapshot: number;
  /** Неопубликованные файлы, ушедшие в эту выгрузку (решение 042). */
  uploadPaths?: string[];
}

/** Итог прогона: применяется, только если прогон всё ещё `in_progress`. */
export interface PublishFinish {
  result: 'success' | 'failure';
  finishedAt: Date;
  /** Успех с выгрузкой: новое время последней публикации. */
  publishedAt: Date | null;
  /** На сколько уменьшить счётчик окончательно удалённых. */
  purgedDelta: number;
}

/**
 * Загруженный файл (ТЗ 8.4; решение 042). Содержимое лежит в БД, только пока
 * файл не опубликован: успешная публикация переносит его в ветку
 * `content-data`, и `data` становится `null`.
 */
export interface UploadRecord {
  /** `media/{entity}/{slug}-{hash}.{ext}` — уникален. */
  path: string;
  entity: string;
  slug: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  /** SHA-256 содержимого, шестнадцатеричный: по нему выгрузка сверяет файл. */
  sha256: string;
  alt: string | null;
  uploadedAt: Date;
  uploadedBy: string;
  /** Время выгрузки, с которой файл ушёл на сайт; `null` — ещё не опубликован. */
  publishedAt: Date | null;
  /** Владелец удалил опубликованный файл: уйдёт из ветки со следующей публикацией. */
  deleteRequestedAt: Date | null;
  /** Содержимое до публикации; после — `null`. */
  data: Buffer | null;
}

export type UploadMeta = Omit<UploadRecord, 'data'>;

/**
 * Решение по карточке ленты «Новини галузі» (ТЗ 6.3, 6.4, 9.5; решение 043).
 * Сама карточка в БД не хранится: её пишет синхронизация в ветку `sync-data`.
 * Возврат не удаляет запись, а снимает `hidden`: так возврат тоже попадает в
 * счётчик неопубликованных правок.
 */
export interface ModerationRecord {
  /** `FeedItem.urlKey` — естественный ключ записи ленты. */
  urlKey: string;
  hidden: boolean;
  updatedAt: Date;
  /** Кто принял решение: идентификатор пользователя. */
  updatedBy: string;
}

export interface ContentOrderEntry {
  id: string;
  order: number;
}

export interface Store {
  /** Короткая проверка связи с БД для `/health`. */
  ping(): Promise<boolean>;

  countUsers(): Promise<number>;
  findUserByLogin(login: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  /** Бросает `DuplicateKeyError`, если логин занят. */
  createUser(user: NewUser): Promise<User>;
  updateUser(id: string, patch: UserPatch): Promise<void>;

  createSession(session: NewSession): Promise<Session>;
  findSessionByTokenHash(tokenHash: string): Promise<Session | null>;
  touchSession(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void>;
  deleteSession(id: string): Promise<void>;
  /** Удаляет сессии пользователя, кроме `exceptId`. */
  deleteUserSessions(userId: string, exceptId?: string): Promise<void>;
  /** Действующие сессии пользователя, от новых к старым. */
  listUserSessions(userId: string, now: Date): Promise<Session[]>;

  appendLog(entry: ActionLogEntry): Promise<void>;
  /** Страница журнала и число записей под фильтром. */
  listLog(query: LogQuery): Promise<{ items: ActionLogRecord[]; total: number }>;
  /** Все учётные записи — для фильтра журнала. */
  listUsers(): Promise<User[]>;

  /** Все записи сущности, включая «Кошик»; порядок не гарантируется. */
  listContent(kind: ContentKind): Promise<ContentRecord[]>;
  findContent(kind: ContentKind, id: string): Promise<ContentRecord | null>;
  /** Бросает `DuplicateKeyError`, если `key` занят в пределах `kind`. */
  insertContent(record: NewContentRecord): Promise<ContentRecord>;
  /**
   * Заменяет запись, если её `updatedAt` всё ещё `expectedUpdatedAt`.
   * `false` — запись изменили или удалили раньше. Бросает `DuplicateKeyError`
   * при занятом `key`.
   */
  replaceContent(record: ContentRecord, expectedUpdatedAt: Date): Promise<boolean>;
  /** Ставит `data.order` и `updatedAt` перечисленным записям. */
  updateContentOrder(kind: ContentKind, entries: ContentOrderEntry[], at: Date): Promise<void>;
  /** Физическое удаление. `false` — записи не было. */
  deleteContent(kind: ContentKind, id: string): Promise<boolean>;
  /** Число записей с `updatedAt` позже `since`; `null` — все записи. */
  countContentChangedSince(since: Date | null): Promise<number>;
  getContentMeta(): Promise<ContentMeta>;
  /** Отмечает загрузку начальных данных. `false` — отметка уже стояла. */
  markContentSeeded(at: Date): Promise<boolean>;
  incrementPurgedPending(): Promise<void>;
  /** Записывает новый прогон публикации поверх прежнего. */
  setPublishRun(run: PublishRun): Promise<void>;
  /** Меняет поля прогона `runId`. `false` — последний прогон другой. */
  patchPublishRun(runId: number, patch: Partial<Omit<PublishRun, 'runId'>>): Promise<boolean>;
  /**
   * Завершает прогон `runId`, если он ещё `in_progress`, и при успехе
   * сдвигает время последней публикации. `false` — уже завершён или другой.
   */
  finishPublishRun(runId: number, finish: PublishFinish): Promise<boolean>;

  /** Бросает `DuplicateKeyError`, если путь занят. */
  insertUpload(upload: UploadRecord): Promise<void>;
  /** Все файлы без содержимого. */
  listUploads(): Promise<UploadMeta[]>;
  findUpload(path: string): Promise<UploadMeta | null>;
  /** Содержимое неопубликованного файла; `null` — нет файла или уже опубликован. */
  readUploadData(path: string): Promise<Buffer | null>;
  /** Ставит или снимает отметку удаления. `false` — файла нет. */
  setUploadDeleteRequested(path: string, at: Date | null): Promise<boolean>;
  /** Физическое удаление записи. `false` — файла не было. */
  deleteUpload(path: string): Promise<boolean>;
  /**
   * Итог успешной публикации с выгрузкой `snapshotAt`: файлы `exported`
   * становятся опубликованными (содержимое из БД убирается), а удалённые
   * владельцем до выгрузки — исчезают.
   */
  settleUploads(snapshotAt: Date, exported: readonly string[]): Promise<void>;

  /** Все решения модерации ленты, включая снятые. */
  listModeration(): Promise<ModerationRecord[]>;
  findModeration(urlKey: string): Promise<ModerationRecord | null>;
  /** Записывает решение по ключу поверх прежнего. */
  upsertModeration(record: ModerationRecord): Promise<void>;
  /** Число решений с `updatedAt` позже `since`; `null` — все. */
  countModerationChangedSince(since: Date | null): Promise<number>;
}

export class DuplicateKeyError extends Error {
  constructor(message = 'duplicate key') {
    super(message);
    this.name = 'DuplicateKeyError';
  }
}

/** Ошибка связи с БД: отдаётся как 503 `DB_UNAVAILABLE` (ТЗ 8.1, п. 4). */
export class StoreUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('database unavailable', { cause });
    this.name = 'StoreUnavailableError';
  }
}
