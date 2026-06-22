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
  prompt: 'readonly',
  confirm: 'readonly',
  alert: 'readonly',
  matchMedia: 'readonly',
  ResizeObserver: 'readonly',
  MutationObserver: 'readonly',
  IntersectionObserver: 'readonly',
  performance: 'readonly',
  Promise: 'readonly',
  // Web APIs used by the cross-app import path.
  FileReader: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  URL: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  // CEP / vendored
  CSInterface: 'readonly',
  CSEvent: 'readonly',
  SystemPath: 'readonly',
  cep: 'readonly',
  cep_node: 'readonly',
  __adobe_cep__: 'readonly',
  Rebound: 'writable',
  // UMD modules (easing, units) reference these under a guard so the same file
  // runs in the browser and under Node tests.
  module: 'readonly',
  require: 'readonly',
  globalThis: 'readonly',
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
  CompItem: 'readonly',
  FootageItem: 'readonly',
  FolderItem: 'readonly',
  Property: 'readonly',
  PropertyGroup: 'readonly',
  AVLayer: 'readonly',
  Layer: 'readonly',
  ShapeLayer: 'readonly',
  TextLayer: 'readonly',
  CameraLayer: 'readonly',
  LightLayer: 'readonly',
  LightType: 'readonly',
  MaskPropertyGroup: 'readonly',
  MaskMode: 'readonly',
  TrackMatteType: 'readonly',
  Shape: 'readonly',
  SolidSource: 'readonly',
  FileSource: 'readonly',
  ImportOptions: 'readonly',
  ParagraphJustification: 'readonly',
  TextDocument: 'readonly',
  Date: 'readonly',
  Math: 'readonly',
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
  { ignores: ['client/js/lib/**', 'dist/**', 'coverage/**', 'node_modules/**', 'tools/_*', 'plugins/figma/dist/**'] },
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
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-prototype-builtins': 'off',
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
      // Best-effort host calls intentionally swallow unsupported-API errors.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Shared cross-plugin libs. Plain ES5 UMD so the exact same file runs in the
  // CEP panel (script tag), the ExtendScript host (evalFile), Node/Vitest, and
  // the Figma plugin bundler. Keep it to the ES3/ES5 common denominator.
  {
    files: ['shared/**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: {
        module: 'writable',
        exports: 'writable',
        define: 'readonly',
        globalThis: 'readonly',
        self: 'readonly',
        window: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-prototype-builtins': 'off',
      'no-var': 'off',
    },
  },

  // Node tooling + tests (ESM).
  {
    files: ['tools/**/*.mjs', 'plugins/**/*.mjs', 'test/**/*.{js,mjs}', '*.config.js', 'vitest.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: nodeGlobals,
    },
  },

  // Figma plugin source (the sandbox main thread and the UI iframe). Modern JS,
  // bundled at build time; the shared libs supply the Rebound* globals.
  {
    files: ['plugins/figma/src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'script',
      globals: {
        figma: 'readonly',
        __html__: 'readonly',
        parent: 'readonly',
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        console: 'readonly',
        globalThis: 'readonly',
        ReboundNormalize: 'readonly',
        ReboundBezier: 'readonly',
        ReboundFigma: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Illustrator + Photoshop exporters (ExtendScript, ES3). These host DOMs expose
  // a huge surface of constructors and enums, so no-undef is off here.
  {
    files: ['plugins/illustrator/**/*.{js,jsx}', 'plugins/photoshop/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 3,
      sourceType: 'script',
      globals: { ...extendscriptGlobals, alert: 'readonly' },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-prototype-builtins': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
