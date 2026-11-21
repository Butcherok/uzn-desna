/**
 * Что показывает полоса публикации (ТЗ 8.5, п. 6; ТЗ 9.3; решение 041).
 * Чистая функция от ответа `/publish/status`: какой текст и есть ли кнопка.
 * Кнопки нет, когда нажимать нечего или нажатие не сработает: неработающая
 * кнопка выглядит сломанной (решение 040).
 */

export type RunResult = 'in_progress' | 'success' | 'failure';

export interface PublishRunView {
  runId: number;
  runUrl: string;
  startedAt: string;
  startedBy: string | null;
  result: RunResult;
  finishedAt: string | null;
}

export interface PublishStatus {
  lastPublishedAt: string | null;
  pendingChanges: number;
  configured: boolean;
  run: PublishRunView | null;
}

export interface PublishProblem {
  kind: string;
  label: string;
  id: string | null;
  title: string;
  message: string;
}

export type BarTone = 'plain' | 'progress' | 'error';

export interface BarView {
  tone: BarTone;
  text: string;
  showButton: boolean;
  /** Опрашивать `/publish/status`, пока идёт прогон. */
  poll: boolean;
}

export const PUBLISH_STARTED = "Зміни з'являться на сайті протягом кількох хвилин.";
export const POLL_INTERVAL_MS = 20_000;

export function barView(s: PublishStatus | null, pluralChanges: (n: number) => string): BarView {
  if (!s) {
    return {
      tone: 'plain',
      text: 'Стан публікації завантажується…',
      showButton: false,
      poll: false,
    };
  }
  if (s.run?.result === 'in_progress') {
    return {
      tone: 'progress',
      text: `Публікація триває. ${PUBLISH_STARTED}`,
      showButton: false,
      poll: true,
    };
  }
  const failed = s.run?.result === 'failure';
  if (s.pendingChanges === 0) {
    return { tone: 'plain', text: 'Усі зміни опубліковано.', showButton: false, poll: false };
  }
  const pending = `Не опубліковано: ${pluralChanges(s.pendingChanges)} — на сайті ще не видно.`;
  if (!s.configured) {
    return {
      tone: 'plain',
      text: `${pending} Публікацію ще не налаштовано — зверніться до власника.`,
      showButton: false,
      poll: false,
    };
  }
  return {
    tone: failed ? 'error' : 'plain',
    text: failed ? `Остання публікація не вдалася. ${pending}` : pending,
    showButton: true,
    poll: false,
  };
}
