// ESLint: catches likely bugs (undefined names, unreachable code, duplicate keys...). Style rules are off on purpose.
// Run with `npm run lint` (after `npm install`). CI runs it on every push.
// Lints the script inside index.html and the HTML guides/tests (eslint-plugin-html), plus the standalone .js files.
import js from '@eslint/js';
import html from 'eslint-plugin-html';
import globals from 'globals';

// What tests/lib.js defines for the test pages that load it.
const testLib = Object.fromEntries([
  'sleep', 'F', 'W', 'D', 'errors', 'dialogs', 'confirmAnswer', 'promptAnswers', 'load', '$', 'q', 'qa', 'click', 'type',
  'select', 'setBase', 'divideRow', 'rowCells', 'snap', 'hash', 'results', 'failures', 'check', 'done', 'decodeBlob',
].map((n) => [n, 'writable']));

export default [
  { ignores: ['node_modules/', '_site/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: globals.browser },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // `try { localStorage... } catch (e) {}` is deliberate: storage can be blocked, and the app carries on without it.
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
      // The tests match runs of spaces in aligned output (Terraform, YAML) on purpose.
      'no-regex-spaces': 'off',
    },
  },
  { files: ['**/*.html'], plugins: { html } },
  { files: ['eslint.config.mjs', 'tests/*.mjs'], languageOptions: { sourceType: 'module', globals: globals.node } },
  { files: ['sw.js'], languageOptions: { globals: globals.serviceworker } },
  // lib.js defines helpers for the test pages, so its top-level names are "unused" here.
  { files: ['tests/lib.js'], rules: { 'no-unused-vars': ['error', { vars: 'local', caughtErrors: 'none' }] } },
  { files: ['tests/*.html'], languageOptions: { globals: testLib } },
];
