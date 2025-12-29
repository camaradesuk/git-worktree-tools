import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'no-console': 'off',
      'no-case-declarations': 'warn',
      'prefer-const': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.js', '*.cjs', '*.mjs'],
  }
);
