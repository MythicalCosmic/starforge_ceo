import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Keep the stable Hooks correctness rules. react-hooks 7 also ships
      // opt-in compiler diagnostics that require a dedicated migration and
      // should not silently change this project's release gate.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          // Context modules intentionally co-export their provider and its
          // consumer hook. Keep Fast Refresh enforcement everywhere else
          // without forcing these stable public APIs into artificial files.
          allowExportNames: [
            'Icons',
            'PALETTES',
            'useAuth',
            'usePreferences',
            'useScope',
          ],
        },
      ],
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    // This module intentionally exports one immutable registry of pre-rendered
    // SVG nodes, not a Fast Refresh component boundary.
    files: ['src/components/Icons.jsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
];
