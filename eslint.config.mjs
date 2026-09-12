// Lint rules chosen to guard the things this codebase cares about and nothing else. The
// house style is long, explanatory names, so `id-length` sets a floor rather than a ceiling
// and there is no line-length rule fighting it.
export default [
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      // Real mistakes.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-shadow': 'error',
      'no-return-assign': 'error',
      'no-fallthrough': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'array-callback-return': 'error',
      'require-atomic-updates': 'error',
      eqeqeq: ['error', 'always'],
      'no-implicit-coercion': ['error', { boolean: false }],

      // The house style: names spell out what they mean, so nothing one or two letters long.
      // Property keys are often the format's own spelling (the %Y of a layout, a box type),
      // so the floor applies to names the code chose, not to data it is matching.
      'id-length': ['error', {
        min: 3,
        properties: 'never',
        exceptions: ['at', 'id', 'to', 'fs', 'os', 'TZ'],
      }],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-template': 'error',
      'arrow-body-style': ['error', 'as-needed'],

      // Layout, kept light.
      indent: ['error', 2, { SwitchCase: 1, flatTernaryExpressions: true, ignoredNodes: ['ConditionalExpression'] }],
      quotes: ['error', 'single', { avoidEscape: true }],
      semi: ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'no-trailing-spaces': 'error',
      'eol-last': ['error', 'always'],
    },
  },
];
