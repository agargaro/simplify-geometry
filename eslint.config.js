import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';

const formatting = stylistic.configs.customize({
  jsx: false,
  semi: true,
  commaDangle: 'never',
  arrowParens: true,
  braceStyle: '1tbs',
  quoteProps: 'as-needed'
});

const runtimeSyntax = [
  { selector: 'BinaryExpression[operator="in"]', message: 'Read an is* flag instead of the in operator.' },
  { selector: 'BinaryExpression[operator="instanceof"]', message: 'Read an is* flag instead of instanceof.' },
  { selector: 'ForOfStatement', message: 'Use an indexed for loop with a precomputed length.' },
  { selector: 'ForInStatement', message: 'Use an indexed for loop with a precomputed length.' },
  { selector: 'ForStatement > BinaryExpression.test > MemberExpression.right[property.name="length"]', message: 'Precompute the length: for (let i = 0, l = array.length; i < l; i++).' },
  { selector: 'CallExpression[callee.property.name=/^(forEach|map|filter|reduce|reduceRight|some|every|find|findIndex|findLast|findLastIndex|flatMap)$/]', message: 'Use an indexed for loop instead of a callback array method.' },
  { selector: 'UnaryExpression[operator="delete"]', message: 'delete changes the object shape; assign undefined or null instead.' }
];

export default defineConfig([
  { ignores: ['build/**', '.cache/**', '.claude/worktrees/**'] },
  { files: ['**/*.js'], extends: [js.configs.recommended, formatting] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.strictTypeChecked, formatting],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-use-before-define': ['error', { functions: false }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error'
    }
  },
  {
    files: ['examples/**/*.ts', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...runtimeSyntax],
      'prefer-rest-params': 'error',
      '@stylistic/object-curly-newline': ['error', { ImportDeclaration: 'never' }]
    }
  }
]);
