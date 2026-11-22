/**
 * Единый формат ошибок API (ТЗ 8.1, п. 3–4).
 * `code` — из закрытого перечня, `message` — готовый к показу текст
 * на украинском, без кодов и жаргона (ТЗ 2.3, требование 5).
 */

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'CONFLICT',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE_TYPE',
  'RATE_LIMITED',
  'PUBLISH_IN_PROGRESS',
  'GITHUB_UNAVAILABLE',
  'DB_UNAVAILABLE',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
    /** Записи, из-за которых публикация не запущена (ТЗ 8.5, п. 2). */
    problems?: PublishProblem[];
  };
}

export interface PublishProblem {
  kind: string;
  /** Раздел админки, как в меню (ТЗ 9.3). */
  label: string;
  /** `null` — записи нет совсем (синглтон не заполнен). */
  id: string | null;
  title: string;
  message: string;
}

/** Текст по умолчанию для каждого кода. Конкретный текст можно передать явно. */
export const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Сесія завершилась. Увійдіть знову',
  FORBIDDEN: 'Для цієї дії недостатньо прав',
  NOT_FOUND: 'Не знайдено',
  VALIDATION_FAILED: 'Перевірте заповнені поля',
  CONFLICT: 'Запис змінився або вже існує. Оновіть сторінку',
  FILE_TOO_LARGE: 'Дані завеликі',
  UNSUPPORTED_FILE_TYPE: 'Такий тип файлу не підтримується',
  RATE_LIMITED: 'Занадто багато спроб. Спробуйте за хвилину',
  PUBLISH_IN_PROGRESS: 'Публікація вже триває',
  GITHUB_UNAVAILABLE: 'Не вдалося запустити публікацію. Спробуйте пізніше',
  DB_UNAVAILABLE: 'Сервіс тимчасово недоступний. Спробуйте ще раз',
  INTERNAL: 'Щось пішло не так. Спробуйте ще раз',
};

export const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 422,
  RATE_LIMITED: 429,
  PUBLISH_IN_PROGRESS: 409,
  GITHUB_UNAVAILABLE: 503,
  DB_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fields: Record<string, string> | undefined;
  readonly problems: PublishProblem[] | undefined;

  constructor(
    code: ErrorCode,
    message?: string,
    options: {
      status?: number;
      fields?: Record<string, string>;
      problems?: PublishProblem[];
    } = {},
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'ApiError';
    this.code = code;
    this.status = options.status ?? HTTP_STATUS[code];
    this.fields = options.fields;
    this.problems = options.problems;
  }

  toBody(): ErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
        ...(this.problems ? { problems: this.problems } : {}),
      },
    };
  }
}

/** Сообщение при любой неудаче входа: одно и то же для логина и пароля (ТЗ 8.2, п. 3). */
export const LOGIN_FAILED_MESSAGE = 'Невірний логін або пароль';
