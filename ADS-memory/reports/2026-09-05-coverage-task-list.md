# Coverage task list — apps/admin + features/* (owner-directed)

**Created** 2026-09-05, at Leona's request. **Status: NOT STARTED — awaiting her direction per task.**

## Standing rules that govern every task here

- **100% is the bar.** A file at 96/97/98% is a signal the code needs **refactoring,
  restructuring, or extraction of dead branches** — not a number to chase with more tests.
- **Never delete a branch to raise coverage.** Delete only if unreachability is provable
  locally; if the branch exists because a framework or protocol contract permits that input,
  KEEP it and test it by direct invocation. An agent tried the deletion shortcut on
  `widgets/agent-tools.ts` today (reducing a `typeof body.config === "object" && body.config
  !== null` guard on an unvalidated admin HTTP body to a bare cast) and was caught uncommitted.
  Getting this backwards previously cost 12 restorations.
- **Verify before trusting any prior claim.** Leona: *"I don't necessarily trust what the other
  agents said about these."* Every entry below starts UNVERIFIED. See the trap register.
- **A percentage without its scope is meaningless.** State which suites produced every number.

## The trap register — three wrong claims today, all the same shape

| Claim | Reality |
|---|---|
| `system/sites.ts` "zero tests anywhere" | 272-line HTTP test drives it via `fetch()`, never imports the module |
| `apps/admin/src/lib/api.ts` "~145 untested endpoints" | Measures **100%** (FNF 219/219, BRF 184/184) |
| 3 files on the §4a ranked worklist | Already at 100%; their suites live outside the scoped run's directory |

**Grepping for a symbol never proves coverage.** Search by import path, package name, URL, and
behavior. If tests can't be found, write *"could not find tests searching X, Y, Z"* — never
*"it has no tests."*

Also: a `vi.mock()`'d module reports ZERO coverage though tests exercise it. BRDA branch
positions are unstable under tsx — if a hit count changes between identical superset runs, the
data is self-contradicting; stop, don't build a finding on it. A file `.toString()`-serialized
into a browser reports parse-time noise as coverage.

## Tasks — apps/admin (beyond `api.ts`, which is done at 100%)

| # | Scope | State | Notes |
|---|---|---|---|
| A1 | Establish a *trustworthy* whole-`apps/admin` number | UNVERIFIED | No trustworthy number exists today. An unattributed `apps/admin/coverage-lib-audit/lcov.info` claims 56-61%; traced and rejected as a partial/scoped run (33/37 "absent" and 42/53 "0%" files have dedicated tests elsewhere). Needs a deliberate scoped pass, authorized at a quiet moment. |
| A2 | `features/*` hooks + screens with no locatable test | UNVERIFIED | ~11 hooks/screens (~1080 lines) reported; **2 of those were already misjudged** — their tests live one directory up. Re-derive from scratch. |
| A3 | Deferred TSX-logic sweep | UNVERIFIED | Interrupted mid-pass. Known deferred: `AccessTokensTab`, `OtherCredentialsSection`, `ThemeExplore` fullscreen lifecycle, `SitemapModal`, plus a full recount of `apps/admin/src/**`. |
| A4 | `Media.tsx`, `Collections.tsx`, `MenuEditor.tsx` | AUDITED, NOT COVERAGE-MEASURED | Gemini audit chunks 8-10 found them clean; no dedicated test-quality or coverage pass was run. |

**Exempt from A3:** three `.tsx` files carry an explicit "STAYS LOCAL — owner-ratified" comment.
Extraction was tried, broke real-DOM tests, and was reverted. Do not re-flag them.

## Tasks — apps/website non-route `features/*`

| # | Scope | State | Notes |
|---|---|---|---|
| F1 | All non-route `features/*` code | NEVER MEASURED | The bigger half of the codebase. No trustworthy number for any of it. |
| F2 | `features/theme` specifically | KNOWN-TRICKY | Its real exercisers live **outside** the feature directory; measuring the dir alone understates it. Use the per-file suite map. |

## Route surface — Leona's call, not to be quietly closed

Measured 238 files: **92.75% line / 87.70% branch / 86.19% function** (0-contamination lcov;
`ADS-memory/reports/2026-09-05-route-coverage-ground-truth.md`, `ea32ca42`, worklist in §4a).

| File | Gap | Why it's an owner decision |
|---|---|---|
| `widgets/agent-tools.ts` | 3 branches | 3 lines + 1 branch inside `removeRegionPlacement`'s `return mutateWidgetAreaPlacements({...})` read zero-hit **with no conditional logic to explain it** — possibly a tsx/V8 artifact on a multi-line literal, possibly a real seam worth extracting. |
| `site/media-rendition.ts` | 2 branches | One is line 27's compound OR (both sub-cases individually proven correct). The other's hit count **decreased** between identical superset runs — the known BRDA-instability trap. A branch that cannot be honestly measured is an argument for restructuring it into one that can. |

Leona's ruling: **these must reach 100%, and refactoring is the expected route** where something
isn't easily testable.

## Route worklist §4a items 5-12 — ALL UNVERIFIED, assume scope artifacts

The outgoing session took every one of these counters wholesale from an earlier agent and
**never checked them**. Items 1-3 of the same list were then *proven* to be scope artifacts —
all three were already at 100% functions. Example: §4a claimed `put-config.ts` was `FNF:8
FNH:2`; its real state was `FNF:8 FNH:8`. **Assume 5-11 are wrong the same way until each is
checked against its real driving tests.**

| # | File | Claimed gap |
|---|---|---|
| 5 | `system/publish-credentials.ts` | 14 branches |
| 6 | `system/sites.ts` | 11 branches (71.79%) |
| 7 | `system/custom-credentials.ts` | 11 branches (74.42%) |
| 8 | `system/vendor-credentials.ts` | 9 branches (75.68%) |
| 9 | `system/source-control-credentials.ts` | 9 branches (74.29%) |
| 10 | `taxonomy/merge-term.ts` | 11 branches (56.00% — worst claimed) |
| 11 | `media/upload.ts` | 10 branches (61.54%) |
| 12 | `assistant/test-agent.ts` + `test-connection.ts` | **Infra, not test-writing** — silently excluded from every run lacking `--test-coverage-exclude`, including CI's `test:cov:server` |

Items 7-9 are one cluster and likely share a single untested validation/probe-failure pattern;
they were ranked separately for dispatch reasons, not because they're independent.

### The 92.75/87.70/86.19 numbers are not reproducible as they stand

The lcov that produced them lived in a subagent's scratch directory and **is gone**. The
counters survive only as prose in the report. Re-running is required to extend or confirm them.
The measuring command (report §3) was one sequential invocation over a **170-file** set (72
`__tests__/routes/*.test.ts` + 80 admin-http + 18 public-http), while the **238-file**
denominator comes from `route-coverage-lib.ts`'s `isMeasurableRouteFile` — *a different set*.
That mismatch is itself a likely source of artifact percentages.

Nobody has independently re-run that measurement or checked its raw counters.

## Also open, unowned

- `system/publish-credentials.ts` — §4a item 5, reported 14 uncovered branches (in progress;
  the 14 figure is itself being checked for scope-artifact status first).
- `packages/*` — testability survey in progress; Leona's prior is "nothing to test there."
- A RED baseline: 3 failures in `post-template-site-serving.test.ts`, 1 in
  `settings-workspace-scoping.test.ts` (the latter was already dirty in the tree before today).

## Machine constraints

A full `test:cov` is forbidden — it OOMs this box, which crashed today at load 721 with swap at
6.4 GB of 8. Everything here must be a scoped pass against explicit paths. **One test
invocation at a time**; three concurrent runs reached load 620. Check `uptime` before and after
— a slow run is load, not a hang. **Any number measured during a load spike is void: discard
and re-measure, never adjust.**
