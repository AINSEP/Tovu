# Repo-wide coverage + complexity measurement — Tovu, 2026-08-20

**Branch:** `general-work` @ `b42e8398`
**Purpose:** honest baseline before expanding the coverage gate past `src/server/routes/**` and
before any refactor pass. Measurement only — no code changed.

---

## 1. What is actually gated today

| Scope | Coverage gate | Complexity gate (9/9 hard) |
|---|---|---|
| `src/server/routes/**` | ✅ floor + per-changed-file tiered | ✅ `check:src-complexity-drift` + debt list |
| `apps/admin/src/**` | ❌ none | ✅ `check:admin-complexity-drift` + debt list |
| rest of `src/**` (821 files) | ❌ none | ❌ `warn`/15 repo-wide — cannot fail CI |
| `apps/site-chat/src/**` | ❌ none (no `test` script at all) | ❌ same |
| `packages/**` | ❌ none | ❌ same |

`npm run ci:local` runs **zero tests**. Tests and coverage are opt-in flags
(`ci:local:tests`, `ci:local:route-coverage`).

---

## 2. Route coverage gate — current verdict

`npm run ci:local:route-coverage` at `b42e8398`:

```
PASS  typecheck (root)            PASS  complexity (eslint, warn/15)
PASS  check:boundaries            PASS  typecheck (admin)
PASS  check:architecture          PASS  admin:build
PASS  check:inventory             PASS  check:route-coverage-floor
PASS  check:src-complexity-drift  PASS  check:route-test-baseline
FAIL  test:cov:server
FAIL  test:cov:server:tiered
FAIL  check:route-coverage-diff
```

**Cascade, not three independent failures.** One test fails —
`src/server/http/site/liquid-sandbox.test.ts:110` asserts `/memory alloc limit exceeded/` but gets
Node's `ERR_WORKER_OUT_OF_MEMORY: Worker terminated due to reaching memory limit`. That failure is
**already in the 42-entry baseline** (`check:route-test-baseline` passed). `test:cov:server:tiered`
is `unit && integration`; unit's non-zero exit short-circuited it, so `lcov.integration.info` was
never written, so `check-route-coverage-diff` crashed on a missing file rather than measuring.

Re-running the integration tier alone (`TEST_CONCURRENCY=2 npm run test:cov:server:integration`,
exit 0) then the diff gate gives the real answer:

```
5 changed file(s) vs origin/main — thresholds: unit >= 99% branch, integration >= 95% branch
  FAIL  src/server/routes/admin/presentation/get.ts                unit 64.29%  integ 100.00%
  FAIL  src/server/routes/admin/presentation/patch-active-theme.ts unit 62.50%  integ 100.00%
  FAIL  src/server/routes/admin/system/publish-site.ts             unit 76.54%  integ 100.00%
  ok    src/server/routes/admin/themes/explore.ts                  unit 99.39%  integ 100.00%
  FAIL  src/server/routes/site/pages.ts                            unit 85.86%  integ  55.74%
```

`publish-site.ts` — the file the previous handoff flagged — is under threshold at **76.54% unit
branch**. Per that handoff's own instruction: bring the change up, do not relax the gate.

Aggregate floor gate passed: line 94.12% (floor 88), branch **70.76%** (floor 68), funcs 95.86%
(floor 93). Note branch is **down ~3.1pp** from the 2026-08-16 measured baseline of 73.86%. The
run had a worker OOM, which may have dropped that worker's counters — re-measure before treating
the drop as a real regression.

Also: `check:route-test-baseline` reports **41 of 42 baseline entries no longer fail**. The
baseline file is stale and can be pruned to 1 entry.

---

## 3. Coverage gap triage (`npm run triage:coverage-gaps`)

```
200 of 217 route files are below tier threshold
  66  ARCHITECTURE_DEBT  — also violate 9/9 complexity; refactor before writing tests
 134  TEST_GAP           — complexity clean, test simply not written
```

The gate passes today only because it evaluates **changed** files. 92% of route files would fail
the moment they are touched.

### Worst ARCHITECTURE_DEBT route files (max cyclomatic / max cognitive per file)

| cyc | cog | unit branch | file |
|----:|----:|----:|---|
| 20 | 33 | 88.00% | `src/server/routes/admin/connectors/put-config.ts` |
| 25 | 25 | 45.00% | `src/server/routes/admin/settings/register-definitions.ts` |
| 22 | 28 | 85.86% | `src/server/routes/site/pages.ts` |
| 26 | 20 | 66.67% | `src/server/routes/admin/media/update.ts` |
| 20 | 22 | 76.54% | `src/server/routes/admin/system/publish-site.ts` |
| 17 | 22 | 70.00% | `src/server/routes/admin/assistant/put-execution-credential.ts` |
| 20 | 18 | 66.67% | `src/server/routes/admin/settings/set.ts` |
| 19 | 16 | 30.00% | `src/server/routes/admin/newsletter/update-campaign.ts` |
| 18 | 16 | 41.67% | `src/server/routes/admin/settings/clear.ts` |
| 22 | 10 | 63.64% | `src/server/routes/admin/media/upload.ts` |

Ceiling is 9/9. Note the correlation: `newsletter/update-campaign.ts` at cyc 19 sits at 30% unit
branch — branch coverage falls roughly as complexity rises, which is the whole argument for
refactoring before test-writing on these 66.

---

## 4. Repo-wide complexity — the ungated majority

Command that reproduces (the repo's own gates use the same tool, threshold, and shape):

```bash
npx eslint --no-error-on-unmatched-pattern \
  --ignore-pattern '**/*.js' --ignore-pattern '**/*.mjs' --ignore-pattern '**/*.cjs' \
  --ignore-pattern 'src/themes/**' --ignore-pattern 'src/theme-archive/**' \
  --rule '{"complexity":["error",9],"sonarjs/cognitive-complexity":["error",9]}' \
  -f json src
```

**Invocation trap:** passing `src` (or a `src/**/*.ts` glob) without the `--ignore-pattern` flags
fails with *"could not find plugin sonarjs"*. Cause: `eslint.config.mjs` registers the `sonarjs`
plugin only on `files: ['**/*.ts','**/*.tsx']`, and ESLint 10 lints `.js`/`.mjs` by default — 55
`.js` and 2 `.mjs` files live under `src/`. A `--rule` override applied to a file matched by no
plugin-bearing config object is a hard error. `check-src-complexity-drift.ts` never hits this
because `src/server/routes` happens to contain no `.js`.

### Violations by area (9/9 ceiling, tests and measurements excluded)

| violations | files | area |
|----:|----:|---|
| 123 | 42 | `src/features` |
| **105** | **67** | `src/server/routes` — **already gated** |
| 33 | 14 | `src/server` (non-route) |
| 31 | 13 | `src/assistant` |
| 10 | 4 | `src/widgets` |
| 9 | 5 | `src/seo` |
| 7 | 3 | `src/db` |
| 5 | 3 | `src/core` |
| 5 | 2 | `src/export` |
| 5 | 1 | `src/http` |
| 4 | 2 | `src/analytics` |
| 4 | 3 | `src/cli` |
| 4 | 2 | `src/comments` |
| 4 | 1 | `src/forms` |
| 4 | 2 | `src/members` |
| 3 | 1 | `src/media` |
| 3 | 2 | `src/webhooks` |
| 2 | 2 | `src/connectors` |
| 2 | 1 | `src/newsletter` |
| 2 | 1 | `src/origin` |
| 1 | 1 | `src/redirects` |
| 1 | 1 | `src/site-dir` |

**Total 367 violations. 105 are inside the gated route scope; 262 are in scope nothing watches.**

`apps/site-chat/src`: **1 violation** — `site-assistant-transport.ts`, cognitive 17. Ten source
files total; this is not a problem area.

`apps/admin/src` is already at 9/9 with its own debt ledger and was not re-measured here.

### Worst ungated files in `src`

| cyc | cog | violations | file | lines |
|----:|----:|----:|---|----:|
| 76 | 64 | 12 | `src/server/http/site/render.ts` | 2080 |
| 56 | 76 | 10 | `src/features/theme/theme.ts` | 1143 |
| 51 | 47 | 2 | `src/features/plugin-runtime/manifest.ts` | |
| 43 | 52 | 4 | `src/features/theme/validation/manifest-v2.ts` | |
| 31 | 47 | 3 | `src/seo/settings.ts` | |
| 37 | 39 | 4 | `src/features/theme/handlebars-allowlist.ts` | |
| 25 | 41 | 4 | `src/forms/forms.ts` | |
| 30 | 35 | 3 | `src/assistant/byok-provider-turn.ts` | |
| 35 | 30 | 2 | `src/features/site-glue/manifest.ts` | |
| 31 | 31 | 5 | `src/features/deployments/static-publish/adapter.ts` | |
| 22 | 38 | 2 | `src/features/theme/validation/validate-theme-package.ts` | |
| 24 | 34 | 2 | `src/widgets/config-validation.ts` | |
| 36 | 18 | 2 | `src/assistant/execution-credential-store.ts` | |
| 27 | 27 | 2 | `src/features/database/migrate-forward/state-machine.ts` | |
| 18 | 36 | 9 | `src/features/deployments/static-publish/s3-compatible-target.ts` | |

### The two extreme functions, named

`src/server/http/site/render.ts` — 12 violations across 8 functions:

```
line  374  renderMarks        cyclomatic 24   cognitive 44
line  598  tableSpanAttrs     cyclomatic 11
line  682  renderDocNode      cyclomatic 76   cognitive 64
line 1340  (anon)                             cognitive 16
line 1466  (anon)                             cognitive 11
line 1545  renderWidgetIr     cyclomatic 10
line 1732  renderBlock        cyclomatic 12   cognitive 17
line 1911  renderSite         cyclomatic 24   cognitive 25
```

`src/features/theme/theme.ts` — 10 violations across 5 functions:

```
line  376  parseThemeBuildInfo       cyclomatic 16   cognitive 13
line  649  loadTheme                 cyclomatic 56   cognitive 76
line 1096  resolveTemplateId         cyclomatic 10   cognitive 11
line 1114  resolveLiquidTemplateId   cyclomatic 10   cognitive 11
line 1132  resolveHandlebarsTemplateId cyclomatic 10 cognitive 11
```

`renderDocNode` at **cyclomatic 76** means ~76 independent paths through one function. Exhaustive
branch coverage of it is not realistically writable as unit tests; that is the concrete meaning of
"too complex to test."

**Caveat before acting on any single number** (from `project_admin_complexity_metric`): high
cyclomatic with near-zero cognitive is usually operator counting (a flat `??` chain or default
parameters), not branching. Every file in the table above has *both* numbers high, so this caveat
does not excuse them — but check it per-function before opening any specific file.

---

## 5. Three different test runners — the gate cannot be one command

| Scope | Runner |
|---|---|
| `src/**`, `packages/*/src/**` | `node --import tsx --test` (vitest is NOT installed at root) |
| `apps/admin` | `vitest run` / `vitest run --coverage` |
| `apps/site-chat` | **none — no `test` script exists** |

Any expansion of the coverage gate needs a per-runner lcov story, not a single threshold flag.

---

## 6. Churn × complexity hotspots (new metric, 2026-08-20)

Complexity alone says what is *bad*; it does not say what is *worth fixing*. Crossing it with how
often a file actually changes does. Score = (commits in last 6 months) × (max cyclomatic + max
cognitive). No new dependency — git log plus the scan already run above.

```
score  churn  cyc  cog   file
 6720     48   76   64   src/server/http/site/render.ts
 3960     30   56   76   src/features/theme/theme.ts
 3078     81   38    0   src/server/app.ts                     <- see caveat
 1750     35   22   28   src/server/routes/site/pages.ts
  910     65   14    0   src/server/deps.ts                    <- see caveat
  800     25   14   18   src/features/deployments/publish-agent-tools.ts
  620     10   31   31   src/features/deployments/static-publish/adapter.ts
  570      6   43   52   src/features/theme/validation/manifest-v2.ts
  546      7   31   47   src/seo/settings.ts
  512     16   17   15   src/features/post/post.ts
  494     19   12   14   src/widgets/resolver-service.ts
  459      9   25   26   src/assistant/byok-tool-surface.ts
  437     19   12   11   src/server/modules/assistant.ts
  400      8   25   25   src/server/routes/admin/settings/register-definitions.ts
  378      9   20   22   src/server/routes/admin/system/publish-site.ts
```

173 violating files scanned. **Zero of them have gone untouched for 6 months** — none of this debt
is in cold code that could simply be left alone.

**Caveat, and it fires twice in this table.** `src/server/app.ts` (cyc 38, cog **0**) and
`src/server/deps.ts` (cyc 14, cog **0**) are the operator-counting pattern documented in
`project_admin_complexity_metric`: high cyclomatic with near-zero cognitive means a flat sequence of
operators or default parameters, not branching. Both are composition roots — `createRouteDeps()` /
`createSqliteRouteDeps()` — where a long flat wiring list is the correct shape. Their high churn is
also expected: a composition root changes whenever anything it wires changes. **Do not refactor
these two on the strength of this score.** They rank high on churn, not on tangle.

Excluding those, the ranking independently confirms `render.ts` and `theme.ts` as the correct first
two targets, and puts `src/server/routes/site/pages.ts` third — which is also one of the four files
currently failing the coverage diff gate. Those two signals converging on one file is the strongest
prioritization evidence in this document.

---

## 7. Refactor backlog — ranked candidate list (2026-08-20, post-wave-1)

Wave 1 is complete: `src/server/http/site/render.ts` and `src/features/theme/theme.ts` are both at
**0 violations**, 184/184 and 383/383 tests green respectively. 13 functions brought under the 9/9
ceiling, `renderDocNode` 76→8 and `loadTheme` 56→2 being the two extremes. Both files have dropped
off this list entirely.

Reproduce with `npm run triage:churn-hotspots -- --json --top=500`.

**115 non-FLAT_WIRING violating files remain** (56 more are FLAT_WIRING and excluded — see §6; those
are flat wiring lists where a high cyclomatic score is the correct shape, not debt).

| # | score | churn | cyc | cog | lines | file |
|--:|--:|--:|--:|--:|--:|---|
| 1 | 1750 | 35 | 22 | 28 | 897 | `src/server/routes/site/pages.ts` |
| 2 | 800 | 25 | 14 | 18 | 1549 | `src/features/deployments/publish-agent-tools.ts` |
| 3 | 620 | 10 | 31 | 31 | 492 | `src/features/deployments/static-publish/adapter.ts` |
| 4 | 570 | 6 | 43 | 52 | 402 | `src/features/theme/validation/manifest-v2.ts` |
| 5 | 546 | 7 | 31 | 47 | 334 | `src/seo/settings.ts` |
| 6 | 512 | 16 | 17 | 15 | 902 | `src/features/post/post.ts` |
| 7 | 494 | 19 | 12 | 14 | 893 | `src/widgets/resolver-service.ts` |
| 8 | 459 | 9 | 25 | 26 | 383 | `src/assistant/byok-tool-surface.ts` |
| 9 | 437 | 19 | 12 | 11 | 458 | `src/server/modules/assistant.ts` |
| 10 | 400 | 8 | 25 | 25 | 167 | `src/server/routes/admin/settings/register-definitions.ts` |
| 11 | 378 | 9 | 20 | 22 | 338 | `src/server/routes/admin/system/publish-site.ts` |
| 12 | 376 | 8 | 17 | 30 | 261 | `src/export/route-manifest.ts` |
| 13 | 360 | 12 | 13 | 17 | 736 | `src/export/site-exporter.ts` |
| 14 | 350 | 14 | 13 | 12 | 183 | `src/server/routes/admin/posts/update.ts` |
| 15 | 342 | 9 | 20 | 18 | 153 | `src/server/routes/admin/settings/set.ts` |
| 16 | 315 | 7 | 24 | 21 | 274 | `src/comments/settings.ts` |
| 17 | 315 | 7 | 17 | 28 | 228 | `src/features/theme/migration/theme-migration-plan.ts` |
| 18 | 312 | 12 | 13 | 13 | 429 | `src/features/source-control/commit-site.ts` |
| 19 | 308 | 28 | 0 | 11 | 808 | `src/server/agent-daemon/agent-daemon-server.ts` |
| 20 | 297 | 11 | 14 | 13 | 576 | `src/features/deployments/publish-credentials/store.ts` |
| 21 | 282 | 6 | 20 | 27 | 186 | `src/seo/write-service.ts` |
| 22 | 276 | 6 | 26 | 20 | 73 | `src/server/routes/admin/media/update.ts` |
| 23 | 276 | 12 | 13 | 10 | 649 | `src/features/post/tool-registrations.ts` |
| 24 | 264 | 4 | 25 | 41 | 223 | `src/forms/forms.ts` |
| 25 | 252 | 7 | 15 | 21 | 907 | `src/db/migration/manifest.ts` |
| 26 | 234 | 9 | 11 | 15 | 295 | `src/core/entry-refs/extractor.ts` |
| 27 | 234 | 9 | 13 | 13 | 618 | `src/features/theme/theme-files.ts` |
| 28 | 231 | 7 | 12 | 21 | 299 | `src/features/plugin-runtime/hook-registry.ts` |
| 29 | 224 | 8 | 14 | 14 | 471 | `src/features/source-control/tool-registrations.ts` |
| 30 | 216 | 4 | 36 | 18 | 299 | `src/assistant/execution-credential-store.ts` |
| 31 | 212 | 4 | 20 | 33 | 149 | `src/server/routes/admin/connectors/put-config.ts` |
| 32 | 204 | 6 | 18 | 16 | 114 | `src/server/routes/admin/settings/clear.ts` |
| 33 | 200 | 8 | 15 | 10 | 160 | `src/server/http/admin/widgets.ts` |
| 34 | 196 | 2 | 51 | 47 | 277 | `src/features/plugin-runtime/manifest.ts` |
| 35 | 196 | 7 | 11 | 17 | 467 | `src/features/theme/build-conformance.ts` |
| 36 | 196 | 7 | 13 | 15 | 154 | `src/server/routes/admin/plugins/set-enabled.ts` |
| 37 | 189 | 9 | 10 | 11 | 659 | `src/features/deployments/static-publish/verify.ts` |
| 38 | 186 | 6 | 17 | 14 | 79 | `src/server/routes/admin/users/write-policy-permission.ts` |
| 39 | 186 | 6 | 13 | 18 | 179 | `src/widgets/resolvers/index.ts` |
| 40 | 180 | 3 | 22 | 38 | 188 | `src/features/theme/validation/validate-theme-package.ts` |
| 41 | 168 | 6 | 16 | 12 | 123 | `src/server/routes/admin/assistant/list-models.ts` |
| 42 | 168 | 6 | 16 | 12 | 115 | `src/server/routes/admin/assistant/test-connection.ts` |
| 43 | 162 | 3 | 18 | 36 | 701 | `src/features/deployments/static-publish/s3-compatible-target.ts` |
| 44 | 162 | 6 | 14 | 13 | 198 | `src/features/plugin-runtime/activation.ts` |
| 45 | 160 | 4 | 15 | 25 | 495 | `src/features/agent-plugins/install.ts` |

### Notes on specific entries

- **#1 `pages.ts`** is the strongest single candidate in the repo: top of this list AND one of the
  four files currently failing `check-route-coverage-diff` (unit 85.86%, integration 55.74%). It is
  also the only file on the failing-gate list that is also ARCHITECTURE_DEBT — the other three are
  ordinary test gaps.
- **#19 `agent-daemon-server.ts`** is cyclomatic **0** with cognitive 11 — the inverse of
  FLAT_WIRING. Pure nesting, no operator counting. Nesting is the shape most worth removing, so its
  modest score understates it.
- **#34 `manifest.ts`** (cyc 51 / cog 47) and **#4 `manifest-v2.ts`** (43/52) are the two most tangled
  files left by raw complexity. Their churn is low (2 and 6), so they rank mid-table — worth doing,
  but not before the high-churn entries above them.
- **#22 `media/update.ts`** is 26/20 in **73 lines**. Density that high in a file that short usually
  means one function is doing everything; likely a fast win.

### Suggested wave structure

Three files per wave, one agent each, so no two agents share a directory:

- **Wave 2:** #1 `pages.ts`, #2 `publish-agent-tools.ts`, #3 `static-publish/adapter.ts`
- **Wave 3:** #4 `manifest-v2.ts`, #5 `seo/settings.ts`, #6 `post/post.ts`
- **Wave 4:** #7 `widgets/resolver-service.ts`, #8 `byok-tool-surface.ts`, #10 `register-definitions.ts`

Wave 1's measured cost: two agents, ~13 functions, 26 new tests, zero regressions, one recoverable
git incident (§ see `reference_shared_git_index_across_agents`). Budget similarly.

---

## 8. Open items, not yet decided

1. Bring the 4 failing changed files up to threshold (`presentation/get.ts`,
   `presentation/patch-active-theme.ts`, `system/publish-site.ts`, `site/pages.ts`).
2. Prune `development/scripts/route-test-failure-baseline.json` from 42 entries to 1.
3. Re-measure aggregate branch coverage without a worker OOM to confirm or dismiss the 73.86% →
   70.76% drop.
4. Decide gate expansion order across `src/features` (123 violations, largest), `src/server`
   non-route, and `src/assistant`.
5. Decide refactor order for the 66 ARCHITECTURE_DEBT route files.
6. `apps/site-chat` has no test runner wired at all — 10 source files, 3 test files.

**Excluded by owner instruction:** `src/themes`, `src/theme-archive`.
