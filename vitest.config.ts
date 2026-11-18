import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'shared/src/**/*.test.ts',
      'site/src/**/*.test.ts',
      'server/src/**/*.test.ts',
      'scripts/src/**/*.test.ts',
    ],
    environment: 'node',
  },
});
