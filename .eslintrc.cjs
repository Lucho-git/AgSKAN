module.exports = {
	root: true,
	extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'plugin:svelte/recommended', 'prettier'],
	parser: '@typescript-eslint/parser',
	plugins: ['@typescript-eslint'],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
		extraFileExtensions: ['.svelte']
	},
  overrides: [
    {
      files: ['*.svelte'],
      parser: 'svelte-eslint-parser',
      parserOptions: {
        parser: {
          // Specify a parser for each lang.
          ts: '@typescript-eslint/parser',
          js: 'espree',
          typescript: '@typescript-eslint/parser'
        }
      }
    },
    {
      // Tests build partial fakes of Supabase rows and clients on purpose.
      files: ['*.test.ts', '*.test.js', 'src/lib/test/**'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/ban-ts-comment': ['error', { 'ts-nocheck': false }]
      }
    }
  ],
	env: {
		browser: true,
		es2017: true,
		node: true
	},
  rules: {
    'no-undef': 'off'
    // no-undef has been turned off because of this:
    // basically, it causes issues and TS does those checks so it's redundant
    // https://typescript-eslint.io/linting/troubleshooting#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
  }
};
