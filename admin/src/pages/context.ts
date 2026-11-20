/**
 * Общее состояние открытой админки: кто вошёл, полоса публикации, сообщения.
 */
import { createContext, useContext } from 'react';
import type { User } from '../domain/kinds';

export interface Notice {
  text: string;
  /** Кнопка отмены у обратимого действия (ТЗ 9.4, п. 3). */
  undo?: { label: string; run: () => void };
}

export interface AdminCtx {
  user: User;
  /** Число неопубликованных правок пришло в ответе записи. */
  setPending: (n: number) => void;
  notify: (n: Notice | null) => void;
  /** Передаётся в запросы: показывает «Сервіс прокидається…» (ТЗ 8.7, п. 2). */
  onSlow: (slow: boolean) => void;
  /** Сессия кончилась (401): обратно к форме входа. */
  signedOut: () => void;
}

export const Ctx = createContext<AdminCtx | null>(null);

export function useAdmin(): AdminCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAdmin outside provider');
  return c;
}
