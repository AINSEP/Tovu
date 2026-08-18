# Handoff: coverage gate fully closed (real ceiling reached), RouteDeps ~complete, next session = ESM migration

Generated: 2026-08-18 (end of session 18)
Source: Claude Code (Sonnet 5), same repo as sessions 12-17
Target: Claude Code, next session, same repo
Save note: written to `ADS-memory/reports/continuity/` (committed), matching sessions 14-17.

**Note on the shared checkout:** a second, independent Claude Code session was live in this same
repo for most of tonight too (theme migration, AG-UI transport work in `apps/admin/**` and
`src/features/theme/**`). Same as every prior session's note — don't be surprised the branch has
moved further than this handoff's commits account for. Run `git log --oneline -20` before assuming
you know current HEAD. That other session's dev server also got taken down twice tonight by this
session's own mutation-sweep runs mutating shared route files mid-test — see the new Verification
Trap on this below before running mutation-sweep again near anyone's live dev server.

---

## CI status — check this fresh, don't trust this document

CI run `32174362065` on an older commit was still showing `in_progress` at **~2 hours** elapsed when
this was written — that is almost certainly hung, not genuinely running (a normal run here takes
minutes). Don't wait on it; check `gh run list --branch general-work --limit 5` fresh and, if it's
still stuck, look at whether it needs cancelling/re-triggering rather than assuming it'll resolve.

**Nothing from tonight is pushed to remote yet.** Local `general-work` is 7 commits ahead of
`origin/general-work` (all real, all described below). `origin/main` itself has not moved (0 commits
of its own vs `general-work` — a future merge to `main` is a fast-forward, not a real merge, whenever
that happens).

---

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then
> `ADS-memory/reports/continuity/2026-08-18-session-18-esm-migration-handoff.md`.
> Check CI and current HEAD first — the branch is shared with another live session and this
> document's facts may already be stale. **The owner's explicit next-session priority is the ESM
> migration** (CommonJS -> native ES Modules), motivated by tonight's finding that the CJS interop
> shim costs exactly 2 permanently-dead branches per file, proven across 6 files via raw V8 coverage
> offsets — not an estimate anymore. This is a real, valuable, NOT a quick per-file job (see its own
> section below) — it broke on the very first real import tested. Read that section fully, and the
> owner's own framing (100% coverage is the bar; the 2-phantom-per-file ceiling is the ONE accepted
> exception; anything else uncovered is either a missing test or a sign the code needs refactoring)
> before starting.

---

## What actually happened tonight (session 18)

Continuing from session 17's handoff (coverage gate mostly closed, RouteDeps 7/18 groups, ESM
scoped-not-started):

1. **Closed the remaining real integration-tier gaps on all 5 originally-flagged-tonight files** via
   a dispatched coverage-gap-fill agent, using a corrected workflow (batch-survey-then-verify instead
   of one-branch-at-a-time with full-suite reruns — see "Dispatch process lessons" below) and real
   TDD-skill grounding on its second pass.
2. **Built and validated a new triage tool**: `development/scripts/classify-coverage-gaps.ts`
   (`npm run triage:coverage-gaps`). Cross-references the coverage gate's per-file tier evaluation
   against a live `check-src-complexity-drift` scan so a failing file gets auto-labeled
   `ARCHITECTURE_DEBT` (also complexity-flagged -> refactor first) vs `TEST_GAP` (clean complexity ->
   just write the test), plus a `phantomTaxPlausible` hint on small files. Validated against two real
   files (`put-config.ts` correctly flagged `ARCHITECTURE_DEBT` with its real complexity reason
   attached; `export-site.ts` correctly flagged `TEST_GAP`). Committed at `0e237558`.
3. **Proved the phantom-branch tax is exactly 2 branches/file, not ~2** — session 17 had documented
   one (`__copyProps`'s always-false `typeof from === "function"`); tonight's agent independently
   found and proved a second, previously-undocumented one via raw `NODE_V8_COVERAGE` +
   `Module.prototype._compile`-hooking: esbuild's trailing `0 && (module.exports = {...})`
   cjs-module-lexer hint, which never executes by construction. Confirmed identically on 6 files
   (the 5 tonight + `delete.ts` as an untouched comparative baseline from session 17).
4. **Found and fixed a real, generalizable test-infra bug**: this repo's established
   "forced direct handler call" pattern (used for the small number of branches genuinely unreachable
   via real HTTP, e.g. `??""` param fallbacks Express itself prevents) matches a route by URL path
   only, not `(method, path)`. On any path shared by two HTTP methods (3 of tonight's 5 files:
   export-site GET+POST, put-entry PUT+GET, create.ts POST+GET), this could silently grab the wrong
   method's handler and still pass, coincidentally, on a similarly-shaped response. Fixed in the 3
   files it touched. **Not audited beyond those 3 — a real, scoped follow-up task if anyone wants it:
   check every other file using this same helper repo-wide for the same latent bug.**
5. **Ran mutation-sweep verification** (`development/scripts/mutation-sweep.mjs`) across all 5+1
   files to prove the new tests are load-bearing, not just coverage-satisfying. Real, mostly-clean
   results (12-14 killed per file on the larger ones) with one consistently-reproducing, PROVEN-benign
   survivor pattern — see "The workspaceId survivor" below.
6. **Closed `explore.ts`'s last 2 real gaps** (a peer cross-check caught that 2 of its earlier "4
   confirmed phantom" branches were actually real, just misattributed via lcov line numbers without
   the raw-offset cross-check — the exact trap session 17's handoff already warned about, recurring).
   Final: **189/191 branches (98.95%)** — 191 total minus the 2 known permanent phantoms = 189
   achievable, and 189 is exactly what's hit. This file is genuinely, provably done.
7. **RouteDeps decomposition — likely complete or very close.** 11 groups were done at session start
   tonight (7 from session 17 + a partial mid-session addition); a redispatched agent (see "Dispatch
   process lessons") landed **8 more commits covering 12 more groups** tonight:
   `PostDeps`, `PresentationDeps`, `SettingsDeps`, `ChangeSetDeps`, `EventBusDeps`, `AnalyticsDeps`,
   `NavigationDeps`, and a bundled commit with `DatabaseOpsDeps`/`RedirectsDeps`/`CommerceCatalogDeps`/
   `WidgetsDeps`/`PluginRuntimeDeps`. **As of this document, it was mid-way through one final `tsc
   --noEmit` verification pass on what looks like the last remaining fields — check
   `git -C /Users/la/Programming/Tovu/.claude/worktrees/agent-accc86cafe0ce59e7 log` for whether that
   landed.** This work lives on branch `worktree-agent-accc86cafe0ce59e7` in that worktree — **it has
   NOT been merged back into `general-work` yet.** Do that first (it's real, tested, typechecked work
   sitting isolated) before anything else RouteDeps-related.

---

## Coverage — final state, all files at their real ceiling

| File | Session 17 end | Session 18 end |
|---|---|---|
| `admin/system/export-site.ts` | 73% (integration) | **96.30%** (52/54) — target met |
| `admin/themes/explore.ts` | 80% (integration) | **98.95%** (189/191) — proven ceiling, exact |
| `admin/seo/put-entry.ts` | 82% (integration) | **93.10%** (27/29) — proven ceiling, exact |
| `admin/integrations/create.ts` | 85% (integration) | **92.59%** (25/27) — proven ceiling, exact |
| `admin/integrations/pause.ts` | 85% (integration) | **92.31%** (24/26) — proven ceiling, exact |

**"Proven ceiling" here is not a shrug — it's arithmetic.** Each of those 3 files has exactly 2
permanently-dead branches (the proven-exactly-2 finding above); total branches minus those 2 equals
precisely the percentage landed. `route-coverage-lib.ts`'s "subtract known phantom count from the
gate math" (session 17's handoff, Option 1) is now justified with hard proof instead of an estimate —
still not implemented, still a legitimate small follow-up if anyone wants the raw gate number to read
100% instead of requiring a human to know the 2-branch asterisk.

**The owner's standing bar going forward, stated explicitly tonight:** 100% coverage, full stop,
*except* the proven 2-phantom-branch-per-file ceiling. Anything else short of 100% is either a real
missing test or a signal the code needs refactoring — not something to wave off. The
`classify-coverage-gaps.ts` tool above exists specifically to make that distinction mechanically
instead of by eyeballing.

### The workspaceId survivor (mutation-sweep finding, proven benign)

Every file's `if (String(req.params.workspaceId ?? "") !== deps.workspaceId)` guard survives
mutation-sweep's `?? ""`-drop mutant, and this is real, not a gap: `String(undefined ?? "")` = `""`,
`String(undefined)` = `"undefined"` — both are unequal to any real `deps.workspaceId`, so no test
input can ever distinguish the two versions of the comparison. Confirmed identical on `delete.ts`
(untouched, pre-existing) too — this is a repo-wide (~20+ routes) intentional defensive-styling
convention, not dead code and not a coverage gap. Flagged, not touched — "delete the defensive code"
is a call above what a coverage-fill dispatch should make unilaterally.

---

## New verification trap — mutation-sweep can leave a LIVE broken mutant in production source

**Found twice tonight, cost real debugging time, and briefly broke another session's dev server.**
`mutation-sweep.mjs` neutralizes one guard, runs the scoped test, then restores the file — but if the
process gets interrupted (killed, crashes, or in tonight's case: a dispatched agent went idle/quiet
mid-sweep) *between* the neutralize and restore steps, the mutated, broken guard is left sitting in
the real source file. Twice tonight this looked like ordinary WIP (`git status` just shows the file
modified) and was almost committed/ignored as such — one was `if (!authResult.allowed)` silently
turned into `if (false)` (a live authorization bypass sitting in the working tree), the other dropped
the workspaceId `?? ""` fallback. Both were only caught by actually reading the diff content before
trusting an uncommitted change, not by the diff merely existing.

**Both times, no live process was still running (`ps aux` empty) — meaning "stalled agent, uncommitted
file" is not safe to assume is inert WIP anymore.** Before committing, reverting-and-moving-on, or
handing off ANY file that a mutation-sweep-touching agent left dirty: **read the actual diff content**,
not just whether one exists. If it looks like a single-line logic inversion or a dropped fallback with
no corresponding test-writing context, it's almost certainly a stuck mutant, not real work — `git
checkout -- <file>` it and re-verify the file is byte-identical to HEAD before trusting it again. This
also means: **don't run mutation-sweep near a shared checkout's file while another session might have
a dev server watching those same files** — the neutralize step is a real file write that triggers
hot-reload/restart, and a mutated guard can crash that server for the window it's broken.

---

## Dispatch process lessons (apply these at spawn time, not as follow-up corrections)

- **Coverage-gap-fill dispatches need the real `AI-Dev-Shop/agents/tdd/skills.md` loaded, not an
  inline paraphrase of its rules** — the first coverage dispatch tonight got inline rules and it took
  a follow-up message (which DID eventually land and get acted on, contrary to this repo's usual
  "mid-flight corrections don't reliably land" caution — but don't rely on that working twice) to get
  it to load the real skill file and add mutation-sweep verification. Put it in the spawn prompt next
  time.
- **Batch-then-narrow, not incremental-with-full-rerun.** Re-running the full `npm run
  test:cov:server:integration` (whole-server suite) after every single small test addition is
  expensive and looks like stalling. Correct shape: one full read-over to enumerate every gap in a
  file at once, write all its tests in one batch, verify with a scoped single-file run, only run the
  full gate script once at the end.
- **For a worktree-isolated agent, `AI-Dev-Shop/` is NOT present** (it's gitignored, so a fresh `git
  worktree add` never gets it) — point the agent at the real skill file by its ABSOLUTE path in the
  main checkout instead (`/Users/la/Programming/Tovu/AI-Dev-Shop/agents/<role>/skills.md`) rather than
  skipping it or hand-paraphrasing. This is what got the redispatched RouteDeps agent (see below) its
  real Refactor-role grounding and explicit permission to implement (that role defaults to
  propose-only otherwise).
- **"Stalled agent, no live process, uncommitted diff" needs the diff actually read before deciding
  what to do with it** — twice tonight the reflexive move (revert it, assume it's incomplete garbage)
  would have been correct only for the SIZE of the diff, not its correctness. Once (RouteDeps' Slice 8,
  an 11-group bundle) the diff genuinely was fine but got raced by a revert before the agent's own
  restore completed — real work lost, no recovery possible (never staged, so no dangling git object to
  recover from). Once (`explore.ts`'s last 2 tests), the diff was real, complete, 56/56 tests passing —
  and got committed instead of reverted, because it was actually run and checked first. **Run the
  file's own tests / read the diff before deciding "revert" vs "commit" — don't default to revert just
  because the process looks idle.**
- **When a genuinely-stalled worktree agent needs restarting, tell it to reach a clean commit-or-revert
  point itself first** (via SendMessage) before you touch anything — it knows its own half-done state
  better than a diff alone tells you. If it doesn't respond in a reasonable window and there's real
  uncommitted content, verify independently (run its tests) rather than guessing.

---

## RouteDeps — hard exclusion, still applies to whatever's left

`runExportSite: ExportEngine<RouteDeps>` is self-referential (needs the FULL `RouteDeps` to boot the
real app for site export) — proven via a concrete `tsc` contravariance failure, blocks 7
already-diagnosed violations in `features/deployments/**` and `features/source-control/**`. Never
touch `runExportSite`, `createSiteApp`, `exportSite`, `src/export/`, `features/deployments/`, or
`features/source-control/` in any future RouteDeps slice.

---

## ESM migration — the owner's explicit next-session priority

**Motivation, sharpened tonight:** the CJS-interop phantom-branch tax is no longer an estimate — it's
proven exactly 2 dead branches per file, confirmed on 6 files via raw V8 coverage offsets. On small
files this is a real, mathematically-provable ceiling (`put-entry.ts`/`create.ts`/`pause.ts` all land
exactly on their 2-phantom-adjusted ceiling tonight, not approximately). Native ESM output has no CJS
interop shim at all — this ceiling goes away entirely, not just gets smaller.

**What's already known (from session 17's real, reverted experiment — read that handoff's own ESM
section for the full account, summarized here):**
- Tried it for real on one file (`delete.ts` copied to `.mts`), confirmed the interop shim genuinely
  disappears under ESM compilation (0 occurrences of `__copyProps`/`__toCommonJS`/`__export`).
- **It broke immediately on a real import**: `delete.ts` imports `WebhookSubscriptionNotFoundError`
  from `#src/webhooks/index`, a two-hop re-export chain. Node's CJS-to-ESM named-export detection
  (`cjs-module-lexer`, a static-analysis heuristic) fails on this specific shape.
- **Conclusion: not a file-by-file job.** The whole root `package.json` is `"type": "commonjs"`. An
  ESM leaf file importing from a still-CJS dependency chain hits this exact failure class at nearly
  every crossing point involving a re-export — extremely common here given this codebase's
  barrel-file convention (every `index.ts` in every module is a re-export layer).

**Recommended starting approach, not decided yet, needs the owner's input at the start of next
session:**
- Map the real dependency graph first (`check:architecture`'s depcruise-based tooling already exists
  — could answer "what's the smallest closed subgraph that could move to ESM together without
  crossing back into CJS-only territory").
- Decide: big-bang whole-repo flip (higher risk, one PR, done) vs. boundary-by-boundary wave (lower
  risk per step, but the exact interop friction found in session 17's experiment will recur at every
  remaining CJS<->ESM crossing until the whole graph is on one side).
- Node 24 (this repo's confirmed runtime) has *stable* synchronous `require(esm)` support, which
  somewhat de-risks partial migration for simple cases — but does NOT fix the specific
  re-export-chain failure mode already found.
- **This deserves its own Spec/ADR pass before implementation, not an ad-hoc agent dispatch** — it
  touches module resolution repo-wide. Don't start editing files before that exists.
- Once the shim provably disappears repo-wide, the "subtract 2 known phantom branches" gate-math fix
  (mentioned above) becomes moot — worth sequencing the ESM decision before spending time on that
  smaller fix, since ESM would obsolete it entirely.

---

## Not ours — in the working tree tonight, do not touch or attribute

Same territory as session 17 flagged: `apps/admin/**`, `src/themes/static/**`,
`src/features/theme/**` and its migration/validation subtrees, various `ADS-memory/reports/
architecture/ADR-*` files, `.gitignore` — live, concurrent work from the other session tonight
(theme schema v2, AG-UI client transport). `package.json`'s `dependencies` block currently has
uncommitted `@ag-ui/core`/`@ag-ui/encoder` lines from that same session — **do not commit them
alongside unrelated work** (this session used `git add -p` to stage only its own single-line
`triage:coverage-gaps` script addition and leave those untouched — same discipline needed going
forward on any `package.json` edit while that session is still live).

## Open, unstarted follow-ups (not urgent, real)

- Repo-wide audit for the wrong-handler-matching bug (method-blind `extractHandler(app, path)`
  helper) beyond the 3 files fixed tonight.
- `route-coverage-lib.ts`'s phantom-count-subtraction gate-math fix — now backed by hard proof, still
  not implemented. Low priority given ESM would make it moot.

## Handoff Contract

Written by session 18's agent, reviewed against real command output at write time (coverage numbers,
RouteDeps commit list, CI status, ahead/behind counts all re-verified in this same sitting). Two
explicitly unconfirmed facts: whether the RouteDeps agent's final `tsc --noEmit` pass (running at
write time) landed a clean final commit, and CI's real state (it read as hung, not confirmed why).
