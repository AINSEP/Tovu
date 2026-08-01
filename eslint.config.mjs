import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'AI-Dev-Shop/**',
      'ADS-memory/**',
    ],
  },
  {
    // Pre-existing inline `eslint-disable` comments in this repo reference rules
    // from plugins this minimal config intentionally does not load (e.g.
    // react-hooks/exhaustive-deps, @typescript-eslint/no-explicit-any). Without
    // this, ESLint errors with "Definition for rule '...' was not found" on
    // every such comment, flooding a complexity-only run with unrelated errors.
    linterOptions: { noInlineConfig: true },
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs },
    rules: {
      complexity: ['warn', 15],
      'sonarjs/cognitive-complexity': ['warn', 15],
    },
  },
  {
    /**
     * Keeps `@tanstack/react-query` rippable.
     *
     * The admin talks to server state through `lib/fetch-query`, whose whole
     * value proposition is that swapping the implementation touches one file
     * and no call sites. That is only true while the library has exactly one
     * importer. A single direct `useQuery` somewhere in a section would pin
     * the dependency in place and silently void the guarantee — the kind of
     * thing that is invisible in review and only discovered when someone
     * actually tries to remove it.
     *
     * `error`, not `warn`: a warning here would be indistinguishable from the
     * complexity warnings above, which this repo already tolerates.
     */
    /**
     * Every module format Vite will actually bundle, not just the TypeScript
     * ones. Scoped to `.ts`/`.tsx` this rule had a hole an external review
     * walked straight through: `apps/admin/src/anything.js` importing
     * `@tanstack/react-query` linted clean and pinned the dependency outside
     * the adapter, which is precisely the failure the rule exists to prevent.
     * Verified by probe in both directions.
     */
    files: ['apps/admin/src/**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ignores: ['apps/admin/src/lib/fetch-query/adapter.*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@tanstack/*'],
              message:
                'Import from "lib/fetch-query" instead. TanStack Query is confined to lib/fetch-query/adapter.tanstack.tsx so it stays replaceable — see that directory\'s index.ts for the rip-out procedure.',
            },
          ],
        },
      ],
    },
  },
];
