import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';

import effectResourceCleanup from './development/eslint-rules/effect-resource-cleanup.mjs';

// Single source of truth shared with `development/scripts/check-admin-complexity-drift.ts` — see
// that file's header and the block below for why this list exists and how to shrink it.
//
// `admin-complexity-debt.json` is keyed per-VIOLATION (rule, file, reason), not per-file — see its
// own `_comment_2026-09-05_per_function` for why (a per-file debt list let every OTHER function in
// a listed file drift unnoticed). ESLint's flat config has no function-level scope, only file
// globs, so this block can only ever relax a whole FILE — that is unchanged and intentional; the
// per-function precision lives in check-admin-complexity-drift.ts's own --rule override, which
// re-lints at the strict ceiling ignoring this relax block entirely. Dedup with `Set` because two
// violations (one `complexity`, one `sonarjs/cognitive-complexity`) can name the same file.
const ADMIN_COMPLEXITY_DEBT_PATH = fileURLToPath(
  new URL('development/scripts/admin-complexity-debt.json', import.meta.url)
);
const ADMIN_COMPLEXITY_DEBT_FILES = [
  ...new Set(
    JSON.parse(readFileSync(ADMIN_COMPLEXITY_DEBT_PATH, 'utf8')).violations.map((entry) => entry.file)
  ),
];

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
     * sonarjs expansion, 2026-08-31. `eslint-plugin-sonarjs` v4.2.0 ships 279 rules; before this
     * block only `cognitive-complexity` (above) was on. A report-only pass with all 279 forced to
     * `warn` was run across the repo (no autofix, no tracked-source changes) to measure real counts
     * before enabling anything for real — see the report this block's dispatch produced for the full
     * per-rule table and file:line samples. 76 rules actually fired; the rest never matched anything
     * in this codebase (many need frameworks not in use here — AWS CDK, Angular — or type-aware
     * linting this config doesn't run, see the `off` block below for that group).
     *
     * Every rule below was spot-checked by reading real source at the reported line, not just
     * counted — this repo's own `AGENTS.md` warns raw analyzer counts here have been inflated 5-7x
     * before by generated files and same-file-only usages, and that pattern repeated: five of the
     * highest-volume rules turned out to be near-100% noise once read (see the `off` block).
     *
     * Nothing here is promoted to `error`. `npm run complexity` is a blocking CI step and several
     * of these rules have small amounts of pre-existing, real debt (counts below); flipping to
     * `error` today would fail the gate for everyone on this branch over unrelated findings. Rules
     * marked (0-2 hits) below are effectively free to promote once that debt is fixed — see the
     * dispatch report for the exact file:line list.
     */
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs },
    rules: {
      // True-bug shape, near-zero or zero current hits — cheapest rules to promote to `error` after
      // a trivial fix-up (counts from the measurement pass, repo-wide). Promoted 2026-08-31: every
      // hit from the measurement pass was fixed (or, for the two `no-trivial-assertions` hits that
      // turned out to be deliberate, exempted via the file-scoped override block below — this
      // config's `noInlineConfig: true` makes a per-line disable comment inert, so a whole-rule
      // repo-wide promotion needs a glob-scoped carve-out instead). Zero warn-level debt remains for
      // any of these ten.
      'sonarjs/no-extra-arguments': 'error',
      'sonarjs/no-floating-point-equality': 'error',
      'sonarjs/no-ignored-exceptions': 'error',
      'sonarjs/no-unused-collection': 'error',
      'sonarjs/no-all-duplicated-branches': 'error',
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/array-constructor': 'error',
      'sonarjs/no-redundant-assignments': 'error',
      'sonarjs/no-redundant-jump': 'error',
      'sonarjs/no-trivial-assertions': 'error',
      // Real bug/readability shape, verified against source, moderate volume — genuinely useful but
      // not zero-debt, so `warn` for now.
      'sonarjs/no-dead-store': 'warn',
      'sonarjs/no-unused-function-argument': 'warn',
      'sonarjs/no-nested-conditional': 'warn',
      'sonarjs/no-nested-template-literals': 'warn',
      'sonarjs/no-nested-incdec': 'warn',
      'sonarjs/no-nested-assignment': 'warn',
      'sonarjs/nested-control-flow': 'warn',
      'sonarjs/too-many-break-or-continue-in-loop': 'warn',
      'sonarjs/elseif-without-else': 'warn',
      'sonarjs/no-inconsistent-returns': 'warn',
      'sonarjs/expression-complexity': 'warn',
      'sonarjs/bool-param-default': 'warn',
      'sonarjs/declarations-in-global-scope': 'warn',
      // TypeScript hygiene, low noise.
      'sonarjs/redundant-type-aliases': 'warn',
      'sonarjs/use-type-alias': 'warn',
      'sonarjs/no-redundant-optional': 'warn',
      // Severe-if-real security shape (dynamic SQL, code injection). Only fires in test/dev-tooling
      // fixtures today (6 hits total, 0 in production source) — `warn`, not `off`, because unlike the
      // hardcoded-literal/PRNG cluster below these two don't have a structural false-positive source
      // in this codebase; a future hit is worth a human look.
      'sonarjs/sql-queries': 'warn',
      'sonarjs/code-eval': 'warn',
      // Visibility/hygiene, low volume.
      'sonarjs/todo-tag': 'warn',
      'sonarjs/fixme-tag': 'warn',
      'sonarjs/no-skipped-tests': 'warn',
      'sonarjs/no-commented-code': 'warn',
      // Test-quality rules — this repo already cares about assertion strength (see
      // feedback_assert_exact_error_text in project memory); these three catch weaker versions of
      // the same problem class.
      'sonarjs/prefer-specific-assertions': 'warn',
      'sonarjs/assertions-in-tests': 'warn',
      'sonarjs/no-fixed-wait-in-tests': 'warn',
      'sonarjs/no-identical-functions': 'warn',
      'sonarjs/parameterized-tests': 'warn',
      'sonarjs/public-static-readonly': 'warn',
      // Regex readability micro-smells, very low volume (10 hits total across 4 rules).
      'sonarjs/concise-regex': 'warn',
      'sonarjs/duplicates-in-character-class': 'warn',
      'sonarjs/regex-complexity': 'warn',
      'sonarjs/single-character-alternation': 'warn',
    },
  },
  {
    // `sonarjs/no-duplicate-string` is real and worth keeping (158 production hits, verified), but
    // 90% of its repo-wide volume (1484/1642) is test files legitimately repeating the same literal
    // across many `it()` blocks — scoped out here the same way the complexity blocks below scope out
    // test directories, just repo-wide since this rule's noise isn't apps/admin-specific.
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      '**/__tests__/**',
      '**/__measurements__/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      'development/e2e/**',
    ],
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs },
    rules: {
      'sonarjs/no-duplicate-string': 'warn',
    },
  },
  {
    // `no-hardcoded-passwords` / `no-hardcoded-secrets` are the highest-value rules in the
    // hardcoded-literal cluster (a real future leaked secret is worth catching), but every hit found
    // in apps/admin during the measurement pass was a translation-dictionary VALUE like `"Owner
    // password": "Besitzer-Passwort"` — copy, not a credential (see
    // reference_admin_copy_string_is_i18n_key in project memory: an admin copy string is its own
    // i18n key, and these files are literally hundreds of UI-label entries). Scoped off there; kept
    // warn everywhere else.
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['**/*-i18n.ts', '**/*-i18n.tsx'],
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs },
    rules: {
      'sonarjs/no-hardcoded-passwords': 'warn',
      'sonarjs/no-hardcoded-secrets': 'warn',
    },
  },
  {
    // Deliberately left OFF. Each was measured, then verified by reading real source at the reported
    // line before being rejected — not rejected on volume alone. See the dispatch report for the
    // full file:line evidence behind each of these.
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs },
    rules: {
      // Pure style/formatting opinions with no functional finding behind them — this repo's
      // formatter's job, not a lint gate's.
      'sonarjs/arrow-function-convention': 'off', // arrow-paren style; 6346 hits, the single largest source of noise in the whole survey
      'sonarjs/shorthand-property-grouping': 'off', // object-property ordering; cosmetic only
      // Needs configuration this repo doesn't have; with no config it produces a false positive on
      // (effectively) every file.
      'sonarjs/file-header': 'off', // requires a license/header template; fired on all 2567 scanned files
      'sonarjs/no-reference-error': 'off', // needs browser/DOM `globals`; flags window/document/HTMLElement/ResizeObserver etc. as undefined
      // Actively wrong for this codebase's conventions — verified, not just "noisy".
      'sonarjs/no-implicit-dependencies': 'off', // doesn't resolve this repo's `@/` tsconfig path alias; flags nearly every aliased import as an undeclared dependency
      'sonarjs/function-name': 'off', // camelCase-only regex rejects PascalCase, mandatory for React/JSX component functions
      'sonarjs/no-undefined-assignment': 'off', // fights this codebase's (and TS optional-property) convention of `undefined` for absence, not `null` — verified against test fixtures asserting exactly that semantics
      'sonarjs/no-wildcard-import': 'off', // fires on deliberate barrel `export *` re-exports and `import * as X` test-mocking, both idiomatic here
      'sonarjs/max-union-size': 'off', // default cap of 3 conflicts with ordinary TS discriminated-union/status modeling
      'sonarjs/no-small-switch': 'off', // fired only in panels.tsx's uniform switch-per-view convention (~15 panels); the flagged ones just currently have 2 cases, not a design smell
      'sonarjs/file-name-differ-from-class': 'off', // only hit was a Playwright `*.globalSetup.ts` file — that's Playwright's naming convention, not a mismatch
      // Raw size/complexity metrics duplicating a gate this file already enforces differently, or
      // that this agent's own governing skill treats as never a standalone finding.
      'sonarjs/cyclomatic-complexity': 'off', // duplicates the `complexity` core rule already tiered per-scope in this file at a third default threshold (10)
      'sonarjs/max-lines-per-function': 'off', // raw function size; never a standalone finding per this agent's own function-quality-assessment skill
      'sonarjs/max-lines': 'off', // same size-metric objection, and fires mostly on `*-i18n.{ts,tsx}` flat translation dictionaries that are large by design
      // Duplicates biome, which already runs repo-wide via `npm run lint` (recommended preset).
      'sonarjs/no-unused-vars': 'off', // duplicates biome's `noUnusedVariables`
      'sonarjs/unused-import': 'off', // duplicates biome's `noUnusedImports`
      // Security/hardcoded-literal rules with a structural false-positive source in this codebase —
      // every verified hit (test files AND the rare production hit) was benign, not just untriaged.
      'sonarjs/no-hardcoded-ip': 'off', // every hit is IP-classification code (e.g. `classifyIpv6`) or documented test-fixture IPs; zero real endpoint literals found
      'sonarjs/pseudo-random': 'off', // every hit is `Math.random()` used only as a non-crypto UI-id fallback after `crypto.randomUUID()`, never a security context
      'sonarjs/file-permissions': 'off', // 100% test fixtures exercising fs-permission behavior as the subject under test
      'sonarjs/publicly-writable-directories': 'off', // same reason, 100% test fixtures
      'sonarjs/no-clear-text-protocols': 'off', // 13/14 hits in tests; the one prod hit is a `.invalid`-TLD placeholder used only for URL parsing, never a live request
      'sonarjs/no-os-command-from-path': 'off', // 100% PATH-related fault-injection test fixtures, zero production hits
      // Needs type-aware linting (`parserOptions.project`) to produce sound results; this config
      // doesn't run one (see dispatch report's type-aware-linting section for the cost). Without it
      // this rule doesn't just miss cases, it actively misfires.
      'sonarjs/class-prototype': 'off', // flags standard DOM prototype methods (`HTMLDialogElement.showModal`, `Element.scrollIntoView`) as "undeclared" without type info
      // Single stray hit each, traced to something other than authored production source.
      'sonarjs/no-tab': 'off', // only hit is inside a bundler-generated `.astro/content.d.ts` fixture checked in for a probe test
    },
  },
  {
    // `sonarjs/no-trivial-assertions` is `error` repo-wide above. These two assertions are each
    // deliberately always-true, not a mistake — a line-level disable can't say so here because this
    // config sets `noInlineConfig: true` (see the block near the top of this file), which makes an
    // `eslint-disable-next-line` comment inert, so the exception has to be scoped to these two exact
    // files instead of the single line each actually needs.
    //
    // - migration-manifest.test.ts: `laterInstantOffsetForm < earlierInstantZForm` compares two
    //   hardcoded literal strings declared two lines above it. The assertion's whole point is to
    //   demonstrate that plain string comparison of those two specific literals ranks the
    //   chronologically LATER instant first — the lexicographic-vs-chronological collation hazard
    //   `TIMESTAMP_ORDERING_REQUIRES_CANONICAL_Z` documents. Sonar constant-folds the comparison
    //   because both operands are literals and reports "always succeeds"; always succeeding against
    //   these two specific literals is exactly what the test is proving.
    // - purpose-scoped-mailer.unit.test.ts: `assert.ok(true, "compile-time guard — ...")` is an
    //   explicit compile-time expectation per its own inline comment — the real check is `tsc`
    //   rejecting a type once REQ-09 ships, not a runtime assertion.
    files: [
      'apps/website/src/platform/db/__tests__/migration-manifest.test.ts',
      'apps/website/src/platform/mail/__tests__/unit/purpose-scoped-mailer.unit.test.ts',
    ],
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs },
    rules: {
      'sonarjs/no-trivial-assertions': 'warn',
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
  {
    /**
     * `apps/desktop` — the ONE thing this workspace needs from the shared config, added 2026-09-12.
     *
     * ## What was broken
     *
     * Every other config block in this file globs `**​/*.ts` / `**​/*.tsx` (or `apps/admin/src/**`
     * with a widened extension list). NOTHING matched `apps/desktop`'s `.js`/`.mjs`/`.cjs` — which
     * is most of the app, including `main.js` at ~1200 lines, `tovu-server.js`, and
     * `scripts/stage-payload.mjs`. Those files were still ENUMERATED by `eslint .` and linted
     * against an empty ruleset, so they reported 0 problems and looked gated. Verified 2026-09-12:
     * a default run over `main.js` produced 0 messages, while `--rule '{"max-lines":["error",5]}'`
     * produced 1 — the file is reachable, it simply had no rules.
     *
     * ## Why the plugin registration here is load-bearing
     *
     * `check-admin-complexity-drift.ts` re-lints at a strict 9/9 by passing `--rule` on the CLI. A
     * CLI `--rule` applies to every file ESLint enumerates, and ESLint resolves a plugin name only
     * from a config object that MATCHES that file. With no block covering desktop's `.js` files,
     * the same technique died with exit 2 and empty stdout — "could not find plugin sonarjs" —
     * on any desktop glob whose directory contained a `.js` file. (Isolated: `src/contracts/*.ts`,
     * which has no `.js` siblings, exited 0; `src/preload/*.ts`, which sits beside
     * `preload.test.js`, exited 2.) `apps/admin` is immune only because the block above pairs its
     * glob with `js,jsx,mjs,cjs`. Declaring `sonarjs` here is what lets the desktop gate use the
     * same `--rule` re-lint the admin ratchet has always used.
     *
     * ## Severity is deliberately `warn`, not `error`
     *
     * STRICTLY ADDITIVE: `npm run complexity` is a blocking CI step, and desktop carries 10
     * pre-existing 9/9 violations. Promoting them here would fail that gate for everyone the moment
     * this lands, over debt this commit does not introduce. `warn`/15 matches what desktop's `.ts`
     * and `.tsx` already got from the repo-wide block, so this block changes NO existing result —
     * it only extends that same treatment to the `.js`/`.mjs`/`.cjs` files that had none. The hard
     * 9/9 ceiling is enforced by `apps/desktop/scripts/check-complexity.mjs`'s own `--rule`
     * re-lint against a per-violation debt list, exactly as `apps/admin` does it.
     *
     * `tseslint.parser` + `jsx: true` for the reason the `apps/admin` block documents above: a
     * widened glob that falls through to default espree makes a real `.jsx`/`.tsx` file a hard
     * PARSE error. The build-output ignores are required because this file's global `ignores` cover
     * `**​/dist/**` but not `release/`, `release-verify/`, `staging/`, or `src/speech/.build/`,
     * each of which holds a full copy of the app.
     */
    files: ['apps/desktop/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    ignores: [
      'apps/desktop/dist/**',
      'apps/desktop/release/**',
      'apps/desktop/release-verify/**',
      'apps/desktop/staging/**',
      'apps/desktop/src/speech/.build/**',
    ],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    plugins: { sonarjs },
    rules: {
      complexity: ['warn', 15],
      'sonarjs/cognitive-complexity': ['warn', 15],
    },
  },
];
