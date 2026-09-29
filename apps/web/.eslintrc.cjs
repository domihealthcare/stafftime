module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-hooks', 'react-refresh'],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'node_modules'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
  overrides: [
    {
      // The clinical forms hold patient details, which must never leave the
      // browser or be kept in it (September 2026). Nothing in this folder may
      // talk to the server, store anything, or log anything. If one of these
      // fires, the answer is almost certainly a different design, not an
      // exception — see docs/architecture.md, "The clinical forms".
      files: ['src/clinical/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['**/lib/api', '**/lib/api.ts'],
                message: 'The clinical forms never talk to the server.',
              },
            ],
          },
        ],
        'no-restricted-globals': [
          'error',
          ...['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'Request'].map((name) => ({
            name,
            message: 'The clinical forms never send anything anywhere.',
          })),
          ...['localStorage', 'sessionStorage', 'indexedDB', 'caches'].map((name) => ({
            name,
            message: 'The clinical forms keep nothing in the browser.',
          })),
        ],
        'no-restricted-properties': [
          'error',
          { object: 'navigator', property: 'sendBeacon', message: 'Nothing is sent anywhere.' },
          { object: 'document', property: 'cookie', message: 'Nothing is kept in the browser.' },
          ...['fetch', 'localStorage', 'sessionStorage', 'indexedDB', 'caches'].map((property) => ({
            object: 'window',
            property,
            message: 'Nothing is sent anywhere or kept in the browser.',
          })),
        ],
        'no-console': 'error',
      },
    },
  ],
};
