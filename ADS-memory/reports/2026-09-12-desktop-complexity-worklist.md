# apps/desktop complexity triage — worklist

**Measured:** 2026-09-12, read-only pass against `restructure/apps-website-phased` HEAD at the time
(commit `c05e2d28`). **This tree has 6+ agents committing concurrently — re-verify every number in
this document (violation list, debt-file contents, gate status) immediately before acting on it.**
A constant this document originally flagged as wrong (`MIN_FILES_LINTED`) changed value between my
read and my report, in a commit that landed in the gap — see "Gate status" below. Don't trust a
stale read of this file either.

**Gate status as of this writing:** the complexity gate is now **ENABLED** and its baseline is
**SEEDED**, via commit `efc63652` (harness agent), which landed after my initial measurement pass.
That changes the framing of everything below: the 11 functions in this worklist are now
**grandfathered debt entries in `apps/desktop/complexity-debt.json`**, not merely "known violations."
The ratchet rule applies: fixing one means **deleting its entry from the debt file**, never editing
a number upward to match a regression. If a function's complexity climbs after a further edit, that
is a **new, non-grandfathered violation** and fails the gate on its own — it does not get folded
into an existing debt entry's number.

**Real bug, found twice independently, already fixed — NOT a stale read.** This section was
originally written as "verified NOT a bug" on the coordinator's instruction; that instruction was
wrong and has been retracted. The record:

`MIN_FILES_LINTED` genuinely WAS `90`, and it was genuinely miscalibrated — copied from a scan that
had not applied the test-file ignore, so it counted files the gate does not lint. This triage flagged
the mismatch against a live 63-file scan. **Independently and at almost the same moment, the gate's
own non-vacuity guard caught it**: the harness refused to report clean and said why, and its author
recalibrated to `58` from two routes that agree exactly. That fix landed in `efc63652` — the same
commit that seeded the baseline and enabled the gate — between this triage's read and its report.

Current state: `MIN_FILES_LINTED = 58`, live scan reports 63 files linted. Consistent. Nothing to do.

**Two lessons, and the second is the one that was nearly lost.** First: in a tree under concurrent
edits, a constant read from disk and a count measured seconds later are not the same instant —
re-read immediately before asserting a mismatch, or have one command report both halves atomically.
Second, and more important: **a correct finding reported against a tree that moved underneath you is
not a mistake.** Three separate agents reported stale state as fact within one hour of this session
(an already-landed rename read as uncommitted, this constant, and a half-applied commit read as a
test failure). Every one of them was measuring accurately. The failure mode to guard against is
agents who wait until it is safe to report, not agents who report and get overtaken.

The number being 58 rather than something round is the residue of this — worth knowing before anyone
"tidies" it.

The gate is currently failing for an unrelated, real reason: `apps/desktop/src/project-ipc.js`'s
`handleRename` at complexity 11, in code another agent was actively writing at measurement time. Not
part of this worklist — it belongs to whoever is editing that file.

Confirmed: the debt file is keyed **per-violation** `(rule, file, message)`, not per-file — see
`violationKey()` in `src/complexity-debt.js`. This is what makes "delete the entry when fixed" safe
without grandfathering the rest of that file.

## Ranked worklist

### REFACTOR — real content, worth doing

**1. `src/tovu-server.js:304 buildServeEnv`** — cyc 11, cog 10.
Zero seam cost: single object param, no default parameters at all. I verified empirically (isolated
probe files) that a default parameter costs exactly +1 cyclomatic point each — `f(a=1)` → 2, four
defaults → 5, a destructured object with 4 property defaults plus an outer `= {}` default → 6. None
of that applies here. All 6 structural points are independent, sequential `if (!env.X) env.X =
fallback` precedence guards, each with its own paragraph of doc comment explaining why. **Best-tested
function in the batch** — 15+ dedicated tests, one or two per branch (token mint/keep, admin-dist
set/unset/keep, site-chat-dist same, site-dir same, agent-cwd, dev-proxy). Move: extract each guard
into a small named function (`applyDaemonToken`, `applyDesktopCredential`, `applyAgentCwd`,
`applyAdminDist`, `applySiteChatDist`, `applyAdminDevProxyUrl`), call them in sequence. Drops both
metrics well under 9. Lowest risk in the batch — do this first.

**2. `src/renderer/App.hooks.ts:1117 buildCreateProjectInput`** — cyc 9 (compliant), cog 10.
Pure function (no React/DOM — its own doc comment says so), textbook Type-F nested ternaries picking
`endpoint`/`credentialValue` by `database` kind. Zero tests today despite being trivially testable
(no DOM, no mocks — plain object in, object out). It IS wired — called from `useCreateWebsiteForm`'s
`handleSubmit`, live in the create-website flow — not dead code, just untested. Move: replace the two
nested ternaries with a small switch/lookup keyed on `database`. Write direct-input tests first
(cheap), then refactor, verify green.

**3. `scripts/stage-payload.mjs:359 newestMtime`** — cyc 11, cog 13 (highest cognitive in the batch).
Recursive tree walk + nested loop + 4 guards. **Zero test coverage** — confirmed no `scripts/*.test.*`
exists at all; the only two mentions of "stage-payload" in any test file are comments in
`shell-staleness.test.js` and `check-gates-exit-code.test.js`, not actual imports. Test-first required.
Precedent already exists next door: `shell-staleness.js` was already pulled out of `stage-payload.mjs`
for exactly this reason. Needs a temp-dir fixture (nested dirs, `node_modules` exclusion, dotfile
exclusion, `isBundleInput` filtering) — moderate setup cost, highest value of the three
stage-payload items.

**4. `scripts/stage-payload.mjs:212 stageTransitiveDependencies`** — cyc 7 (compliant), cog 12.
Untested (same stage-payload.mjs coverage gap as above). Real nesting: while-queue outer loop,
for-of inner loop, ifs. Test-first (temp fake node_modules tree: no deps, one level, multi-level,
cycle/already-visited, excluded package), then flatten.

**5. `scripts/stage-payload.mjs:293 assertClosureComplete`** — cyc 7 (compliant), cog 10.
Untested. Nested for-loops (packages × deps). Test-first, then flatten via flatMap — preserves
iteration order, so the `missing` list's order is unaffected.

**6. `src/renderer/SiteGrid.tsx:71 SiteCard`** — cyc 10, cog 6. No default params.
Five ternaries, all gated by the **same** `openable` boolean — `className`, `role`, `tabIndex`,
`onClick`, `onKeyDown`. This is a natural grouping (all five are "the props that only apply when the
card is interactive"), not an artificial one — precisely the distinction that separates a legitimate
extraction from the flat-`??`/`||`-chain trap this batch also contains examples of. This package has
**no jsdom/testing-library at all** (`package.json`'s test script is plain `node --test`), so the
component itself can never get a render-level test here — but this codebase's own convention already
routes around that: `SiteGrid.hooks.ts` already holds `isCardOpenable`/`isCardOpenKey`/
`deleteActionCopy`, pulled out of this exact component and unit-tested in `SiteGrid.hooks.test.ts`.
The pattern is precedented, not invented. Move: add one more pure function there —
`interactiveCardProps(openable, handlers) -> props object` — tested the same way as its neighbors,
then `SiteCard` just spreads it. Cheapest of the three JSX-component refactors because it reuses an
existing, already-tested file.

**7. `src/renderer/App.tsx:483 SiteWorkspace`** — cyc 11, cog 10, zero seam cost (no defaults).
Genuine 3-way conditional render (`running && !failed` / `running` / else) picking between the
webview guest and two `SiteStartPanel` variants — real branching, not tangled for no reason. Same
testability gap as `SiteCard` (no jsdom in this package) but the same escape hatch applies and is
precedented in this exact file: `App.hooks.ts` already holds pure decision helpers for `App`'s and
`SiteWorkspace`'s siblings (`deriveSitesHomeView`, `computeCanCreate`). Move: extract the 3-way
decision (`running`/`failed`/`stalled` → `'guest' | 'wedge' | 'stopped'`) into a pure function there,
test it directly (no DOM), then `SiteWorkspace`'s JSX becomes a flat switch on an already-tested enum.
Honest residual gap: this verifies the *decision*, not that the right JSX subtree is actually wired
to each case — that gap isn't closable without a render harness this package doesn't have. Do this
one after `buildServeEnv`/`buildCreateProjectInput` — App.tsx was the hottest file today.

### LEAVE — flat chains or already-compliant, don't touch

**8. `src/renderer/App.tsx:58 App`** — cyc 12, cog 1.
Empirically confirmed: 5 of the 12 points are deliberate DI seam cost (4 injected-hook defaults plus
the outer `= {}` default — see the seam-cost verification above), not real branching. The doc comment
says this is deliberate, for test injection. The remaining 7 points are flat `&&` JSX conditionals
with cog 1 — confirming no real tangle. Stripping the seam to satisfy the linter would be the wrong
trade. This turns what looks like the worst violation in the batch (cyc 12) into the clearest LEAVE.

**9. `scripts/check-gates.mjs:114 main`** — cyc 10, cog 4.
Flat sequential script body (parse argv → read manifest → validate → detect drift → report → run each
enabled gate → summarize → decide exit). High-cyc/low-cog is the textbook "not tangled" signature.
Reasonably covered by `check-gates-exit-code.test.js` (E2E subprocess tests against
deliberately-broken manifests).

**10. `src/quality-gates.js:92 validateManifest`** — cyc 10, cog 9 — exactly at the ceiling,
technically compliant. Extensively unit-tested already (8+ direct test cases covering every branch).
A small extraction (pull the per-gate id/run/duplicate check into its own helper, mirroring the
sibling `disabledGateProblems`, which is already extracted this exact way) would fix the 1-point
cyclomatic overage cheaply and is low-risk given the coverage — but it's barely over and cognitive is
compliant, so this is lowest priority in the batch. Optional; do whenever the file is next touched
anyway.

## Coverage-gap pattern

`src/renderer/folder-drop.ts:43 folderPathsFromDataTransfer` (cyc 10, cog 9 — one point from also
violating cognitive) has zero test coverage, exactly as originally flagged — no `folder-drop*.test.*`
exists anywhere. **Two more functions in this worklist share that exact position**:
`stageTransitiveDependencies` and `assertClosureComplete` above — all of `stage-payload.mjs` has zero
direct test coverage, only comment-mentions in two unrelated test files. `newestMtime` makes it three.
So the real gap is not one function — it's **folder-drop.ts plus all of stage-payload.mjs, four
functions total needing tests before any refactor**. All four happen to be pure and
framework-independent by design: `folder-drop.ts`'s own doc comment says it was extracted from
`App.hooks.ts` *specifically* to be independently testable, and the same rationale applies cleanly to
the stage-payload functions (confirmed by the existing `shell-staleness.js` precedent, itself an
earlier extraction out of the same file for the same reason).

## Suggested execution order

1. `buildServeEnv` (tovu-server.js) — safest, best-tested, not touched by anyone today.
2. `buildCreateProjectInput` (App.hooks.ts) — cheap test-first, small nested-ternary fix.
3. `newestMtime`, `stageTransitiveDependencies`, `assertClosureComplete` (all stage-payload.mjs) —
   test-first as one batch, since they share the same missing-coverage problem and file.
4. `SiteCard` (SiteGrid.tsx) — cheap, reuses existing tested hooks file.
5. `SiteWorkspace` (App.tsx) — do last among the "real" fixes; give App.tsx a beat after today's rename.
6. `validateManifest` — optional, low priority, whenever convenient.
7. Leave `App` and `check-gates.mjs main` alone — re-open only if their numbers climb further.

Each completed fix must **delete its entry from `apps/desktop/complexity-debt.json`** (the gate is
now enabled and seeded) rather than leaving the grandfathered entry in place next to a now-lower
number.

## Files referenced

- `/Users/la/Programming/Tovu/apps/desktop/src/tovu-server.js:304`
- `/Users/la/Programming/Tovu/apps/desktop/src/renderer/App.hooks.ts:1117`
- `/Users/la/Programming/Tovu/apps/desktop/scripts/stage-payload.mjs:212,293,359`
- `/Users/la/Programming/Tovu/apps/desktop/src/renderer/SiteGrid.tsx:71`
- `/Users/la/Programming/Tovu/apps/desktop/src/renderer/App.tsx:58,483`
- `/Users/la/Programming/Tovu/apps/desktop/scripts/check-gates.mjs:114`
- `/Users/la/Programming/Tovu/apps/desktop/src/quality-gates.js:92`
- `/Users/la/Programming/Tovu/apps/desktop/src/renderer/folder-drop.ts:43`
- `/Users/la/Programming/Tovu/apps/desktop/scripts/check-complexity.mjs`
- `/Users/la/Programming/Tovu/apps/desktop/quality-gates.json`
- `/Users/la/Programming/Tovu/apps/desktop/src/complexity-debt.js`
