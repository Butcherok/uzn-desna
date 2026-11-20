import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Админка отдаётся сервером с `/admin/` (решение 040). В разработке запросы
 * к API уходят на локальный сервер: `npm run dev --workspace server`.
 */
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
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
