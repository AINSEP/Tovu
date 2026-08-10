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
      // `**/dist/**` only matches a directory literally named `dist` — `dist-debug` is a
      // different name and slips through. A local debug build under this folder is dev-machine
      // state, not a CI artifact, but its unminified bundle can carry the original source's
      // inline `eslint-disable` comments, which `npm run complexity` then chokes on (verified:
      // reproduced against the debug build already present in this checkout — "Definition for
      // rule '...' was not found" for two disabled rules the minimal complexity-only config
      // doesn't load). CI never has this directory, so this is a local-machine-only fix.
      'apps/admin/dist-debug/**',
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
    files: ['apps/admin/src/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    /**
     * Required because this block widened `files` past `.ts`/`.tsx`. The
     * complexity block above pairs its TS-only glob with `tseslint.parser`;
     * without repeating that here, `.js`/`.jsx` fell through to default espree
     * with JSX disabled, so a single `.jsx` file containing real JSX was a hard
     * PARSE error — and since `npm run complexity` is now a blocking CI step,
     * that would have failed the build on syntax this rule never intended to
     * gate. No such file exists today, which is exactly why it would have
     * landed on whoever added the first one.
     */
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    /**
     * Exactly the one adapter that legitimately needs the library, not a
     * wildcard. `adapter.*` exempted any file in that directory whose name
     * merely started with `adapter.` — an external probe walked through it with
     * `adapter.shadow.js`. A future `adapter.local.tsx` (the documented
     * rip-out target) does not need an exemption, because the whole point of
     * it is that it does NOT import TanStack.
     */
    ignores: ['apps/admin/src/lib/fetch-query/adapter.tanstack.{ts,tsx}'],
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
      /**
       * `no-restricted-imports` only sees STATIC import/export-from
       * declarations. `await import('@tanstack/react-query')` sails past it,
       * which an external probe confirmed: the rule reported nothing and the
       * build was clean. A dynamic import pins the dependency exactly as hard
       * as a static one, so the boundary has to cover both or it is decorative.
       */
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportExpression[source.value=/^@tanstack(\\u002F|$)/]",
          message:
            'Dynamic import of TanStack Query is restricted for the same reason a static one is: it pins the dependency outside lib/fetch-query/adapter.tanstack.tsx and voids the rip-out guarantee.',
        },
        {
          /**
           * `no-restricted-imports` registers listeners only for
           * `ImportDeclaration`, `ExportNamedDeclaration`, `ExportAllDeclaration`
           * and `TSImportEqualsDeclaration` — so `require('@tanstack/...')` in a
           * `.cjs` file was clean even after that file type was added to the
           * glob. Third mechanism, same hole.
           */
          selector:
            "CallExpression[callee.name='require'][arguments.0.value=/^@tanstack(\\u002F|$)/]",
          message:
            'require() of TanStack Query is restricted for the same reason import is: it pins the dependency outside lib/fetch-query/adapter.tanstack.tsx and voids the rip-out guarantee.',
        },
      ],
    },
  },
];
