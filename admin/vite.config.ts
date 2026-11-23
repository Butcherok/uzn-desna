import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Админка отдаётся сервером с `/admin/` (решение 040). В разработке запросы
 * к API уходят на локальный сервер: `npm run dev --workspace server`.
 */
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  // Карточки сайта (`site/src/components/cards`, решение 046) лежат вне пакета:
  // один экземпляр React на админку и карточки.
  resolve: { dedupe: ['react', 'react-dom'] },
  // Для всех файлов — настройки TypeScript админки. Иначе Vite берёт ближайший
  // `tsconfig.json` к файлу, у карточек это `site/tsconfig.json`, а он
  // ссылается на `astro/tsconfigs/strict` — Astro на Render не ставится
  // (решение 037), и сборка падает (проверено 23.11.2026 командой из render.yaml).
  tsconfig: 'tsconfig.json',
  server: {
    port: 5173,
    strictPort: true,
    // Шрифты и токены берутся из дизайн-системы сайта (`site/src/styles`).
    fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    // Встроенные data:-шрифты и скрипты запретила бы политика содержимого.
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
