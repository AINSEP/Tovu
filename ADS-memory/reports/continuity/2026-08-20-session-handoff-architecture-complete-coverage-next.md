# Handoff — Tovu, 2026-08-20

**Branch:** `general-work` @ `1c33b7c4` (pushed, 14 commits this session)
**Status:** architecture plan **complete, all 3 steps**. Next workstream is **test coverage**.

---

## ⛔ READ FIRST — three facts that change what you'd otherwise do

### 1. `npm run ci:local` does NOT run any tests

This is the single most important thing in this document. All night, "8/8 PASS" was reported after
every change. **Those 8 gates contain zero tests.** They are: typecheck root, `check:boundaries`,
`check:architecture`, `check:inventory`, `check:src-complexity-drift`, complexity/eslint, typecheck
admin, `admin:build`.

Tests are opt-in flags that nobody ran this session:

```bash
npm run ci:local                  # 8 gates, NO tests            <- what everyone ran
npm run ci:local:tests            # + npm run test:ci (full suite)
npm run ci:local:route-coverage   # + the 5 route-coverage gates
bash development/scripts/ci-local.sh --with-tests --route-coverage   # everything
```

`.github/workflows/ci.yml`'s own `test` step is **non-blocking**, which is why the local mirror
treats it as opt-in. So a green branch has never meant a tested branch.

### 2. The coverage gate exists, is strict, and was never run against this session's changes

Built 2026-08-16 (`ADS-memory/reports/.../2026-08-16-route-coverage-gates.md`). Two gates, both
scoped to **`src/server/routes/**` only**:

| Gate | File | Threshold |
|---|---|---|
| Aggregate floor | `development/scripts/check-route-coverage-floor.ts` | `line 88`, `branch 68`, `funcs 93` |
| Per-changed-file, tiered | `development/scripts/check-route-coverage-diff.ts` | unit branch **≥ 99%**, integration branch **≥ 95%** |

The 2026-08-16 measured baseline was line 92.15%, branch 73.86%, funcs 97.52% — the floor sits a few
points under it deliberately.

**This session changed `src/server/routes/admin/system/publish-site.ts`, which is inside that gate's
scope, and the gate was never run.** That is the first thing to do next session:

```bash
npm run ci:local:route-coverage
```

If it fails, it is our change that has to be brought up to threshold, not the gate that needs
relaxing.

### 3. GitHub Actions is billing-blocked — unrelated to the above

Jobs die in ~3s, zero steps executed. `gh run list` shows plain `failure`; the tell is 0 steps and
seconds rather than minutes. Nothing in the repo fixes it. Do not dispatch anyone at it. Local CI is
the chosen substitute — which is exactly why knowing what `ci:local` does and does not cover matters.

---

## What we did this session

### Architecture plan — COMPLETE (all 3 steps)

The plan came from a six-model debate that unanimously rejected an 8-12 week rewrite in favour of
~1.5 weeks of targeted work.

| Step | Status |
|---|---|
| 1. Rename the metric, print membership | ✅ `bf24571c` (earlier session) |
| 2. Close boundary violations, tighten the rule | ✅ this session |
| 3. Narrow `AssistantToolRegistryDeps` | ✅ — see "step 3 was already done" below |

**Measured results, verified at HEAD by the Coordinator, not relayed:**

```
feature-no-express-or-admin-imports    9 → 0   (and promoted warn → error)
back-edges into composition root      11 → 0
propagation cost (all-import)       12.2 → 11.67   (improved past baseline)
module API surface (files exposed)   201 → 199
```

**The core technique, worth understanding before touching any of it:** several domains named the
`RouteDeps` god type because they passed it to `exportSite`, which boots a second in-process
`createApp(routeDeps)`. `RouteDeps.runExportSite` is `ExportEngine<RouteDeps>` (`types.ts:1156`) —
non-generic, so contravariance defeats any narrower stand-in. **A narrower TYPE is impossible; a
pre-bound FUNCTION is not.** The composition roots (`server/app.ts`'s `createRouteDeps()`,
`server/deps.ts`'s `createSqliteRouteDeps()`) now close over `RouteDeps` and hand down bound nullary
closures — `exportSiteBound`, `createSiteApp`, `resolveStorefrontProducts` — so no domain names
`RouteDeps` at all.

**Step 3 was already done, and the plan was written on a wrong premise.** The handoff said "narrow
`AssistantToolRegistryDeps`'s consumer signature one `contribute*Tools()` at a time." All 24
`contribute*Tools()` functions take **zero arguments** — there is no signature to narrow. And the
type was already the union of each domain's own narrow contract, never `RouteDeps`. Step 2 made it
genuinely narrower as a side effect: `DeploymentsToolDeps`, `StaticPublishToolDeps` and
`SourceControlToolDeps` were the whole god-bag that morning and are small interfaces now.

### Bugs and hazards caught along the way

1. **A design-review bug that types could not catch.** `ExportEngine`'s options bag contains
   `routeDeps`, so `exportSite({ routeDeps, ...opts })` lets a *narrow* deps object silently override
   the real one. Excess properties on non-literal arguments pass silently — green `tsc`, broken
   runtime. Closed at both the composition root (`{ ...opts, routeDeps }`) and at call sites
   (explicit destructuring), with a regression test verified to fail against the naive ordering.
2. **The closure-identity test gotcha — the most dangerous thing here.** A fixture built as
   `{ ...createRouteDeps(), field: fake }` produces an object the closure never captured, so the
   override goes **silently inert** and the test passes for the wrong reason. It made a
   "broken asset blocks the commit" test stop testing anything while still green. Three fixtures
   fixed; two more landmines caught in the mandatory audit before they shipped. **Rule: any
   `RouteDeps` field bound by closure at construction time must be overridden by mutation, never
   spread.** Documented on `RouteDeps.exportSiteBound` itself.
3. **A red HEAD hidden behind a green gate.** An agent reported "8/8 PASS, nothing left open" while
   HEAD was genuinely broken — a required caller fix sat uncommitted in the tree the gate measured.
   Fixed in `a95a238f`. **Verify commits, never the tree:**
   `git log --oneline <baseline>..HEAD --name-only`.
4. **Six false code comments**, now in a committed register — see below.

---

## Checks to make (in order)

1. **`npm run ci:local:route-coverage`** — never run against this session's changes, and
   `publish-site.ts` is in scope. Highest priority.
2. **`npm run ci:local:tests`** — the full suite has not run end-to-end this session. Note the memory
   warning: the full suite measures 5.4 GB across 13 workers. **Always `TEST_CONCURRENCY=2`**
   (`ci-local.sh` already defaults it to 2 for these flags).
3. **`npm run ci:local`** — 8/8 at `1c33b7c4`, re-confirm after any change.
4. **Reconcile the untracked file** `ADS-memory/reports/architecture/2026-08-20-extension-surface-gap-inventory.md`.
   It appeared mid-session, no agent claimed it, and it is still untracked. Establish whose it is
   before committing or deleting it.

---

## Next workstream — test coverage

**This is why the architecture work happened at all**: the CI gate was not meaningfully protecting
the repo, because the parts that would catch regressions are opt-in and partial. The goal is full
unit coverage and full integration coverage, not a floor.

Known shape of the problem:

- **Coverage gates only cover `src/server/routes/**`.** Everything else — `src/features/**`,
  `src/assistant/**`, `src/export/**`, `src/seo/**`, `packages/**` — has no coverage gate at all.
  Tonight's work touched all of those.
- **The strict thresholds are per-changed-file, not repo-wide.** `check-route-coverage-diff.ts`
  demands unit branch ≥ 99% and integration branch ≥ 95%, but only on files a diff touches. A file
  nobody edits can sit at any coverage forever.
- **The tiered split exists for a good reason** — read `check-route-coverage-diff.ts`'s header. A
  single combined threshold let a file pass on integration coverage alone with near-zero real unit
  coverage. `route-coverage-lib.ts`'s `isIntegrationTestFile` is what classifies a test into a tier.
- **`tsc` does not check `__tests__` at all** (`tsconfig` excludes it). Four pre-existing type errors
  are sitting in test files right now, reported by no gate: `commit-site.unit.test.ts` /
  `adapter.unit.test.ts` (`GitHubCommitAdapterResult.filesDeleted` missing, a `never`-typed
  array-literal quirk), `assistant-byok-routes.test.ts` (`PostRecord` missing `bodyFormat` /
  `bodyHtml`, an optional `registerRoutes?.()` call). None block runtime because `tsx` strips types.
  This is a real hole nobody tracks.

Suggested sequencing (not yet agreed with the owner):

1. Measure honestly first — run the tiered coverage commands and get real unit-vs-integration numbers
   per area, rather than assuming where the gaps are.
2. Decide scope with the owner: extending the existing gate's *scope* beyond
   `src/server/routes/**` is likely higher value than raising its *thresholds*.
3. Only then write tests. Writing tests before measuring risks covering what is already covered.

**Relevant existing tooling** (do not rebuild these): `test:cov`, `test:cov:server`,
`test:cov:server:unit`, `test:cov:server:integration`, `test:cov:server:tiered`,
`development/scripts/classify-coverage-gaps.ts`, `development/scripts/route-coverage-lib.ts`,
`scripts/mutation-sweep.mjs`.

---

## Improvements worth considering

- **Make the test gate blocking, or at least make its absence loud.** The current split silently
  encourages "8/8 PASS" as a completion signal when it proves nothing about behaviour.
- **Extend the boundary rule past `^src/features`.** It cannot see `src/assistant/`, `src/widgets/`,
  `src/export/`. Note: a naive widening was tried and reverted this session — `src/assistant/`
  contains genuine route files (`a2ui-actions-route.ts`, `mcp-ui-tool-calls-route.ts`) that
  legitimately import Express types, so any widening needs a route-file carve-out.
- **Fix the two open false comments** in the register (below).
- **`src/seo/types.ts`'s `EntrySnapshotIdentity`** is dead and does not guard what it claims — either
  make the guard real and reference it, or delete it.
- **`.github/workflows/ci.yml`** — the owner wanted the triggers disabled rather than the file
  deleted, so re-enabling is one line. Still open from the previous handoff.
- **A spec now contradicts the code**: `ADS-memory/specs/custom-publish-provider-contract.md` §7 says
  "no delete is the safer default" — that was the S3 bug. Still open from the previous handoff.
- **`origin/main` is behind `general-work`.** Still open from the previous handoff.

---

## Traps — carry these forward

- **Never `git add -A` / `git add .`** — ~40 files in the tree belong to other concurrent sessions.
  Stage explicit paths and verify `--cached` in the same command as the commit.
- **Never `git stash`** in any form. The stash stack is shared; a `git stash -u` swallowed another
  session's work this week. Recovery is `git stash apply`, never `pop`.
- **A brand-new untracked file needs an explicit `git add`** — `git commit -- <path>` silently skips
  it. This nearly lost a report.
- **A green gate can hide a red HEAD.** Diff `<baseline>..HEAD --name-only` against the claimed file
  list. A file in the work but in no commit is the tell.
- **Do not trust this repo's code comments.** Six proven false in 24 hours; register at
  `ADS-memory/reports/2026-08-20-false-code-comments-register.md` (`87ad4f8c`), with two still open
  on disk. Three failure shapes: invented citation, true premise with a false conclusion, and a real
  constraint stated wider than it holds.
- **Stand an agent down before respawning a replacement.** A queued message is a delayed work order:
  an idle agent picks it up on wake and resumes. That produced two agents in one tree this session,
  eight modified files, and no way to attribute a hunk from git alone.
- **An agent that asks a blocking question does not reliably wait for the answer.** One ended with
  "flagging before I commit — your call", then committed before the reply landed.
- **Never run the full test suite without `TEST_CONCURRENCY=2`** — 5.4 GB across 13 workers.
- **vitest is NOT installed at the Tovu root.** The runner is `node --import tsx --test`.

---

## Reports written this session

- `ADS-memory/reports/2026-08-20-architecture-step2-routedeps-narrowing.md` — the design, per-site table
- `ADS-memory/reports/2026-08-20-architecture-final-backedge-closure.md` — back-edge closure, plus a
  "where this work is less than certain" section
- `ADS-memory/reports/2026-08-20-false-code-comments-register.md` — the register
- `ADS-memory/reports/continuity/2026-08-20-architecture-step2-narrowing-handoff.md` — mid-session
  context-limit handoff
- `ADS-memory/reports/2026-08-19-architecture-step2-boundary-closure.md` — superseded; its config-only
  conclusion was rejected by the owner, but its per-edge verification tables remain useful

---

## Next-agent opening prompt

> Read `AI-Dev-Shop/AGENTS.md` first, then
> `ADS-memory/reports/continuity/2026-08-20-session-handoff-architecture-complete-coverage-next.md`.
>
> The architecture plan is COMPLETE — all 3 steps. Do not re-open it, and do not re-propose the
> rewrite (rejected unanimously by six models). Boundary violations and back-edges into the
> composition root are both at 0, verified at `1c33b7c4`.
>
> **`npm run ci:local` runs NO tests** — its 8 gates are typecheck/lint/architecture only. Tests are
> opt-in: `npm run ci:local:tests` and `npm run ci:local:route-coverage`. GitHub Actions is
> billing-blocked; ignore it.
>
> **Start by running `npm run ci:local:route-coverage`.** It was never run against last session's
> changes and `src/server/routes/admin/system/publish-site.ts` is inside its scope. If it fails, our
> change comes up to threshold — do not relax the gate.
>
> Then the coverage workstream: measure real unit-vs-integration numbers per area BEFORE writing any
> tests. The existing gate only covers `src/server/routes/**`; `src/features/**`, `src/assistant/**`,
> `src/export/**`, `src/seo/**` and `packages/**` have no coverage gate at all.
>
> Traps: never `git add -A`, never `git stash`, ~40 dirty files belong to other sessions, always
> `TEST_CONCURRENCY=2`, `tsc` excludes `__tests__`, vitest is not installed, and this repo's code
> comments have been proven false six times — verify against the source any comment cites.
