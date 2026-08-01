import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'drizzle/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `any` defeats the point of running TypeScript in strict mode. Use
      // `unknown` at boundaries and parse it with Zod.
      '@typescript-eslint/no-explicit-any': 'error',

      // A non-null assertion is a claim the compiler cannot check. If you know
      // the value is there, prove it with a check or restructure the code.
      '@typescript-eslint/no-non-null-assertion': 'error',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // Exhaustiveness over discriminated unions is how a new error variant
      // surfaces every place that needs updating.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],

      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
    },
  },

  // The logger is the one place allowed to write to the console — it is the
  // transport. Everywhere else, a stray console.log is an un-queryable log line.
  {
    files: ['src/shared/logger.ts'],
    rules: { 'no-console': 'off' },
  },

  // Time and randomness are injected so behaviour stays testable. The adapters
  // that provide them are necessarily the exception.
  {
    files: ['src/shared/clock.ts', 'src/shared/id.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },

  {
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'drizzle-orm', message: 'domain/ must stay free of persistence concerns.' },
            { name: 'postgres', message: 'domain/ must stay free of persistence concerns.' },
            { name: 'react', message: 'domain/ must stay free of UI concerns.' },
            { name: 'next', message: 'domain/ must stay free of framework concerns.' },
          ],
          patterns: [
            {
              group: ['next/*', '@/modules/*'],
              message:
                'domain/ may import only shared/ and its own module. See docs/ARCHITECTURE.md §3.1.',
            },
          ],
        },
      ],
      // Domain rules are pure. What must not happen here is *reading the
      // current time* — constructing a Date from an instant already passed in
      // is fine, and `Date` as a type annotation obviously is too. So ban the
      // two expressions that reach for "now" rather than the identifier.
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'Take a Clock and pass the instant in — see src/shared/clock.ts.',
        },
        {
          object: 'Math',
          property: 'random',
          message: 'Take an IdGenerator instead — see src/shared/id.ts.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'new Date() reads the wall clock. Take a Clock and pass the instant in, so the rule ' +
            'can be tested at exact boundaries — see src/shared/clock.ts.',
        },
      ],
    },
  },

  {
    files: ['src/modules/*/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'drizzle-orm',
              message: 'Use cases depend on ports, not adapters. See docs/ARCHITECTURE.md §4.',
            },
          ],
          patterns: [
            {
              group: ['*/infrastructure/*', '@/modules/*/infrastructure/*'],
              message: 'Use cases depend on ports, not adapters.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'src/shared/testing/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      'no-console': 'off',
    },
  },

  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },

  // Root config files sit outside tsconfig's `include`, so the type-aware
  // rules have no program to consult. Lint them syntactically instead of
  // widening tsconfig to cover files the app never compiles.
  {
    files: ['*.config.{js,cjs,mjs,ts}', '.*.{js,cjs,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { module: 'writable', require: 'readonly', process: 'readonly' },
    },
    rules: { 'no-console': 'off', '@typescript-eslint/no-require-imports': 'off' },
  },
);
