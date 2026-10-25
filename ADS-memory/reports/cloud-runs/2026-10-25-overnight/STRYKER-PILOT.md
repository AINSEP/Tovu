# Stage S — StrykerJS pilot (report only; no source/test edits, nothing committed to Jini)

Slice: Jini `packages/agent-plugins/src/lifecycle/exports.ts` (124 lines) — 264 mutants (≥30, so the bundled-source-archive fallback was NOT needed). Jini @ 3e2fbae8.
Versions: @stryker-mutator/core 9.6.1, vitest-runner 9.6.1, typescript 5.9.3 (scratch dir /root/stryker); Jini's own vitest 2.1.9, Node 22.22 (Node 24 not needed for Jini). 4 cores, concurrency 2.

## 1. Setup friction and wall time
| Phase | Wall |
|---|---|
| git clone Jini | 5 s |
| pnpm install --frozen-lockfile | 47 s |
| build agent-plugins + deps | 28 s |
| npm i stryker core + vitest-runner (scratch) | 15 s |
| Dry run (initial test run) | 1 m 00 s — ran **768 tests** (the whole package suite, not just exports.unit.test.ts's 40); net test time 34 s, overhead 26 s |
| Mutation run (264 mutants, concurrency 2) | 1 m 36 s |
| Total `stryker run` | 2 m 42 s |

What broke, in order (each cost one retry, ~1–10 s each):
1. Installing `vitest@5` in the scratch dir mismatched Jini's vitest 2.1.9 — removed it; Stryker's runner uses the vitest resolved from the package cwd. **Run stryker with cwd = the package dir** (`cd packages/agent-plugins && /root/stryker/node_modules/.bin/stryker run /root/stryker/stryker.config.json`).
2. `Cannot find package 'typescript'` from core's ts-config-preprocessor → typescript must be installed beside Stryker even for vitest runs.
3. `plugins: [<abs path>]` made "no TestRunner plugins loaded" → drop `plugins`, default discovery works.
4. Dry run failed `TSConfckParseError: failed to resolve extends ../../../../tsconfig.base.json` because the sandbox lived in /root/stryker/.stryker-tmp (Stryker rewrites relative `extends` for the sandbox location). Fix: `tempDirName: ".stryker-tmp"` (relative → sandbox inside the package dir). That creates an untracked `.stryker-tmp` in the Jini package (cleanTempDir true; `git status` was clean afterwards).

Working config (copy: `stryker.config.json` next to this file):
`testRunner vitest; vitest.configFile vitest.config.ts; mutate [src/lifecycle/exports.ts]; coverageAnalysis perTest; concurrency 2; reporters html,json,clear-text,progress-append-only; tempDirName ".stryker-tmp"; disableTypeChecks true`.

## 2. Mutation score
Total 264 · killed 239 · survived 25 · no-coverage 0 · timeout 0 · compile-error 0 (type checks disabled, so type-invalid mutants are not filtered; no checker plugin installed) · **score 90.53 %** (covered score identical). Avg 6.48 tests run per mutant (perTest coverage working).
Caveat: "killed" means *some test in the package suite* failed, not necessarily exports.unit.test.ts (indirect kills are possible; the report lists killing tests per mutant in the JSON).

## 3. Survived mutants (25) — line:col, mutator, original → mutated, verdict
Line numbers are in exports.ts.
- 36:54 ConditionalExpression `typeof value === 'object'` → `true` (isObject): (a) gap — only `ok:false` is asserted for non-object exports/entries; assert the specific error (`exports must be an object…` / `must be an object`) for a string value, e.g. `exports: "x"` and `exports:{a:"x"}`.
- 37:53 ConditionalExpression `typeof value === 'string'` → `true` (isName): (a) gap — no test with non-string alias elements (`aliases:[1]`).
- 39:89 MethodExpression `every(isName)` → `some(isName)` (isNames): (a) gap — need `aliases:['ok','BAD NAME']` to be rejected.
- 45:10 ConditionalExpression `typeof value==='string'` → `true` (isExportFile): (a) gap — no test with non-string/missing `template` (`template: 123` / absent); mutant would throw TypeError on `.endsWith`, so this is also a missing "refuses, never throws" assertion.
- 45:39 Regex drop `*` on directory group: (a) gap — path grammar tested with only one-level dirs (no bare `x.html`, no `a/b/c.html` accept cases).
- 51:10 ConditionalExpression `typeof value==='string'` → `true` (isPluginId): (b) probably equivalent — validatePluginIdentity rejects non-strings itself (not verified by running a non-string case).
- 56:53 MethodExpression `every` → `some` (checkMap): (a) gap — assets/hostLinks map with one valid + one invalid entry should be refused.
- 56:98 Regex ×2 (drop `^` / drop `$` on map-key grammar): (a) gap — no test with bad map keys (`1bad`, `a b`, `x!`).
- 62:84, 66:78, 67:86, 67:105, 69:72, 73:104, 74:94, 75:70, 76:124, 79:72, 91:129, 94:66 StringLiteral message → `""` (12 mutants): (c) mostly noise at ok/ok:false level, but real if error text is a contract (it is user-facing in admin UI) — one parametrised `toContain(message)` test per branch would kill all of them cheaply.
- 91:128 and 94:65 ArrayDeclaration error list → `[]`: (a) gap, same cause — tests don't assert `errors` is non-empty/contents for renamedFrom and non-object exports.
- 91:68 MethodExpression `renamedFrom.every(isPluginId)` → `some`: (a) gap — `renamedFrom:['acme.good','bad']` must be refused.
- 76:59 ConditionalExpression `typeof value==='string'` → `true` (hostLinks validator): (b) equivalent — `provides.includes(nonString)` is false anyway.
Tally: (a) real gaps 15 (incl. 2 regex + 3 every/some + array/typeof cases), (b) equivalent 2, (c) message-only 8–12 depending on whether error text is treated as contract. (91:129/94:66/62.. strings counted in the message group.)

## 4. What Stryker does NOT catch here / vs the hand-rolled sweep
Not caught by this run: behaviour of code not in `mutate` (the validators exports.ts calls — checkAdminSurfaceActionSchema, validatePluginIdentity — were not mutated); mutants killed only by incidental tests; type-level contract bugs (type checks disabled, no `@stryker-mutator/typescript-checker`); equivalent mutants (needs human triage, as above); missing *inputs* (mutation testing finds weak assertions around code that exists, not untested behaviours the code never implemented); integration/e2e behaviour; and the score says nothing about property coverage of regexes beyond the specific mutations Stryker tries.
Vs `development/scripts/mutation-sweep.mjs` (Tovu): the sweep neutralises one *guard* (condition → false, drop `??`, optionally `?.`) and reruns a scoped test — it answers "is this guard load-bearing?" per site, runner-agnostic (node:test + vitest), no setup. Stryker does ~25 mutator kinds (strings, arrays, regex, methods, boolean/conditional, arithmetic, etc.), perTest coverage so it only reruns relevant tests, and gives a score + HTML. In this slice the hand-rolled "condition→false" kind alone would have caught the `typeof→true` class only partly, and would NOT have found the regex-anchor, every→some, string/array-literal, or `*` quantifier gaps (all but ~5 of the 25). Stryker also needs no per-file test-target wiring for vitest; for Tovu's node:test code there is **no official Stryker runner** (only a community `tap`/command runner) — so the sweep stays necessary for the node:test side.

## 5. Scaling recommendation
- Cost measured: mutation phase ≈ 36 s per 100 mutants (concurrency 2, 4 cores, with ~6.5 tests/mutant); fixed overhead ≈ 1 min dry run (full package suite). Estimate ~1 h for ~7–8k mutants; 100 mutants ≈ 1 min + 1 min fixed. Concurrency 3 is probably safe on 4 cores (not measured).
- Config changes before a bigger run: add `@stryker-mutator/typescript-checker` (cuts type-invalid mutants, costs extra startup); restrict the dry run via `vitest.related`/`mutate` globs per slice or an `--incremental` file (`incremental: true`, keep `.stryker-tmp/incremental.json` out of git) to avoid re-running the 768-test suite each time; set `mutator.excludedMutations: ["StringLiteral"]` (or `["StringLiteral","ArrayDeclaration"]`) for validator files whose messages aren't contract — that removes 14 of 25 survivors here as noise; keep `tempDirName` relative.
- Next slices (pure, vitest, heavily-guarded): other `agent-plugins/src/lifecycle/*` validators (bundled-source-archive, bundled-digests, retire-bundled), `@jini-ai/plugins` host contract validators, and Tovu `apps/admin` vitest hooks. Tovu node:test code: keep mutation-sweep.mjs.
- Token cost: this pilot used roughly 0.1M tokens (mostly setup debugging + triage); a run on ~5 slices of this size is ≈ 15 min machine time and ≈ 0.2–0.3M tokens if survivor triage stays in-session. Full-package runs are dominated by triage tokens, not machine time; use the (a)/(b)/(c) buckets and exclude StringLiteral to bound it.

Artifacts next to this file: `stryker.config.json`, `stryker-exports-mutation.json` (0.9 MB), `stryker-exports-mutation.html` (1.1 MB).

STAGE S DONE 2026-10-25T06:48:12Z — wall ~6 min, ~0.1M tokens (rough).
