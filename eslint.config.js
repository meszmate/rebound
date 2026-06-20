// Flat ESLint config for Rebound.
//
// Three worlds live in this repo, each with different globals and language
// levels, so we scope rules by path:
//   * client/js/**   browser/CEP panel code (modern JS, browser globals)
//   * host/**        ExtendScript host code (ES3, the `$`/`app` globals)
//   * tools/ + test/ Node.js tooling and Vitest specs (ESM, node globals)

import js from '@eslint/js';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  localStorage: 'readonly',
  CustomEvent: 'readonly',
  // CEP / vendored
  CSInterface: 'readonly',
  SystemPath: 'readonly',
  cep: 'readonly',
  cep_node: 'readonly',
  __adobe_cep__: 'readonly',
  Rebound: 'writable',
};

const extendscriptGlobals = {
  $: 'readonly',
  app: 'readonly',
  Folder: 'readonly',
  File: 'readonly',
  KeyframeInterpolationType: 'readonly',
  KeyframeEase: 'readonly',
  PropertyValueType: 'readonly',
  PropertyType: 'readonly',
  LayerQuality: 'readonly',
  BlendingMode: 'readonly',
  system: 'readonly',
  JSON: 'writable',
};

const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  module: 'writable',
  require: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  Buffer: 'readonly',
  globalThis: 'readonly',
};

export default [
  { ignores: ['client/js/lib/**', 'dist/**', 'coverage/**', 'node_modules/**'] },
  js.configs.recommended,

  // Browser / CEP panel code.
  {
    files: ['client/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: browserGlobals,
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none' }],
      'no-var': 'off',
    },
  },

  // ExtendScript host (ES3). Keep the linter lenient — this is a legacy dialect.
  {
    files: ['host/**/*.jsx', 'host/**/*.jsxinc'],
    languageOptions: {
      ecmaVersion: 3,
      sourceType: 'script',
      globals: extendscriptGlobals,
    },
    rules: {
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-prototype-builtins': 'off',
    },
  },

  // Node tooling + tests (ESM).
  {
    files: ['tools/**/*.mjs', 'test/**/*.{js,mjs}', '*.config.js', 'vitest.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: nodeGlobals,
    },
  },
];
