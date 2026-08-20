# Handoff — Architecture step 2 (RouteDeps narrowing), session end at ~500k context

**Date:** 2026-08-20
**Branch:** `general-work`
**Stopping HEAD:** `a95a238f`
**Written by:** Programmer (Execution) — stopping for a context-limit restart, not because the work
is stuck. A fresh agent is picking this up next. Read this whole file before touching anything;
several claims relayed to me mid-session about this exact file family turned out stale or wrong, and
I want you to verify rather than inherit my assumptions too.

## Read this first if you are the next agent

You have zero context on this task. Start by reading, in order:
1. This file, all of it.
2. `ADS-memory/reports/2026-08-20-architecture-step2-routedeps-narrowing.md` — the full design report
   (bound-function design, the 6 coupling sites and their narrow interfaces, rejected alternatives,
   the concurrent-agent incident, testing evidence).
3. `ADS-memory/reports/2026-08-19-architecture-step2-boundary-closure.md` — the SUPERSEDED prior
   attempt (config-only, rejected by the owner). Its superseding note at the top explains why; its
   per-edge verification table is still accurate evidence, just don't repeat its conclusion.
4. `git log --oneline daecfe5a..a95a238f` — 6 commits, in order: source-control narrowing, deployments
   narrowing + regression test, dependency-cruiser re-tightening, both reports, a fix to
   `publish-site.ts` landed by a different concurrent process (see "Concurrent-agent incident" below).

## Exact state at the stopping commit — what's done, what's verified

**Done and verified, fresh, against real HEAD (not the working tree — see the HEAD-vs-tree note
below for why that distinction matters here specifically):**
- `tsc -p tsconfig.json --noEmit`: 0 errors.
- `npm run ci:local` (`TEST_CONCURRENCY=2`): 8/8 PASS, run AFTER confirming the working tree exactly
  matched HEAD (nothing of this task's scope was uncommitted at run time).
- `check:architecture --list`: 0 module cycles / SCC 0. Back-edges into the composition root
  **11 → 6** (verified myself, not just relayed — see the remaining-6 breakdown below).
  `feature-no-express-or-admin-imports`: 0 production violations under the re-tightened rule.
  One pre-existing ratchet warning (propagation cost, all-import, 12.20% → 12.22%) — confirmed
  present at baseline BEFORE this dispatch touched anything; not caused by this work.
- 139 scoped tests passing across 5 test files that needed changes; 2 more files
  (`publish-agent-tools.unit.test.ts`, `assistant/__tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts`)
  needed zero changes, confirmed by running them before touching anything else in this task.
- The CHANGE 1 regression test (spread-ordering bug) is verified to actually catch the bug: I
  temporarily reverted the composition-root closure to the naive `{ routeDeps, ...opts }` ordering,
  reran, watched it fail with the exact predicted `TypeError: Cannot read properties of undefined
  (reading 'list')` three frames inside the real `exportSite`, then reverted the revert. Full trace is
  in the design report.

**Not done — genuinely open, not phantom:**
- The `VendorCredentialSetRepoPort` propagation-cost A/B the coordinator asked for (see "Remaining
  worklist" below) — I confirmed the real type-only import doesn't move module-cycle/SCC (0/0 both
  ways, that's structurally guaranteed for type-only edges), but never isolated its specific
  contribution to the "propagation cost (all-import)" ratchet metric specifically, which DOES count
  type-only edges. Not attempted at all this session.
- `ExportSiteBoundFn`'s three independently-declared copies (`commit-site.ts`, `adapter.ts`,
  `publish-agent-tools.ts`) have two different return types (`Promise<ExportReport>` vs., in
  `deployments/tool-registrations.ts`, `Promise<ExportRunReportLike>`). `tsc` is clean because they're
  structurally compatible. Left as-is deliberately — matches this codebase's own "duplicate the tiny
  type, don't share across files" convention — but flagged, not silently decided.

## A claim relayed to me that turned out FALSE — read before trusting anything else relayed to you

Partway through, the coordinator relayed a report from a second, concurrently-active agent
(`arch-step2-boundaries`) that `static-publish/__tests__/adapter.unit.test.ts` had "19 references to
`routeDeps`" and would break at runtime, calling it a "CONFIRMED BUG" the coordinator said they'd
independently verified. **I checked it directly before acting on it: false.** That file was already
fixed by ME, in this same session, hours earlier — I rewrote every `StaticPublishInput` construction
in it as part of the deployments commit (`a699c833`), ran all 28 of its tests, confirmed green, and
committed it. By the time the "19 refs" claim reached me, `grep -c routeDeps` on the real file returned
3 — all three are `createSiteAppWithFailingAsset`'s own parameter named `routeDeps: RouteDeps` (a
helper wrapping `RouteDeps.createSiteApp`'s real signature, unrelated to the removed `StaticPublishInput.routeDeps`
field), not stale references at all. I re-verified `git log -1 -- <file>` showed it already committed
at `a699c833` before I trusted this.

I'm not narrating this to relitigate it — I'm flagging it because the coordinator's own message said
this exact file family had already produced 3 prior false or stale claims embedded as confident-sounding
prose in comments, and this makes a 4th, this time from an agent status report rather than a code
comment. **Treat any claim about this file family's current state — from a comment, a relayed agent
report, or this handoff itself — as something to `grep`/`git log` and confirm yourself before acting,
not as ground truth.** I tried to hold myself to that standard throughout; verify I actually did.

## Concurrent-agent incident — final state

A second agent (`arch-step2-boundaries`, the one that authored the original `b6144774` the owner
rejected) was accidentally left active on this same brief for part of this session — the coordinator's
stand-down message queued behind stale work it picked up on wake. It authored (or partially authored)
3 files that ended up in my tree without me writing them: `static-publish/adapter.ts`,
`publish-agent-tools.ts` (partial — team-lead's first attribution pass missed this one; I found it
myself when I went to work on that file), and `src/server/routes/admin/system/publish-site.ts`. I
reviewed all 3 line-by-line as untrusted input before committing anything from them — full comparison
against what I'd have written is in the design report. All 3 were substantively correct; I rewrote one
stale comment block in `publish-agent-tools.ts` (it still claimed a hard zero-import rule against
`vendor-credentials` after the file had already gained a real, verified-safe type-only import) and
tightened `.dependency-cruiser.cjs`'s comment (its structural edit was correct; its prose referenced
`runSiteExport`/`export-run.ts`'s `BoundExportEngine`, names from an earlier, pre-CHANGE-2 design pass
that don't exist in the final shape — `export-run.ts` needed zero changes).

**`publish-site.ts` landed as a SEPARATE commit I didn't author**, `a95a238f`, by some other process in
this shared tree while I was mid-review of it — my own `git add` for it found nothing to stage because
it was already at HEAD by the time I ran it. I'd already reviewed its content (construct-a-literal, no
options-bag forwarding, no CHANGE 1 exposure) and confirmed it correct before that happened, so nothing
here needed redoing — just noting it landed under different authorship than the rest of the series.
**That commit's own message says something you should sit with**: it states HEAD was genuinely red
(a real `tsc` failure on a non-test file) between `a699c833` and `a95a238f`, and that an earlier
`npm run ci:local` run reporting 8/8 during that window was measuring the working tree, not HEAD — the
fix was sitting uncommitted while the check ran clean. **This is a known, named trap in this repo** (a
teammate memory titled "a repo-wide check measures the TREE, not HEAD") and it bit this exact task.
The 8/8 I'm reporting as current evidence above was re-run AFTER confirming working-tree-equals-HEAD
for everything in scope — but if you make ANY further edits, re-verify that equality before trusting a
green gate again.

## The design, tight

`RouteDeps.runExportSite: ExportEngine<RouteDeps>` (`server/routes/types.ts:1156`, unchanged, still
used by `export-site.ts` and `export-run.ts`'s `startExportRun`) is contravariant in its parameter — it
can only be assigned to a slot expecting the FULL `RouteDeps`, never a narrower stand-in. Two call
sites (`commitSiteToSourceControl`, `publishStaticSite`) genuinely need a real `exportSite` pass, so
they genuinely need `RouteDeps` *somewhere* in the chain. The fix isn't a narrower type — it's a
**pre-bound function with no `routeDeps` parameter at all**, closed over the full `RouteDeps` once, at
construction time, at the composition root:

```ts
// server/routes/types.ts, on RouteDeps
exportSiteBound: (options: { outputDir: string; clean?: boolean; basePath?: string }) => Promise<ExportReport>;
```

Bound in `server/app.ts`'s `createRouteDeps()` and `server/deps.ts`'s `createSqliteRouteDeps()` via a
self-referencing closure — both functions were restructured from `return { ...fields };` to
`const routeDeps: NewsletterRouteDeps = { ...fields, exportSiteBound: (opts) => exportSite({ ...opts, routeDeps }) }; return routeDeps;`.
This works because the arrow function's body isn't evaluated until called, by which point `routeDeps`
is fully constructed — a standard, safe self-referencing-object-literal pattern.

Each of the 3 consuming domain files (`commit-site.ts`, `adapter.ts`, `publish-agent-tools.ts`)
declares its own tiny local copy of this shape (`ExportSiteBoundFn`), never importing `RouteDeps`.

## THE SPREAD-ORDERING HAZARD — read this even if you skip everything else

`ExportEngine<T>`'s options object (`export-run.ts`) ALWAYS carries a `routeDeps: T` field. The first
draft of the composition-root closure was `{ routeDeps, ...opts }` — closed-over value FIRST. A caller
who forwards that whole `ExportEngine`-shaped bag into `exportSiteBound` (instead of destructuring
`{outputDir, clean, basePath}` explicitly) would have its OWN narrow `routeDeps` key silently overwrite
the real one via the spread, and the real `exportSite` would receive a broken, half-populated object in
place of `RouteDeps`. **`tsc` cannot catch this** — `exportSiteBound`'s declared parameter has no
`routeDeps` field at all, so an excess one on a non-literal argument passes silently.

Closed twice, both in the shipped commits:
1. Composition root now spreads `{ ...opts, routeDeps }` — closed-over value LAST, always wins.
2. `deployment_trigger_export`'s own adapter to `startExportRun` explicitly destructures
   `{outputDir, clean, basePath}` rather than forwarding the bag, so the narrow deps never even reach
   `exportSiteBound` regardless of root ordering.

Regression test: `deployments/__tests__/integration/tool-registrations.integration.test.ts`, the test
named `"RouteDeps.exportSiteBound ignores a caller-forwarded 'routeDeps' key..."`. **I verified it
actually fails without the fix** (see "Exact state" above) — don't take a passing test at face value
for this one without knowing it was adversarially checked once already.

A closely related, SEPARATE gotcha this design introduces, also fixed and documented: `exportSiteBound`
is bound to ONE object identity at construction time, so a TEST FIXTURE built via
`{ ...createRouteDeps(), someField: override }` produces a logically-overridden but DIFFERENT object —
the closure still points at the original, so the override silently never applies. This is a **false
green**: a test meant to prove a failure mode passes for the wrong reason because its own override was
inert. Caught for real in `commit-site.unit.test.ts`'s "asset that fails to export blocks the commit"
test. Fixed everywhere by mutating the object `createRouteDeps()` returns in place
(`deps.createSiteApp = fake`) instead of spreading a copy. Documented as a generalized "TEST GOTCHA"
note directly on `RouteDeps.exportSiteBound`'s own doc comment in `server/routes/types.ts` — it applies
to ANY future field bound by closure at construction time, not just this one. If you add a new
`RouteDeps` field that's a closure over the constructed object, re-read that doc comment and think
about whether a test fixture spreading it would silently break your own field too.

## Provenance — who wrote what

**Authored by me, this session:**
- `src/server/routes/types.ts`, `src/server/app.ts`, `src/server/deps.ts`
- `src/features/source-control/commit-site.ts`, `src/features/source-control/tool-registrations.ts`
- `src/features/deployments/tool-registrations.ts`
- `src/features/source-control/__tests__/commit-site.unit.test.ts`
- `src/features/deployments/static-publish/__tests__/adapter.unit.test.ts`
- `src/features/deployments/static-publish/__tests__/publish-run.unit.test.ts`
- `src/features/deployments/__tests__/integration/tool-registrations.integration.test.ts`
- `.dependency-cruiser.cjs` (comment block; the structural rule edit itself was inherited, see below)
- Both report files

**Inherited from `arch-step2-boundaries`, reviewed line-by-line by me, kept (with noted exceptions):**
- `src/features/deployments/static-publish/adapter.ts` — reviewed in full, kept verbatim, no changes
- `src/features/deployments/publish-agent-tools.ts` — reviewed in full, one comment block rewritten
  (the stale zero-vendor-credentials-import claim), everything else kept
- `src/server/routes/admin/system/publish-site.ts` — reviewed in full by me, landed as commit
  `a95a238f` by a different process before my own `git add` could stage it; content matches what I
  reviewed and approved
- `.dependency-cruiser.cjs`'s structural rule change (the actual `from`/`to`/severity edit) — verified
  correct against the approved design, kept; only its prose comment was rewritten by me

**I have reviewed all 3 inherited files.** Nothing is sitting un-reviewed.

## Remaining worklist — full list, not trimmed

1. **`VendorCredentialSetRepoPort` propagation-cost A/B (coordinator-requested, not done).** CHANGE 3
   kept a real `import type { VendorCredentialSetRepoPort } from "../vendor-credentials/index.js"` in
   `publish-agent-tools.ts` instead of hand-mirroring the type. Module-cycle/SCC is unaffected (0/0
   both ways, structurally guaranteed for type-only edges — don't re-measure that part, it's settled).
   What's NOT measured: whether this specific edge moves the "propagation cost (all-import)" ratchet
   metric (`check:architecture --list`'s own output), which DOES count type-only edges. To do the A/B:
   run `check:architecture --list`, note propagation cost (all-import); temporarily swap the import for
   a local `VendorCredentialSetRepoPortLike` mirror (only `findDefaultByVendor` needs a real method
   signature — it's the only one called directly; `list`/`create`/`update` are passed opaquely through
   this file's own `VendorCredentialPort` interface and need no shape); re-run; compare; revert the
   mirror if the real import doesn't measurably worsen it (my expectation, given the number is already
   dominated by other edges — 12.22% total — but I did not verify this, say so plainly if you don't
   either). Update the design report with whichever way it lands.
2. **`ExportSiteBoundFn` return-type harmonization** — cosmetic, your call, see "Not done" above.
3. **The remaining 6 back-edges into the composition root** (down from 11) are NOT part of this task's
   scope — 3 are `→ src/server/routes/types.ts` (almost certainly the `assistant`/`widgets`/`export`
   `RouteDeps` type-only edges explicitly deferred by this dispatch's brief, recorded as deliberate
   follow-up in `.dependency-cruiser.cjs`'s own comment), 3 are `→ src/server/http/site/page-head.ts`
   (unrelated to this task entirely — not investigated). If a future dispatch picks up the
   `assistant`/`widgets`/`export` widening this brief deferred, start there.
4. **Nothing else is open from the original 5(6)-site brief** — all 6 coupling sites are narrowed, the
   config is re-tightened, the regression test is verified, both reports are written and committed.

## Traps for you specifically

- `tsc -p tsconfig.json --noEmit` **excludes `src/**/__tests__/`** (per `tsconfig.json`'s own excludes).
  A clean `tsc` proves NOTHING about test fixtures. Run affected test files explicitly:
  `TEST_CONCURRENCY=2 node --import tsx --test <path>`. **Vitest is NOT installed at the Tovu root** —
  don't reach for it.
- **Never the full test suite** (`npm test`/`npm run test:ci` with no path filter) — 5.4 GB across many
  workers, explicitly forbidden in every brief on this task. Always scope to specific files, always
  `TEST_CONCURRENCY=2`.
- **A green `ci:local`/`tsc` run only proves something about whatever is on disk at that instant** —
  see the HEAD-vs-tree incident above. If you have uncommitted changes when you run a gate, and then
  commit something else before acting on the gate's result, re-run it. This is not paranoia; it
  happened this session.
- **~40+ files are dirty in this working tree and belong to OTHER, unrelated concurrent sessions** —
  `ADS-memory/reports/`, `apps/admin/src/features/plugins/*`, etc. Never `git add -A` / `git add .`.
  Stage explicit paths only. Verify `git diff --cached --name-only` in the SAME shell command as the
  commit, before it, so you catch a mismatch before it lands.
- **Never `git stash`, in any form.** The stash stack is shared across concurrent sessions in this repo.
- **`git commit -F <file>`, never `-m`** — heredoc backticks corrupt commit messages here (there's a
  named trap for this).
- **GitHub Actions is billing-blocked.** `npm run ci:local` (8 gates, ~2-4 min) is the only real gate.
  Ignore any CI status you might see referencing GitHub Actions.
- **This file family's comments have produced false or stale claims 4 times now** (3 before this
  session per the coordinator, 1 during it — see above). Verify against source before trusting a
  confident-sounding comment or status report in this specific corner of the codebase.
- **Do not touch `src/server/tool-catalog-manifest.ts` or `AssistantToolRegistryDeps`** — that's step 3
  of the architecture plan, a separate dispatch, explicitly out of scope here and there.

## Where I'm least confident

- I did not personally re-derive the "propagation cost (all-import), 12.22%" ratchet-warning
  attribution beyond confirming it was present before this dispatch touched anything (same number, same
  warning, at the very start of my session). I did not trace which specific files are driving it. If it
  keeps growing, that's worth a real investigation, not just another "not ours" wave-through.
- I reviewed the 3 inherited files carefully against MY OWN understanding of the design, but I'm one
  reviewer, working under real time pressure near a context limit at the end. If something in
  `adapter.ts` or `publish-agent-tools.ts` still reads a little "off" to you, don't defer to "it already
  passed review" — check it again yourself. I'd rather you re-verify something fine than trust something
  wrong because I said it was fine.
- I have not investigated the remaining 6 back-edges into the composition root beyond `grep`-identifying
  their target files. I'm fairly confident the 3 into `routes/types.ts` are the deferred
  `assistant`/`widgets`/`export` edges, but "fairly confident" is not "verified."

## Ready-to-paste opening prompt for the next agent

```
Continue architecture step 2 (RouteDeps narrowing) from
ADS-memory/reports/continuity/2026-08-20-architecture-step2-narrowing-handoff.md — read that file
in full first, it has the exact state, the design, a real bug class you need to understand before
touching RouteDeps.exportSiteBound or any of its consumers, and a full remaining worklist. Current
HEAD is a95a238f. The core narrowing work is DONE and verified (tsc clean, 8/8 ci:local, 139 tests
passing, regression test adversarially verified). What's left is small: a propagation-cost A/B
measurement for one type-only import (worklist item 1), and your own judgment call on a cosmetic
return-type inconsistency (item 2). Everything else in the original brief is closed. Read the handoff's
"claim relayed to me that turned out FALSE" section before trusting any status report about this file
family, including this handoff itself — verify with git log/grep before acting.
```
