import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

import effectResourceCleanup from './development/eslint-rules/effect-resource-cleanup.mjs';

// Single source of truth shared with `development/scripts/check-admin-complexity-drift.ts` — see
// that file's header and the block below for why this list exists and how to shrink it.
const ADMIN_COMPLEXITY_DEBT_PATH = fileURLToPath(
  new URL('development/scripts/admin-complexity-debt.json', import.meta.url)
);
const ADMIN_COMPLEXITY_DEBT_FILES = JSON.parse(readFileSync(ADMIN_COMPLEXITY_DEBT_PATH, 'utf8')).files.map(
  (entry) => entry.file
);

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
      // Agent worktrees. `.claude/worktrees/<name>/` is a real git worktree of this same repo
      // (gitignored via .git/info/exclude), so `eslint .` recurses into it and lints a SECOND,
      // independent checkout -- usually another session's in-progress branch. Verified 2026-08-19:
      // `npm run complexity` exited 1 solely on a stale copy of use-access-tokens.hooks.ts inside
      // one, a file already fixed on this branch in 5a23e102. Every reported path was a worktree
      // path; the same command with these excluded exits 0. CI never has this directory (it is a
      // fresh checkout), so this is a local-machine-only fix, exactly like dist-debug above --
      // without it a local complexity run reports failures that CI cannot reproduce.
      '.claude/worktrees/**',
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
  {
    /**
     * F06 option B (2026-08-10): `apps/admin` enforces the documented ≤9 cyclomatic / ≤9
     * cognitive-complexity ceiling as a hard error, not the repo-wide `warn`/15 the block near the
     * top of this file still sets everywhere else. Deliberately NOT a repo-wide flag day — ~114
     * pre-existing findings exist outside `apps/admin` today and are out of scope for this pass.
     *
     * Reconciliation note, so the two counts anyone finds for this task don't look like a
     * contradiction: measured AT THE REPO'S EXISTING 15/15 THRESHOLD, `apps/admin/src` has exactly
     * 3 findings (2 `complexity`, 1 `sonarjs/cognitive-complexity` — `Media.tsx`, `PostEditor.tsx`,
     * `Seo.tsx`, verified with `--rule '{"complexity":["error",15],"sonarjs/cognitive-complexity":
     * ["error",15]}'`). Measured AT THE 9/9 CEILING THIS BLOCK ACTUALLY SETS, the same directory has
     * 20 violating functions across 18 production files (`admin-complexity-debt.json`) — one
     * further test-only violation is excluded below rather than counted as debt, see that `ignores`
     * entry. Both counts are correct; they answer different questions — "what's already failing the
     * old bar" vs. "what violates the ceiling this repo documents but never enforced." The 18-file
     * debt list below is the 9/9 count, because 9/9 is what this block enforces.
     *
     * This block alone would also fail on every file listed in `admin-complexity-debt.json` — the
     * grandfather block directly below re-lowers exactly those files back to `warn`/15 (flat config
     * resolves later blocks over earlier ones for the same file+rule), so today's pre-existing debt
     * doesn't fail CI while any NEW apps/admin function over the line still does.
     */
    files: ['apps/admin/src/**/*.ts', 'apps/admin/src/**/*.tsx'],
    // Test files are excluded from this stricter gate entirely, not grandfathered as debt — a
    // complexity ceiling on test code (setup tables, parametrized assertions) is a different, and
    // weaker, argument than on production logic, and grandfathering implies "debt someone should pay
    // down," which isn't the claim here. They still get the repo-wide `warn`/15 from the block above.
    // `__measurements__/` is the same category under a different name: vitest files that assert
    // request counts and render costs rather than correctness (see the request-volume /
    // render-churn harnesses). They are setup tables and parametrized assertions exactly as above,
    // so the weaker-argument reasoning applies unchanged — they are not production logic and not
    // debt anyone should pay down.
    ignores: ['apps/admin/src/**/__tests__/**', 'apps/admin/src/**/__measurements__/**'],
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs },
    rules: {
      complexity: ['error', 9],
      'sonarjs/cognitive-complexity': ['error', 9],
    },
  },
  {
    // Resource-leak detection: a recurring bug shape found and fixed 2026-08-17 (see
    // `ADS-memory/reports/2026-08-17-resource-leak-sweep.md`) — a `useEffect` that opens a
    // browser-connection or timer resource with no cancellation path silently exhausts a shared,
    // finite resource (Chrome's 6-connections-per-origin cap, in the case that prompted this rule).
    // Scoped to `apps/admin/src` only: it is the one workspace in this repo with React hooks —
    // `packages/sdk` has none. Test files are excluded for the same reason the complexity block
    // above excludes them: this checks production hook shape, not test setup code.
    files: ['apps/admin/src/**/*.ts', 'apps/admin/src/**/*.tsx'],
    ignores: ['apps/admin/src/**/__tests__/**'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { local: { rules: { 'effect-resource-cleanup': effectResourceCleanup } } },
    rules: {
      'local/effect-resource-cleanup': 'error',
    },
  },
  {
    // Grandfathered debt for the block above — see `development/scripts/admin-complexity-debt.json`
    // for what's here and why, and `development/scripts/check-admin-complexity-drift.ts` (`npm run
    // check:admin-complexity-drift`) for the check that keeps this list from silently growing.
    files: ADMIN_COMPLEXITY_DEBT_FILES,
    rules: {
      complexity: ['warn', 15],
      'sonarjs/cognitive-complexity': ['warn', 15],
    },
  },
];
