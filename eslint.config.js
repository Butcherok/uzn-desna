import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

/** Запрет импортов между слоями — требование ТЗ 10.2, п. 1. */
const layerRules = {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: ['**/gateway/*', '**/gateway', '**/components/*', '**/components'],
          message:
            'Слой domain не импортирует gateway и components (ТЗ 10.2, п. 1). Передавайте данные параметром.',
        },
      ],
    },
  ],
};

export default [
  { ignores: ['**/dist/**', '**/.astro/**', 'node_modules/**', 'docs/design/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs,js}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['site/src/domain/**/*.ts', 'server/src/domain/**/*.ts'],
    rules: layerRules,
  },
  {
    files: ['site/src/components/**/*.{ts,tsx}'],
    rules: layerRules,
  },
];
