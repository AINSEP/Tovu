# Handoff — Tovu, 2026-08-20 (session 2): coverage + complexity campaign

**Branch:** `general-work` (pushed) · **57 commits this session** · **Next workstream:** finish the campaign below

---

## ⛔ READ FIRST — five facts that change what you would otherwise do

### 1. `npm run ci:local` runs ZERO tests

All 8 gates are typecheck / lint / architecture. Tests are opt-in:

```bash
npm run ci:local                  # 8 gates, NO tests
npm run ci:local:tests            # + the full suite
npm run ci:local:route-coverage   # + the 5 route-coverage gates
```

A green `ci:local` has never meant a tested branch.

### 2. Only `src/server/routes/**` has a coverage gate. Only it and `apps/admin/src` have a complexity gate.

Everything else — `src/features/**`, `src/assistant/**`, `src/export/**`, `src/seo/**`, `packages/**`,
`apps/site-chat/**` — is ungated. `eslint.config.mjs` sets complexity to `warn`/15 repo-wide, which
**cannot fail CI**. That is why 262 of the repo's 367 complexity violations accumulated unseen.

### 3. "100% coverage is unreachable here" is FALSE and was proven so today

`classify-coverage-gaps.ts` used to claim esbuild injects "exactly 2 permanently-zero-hit branches
into every file." Corrected in `15b432fe`, register entry 7. Evidence: of 1265 files with branch
data, **567 have ZERO unhit branches**. Root cause of the bad claim — the repo is ESM
(`"type": "module"`, `module: "nodenext"`), so esbuild emits no CJS-interop shim. **Three files hit
literal 100% today.** Do not cite a ceiling.

### 4. The coverage tier is decided by FILENAME, not by what the test does

```ts
// development/scripts/route-coverage-lib.ts
export function isIntegrationTestFile(relPath: string): boolean {
  if (/\.integration\.test\.ts$/.test(normalized)) return true;
  return normalized.includes("/__tests__/integration/");
}
```

**138 of 158 server test files count as "unit"** — including `post-template-site-serving.test.ts`,
`seo-site-serving.test.ts`, `redirects-site-serving.test.ts`, `widgets-site-serving.test.ts` and
`media-site-serving.test.ts`, all of which spin up a real server and hit it over HTTP. This is the
dominant reason `pages.ts` shows 74% integration coverage while being genuinely well tested.
**This is an open decision — see §6.**

### 5. Two coverage tools disagree, and neither is fully trusted

- Node's `--experimental-test-coverage` **mis-maps `BRDA`/`FN` line numbers** on larger files —
  consistently wrong, not off-by-one. `DA:` statement lines are fine.
- `npx c8` source-maps correctly and is the tool to use for finding gaps. But it counted **168
  branches** where node counted **119** on the identical file, and separately reported three
  functions at zero hits while a test demonstrably exercising them passed in the same run
  (reproducing at both 10 and 202 tests).
- **The gates parse node's lcov**, so the gate's denominator is node's. A c8 percentage is not
  directly comparable to a gate percentage.

Use `c8` to find gaps. Use the gate's own commands for pass/fail. Do not mix the numbers.

---

## What was accomplished

### The route-coverage gate went from 4 failures to 1

```
                                         BEFORE          NOW
presentation/get.ts                unit  64.29%   →   100.00%  ✅
presentation/patch-active-theme.ts unit  62.50%   →   100.00%  ✅
system/publish-site.ts             unit  76.54%   →   100.00%  ✅
themes/explore.ts                  unit  99.39%   →    99.39%  ✅ (already passing)
site/pages.ts                      unit  85.86%   →    96.00%  ❌ still short
                                   integ  55.74%  →    74.26%  ❌ (mostly the §4 classifier bug)
```

`publish-site.ts` — the file the previous handoff flagged as never verified — is at 100%.

### 14 files brought under the 9/9 complexity ceiling

| file | before (cyc/cog) | after |
|---|---|---|
| `src/server/http/site/render.ts` | 76 / 64 | 0 violations |
| `src/features/theme/theme.ts` | 56 / 76 | 0 violations |
| `apps/admin/src/features/posts/PostEditor.tsx` | 62 / 26 | 0 violations |
| `src/features/theme/validation/manifest-v2.ts` | 43 / 52 | 0 violations, **100% coverage** |
| `src/seo/settings.ts` | 31 / 47 | 0 violations |
| `src/features/deployments/static-publish/adapter.ts` | 31 / 31 | 0 violations |
| `src/features/theme/validation/validate-theme-package.ts` | 22 / 38 | 0 violations, **100% coverage** |
| `src/server/routes/site/pages.ts` | 22 / 28 | 0 violations |
| `src/server/routes/admin/system/publish-site.ts` | 20 / 22 | 0 violations, **100% coverage** |
| `src/features/post/post.ts` | 17 / 15 | 0 violations, **100% coverage** |
| `src/features/deployments/publish-agent-tools.ts` | 14 / 18 | 0 violations |
| `src/server/routes/admin/presentation/patch-active-theme.ts` | 12 / 0 | 0 violations, **100% coverage** |
| `src/server/routes/admin/presentation/get.ts` | clean | **100% coverage** |

Extremes: `renderDocNode` 76 → 8. `loadTheme` 56 → 2. The `PostEditor` toolbar selector 62 → 1.

### New tooling: `npm run triage:churn-hotspots`

`development/scripts/report-churn-hotspots.ts` + 10 unit tests. Diagnostic, always exits 0.

```
score = churn × (maxCyclomatic + maxCognitive)
```

Churn = commits touching the file in the last `--months` window (default 6). Complexity alone says
what is bad; churn says what is *expensive*, because complexity is a tax paid on every edit.

Two flags, both of which fired on real files:

- **`FLAT_WIRING`** — cognitive 0 with a cyclomatic violation: operator counting, not branching.
- **`COLD`** — no commits in the window. **Currently 0 of 162** — none of this debt is in cold code.

**Known limitation:** it reports per-file *maxima*, and the two maxima can come from different
functions. It reported `publish-site.ts` as "cyc 20 / cog 22" when the truth was cyc 20 / cog 20 in
one function and cyc 15 / cog 22 in another. Read per-function numbers before targeting anything:

```bash
npx eslint --no-error-on-unmatched-pattern \
  --rule '{"complexity":["warn",0],"sonarjs/cognitive-complexity":["warn",0]}' \
  -f json <file>
```

---

## The method that worked — reuse it

Per file, in this order. Deviating from the order is what produced the one process complaint today.

1. **Measure first** — complexity via the eslint command above, coverage via `npx c8`.
2. **Baseline the tests** and record the exact pass count.
3. **Write characterization tests BEFORE refactoring** anything below 100%, and **confirm they pass
   against the pre-refactor code**. This is what makes the refactor safe.
4. **Extract to top-level functions or sibling modules.** A closure declared inside the same function
   lowers nothing that matters — the gate scores per-scope and nesting never folds into the parent.
5. **Re-measure the whole file after every extraction** — extracting can create a NEW violation in
   the extracted function (a cyc-14 helper appeared this way).
6. **Close the remaining coverage to 100%.**

Two extraction shapes did nearly all the work:

- **Lookup table replacing an if/else chain or switch** — `renderDocNode`'s 22-case switch, the
  publish-target parsers, `resolveRouteTemplateId`'s candidate lists, `setSeoSettings`'s write
  dispatch, and the toolbar probe table.
- **Hoisting a repeated guard out of N repetitions into one early return** — the toolbar selector
  repeated `editor?.… ?? default` ~40 times; one `if (!editor) return DEFAULTS` collapsed 62 → 1.

---

## The dead-branch policy — and why ZERO branches were deleted

**The thesis:** the usual thing between a file and 100% is not a missing test but a branch that
cannot fire — over-defensive handling for states callers make impossible. Removing those raises
coverage AND deletes real dead code.

**The standard.** A branch may be deleted ONLY with proof, either:

- **Type-level** — the parameter's type makes the input impossible, with no `as`/`any` upstream, or
- **Caller-side** — EVERY caller enumerated repo-wide, each shown to guarantee the condition.

**"No test hits it" is NOT proof.** That is the definition of the gap, not evidence about the code.

**Count the module's own exported surface as a caller.**

**Result: across ~10 files and six agents, zero branches were deleted.** Every "obviously dead"
branch turned out reachable, in three distinct ways:

1. **Concurrent in-place mutation.** `patch-active-theme.ts`'s `deps.themes.find(...)` after a
   successful `setActiveTheme()` looked type-guaranteed. But `setActiveTheme` awaits a repo call, and
   `rescanThemes()` does `themes.length = 0; themes.push(...fresh)` on that exact array
   (`src/features/theme/theme.ts:1233-1234`, called as
   `rescanThemes({ themes: deps.themes, ... })` at `rescan-themes.ts:47` — same array object for the
   life of the process). **A theme rescan landing mid-request is a real way to hit it.** Now pinned
   with a deterministic race test. Verified independently by the Coordinator.
2. **The module's own exported surface.** `validateManifestV2`'s `apiVersion` branch is guaranteed by
   its single internal caller — but the function is `export`ed with a `Record<string, unknown>`
   parameter, so a future caller or test reaches it with no type-level barrier. Direct-call test
   written instead.
3. **Falsy-but-defined.** `pages.ts`'s `if (!staticHtml)` tests **falsy**, not `=== undefined`. A
   theme page file containing an empty string satisfies the "always defined" guarantee and is still
   falsy. The obvious proof was wrong; a sloppier pass would have deleted a live branch.

Prefer making an impossibility **explicit and enforced** (hoist to a type, or throw at the boundary)
over silent deletion. **When in doubt, write the test.** A wrongly-deleted defensive branch is a
production crash; a wrongly-kept one costs a few percent.

---

## Bugs and untested production code the campaign surfaced

This is the actual return on the effort — none of it is visible from complexity metrics.

1. **`src/seo/settings.ts` — every error-throwing path untested** (72.88% branch). Bad description,
   oversized OG image, malformed robots rules: no test for any of it.
2. **`static-publish/adapter.ts` — `buildJiniTarget`'s real dispatch had NEVER been exercised.** Every
   existing test injected a fake `buildTarget`.
3. **`routes/site/pages.ts` — static-theme menu rendering had zero test hits anywhere in the repo.**
   No test authored a static theme with an actual menu marker.
4. **`src/features/post/post.ts` — the `beforeSaveHook` extension point had never been wired by any
   test.** Four branches cold from one root cause: an optional SPEC-005 dependency nobody exercised.
5. **`publish-site.ts` — four target-parse branches on the TRIGGER route** had only ever been
   exercised through the PREVIEW route's tests. Two separate parse functions; one looked covered
   because its sibling was.
6. **Duplicate validators in `publish-agent-tools.ts`** — `deployment_preview_static_publish`'s target
   validation was an EXACT duplicate of `deployment_execute_static_publish`'s inline check. Two
   copies drifting independently. Same for an S3 protocol check. Both collapsed to one.
7. **Two real type errors** surfaced by extraction in `publish-agent-tools.ts` — a too-loose
   `defaultCredential` param and a missing `StaticPublishOutcome` import.
8. **`if (!staticHtml)` on an empty theme page file** — now proven to 404 through the ordinary
   fallback rather than serve a blank 200.

---

## Remaining work

### 6.1 — 107 non-flat files still over the 9/9 ceiling

`npm run triage:churn-hotspots -- --top=500`. Current top of the ranked list:

| score | churn | cyc | cog | file |
|--:|--:|--:|--:|---|
| 494 | 19 | 12 | 14 | `src/widgets/resolver-service.ts` |
| 459 | 9 | 25 | 26 | `src/assistant/byok-tool-surface.ts` |
| 437 | 19 | 12 | 11 | `src/server/modules/assistant.ts` |
| 400 | 8 | 25 | 25 | `src/server/routes/admin/settings/register-definitions.ts` |
| 376 | 8 | 17 | 30 | `src/export/route-manifest.ts` |
| 360 | 12 | 13 | 17 | `src/export/site-exporter.ts` |
| 350 | 14 | 13 | 12 | `src/server/routes/admin/posts/update.ts` |
| 342 | 9 | 20 | 18 | `src/server/routes/admin/settings/set.ts` |

Full ranked table: `ADS-memory/reports/2026-08-20-repo-wide-coverage-complexity-measurement.md` §7.

### 6.2 — 55 FLAT_WIRING files

Cognitive 0 with a cyclomatic violation. **Not automatically "leave alone"** — the toolbar selector
was textbook flat wiring at cyc 62 and had a genuinely better form. **Rule:** refactor when a real
improvement exists (a lookup table, a shared parse helper — something that makes the next edit
easier); skip when the only effect is moving lines to change a number.

**Two exceptions, do not touch:** `src/server/app.ts` (cyc 38 / cog 0, churn 81) and
`src/server/deps.ts` (cyc 14 / cog 0, churn 65). Both are composition roots where a flat wiring list
is the correct shape, and `app.ts`'s churn makes the blast radius large.

### 6.3 — Coverage, repo-wide

Last measured (from `test:cov:server` only — **partial**, since only `src/server/**` tests ran):

```
scope                 files     line    branch    funcs
TOVU (src/)             689    91.1%     77.6%    66.5%
Jini (sibling repo)     419    57.2%     69.8%    40.7%
```

**Function coverage of 66.5% is the weak number, not line coverage.** A third of Tovu's functions are
never invoked by any test. Line coverage reads healthy at 91% because tests walk through code without
exercising it.

Of 689 measured Tovu files: **245 at 100% branch, 444 not. 388 at 100% function, 301 not.**

A true repo-wide figure needs `npm run test:cov` plus `cd apps/admin && npx vitest run --coverage`.
**Neither has been run.** `apps/admin` is absent from every number above.

### 6.4 — Never started

- **Extend the coverage gate past `src/server/routes/**`.** This was the point of the whole exercise.
  Design note: build it as a **per-area aggregate ratchet** (like `check-architecture.ts`), not
  per-file. Two files today were "short" only because a branch was legitimately covered from another
  directory by documented convention — a per-file gate would flag genuinely-tested code.
- **`apps/site-chat` has no test runner at all.** No `test` script exists. 10 source files, 3 test
  files, 1 complexity violation (`site-assistant-transport.ts`, cog 17).
- **`development/scripts/` is invisible to `tsc`.** `tsconfig.json`'s `include` is `["src/**/*.ts"]`,
  so every CI gate script is untypechecked. Verified with `--listFiles`: zero files from that
  directory are in the program. Bigger than the known `__tests__` exclusion.
- **4 pre-existing type errors in test files**, reported by no gate.
- **Stale failure baseline** — `route-test-failure-baseline.json` has 42 entries; **41 no longer
  fail.** Prune it.
- **Route/service extraction for `pages.ts`.** It exports 12+ application functions from a route file
  (`resolveWidgetsForRender`, `renderViaTemplate`, `resolveStaticMenusForRender`, …) and defines
  three `Pick<RouteDeps, …>` deps types. It is already trying to be a service. **The repo already
  started this move** — `src/features/theme/active-theme.ts:5` and `index.ts:99` both carry comments
  saying logic was moved out of `pages.ts` on 2026-08-16. Honest caveat: only one production file
  (`middleware/theme-page-preview.ts`) imports those helpers today; the rest are tests. The immediate
  payoff is testability without Express, not reuse.

---

## Open decisions for the owner

1. **The tier classifier (§4).** `refactor-pages`'s recommendation, which the Coordinator agrees with:
   **fix the classifier, do not move 138 files.** A path convention cannot see whether a test spins up
   a real server; the test's own code can be checked for that (does it call `createApp` + HTTP, or
   import and call functions directly) — statically greppable per file, no churn. Moving files would
   be enormous churn for zero behavior change and would fight the natural organization.
2. **Whether to keep chasing `pages.ts`'s integration number** before the classifier is fixed. Closing
   74% → 95% honestly means porting the unit tier's rich scenarios into duplicate integration files.
3. **Cloud dispatch — unresolved, see below.**

---

## Cloud dispatch — status UNKNOWN, do not assume it works

Four triggers created today. All returned HTTP 200 and all show `ended_reason: "run_once_fired"`.
**None produced a single commit or branch**, and the owner could not see any of them at
`claude.ai/code`.

```
trig_019hEwrYkhtC1oyVjJHPPXMv   stage 1, fired 17:58:53Z   persist_session: false
trig_01PX3kySVzpnMuKNyeVWTjNG   stage 2, fired 18:12:22Z   persist_session: false
trig_01XGbVJTUpGHzC4DWZrnNQXV   smoke 1, fired 18:32:00Z   persist_session: false
trig_01VvHwYkthBEtVF12eFcKnyX   smoke 2, fired 18:36:00Z   persist_session: TRUE
```

**Verified NOT the problem:** the call shape is byte-identical to the last six historical triggers
(same `ccr` keys, same `session_context` keys, same `environment_id` used by all 20 triggers ever
created, same `created_via: http_api`). The account is correct — "Noel" is the owner. The firing
machinery works: an 08-18 trigger fired today at 18:01.

**The one difference found:** the 2026-08-19 trigger that worked had `persist_session: true`; the
first three today defaulted to `false`. Smoke test 2 sets it `true` — **check whether it produced
`ADS-memory/reports/cloud-briefs/SMOKE-TEST-2-OK.md` or a `cloud/smoke-test-2` branch. That is the
A/B result and the first thing to look at next session.**

**The briefs are written, committed and reusable regardless:**

- `ADS-memory/reports/cloud-briefs/2026-08-20-coverage-stage-1.md`
- `ADS-memory/reports/cloud-briefs/2026-08-20-coverage-stage-2.md` — also distills the Programmer,
  TDD, Refactor and Software Architect personas, because **`AI-Dev-Shop/` is gitignored
  (`.gitignore:37`, 0 files tracked) and does not exist in a cloud clone.**

**Cloud setup that any future dispatch needs:** Tovu has **13 `file:` deps on `../Jini/packages/*`**,
all compiled TypeScript, and **Jini is NOT built in a fresh clone**. Jini uses **pnpm** (`pnpm@10.33.2`),
is a pnpm workspace, has **no root build script**, and its work is on `general-work`:
`corepack enable && pnpm install && pnpm -r build`, then spot-check `dist/`. The two checkouts must be
siblings and the Jini directory named exactly `Jini`. **Complexity-only work does not need Jini
(ESLint just parses files); running any test does.**

---

## Traps — carry these forward

- **Never `git add -A` / `git add .`** — ~40 files belong to other concurrent sessions.
  **Put the pathspec on the COMMIT itself:** `git commit -F <msgfile> -- <paths>`. `git add` scoping
  does not protect you; `git commit` writes the whole index.
- **NEVER `git reset` / `stash` / `rebase` / `amend` on this branch. Forward-only.** An agent ran
  `git reset --soft HEAD~1` today to fix an attribution mistake; another agent's commit had landed in
  between, so it destroyed the wrong commit. **New wrinkle discovered:** the repair re-snapshots the
  CURRENT tree, so the recreated commit was 383/188 lines instead of the original 50/17 — it captured
  a third agent's in-progress work early. No data loss, but two commit messages now describe less
  than their diffs.
- **A mid-flight message to an agent is NOT reliable.** It lands at a turn boundary — it may arrive
  too late to redirect, and it may arrive LATER and be picked up as a work order. Both happened today
  on the same file, producing two agents in one file. **Everything goes in the spawn prompt.**
- **Stand an agent down explicitly before spawning its replacement**, and tell it to ignore messages
  that arrive afterward.
- **`git commit -m` with a heredoc containing backticks** appended a literal `EOF)` to a commit
  message. Use `git commit -F <file>`.
- **Scope every filesystem search to the repo.** A `bfs` rooted at `/` consumed 114% CPU for four
  minutes and drove load average to 188 — more damage than every test run combined.
- **macOS load average is a poor signal here.** It counts I/O-blocked processes, so short test bursts
  spike it into the hundreds. Check actual `%CPU` per process before concluding anything.
- **Never run the full test suite** — 5.4 GB across 13 workers. Always `TEST_CONCURRENCY=2`.
- **Two concurrent `test:cov:server:*` runs corrupt each other** — they `rm -f` the same lcov file
  before rewriting. `lcov.unit.info` at 0 bytes means a run is mid-flight (the reporter writes at the
  end), not that it crashed. For per-file work use `npx c8` into your own directory.
- **vitest is NOT installed at the repo root** (runner is `node --import tsx --test`) but **IS**
  installed in `apps/admin` (`npx vitest run`).
- **`?.` and `??` each count as a branch** under this ESLint config. A function full of optional
  chaining can be over the ceiling with no visible `if`. Default parameters cost +1 cyclomatic each,
  and `apps/admin/INFO.md` mandates that shape for the DI seam — so an admin component starts near
  cyclomatic 5 before any logic.
- **Do not trust this repo's code comments.** Eight proven false in 72 hours; register at
  `ADS-memory/reports/2026-08-20-false-code-comments-register.md`. A **third failure shape** was named
  today: *true premise, stale conclusion* — a claim that was correct before an architectural migration
  (pre-ESM) and was never re-checked.

---

## Next-agent opening prompt

> Read `AI-Dev-Shop/AGENTS.md` first, then
> `ADS-memory/reports/continuity/2026-08-20-session-handoff-coverage-and-complexity-campaign.md`.
>
> The campaign is: **mass testing to 100% branch and function coverage, complexity to under 9/9,
> wholesale refactoring, dead-branch removal with proof, and real error-condition testing.**
>
> **First: check whether smoke test 2 (`trig_01VvHwYkthBEtVF12eFcKnyX`, `persist_session: true`)
> produced `SMOKE-TEST-2-OK.md` or a `cloud/smoke-test-2` branch.** Four cloud triggers fired today
> and none produced a commit. That A/B decides whether cloud dispatch is usable at all.
>
> `npm run ci:local` runs NO tests. Only `src/server/routes/**` has a coverage gate. 100% IS
> reachable — the "esbuild injects 2 dead branches" claim was measured false today. Use `npx c8` to
> find gaps, the gate's own commands for pass/fail, and never mix the two tools' numbers.
>
> 107 non-flat files remain over the ceiling; run `npm run triage:churn-hotspots` for the ranked list.
> The one remaining gate failure is `pages.ts`, and its integration number is mostly a classifier bug,
> not missing tests.
>
> Never `git add -A`, never `git reset`/`stash`/`amend` (forward-only), pathspec on every commit,
> everything an agent needs goes in its SPAWN PROMPT, always `TEST_CONCURRENCY=2`, and verify any long
> code comment against the source before trusting it.
