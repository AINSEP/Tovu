# Coverage gap map — decision-ready — 2026-09-05

Status: COMPLETE. Built entirely from artifacts already on disk plus static (no-test-execution)
verification — grep, `git log`, reading source, and one Python lcov-parse. **Zero coverage-generating
commands were run in this task.** Where a claim needed a run I didn't have budget/permission for, it
is listed in §3 as unmeasured, not guessed.

Every number below states its scope and its staleness. **MEASURED** = I read the artifact/ran the
static check myself. **PER REPORT** = citing another report's number, not re-derived. **INFERRED** =
reasoning on top of a measured fact.

## 1. Top gaps, ranked by risk

### #1 — `system/sites.ts`: zero tests, live, wired, RBAC-gated, filesystem-mutating

**PER `2026-09-05-route-coverage-ground-truth.md` §7, spot-re-verified by me.** `apps/website/src/server/inbound/admin-http/routes/system/sites.ts` was added `115687af` (2026-09-04) and has **zero** test references anywhere in the tree (`grep -rl` for `registerAdminSitesRoutes` or its import path: no hits). It IS wired live (`app.ts:198`/`:1048`, real composition root, not dead code). Three endpoints — list/create/activate sites — all gated on `system.read`/`system.write`, all touch the real filesystem and site registry. The file's own `AdminSitesDeps` type exposes every dependency as an injectable override specifically so a route test could prove both branches cheaply — the seam exists and is unused. Also currently the one file failing `check:src-complexity-drift` (cyclomatic 11 / cognitive 10).

**Confirmed still the only such case, MEASURED just now**: `git log --since=2026-09-01 --diff-filter=A` over the three route directories that feed both existing route-coverage gates shows exactly one new route source file with no paired test file added this month — `system/sites.ts`. No sibling gap of the same shape exists.

**Job size**: small-to-medium. The DI seam is already built; this is "write a route test using the already-exposed override hooks," not a refactor.

**Confidence**: HIGH — both "zero test references" and "wired live" are direct greps/reads, not inference.

### #2 — Two identity/RBAC tests assert a guarantee they don't actually provide

**PER `2026-09-05-stale-fixture-test-audit.md` §2, MEASURED by that report empirically (scratch scripts, run and deleted, never touching the shared tree).**

- `apps/website/src/features/identity/__tests__/wiring.test.ts:259` — comment claims "fails if the backfill [`applyBuiltinRoleGrants`] is ever dropped." Empirically false: with `applyBuiltinRoleGrants` skipped entirely, the assertion still passes (a different mechanism, `migrateDeprecatedPermissionGrants`, grants the same permission on a fresh workspace). This test was **added by the same commit** (`db83fdaf`) that fixed the real permission-loss bug it claims to guard — i.e., the regression test for a real, already-shipped RBAC bug does not actually test for it.
- `apps/website/src/server/__tests__/routes/pages-update-html-auth.test.ts` — its `realIdentityHarness()` never constructs the pre-`theme.edit` vintage that `sites/tovu-com/content.db` (the real deployed DB, confirmed via read-only query) is actually in, so the HTTP-route sink of the same permission chain is untested for the vintage that ships.

**Why it matters**: this is the exact defect class (`admin` role silently losing `pages.edit_html` on already-seeded workspaces) that already shipped once and was fixed at `db83fdaf`. Two of the tests meant to prevent a recurrence would not catch one. Confirmed still-orphaned in the live DB today: `theme.edit`, `workspace.manage`, `admin.assistant.manage` are all missing from `content.db`'s `admin-builtin-policy` with no registered backfill (only `pages.edit_html` has one).

**Job size**: small — the fix pattern (seed, rewind to pre-fix vintage with `dropAdminThemeEdit`, assert) already exists 60 lines away in the same file's sibling (`edit-html-permission.test.ts`). Copy the pattern.

**Confidence**: HIGH — both are directly-measured, reproduced-and-shown-false claims, not inference.

### #3 — Admin `use-login.hooks.ts`/`use-sites.hooks.ts`-shaped hooks: DI seam means the component test never runs the real hook

**MEASURED by me, this task**, extending a pattern the api.ts report already named for `apps/admin`. This app's convention is "logic lives in `*.hooks.ts`, components take an injectable `useXHook` prop for testing" — but that convention means a component's own test can go green while the *real* hook (where the logic actually lives) is never executed by any test. I verified this concretely for two files, then swept for others matching the pattern:

- `Login.tsx`'s test (`Login.unit.test.tsx`) only imports `LoginController` (a type) from `use-login.hooks.ts` and drives everything through a hand-built `useLoginHook` stub — the real 80-line hook is never invoked from that file.
- Same shape confirmed for `Sites.tsx` / `use-sites.hooks.ts` (211 lines).
- **Both of those specific hooks turned out to have their OWN dedicated test file** (`use-login.hooks.unit.test.ts`, `use-sites.hooks.unit.test.tsx`, both importing the real implementation, not a mock) — so neither is actually a gap. Flagging this reversal explicitly: my first pass (matching test files only in the adjacent `hooks/__tests__/` directory) said "no test," which was wrong — this codebase puts hook tests in the feature's top-level `__tests__/`, not nested under `hooks/`. Correcting a live methodology error before it went in the report.
- Sweeping the same DI-bypass shape for **11 other files** that (a) show 0 lines hit in the stale `coverage-lib-audit` snapshot (§below), (b) have no test file anywhere in the tree matching their name, and (c) are consumed only by one parent screen (not by another hook or a direct test): `use-admin-execution-mode.hooks.ts` (73 lines, ai-assistant), `FullSiteTab.tsx`/`HistoryTab.tsx` (152/63 lines, deployment), `use-field-attributes-dialog.hooks.ts`/`use-form-fields-editor.hooks.ts` (64/68 lines, forms), `use-playground-canvas.hooks.ts` (49 lines), `use-agent-plugins.hooks.ts` (66 lines), `Redirects.tsx` (316 lines — a full screen, not just a hook), `use-seo-entry-section.hooks.ts` (19 lines), `use-sitemap-modal.hooks.ts` (157 lines), `use-theme-explore-preview-frame.hooks.ts` (54 lines). ~1080 lines total, no dedicated test.

**Why it matters**: this is the dominant defect shape this repo's own memory already names ("correct primitive, unwired call site") applied to tests specifically — the seam exists, the discipline of writing the hook-level test is inconsistent.

**Confidence**: MEDIUM. I confirmed "no test file matches this name" and "not consumed by another tested module" for all 11, but did **not** individually open each parent screen's test to rule out an indirect real (non-DI-stubbed) exercise the way I did for Login/Sites — given the Login/Sites result flipped my initial read, some of these 11 could too. Treat as "very likely, pattern-consistent, not individually confirmed" rather than as certain as #1/#2.

### #4 — `apps/admin/src/lib/api.ts`'s 10 unhit client methods

**PER `2026-09-05-api-ts-coverage-measurement.md`, MEASURED that session** (scoped `vitest run --coverage.include=src/lib/api.ts`, 13 suites, 326 tests). 10 of ~200 HTTP client methods never called by any of the 13 suites: `listPages`, `createPage`, `listMembers`, `disableMember`, `listMenus`, `getMenu`, `getWorkspace`, `updateWorkspace`, `listTaxonomies`, `listPlugins`. Also: the `onUnauthenticated` listener-registration path and its unsubscribe closure are never exercised (no test drives a real `401`/`UNAUTHENTICATED` response through `request()`), and 5 named branches (session-invalidity notification, `getSettingsEffective`'s no-`principalId` path, 5 of `getDatabaseTimeline`'s filter branches) are unhit.

**Why it matters**: these are the client-side call sites for members/menus/workspace/taxonomy/plugins/pages admin operations — a regression in any of the 10 methods' URL/method/body assembly ships undetected from this layer (route-level tests may still catch some, not verified here).

**Job size**: small — these are thin wrapper methods; a handful of new test cases in the existing suite files would close all 10.

**Confidence**: HIGH — direct measurement, function names and line numbers read from source.

### #5 — Two CI-gate self-tests pass regardless of whether the regression they name exists

**PER this session's audits (Gemini findings, independently verified by me at the cited line — see "verification" below), confirmed by direct read, not test execution.**

- `development/scripts/__tests__/dead-path-sweep.test.ts:669-676` ("generated coverage artifacts are not reported as dead paths") compares a truncated-to-parent-directory string against a full-path array that can never contain it — the assertion passes whether or not the underlying regression exists. **MEASURED** (`grep -n "governance"` / reading `dead-path-sweep.ts` directly): confirmed the truncation shape is real.
- `development/scripts/__tests__/check-governance-adr-scope-drift.test.ts:125-129` (title: "a mid-segment `*` doesn't span `/`") uses a negative case (`"apikeys"` vs. `*api-key*`) that fails for an unrelated reason (a missing hyphen), so it can't distinguish correct glob translation from the regression it claims to catch.
- Separately, **MEASURED by me directly**: `check-governance-adr-scope-drift.ts` reads `ADS-memory/governance/adrs/ADR-INDEX.md`, and `git ls-files ADS-memory/governance/` returns **zero files** — the directory is gitignored. The script's own comment (line 247) already discloses this and treats "file absent" as "no governance ADRs apply, skip" — so the gate is a no-op on any checkout other than the one machine that happens to have that directory locally, which is disclosed behavior, not a hidden bug, but is still a coverage-relevant fact: this gate provides **zero enforcement in CI or on a fresh clone**.
- `development/scripts/lib/dead-path-sweep.ts` cannot see single-segment `path.join(BASE, "lit")`-style calls (its own extraction logic only keeps the trailing literal run); **MEASURED**: `development/scripts/rewrite-deep-imports.ts:50` references a path shape this blind spot would miss, and this file's own header/usage suggests it's a genuinely live script, not dead code.

**Why it matters**: a gate reporting green while not gating is worse than no gate — it actively suppresses the search for a replacement.

**Job size**: small per item (each is a targeted test-fixture fix), except the gitignored-directory issue which is a process/CI question (does CI have this directory populated?), not a code fix.

**Confidence**: HIGH for the two vacuous-assertion findings (independently re-derived from source, not just relayed from Gemini) and the gitignore fact (direct `git ls-files`); MEDIUM for the "live undetected victim" framing of `rewrite-deep-imports.ts:50` (the file exists and matches the described shape; I did not independently trace whether the sweep tool is invoked anywhere that would actually need to catch it).

### #6 — `use-access-tokens.unit.test.tsx:141` zero-assertion test, with a false "impossible to assert" claim

**PER Gemini audit chunk 13a, independently re-verified by me by reading the file directly.** The test body (lines 141-155) contains `waitFor` for mount plus two `act()` calls and **zero `expect()`s**. Its own comment claims "No assertion beyond 'did not throw' is possible" — I confirmed this claim is itself questionable: the same file already uses `replaceToken` elsewhere (lines 1112-1139) as an indirect probe that could surface the seeded draft value, so an assertion likely IS possible; the test's own justification for skipping it doesn't hold up.

**Why it matters**: this guards `persistedRow?.name ?? ""` / `persistedRow?.username ?? ""` seeding for a stale/removed row id — a regression here (corrupting or dropping the seeded fallback) ships undetected.

**Job size**: small — add the same indirect-probe assertion the file already uses elsewhere.

**Confidence**: HIGH — read directly, both the zero-assertion fact and the "an assertion is actually possible" counter-claim.

### #7 — `save-form.unit.test.ts` (external-mcp, apps/website): can't fail against the mutant it's named for

**PER `2026-09-05-gemini-audit-features-platform.md` chunk 1, re-verified there by direct source read.** The test `"neither env nor secret fields ever carry a value key, regardless of input"` can never fail: `ExternalMcpSaveInput` has no `env`/`oauthClientSecret` fields at all, so it's the **type system**, not the assertion, preventing the dangerous case from ever reaching the code under test. A mutant that changed the field-builder to leak a stored secret into `value` would not be caught.

**Job size**: small — needs either a differently-typed test input or an assertion that targets the actual omission logic directly rather than relying on the type system to make the dangerous path unreachable.

**Confidence**: MEDIUM-HIGH — PER report, not independently re-derived by me from source in this task, but that report's own methodology (verify every claim against actual source) gives it more weight than an unverified Gemini claim.

### #8 — Route coverage's real percentage was never finished being measured today

Not a code gap — a **measurement gap** that blocks ranking anything below #1 with real numbers. `2026-09-05-route-coverage-ground-truth.md` §3/§4 are explicitly "TBD": the dispatch that was supposed to produce a real `apps/website` route coverage percentage over the 170 test files it identified never got to run/parse it before the session ended. Its own §5 shows the **previous** number (`2026-09-03-route-coverage-below-100.md`'s worst-10) is stale in the other direction — every one of those 10 files was fixed same-day, hours after that snapshot. So: no trustworthy current route-coverage percentage exists for `apps/website` at all right now; only the one concrete zero-test file (#1) and the currency-check of the old worst-10 (all now fixed) are solid.

**What would establish it**: run exactly the command already fully specified in that report §2 (170 files, `node --import tsx --test --experimental-test-coverage`, isolated scratch lcov destination), then parse it — at a time when the machine isn't at load 27+.

### #9 — `apps/admin` has no trustworthy whole-app coverage number, and the one broad artifact on disk is unattributed and partial

See §2 below for the full unreliability finding — flagged here because "we don't actually know the whole-app number, and the one snapshot that looks like an answer isn't one" is itself a top-of-list fact for a "what haven't we done coverage for" question.

### #10 — `apps/admin`'s Media.tsx / Collections.tsx / MenuEditor.tsx and the hooks-extraction refactor sweep have no dedicated test-quality pass

**PER both gemini-audit-admin-tooling reports' own "not covered" lists.** These three screens (363/268/114-line diffs) and a broader hooks-extraction refactor batch (Pages/Posts/ThemeExplore/AiAssistant/etc.) were explicitly named as un-audited by the code-quality sweep. This is not itself a coverage-percentage claim (no lcov data was cited either way) — it's an honest "nobody has looked here yet" flag, listed low because it's the least specific of the ten.

## 2. What is actually well covered — don't re-fix these

- **`apps/admin/src/lib/api.ts`**: functions 207/219 (94.52%), branches 173/184 (94.02%), lines 285/298 (95.63%), statements 304/324 (93.82%). **Scope**: one `vitest run --coverage.include=src/lib/api.ts` over the 13 test files whose real (non-mocked) exercise of `api.ts` was individually verified. **Staleness**: same-day (2026-09-05), still current — no `api.ts` changes since. Do not compare this number to the previously-circulated "`BRH 91/184` (49.46%), `FNH 71/216`" figure from `project_tovu_open_decisions_2026_09_05` memory — that snapshot predates 5 of the 13 test files (added same morning, ~50 minutes after that snapshot was taken) and is now refuted/stale, not a live gap. **Do not re-open the "~145 untested endpoints" item.**
- **`apps/website`'s general (non-route) source, the trustworthy half of it**: PER the superseded-but-not-wrong `2026-09-03-coverage-gap-analysis-existing-data.md` §3, of 626 clean (non-dual-instantiation-contaminated), function-bearing files outside `server/routes/**`, **zero** are at 0% line coverage and only 3 are under 50% branch — all three explained as legitimate (a self-invoking entrypoint, a test fixture, a CLI command near-100% line). This conclusion is from a 14-day-old lcov for the *clean* half only — treat the specific 3-file table as current-enough (nothing suggests regression) but do not extend the "nothing urgent" verdict to the contaminated half, which this report explicitly couldn't speak to.
- **Route-level regressions from the 2026-09-03 worst-10 list are CLOSED.** `entries/update.ts`, `entries/lifecycle.ts`, `recovery/deep-link.ts`, `connectors/disconnect.ts`, `change-sets/revert.ts`, `redirects/import.ts`, `seo/get-entry.ts`, `users/list.ts`, `users/enable.ts`, `comments/moderation-queue.ts` were all fixed same-day (2026-09-03, 15:03-17:13), confirmed via `git log` against both source and paired test files. Do not re-queue any of these.
- **The Route-W/Route-A dual-instantiation contamination is 2/4-ish fixed today.** `worker-sandbox.ts` (Route W, ~87% of the 71 originally-contaminated blocks) and `commit-site.ts` (Route A's dominant call site) are both fixed and MEASURED clean (0 of 63 blocks contaminated, post-fix). Their blast radius (theme/widgets/forms/post/media/db-schema, `contracts/core/events/*`, `platform/export/*`, `platform/routing/routing.ts`) should now read real numbers in a fresh full run, not the corrupted ones from the 2026-09-03 lcov.
- **`backfill-custom-credential-usernames.test.ts`** — independently spot-checked by the chunk-13 test-quality pass and confirmed genuinely strong (real subprocess execution, real SQLite state, real AES-GCM byte comparison).

## 3. Numbers that could NOT be established here, and what would settle each

1. **A trustworthy current `apps/website` route-coverage percentage.** Blocked on: the exact 170-file, isolated-lcov command already fully specified in `2026-09-05-route-coverage-ground-truth.md` §2, run to completion and parsed (§3/§4 of that report were never filled in). Needs a quiet machine (today's run hit load 27.20 mid-run).
2. **A trustworthy whole-`apps/admin` coverage percentage.** `apps/admin/coverage-lib-audit/lcov.info` (420KB, 417 SF blocks, mtime 2026-09-04 17:13) looks like an answer — naive parse gives lines 61.04%, functions 57.36%, branches 56.34% — but I traced its provenance and it is **not usable as a real number**: no report on disk cites or explains it (no committed command, no author attribution), and cross-checking its "absent" and "0-lines-hit" files against actual test-file existence shows it is a **partial/scoped run, not a full-suite run** — 33 of 37 non-trivial "completely absent" files and 42 of 53 "0% covered" files DO have a dedicated test file elsewhere in the tree that this particular run evidently didn't execute. Treating its 56-61% headline as "real apps/admin coverage" would repeat the exact "scoped-run omission ≠ zero coverage" trap this repo has been burned by before. **What would settle it**: find out what command produced this file (nobody currently knows) or discard it and run a fresh, deliberately full `apps/admin` `vitest run --coverage` at a quiet moment, with an isolated `--coverage.reportsDirectory` (two admin coverage runs are documented to clobber each other's default `.tmp` dir).
3. **Whether the 11 hooks/screens named in gap #3 are truly untested**, vs. exercised indirectly by a parent screen's test in a way that doesn't show up as a same-name test file (the way I initially, wrongly, concluded for `use-login.hooks.ts`/`use-sites.hooks.ts` before correcting it). **What would settle it**: open each of the 11 parent tests and check whether the hook is imported for real or swapped for a DI stub — 11 quick reads, no test execution needed.
4. **Whether `dead-path-sweep.ts`'s single-segment blind spot has other live victims** beyond the one confirmed (`rewrite-deep-imports.ts:50`). **What would settle it**: a repo-wide grep for `path.join(<identifier>, "<single-segment-literal>")` shapes, cross-referenced against the sweep's own segment-extraction logic — a static check, no execution needed, just not done here (out of the stated `apps/**` scope).
5. **The real post-fix contamination count for a full `test:cov`.** PER `2026-09-05-coverage-dual-instantiation-routes-W-and-A.md`: INFERRED only — of the original 71 contaminated blocks, ~68 should now be clean (Fixes 1+2), leaving `static-publish/adapter.ts`'s still-open `require()` plus the 2 `packages/sdk` detector-precision false-positives as the residual. A full `test:cov` is explicitly forbidden on this machine right now, so this is an estimate, not a number.
6. **Two MCP-UI same-origin security claims** (App.tsx/AssistantDock chunk) — PER the gemini-audit-admin-tooling report, "neither confirmed nor discarded," needs an actual browser smoke test, not a coverage measurement. Flagging because it's adjacent to coverage work (the same audit pass) but it's a manual-verification gap, not a test-coverage one.

## 4. Genuinely untested vs. tested-but-vacuous — the remedies differ

**Genuinely untested (write a new test):**
- `system/sites.ts` (gap #1) — no test exists at all.
- `apps/admin/src/lib/api.ts`'s 10 unhit methods (gap #4) — no call anywhere in the audited suites.
- The 11 admin hooks/screens in gap #3 (medium confidence, per the caveat above) — no matching test file found.
- `pages-update-html-auth.test.ts`'s missing pre-`theme.edit` vintage case (part of gap #2) — the vintage genuinely isn't constructed anywhere in that file.

**Tested, but the test can't fail against the regression it names (fix the test, not "add coverage"):**
- `wiring.test.ts:259` (gap #2) — passes with or without the mechanism it claims to guard.
- `use-access-tokens.unit.test.tsx:141` (gap #6) — zero assertions, and an assertion is likely possible.
- `save-form.unit.test.ts` (gap #7) — the type system, not the assertion, makes the dangerous input unconstructable.
- `dead-path-sweep.test.ts:669-676` and `check-governance-adr-scope-drift.test.ts:125-129` (gap #5) — both pass regardless of whether their named regression is present.
- Three more LOW-confidence candidates of the same shape, not fully re-derived (PER Gemini chunk 13, "accepted without full independent re-derivation"): a `meaningful.length < 2` skip with no assertion counter, two "historical: flagged as dead" tests that check `fs.existsSync` directly instead of the sweep's own logic, and a `findEmptyGlobs` test whose fixture provides only one glob despite its title claiming to prove "each" glob is checked.

**Honestly narrow-scoped (not a defect, don't "fix"):**
- Two tests explicitly titled "...safely..."/"...without crashing..." (`use-access-tokens.unit.test.tsx:1127`, `AccessTokensTab.credential-flows.unit.test.tsx:600,610`) — Gemini flagged these as overclaiming; verification showed their own titles already disclose the narrow scope. Real, deliberately narrow smoke tests, not false confidence.
- `api-endpoint-option-branches.unit.test.ts:389` — title reads as backwards, but the assertion is correct once the actual call chain (`fetchOrThrowUnreachable` -> `throwTranslatedFetchFailure`) is traced. A naming nit, not a test-quality bug.

## Sources consulted (all pre-existing, none regenerated)

`2026-09-05-api-ts-coverage-measurement.md`, `2026-09-05-route-coverage-ground-truth.md`,
`2026-09-05-coverage-dual-instantiation-routes-W-and-A.md`, `2026-09-05-stale-fixture-test-audit.md`,
`2026-09-03-coverage-gap-analysis-existing-data.md` (superseded, re-verified not re-quoted),
`2026-09-05-gemini-audit-admin-tooling.md`, `2026-09-05-gemini-audit-admin-tooling-chunks-8-13.md`,
`2026-09-05-gemini-audit-features-platform.md`, plus direct reads of `apps/admin/coverage/lcov.info`,
`apps/admin/coverage-lib-audit/lcov.info`, `development/coverage/lcov.info`, and the source files named
above. `check:route-coverage-floor`'s output was **not** cited anywhere in this report — it runs no
tests and reads a stale lcov (per standing project knowledge), so its green/red proves nothing about
current code.
