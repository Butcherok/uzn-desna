/**
 * Встроенный скрипт темы (решение 058): что он делает при загрузке страницы.
 * Скрипт выполняется в песочнице `node:vm` с минимальными заменами
 * `document`, `localStorage` и `matchMedia`; нажатия и картинку первого
 * экрана проверяет живой прогон в браузере.
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const SCRIPT = readFileSync(new URL('./boot.js', import.meta.url), 'utf8');

function run(system: 'light' | 'dark', saved: string | null, storageWorks = true) {
  const store = new Map<string, string>(saved === null ? [] : [['uzn-theme', saved]]);
  const dataset: Record<string, string> = {};
  const fail = () => {
    throw new Error('storage disabled');
  };
  const sandbox = {
    document: {
      documentElement: { dataset },
      addEventListener: () => undefined,
      querySelectorAll: () => [],
    },
    localStorage: storageWorks
      ? {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => store.set(key, value),
          removeItem: (key: string) => store.delete(key),
        }
      : { getItem: fail, setItem: fail, removeItem: fail },
    matchMedia: () => ({ matches: system === 'dark', addEventListener: () => undefined }),
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    Element: class {},
    requestAnimationFrame: () => 0,
  };
  runInNewContext(SCRIPT, sandbox);
  return { theme: dataset.theme, js: 'js' in dataset, saved: store.get('uzn-theme') ?? null };
}

describe('встроенный скрипт темы', () => {
  it('без сохранённого выбора — тема системы, атрибута нет', () => {
    expect(run('light', null)).toEqual({ theme: undefined, js: true, saved: null });
    expect(run('dark', null)).toEqual({ theme: undefined, js: true, saved: null });
  });

  it('выбор, отличный от системы, ставится на <html> и хранится', () => {
    expect(run('light', 'dark')).toEqual({ theme: 'dark', js: true, saved: 'dark' });
    expect(run('dark', 'light')).toEqual({ theme: 'light', js: true, saved: 'light' });
  });

  it('выбор, совпавший с системой, стирается: хранится только отличие', () => {
    expect(run('dark', 'dark')).toEqual({ theme: undefined, js: true, saved: null });
  });

  it('чужое значение в хранилище не применяется', () => {
    expect(run('light', 'blue').theme).toBeUndefined();
  });

  it('хранилище недоступно — тема системы, скрипт не падает', () => {
    const result = run('light', 'dark', false);
    expect(result.theme).toBeUndefined();
    expect(result.js).toBe(true);
  });

  it('укладывается в 2 КБ (ТЗ 11.2, В1)', () => {
    expect(Buffer.byteLength(SCRIPT)).toBeLessThanOrEqual(2048);
  });
});
