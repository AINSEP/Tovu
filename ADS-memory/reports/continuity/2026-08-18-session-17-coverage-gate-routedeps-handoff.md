# Handoff: coverage gate mostly closed, RouteDeps 7/~18 groups done, ESM migration scoped but not started

Generated: 2026-08-18 (end of session 17)
Source: Claude Code (Opus 5), same repo as sessions 12-16
Target: Claude Code, next session, same repo
Save note: written to `ADS-memory/reports/continuity/` (committed), matching sessions 14-16.

**Note on the shared checkout:** a second, independent Claude Code session was live in this same
repo for most of tonight, pushing real theme-migration work directly to `general-work`. That is
expected and fine — just don't be surprised the branch has moved further than this handoff's own
commits account for. Run `git log --oneline -20` before assuming you know current HEAD.

---

## CI status — check this before anything else

At handoff time, CI run `32174002222` on `89593dca` was **still in_progress**. Check it fresh:
`gh run view 32174002222 --json status,conclusion,jobs`. Do not assume green. Session 16's handoff
made exactly this mistake once already — see that file's own correction section for why it matters.

Known, not-yet-confirmed-in-CI state:
- `check:architecture` — fixed locally 3 times tonight as more work landed (see Decisions below),
  last baseline update was against `89593dca`'s ancestor. **A newer commit may have landed on top
  from the other live session since** — if CI fails on architecture metrics again, don't assume it's
  tonight's work; check `git log` for what actually landed after this handoff was written.
- `check:route-coverage-diff` — the gate itself is redesigned and working (unit>=99%/integration>=95%
  per file). Real numbers below; several files still fail it. This is expected, not a surprise.
- `check:boundaries` — 72 warnings as of this handoff (was 85 at session start, dropped to 69 mid-session,
  **rose to 72 by the end — not explained, not investigated**. Do `git log -- .dependency-cruiser.cjs`
  and diff against the 69-warning list if you want to find out why before continuing other boundary work).

---

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then
> `ADS-memory/reports/continuity/2026-08-18-session-17-coverage-gate-routedeps-handoff.md`.
> Check CI on current HEAD first — do not trust this document's numbers without re-verifying, the
> branch is shared with another live session and moves under you.
> Three real, separate pieces of unfinished work: (1) integration-tier coverage on 5 route files
> (72-85%, real gaps, not just the phantom-branch tax), (2) RouteDeps decomposition — 7 of ~18 natural
> groups done, ~69 of 120 fields still in the flat interface, (3) ESM migration — scoped, proven
> non-trivial by direct experiment, not started. The owner asked for ESM to be tackled "next session"
> — read the "ESM migration" section below before starting, it is NOT a per-file rename job.

---

## What actually happened tonight (session 17)

Continuing from session 16's handoff, which had genuinely fixed 2 of 3 CI gates but was *wrong* that
CI was green overall — `route-coverage` was red. This session:

1. **Diagnosed and fixed the route-coverage false-green.** Root cause: 10 route files were below the
   gate's coverage bar; last session's local check had passed only because of environment drift
   (see "Local Jini sibling drift" below).
2. **Diagnosed and fixed `check:architecture`'s propagation-cost regression — three separate times**,
   as more real work (RouteDeps decomposition, complexity refactor) each nudged the metric a little.
   Each time: a small, understood, deliberate tradeoff (barrel/type consolidation vs. raw coupling
   numbers), verified in a from-scratch environment, locked in via `--update`. Not a bug pattern to
   keep re-litigating — see `development/scripts/check-architecture.baseline.json`'s current values
   as ground truth, not any number quoted earlier in this session's history.
3. **Fixed the boundary-warning tail.** 85 -> 69 warnings. The 7 previously-uninvestigated violations
   (three rules nobody had ever actually looked at) turned out to be **bugs in the rules themselves**
   (a self-reference false positive, missing test-file exemptions) — fixed the rules, not the code.
   *(Then drifted to 72 by end of session, unexplained — see CI status above.)*
4. **Redesigned the route-coverage gate** from one flat 80%-branch number into two tiers:
   unit >= 99% branch, integration >= 95% branch, per changed file (`check-route-coverage-diff.ts`,
   `route-coverage-lib.ts`, two new npm scripts `test:cov:server:unit`/`test:cov:server:integration`).
5. **Found the real root cause of low coverage on 5 of the original 10 files**: pre-existing
   cyclomatic/cognitive complexity debt (already grandfathered in
   `development/scripts/src-complexity-debt.json`), up to complexity 24 / cognitive 19 on
   `explore.ts` against this repo's own complexity-9 ceiling for `src/server/routes/**`. Refactored
   all 5 down to <=9 with zero behavior change (verified: every pre-existing test still passes
   unchanged). Removed all 5 from the debt list since they're genuinely clean now.
6. **Did a rigorous branch-by-branch coverage audit on all 10 original files** (not blind test-writing
   — every zero-hit branch classified with proof: reachable-and-untested -> tested (including via
   deliberately type-bypassing forced-invalid-input calls to trigger "unreachable" exhaustiveness
   guards, with exact error-message assertions, not bare "it throws"), provably-dead -> deleted with
   proof, or genuine-tooling-artifact -> documented. See "The phantom-branch tax" below — this
   produced a real, generalizable finding, not just per-file cleanup.
7. **RouteDeps decomposition, 3 slices, 7 groups extracted** from the 120-field god-interface in
   `src/server/routes/types.ts`. See its own section below.
8. **Investigated ESM migration** (owner's idea, to eliminate the phantom-branch tax at the root) via
   a real, reverted experiment — see "ESM migration" below. Concluded: real, valuable, NOT a
   file-by-file job. Owner wants it planned as next session's main focus.

---

## Coverage numbers — final, as of this handoff

All 10 originally-flagged files, `unit% / integration%` (target 99%/95%):

| File | Start of session 16 | End of session 17 |
|---|---|---|
| `admin/integrations/create.ts` | 69% | **93% / 85%** |
| `admin/integrations/pause.ts` | 73% | **92% / 85%** |
| `admin/integrations/delete.ts` | 74% | **96% / 96%** |
| `admin/media/get-providers.ts` | 78% | **95% / 95%** |
| `admin/media/put-providers.ts` | 73% | **88% / 86%** |
| `admin/seo/put-entry.ts` | 56% | **93% / 82%** |
| `admin/system/export-site.ts` | 75% | **92% / 73%** |
| `admin/themes/explore.ts` | 67% | **98% / 80%** |
| `site/analytics-ingest.ts` | 76% | **90% / 89%** |
| `site/products.ts` | 72% | **94% / 94%** |

**Unit tier is close to done** — several files at or near 99%, the rest blocked almost entirely by
the phantom-branch tax (see below), not real gaps.

**Integration tier is NOT done.** 72-89% across the board, well short of 95%, and — critically —
**this was not verified branch-by-branch the way unit tier was**. Do not assume it's phantom-limited
like the unit tier; it needs the same rigorous audit treatment before anyone concludes it's at ceiling.
This is probably the single highest-value next step if someone wants a quick, bounded task.

Two specific residual real gaps from the audit, not resolved despite real effort:
- `put-providers.ts`: 1 branch (line ~44 in the compiled output), extensively investigated (all 6 real
  decision points enumerated and tested, stack-trace calibration used to prove 4 response paths are
  covered), cause not identified. Best guess: tool-side duplicate/misattribution.
- `analytics-ingest.ts`: 2 branches, working hypothesis is `boundedString`'s internal ternary at two
  call sites already guarded by an identical, unmutated `typeof` check (logically unreachable, not
  just type-unreachable) — not certified.

---

## The phantom-branch tax — a real, proven, generalizable finding

Every file compiled by `tsx` (esbuild) with named exports gets an identical CJS-interop preamble
injected (`__copyProps`, `__toCommonJS`) containing one condition that's provably always-false in
every real usage (`typeof from === "function"` — `from` is always a plain module-exports object,
never a function). This shows up as exactly 2 permanently zero-hit branches per file, confirmed by:
- reproducing tsx's exact esbuild transform directly and diffing the output
- cross-checking function names (`__name`/`__export`/`__copyProps`/`__toCommonJS`) against real source

**On small files (19-39 total branches), those 2 phantom branches alone cost 5-10 percentage points —
making literal 99% mathematically unreachable regardless of test quality.** This is not a coverage
problem to keep chasing on `put-providers.ts`/`get-providers.ts`/etc. — it's a tooling ceiling.

**IMPORTANT correction to an earlier, wrong claim from earlier tonight:** a coverage-writing agent
initially claimed a whole file's remaining gap was "essentially all phantom branches" based on the
zero-hit line *looking* like a comment/type-declaration line. That claim was **substantially wrong**
— cross-checking `DA:` (statement hit count) proved most of those were REAL branches, just
misattributed by tsx's source maps to the wrong line (often a function's signature line instead of
the actual branching sub-expression a few lines into its body). Saved as
`reference_lcov_branch_line_misattribution` in memory. **Only the esbuild CJS-interop preamble is a
confirmed genuine phantom** — treat every other "looks fake" branch as real until proven otherwise via
the DA cross-check, not by eyeballing the line content.

### Fix options discussed, not yet implemented

1. **(Recommended near-term)** Teach `route-coverage-lib.ts` to subtract the known, fixed
   `__copyProps` phantom-branch count from each file's BRF/BRH before computing percentage. Small,
   safe, same-file change. Not started.
2. **(Real root fix, NOT started, NOT a quick job)** Eliminate the CJS-interop shim entirely by
   emitting native ESM instead of CommonJS. See next section — this is the owner's actual next-session
   priority, but it is bigger than option 1 makes it sound.
3. Accept the ceiling per-file once genuinely proven (this session's approach for now).

---

## ESM migration — scoped by direct experiment, this is the owner's next-session priority

The owner wants to move the codebase from CommonJS to ESM, partly to kill the phantom-branch tax at
the root, partly because CJS-only is an increasingly bad long-term bet (more npm packages ship
ESM-only every year; ESM is the actual language standard, CJS is a Node-specific legacy convention).

**Tried it for real tonight, on one file, then reverted cleanly (`src/server/routes/admin/integrations/delete.ts`
copied to `.mts`, ran its real test with real coverage).** Two findings:

1. The esbuild CJS-interop shim genuinely disappears under ESM compilation (0 occurrences of
   `__copyProps`/`__toCommonJS`/`__export` vs. present in every CJS-compiled file) — confirms the
   phantom-branch tax really would go away.
2. **It broke immediately on a real import.** `delete.ts` imports `WebhookSubscriptionNotFoundError`
   from `#src/webhooks/index`, which re-exports it from `./subscriptions` (a two-hop re-export chain).
   Node's CJS-to-ESM named-export detection (`cjs-module-lexer`, a static-analysis heuristic since CJS
   doesn't have real named exports) fails on this specific shape:
   `SyntaxError: The requested module '#src/webhooks/index' does not provide an export named 'WebhookSubscriptionNotFoundError'`.

**Conclusion: this cannot be done file-by-file.** The whole root package is `"type": "commonjs"`
(package.json:6). An ESM leaf file importing from a still-CJS dependency chain hits this exact class
of failure at nearly every crossing point that involves a re-export (which is extremely common in
this codebase's barrel-file convention — every `index.ts` in every module IS a re-export layer).
Flipping the whole `type` field to `"module"` is the other extreme — a single, repo-wide, high-blast-radius
change touching every file's `require`/`__dirname`/dynamic-import assumptions at once.

**Recommended approach for next session, NOT decided yet, needs the owner's input:**
- Map the real dependency graph first (this repo already has `check:architecture`'s depcruise-based
  tooling — could answer "what's the smallest closed subgraph that could move to ESM together
  without crossing back into CJS-only territory").
- Decide: big-bang whole-repo flip (higher risk, one PR, done), or a boundary-by-boundary wave
  (lower risk per step, but the interop friction demonstrated tonight will recur at every remaining
  CJS<->ESM crossing until the whole graph is on one side).
- Note Node 24 (this repo's runtime, confirmed via `node --version`) has *stable* synchronous
  `require(esm)` support, which somewhat de-risks partial migration for simple cases — but does not
  fix the specific re-export-chain failure mode found tonight.
- This deserves its own Spec/ADR pass before implementation, not an ad-hoc agent dispatch — it touches
  module resolution repo-wide.

---

## RouteDeps decomposition — 7 of ~18 natural groups done, 69 of 120 fields remain

`src/server/routes/types.ts`'s `RouteDeps` interface (~120 fields spanning all 25 domains) is being
decomposed into named, composed sub-interfaces (Interface Segregation) so leaf consumers stop
depending on the whole god-type. `RouteDeps` itself stays a pure intersection type — zero behavior
change to any existing consumer, verified after every slice.

**Done and merged (3 slices, `git log --oneline -- src/server/routes/types.ts` for the exact commits):**
- Slice 1: `ClockDeps` (2 fields), `IdentityDeps` (14 fields) — narrowed `requireAdminSession`
  (`server/middleware/dev-auth.ts`) and `createByokToolSurface` (`assistant/byok-tool-surface.ts`).
- Slice 2: `MediaDeps` (6 fields) — rewired the existing `MediaRouteDeps` `Pick`-based convention
  (`admin/media/deps.ts`) to compose it.
- Slice 3: `CredentialsDeps` (10), `ContentTaxonomyDeps` (8), `CommentsDeps` (5), `MembersDeps` (6) —
  narrowed the 4 admin credential-route files (custom/source-control/vendor/publish) and rewired
  `MembersRouteDeps`.

**Hard exclusion, proven not just assumed, do not re-investigate:** `runExportSite: ExportEngine<RouteDeps>`
is self-referential — the function requires the FULL `RouteDeps` to boot the real app for site export.
This blocks 7 separate, already-diagnosed violations in `features/deployments/**` and
`features/source-control/**` from ever being narrowed this way. Verified via the type's own
contravariance (a prior session's `tool-registrations.ts` header already proves this with a concrete
`tsc` failure). Don't touch `runExportSite`/`createSiteApp`/`exportSite`/`src/export/`/
`features/deployments/`/`features/source-control/` in any future slice.

**69 fields still sitting in the flat, ungrouped part of `RouteDeps`.** No one has done a full pass to
identify the NEXT natural groupings for the remainder (the original "5 candidates" list from slice 1's
own agent is now exhausted — media/credentials/taxonomy/comments/members are all done). Whoever
continues this needs to re-survey the remaining 69 fields fresh, the same way the first agent did for
the original 120, and propose new groups.

**Pattern to copy for any future slice:** read the 3 existing slice commits' diffs in full first —
verbatim field types + JSDoc moved from `types.ts` (never retyped from memory), verify real consumer
usage before assuming narrowability, `RouteDeps` must stay byte-identical in what it accepts, use an
isolated `Agent(isolation:"worktree")` dispatch (this repo's shared checkout has another live session
in it most nights — worktree isolation avoids collision), directional-only `check:architecture`
verification (see next section for why absolute numbers lie).

---

## Verification Traps — read before trusting any local result (carried forward + new ones)

- **Local `check:architecture` numbers are unreliable — the main checkout's `../Jini` sibling has
  real uncommitted drift.** `/Users/la/Programming/Jini` (the sibling repo `file:../Jini/packages/*`
  dependencies resolve to) had an uncommitted package restructure live all session. This makes local
  architecture-metric checks silently wrong (both directions — sometimes falsely passing, sometimes
  falsely failing) vs. what CI's fresh clone actually measures. **Confirmed 3 times tonight** by
  reproducing in a from-scratch clone+worktree (Jini cloned fresh from `general-work` branch, Tovu
  checked out in a sibling `git worktree add --detach`, fresh `npm ci`) — this is the only reliable
  local check. **Ask the user before setting this up** — they were sharply against an unasked worktree
  earlier this session, but explicitly approved this exact use case (verifying architecture metrics)
  when asked directly. See memory `feedback_no_worktrees` for the full nuance (asked-for = fine,
  solo-unasked = not fine; concurrent-subagent-isolation = actively encouraged).
- **"Phantom branch" is usually real, misattributed by 1-2 lines — verify via `DA:` hit counts, don't
  eyeball the line content.** See the phantom-branch section above; this overturned an earlier
  overconfident claim from within this same session.
- **Bare "it throws" test assertions are not real tests.** Always assert the exact error message/type.
  A generic throw-check passes even with the wrong message, wrong exception class, or a copy-pasted
  string from a different error path — exactly the bug class an untested "unreachable" branch is
  prone to. Should be the default, not something that needs asking for.
- **Background subagents' "I'll wait for a Monitor/background notification" is an unreliable stall
  pattern, happened repeatedly tonight.** The notification often never arrives in a way that resumes
  them. Recovery: check the worktree directly (`git log`, `git status`, `ls development/coverage/*.info`,
  `ps aux | grep <worktree path>` for live processes) — if genuinely still running, wait; if idle with
  real uncommitted/committed work, finish the last step (usually just running the coverage scripts)
  yourself directly rather than re-prompting indefinitely.
- **`TaskStop` "killed"/"not running" confirmations are not fully reliable — verify with a probe.**
  Multiple times tonight, an agent reported dead by `TaskStop` turned out to still be alive and
  burning tokens, discovered only because the user noticed continued activity and pushed back. Verify
  with `TaskStop({task_id: "some-nonexistent-name"})` — the error message lists every genuinely-live
  named agent. Do this after every stop, don't trust one confirmation. Also check for orphaned CHILD
  agents a parent may have spawned (e.g. `agent-coverage` spawned `explore-test-writer`, which kept
  running after the parent was confirmed dead) — same probe catches these too.
- **The shared checkout has a second live session in it most of the night.** Committing/merging
  directly in the shared `/Users/la/Programming/Tovu` checkout risks colliding with the other
  session's *uncommitted* changes (git will refuse the merge, correctly). When that happens, do the
  merge/push from an isolated worktree instead (fetch origin, merge there, push from there) — never
  discard or stash the other session's uncommitted files to force it through.
- **Complexity gate for `src/server/routes/**` already exists, separate from the repo-wide one.**
  `npx eslint --rule '{"complexity":["error",9],"sonarjs/cognitive-complexity":["error",9]}' <file>` —
  hard-capped at 9, with a grandfathered debt list at `development/scripts/src-complexity-debt.json`
  (currently ~105 entries — this is a repo-wide count including files never touched tonight, not a
  "5 done, 100 to go" number, don't read it that way). `eslint.config.mjs`'s repo-wide default is a
  non-blocking `warn`/15 — different tool config, different number, don't compare them directly.

---

## Not ours — in the working tree, do not touch or attribute

`apps/admin/**`, `src/themes/static/**`, `development/scripts/basic-theme-build-preview.mjs`,
`src/features/theme/**` and its migration/validation subtrees, `.gitignore`, various `ADS-memory/reports/architecture/ADR-*`
files — all live, uncommitted-then-committed work from the other concurrent session tonight (theme
schema v2 migration, AG-UI client transport swap). Several of these commits are already on
`general-work` by the time you read this (that session pushes directly, same branch). Don't revert,
don't attribute to this session's work, don't be confused when `git log` shows commits you don't
recognize interleaved with this handoff's own commits.

## Handoff Contract

This document was written by session 17's agent, reviewed against real command output at write time
(coverage numbers, boundary count, RouteDeps field count, CI status all re-verified in this same
sitting, not carried forward from memory). The one explicitly unconfirmed fact is the final CI result
on `89593dca` — check it first, per the top of this document.
