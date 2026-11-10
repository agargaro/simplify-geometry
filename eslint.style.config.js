import { defineConfig } from 'eslint/config';
import base from './eslint.config.js';

export default defineConfig([
  base,
  {
    files: ['src/**/*.ts'],
    rules: {
      'max-depth': ['warn', 3],
      'max-params': ['warn', 7],
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 20, skipBlankLines: true, skipComments: true, IIFEs: true }],
      complexity: ['warn', 10],
      'no-nested-ternary': 'warn',
      '@stylistic/max-len': ['warn', {
        code: 140,
        ignorePattern: '^\\s*(import |(export )?(async )?function )',
        ignoreComments: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
        ignoreUrls: true
      }],
      '@stylistic/padding-line-between-statements': ['warn',
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'always', prev: ['const', 'let'], next: '*' },
        { blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] }
      ]
    }
  }
]);
