# Session 13 — Stage 2 registry rollout handoff (2026-08-17)

Generated: 2026-08-17T23:59:00-07:00 (approximate, end of session)
Source agent/session: Claude Code, Sonnet 5, same repo as session 12
Target: Claude Code (same tool), next session, same repo

**Read `AI-Dev-Shop/AGENTS.md` first per the repo's own bootstrap rule, then this document, then
continue from "What's left" below.**

---

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then
> `ADS-memory/reports/continuity/2026-08-17-session-13-registry-rollout-handoff.md` (this file).
> 17 of ~25 feature domains are now converted to the tool-contribution registry pattern and merged
> to `general-work` (commit `5098ae4c`), verified clean (0 cycles, 924 tests, tsc clean). 8 remain,
> each blocked by a diagnosed real cycle — not just "not gotten to yet". Start with `media`: re-check
> it first (see "Cheapest next win" below) — its original blocker may already be gone from this
> session's own merge. The other 7 need real design decisions before more agent dispatches, not
> mechanical conversion — see "What's left" for the specific blocker on each. Nothing has been
> pushed to origin this session; ask the owner before pushing.

---

## Current State

- Branch `general-work`, HEAD `5098ae4c`, 12 commits ahead of `origin/general-work`, 0 behind.
- `npm run check:architecture`: **OK, clean** — 0 module cycles, 0 largest SCC (runtime-only), 11
  back-edges into composition root (0 runtime-only, unchanged all session). Baseline file reflects
  this, measured in a disposable git worktree (see "A measurement bug found and fixed" below — do
  not re-measure in the shared main checkout without accounting for that).
- `npx tsc -p tsconfig.json --noEmit`: 0 errors.
- Full scoped regression sweep across every touched/reverted domain: **924/924 tests pass**.
- 2 known pre-existing failure clusters remain, confirmed unrelated to any of this session's or last
  night's work (byte-identical to untouched HEAD via disposable-worktree diff, both nights):
  `tool-registrations.database-recovery.test.ts`, `tool-registrations.menus.test.ts`, plus a
  `byok-provider-turn.test.ts` cluster and 8 older BYOK protocol wire-shape failures. Not chased this
  session either — still open, still someone's TODO eventually, not urgent.

## Completed Work

1. **Landed Stage 1's foundation, which had never actually been committed** (commit `1cdc054c`).
   Last night's whole registry-pattern rewrite (`tool-contribution-registry.ts`,
   `core/tool-surface-exchanges.ts`, `comments`/`newsletter`'s real conversions, the
   `server/agent-daemon/` relocation, etc.) existed only as uncommitted working-tree state in the
   shared checkout. A parallel batch-2 worker agent, given a clean isolated `git worktree`, hit this
   immediately (`git cat-file -e HEAD:src/assistant/tool-contribution-registry.ts` failed) — verified
   independently, then committed the real foundation after re-running `check:architecture` (clean)
   and 248 scoped tests (pass) in that state. Carefully excluded other concurrent sessions'
   unrelated uncommitted work from this commit (see "Not ours" below).
2. **Pushed 6 pre-existing unrelated commits** that were sitting local-only since before this session
   (theme/docs/admin fixes, unrelated to architecture) — done early, at the user's explicit request,
   confirmed already on `origin/general-work`.
3. **Small architecture-tooling fix**: `development/scripts/check-architecture.ts` now also prints
   the runtime-only back-edge breakdown per target file (previously only the aggregate had a
   runtime-only split; the per-file `--list` breakdown didn't). Commit `4d0593c5`.
4. **Stage 2 batch 2**: dispatched two agents in parallel, each in its own isolated `git worktree` (to
   avoid both touching the same 3 shared wiring files at once), each converting a disjoint set of
   ~8 domains:
   - **Group A** (`widgets`, `content-types`, `forms`, `menus`, `database`, `recovery`, `plugins`,
     `entries`): 7 converted and kept, 1 (`database`) reverted — opened a new 16-module SCC through
     the shared low-level `db` module. Commits `fc1f10bc`, `970d7485`, `6940e0d3`.
   - **Group B** (`source-control`, `deployments`, `static-publish`, `media`, `integrations`,
     `workspace`, `pages`, `seo`): 4 converted and kept, 4 reverted — `source-control`/`deployments`/
     `static-publish` all trace to one shared root cause (see "Real blockers" below); `media` closed
     a 3-module cycle through `widgets` (which, in group B's own isolated worktree, was still
     unconverted — see "Cheapest next win"). Commit `c3f40063`.
5. **Merged both worktree branches into `general-work` by hand** — 4 files conflicted (both groups
   edited the same `tool-registrations.ts`/`tool-catalog-manifest.ts`/contract-test file). Resolved
   conflict-by-conflict via precise line-range script edits, not blind `git merge` auto-resolution.
   Found and fixed one own mistake in that process: a stray leftover `});` from the pre-conflict
   common context broke the test file's syntax — caught via re-running the scoped suite post-merge,
   but then **also caught a second time** that the fix itself hadn't actually been re-committed
   before this handoff was started (commit `5098ae4c` is the real fix; do not trust any earlier
   commit hash for this file). Commits `ed0f75c8` (merge, group A), `58802b00` (merge, group B),
   `89968774` (baseline fix), `5098ae4c` (brace fix).
6. **A measurement bug found and fixed**: the propagation-cost/core-size numbers reported earlier in
   this session (and possibly in last night's session too — unverified) were measured in the shared
   main checkout, which had ~86 extra "production" files `check:architecture` doesn't distinguish
   from git-tracked ones (a gitignored test-fixture build cache under
   `features/theme/__tests__/fixtures/astro-bundler-probe/`, plus another concurrent session's
   untracked theme work). Extra low-connectivity files dilute the propagation-cost average downward,
   so the reported numbers understated it. True clean numbers, measured in a disposable `git
   worktree`: propagation cost (all-import) **10.81% → 11.29%** across this session's whole batch-2
   rollout (not the ~8.95% figure quoted mid-session), still 0 cycles/0 SCC throughout. Not a
   regression in the "broke something" sense — just a real, higher-than-reported cost of the pattern,
   worth knowing honestly rather than under-quoting.

## Active Files And Artifacts

- `src/assistant/tool-registrations.ts` — the legacy `DOMAIN_SLICES` array; 8 entries left, each with
  a trailing comment naming its specific cycle (added/updated this session for `database`, `media`,
  `source-control`, `deployments`, `static-publish`; `themes`/`post` comments are from last night,
  still accurate).
- `src/server/tool-catalog-manifest.ts` — `installFirstPartyToolContributors()`, now calls all 17
  converted domains' `contribute<Domain>Tools()`.
- `src/assistant/__tests__/tool-contribution-registry.test.ts` — contract test suite, extended to
  cover all 17 converted + 8 reverted domains by name.
- `ADS-memory/reports/architecture/2026-08-17-stage2-registry-rollout-progress.md` — both batch
  agents' full per-domain reasoning and evidence trail (concatenated during the merge, not
  rewritten — read both halves).
- `ADS-memory/reports/architecture/2026-08-17-back-edges-decoupling-plan.md`,
  `2026-08-17-candidate-3-and-4module-scc-followup.md` — original design spec, still the reference
  for *why* this pattern exists (from session 12, unchanged).
- Prior handoff: `ADS-memory/reports/continuity/2026-08-17-session-12-architecture-handoff.md` — this
  session's own starting point; still useful for the very early history (candidates 1-6, Stage 1
  design rationale).

## Decisions And Constraints

- User confirmed: commit each verified batch (not wait until the end) — followed throughout.
- User confirmed: push the pre-existing unrelated commits — done, on origin now.
- User confirmed: two parallel agents, disjoint domain sets, `post`/`themes` saved for last — done;
  `settings` was also held out this round once its own separate structural blocker was found (see
  below), not part of the "post/themes" deferral the user asked for.
- **Nothing from this session has been pushed to origin.** 12 commits ahead of `origin/general-work`
  right now (6 already-pushed-earlier + 4 batch-2/merge/fix commits from tonight + 2 from an unrelated
  concurrent session, see below). Whether/when to push is the owner's call, same as every prior
  session in this chase.
- **Open, unanswered question from this session**: whether to route 3 files' direct `process.env`
  reads (`source-control/commit-site.ts`, `deployments/export-run.ts`,
  `deployments/static-publish/adapter.ts` — a 4th, `cli/commands/export.ts`, does the same thing and
  wasn't in the original list) through the composition root instead. Investigated mid-session: it's
  NOT the "small, no-risk" fix it was first described as — a code comment reveals it was a deliberate
  choice specifically so tests could override the value without a test-only code path; "fixing" it
  means changing function signatures, threading a param through real call chains, and losing that
  testability trick. Asked the user whether to do it anyway; never got an answer before the restart
  request. Still open.

## Risks And Open Questions

### Real blockers on the 8 remaining domains — this is design work, not mechanical conversion

- **`source-control`, `deployments`, `static-publish`** (3 domains, 1 root cause): `assistant`'s own
  static `REAL_VENDOR_CREDENTIAL_PORT` wiring in `tool-registrations.ts` value-imports
  `features/vendor-credentials`, which value-imports `features/source-control/store.ts` (via
  `dual-read.ts`), which value-imports `features/deployments/static-publish/index.ts`. Any of the
  three converting adds a `<domain> -> assistant` edge that closes this loop. **Two possible fixes,
  neither attempted**: relocate `dual-read.ts`'s legacy read out of the cycle, or move `assistant`'s
  own `VendorCredentialPort` wiring somewhere that doesn't sit on this path. Needs a real design
  decision (possibly a Software Architect dispatch), not another batch attempt.
- **`database`**: closes a 16-module SCC through the shared low-level `db` module and several
  still-static siblings. Largest/messiest of the remaining blockers — needs its own investigation,
  not assumed similar to the others.
- **`settings`**: different shape entirely — `assistant` already imports `src/features/settings`
  directly from 3 OTHER files (`public-assistant-settings.ts`, `custom-instructions.ts`,
  `execution-mode-settings.ts`), not through `DOMAIN_SLICES` at all. Converting it is structurally
  blocked regardless of what order anything else converts in. Not attempted this session (excluded
  proactively once this was found, to avoid wasting an agent's cycle on a known dead end).
- **`themes`**: needs `deployments`/`source-control` converted first (or `export`'s theme dependency
  relocated) — i.e., blocked behind the vendor-credentials fix above.
- **`post`**: needs `export`'s post dependency resolved, or the still-static `deployments`/
  `source-control` entries gone — also downstream of the same vendor-credentials fix.

### Cheapest next win — check this FIRST, before any of the above

`media` was reverted by group B because `widgets/resolver-service.ts` value-imports `media/bootstrap`/
`media/index`, and `assistant` "still statically depends on `widgets`" — **but that was true only in
group B's own isolated worktree**, branched before group A's separate, parallel conversion of
`widgets` landed. The two were never re-verified together post-merge. It's entirely possible `media`
converts cleanly right now with zero further design work — just try it and run `check:architecture`.
This is flagged in `tool-registrations.ts`'s own header comment too, so a future reader doesn't have
to reconstruct this reasoning from git history.

### Not ours — found in the same working tree, do not touch or attribute to this session

- `apps/admin/src/components/AssistantDock/AssistantDock.tsx`, `apps/admin/src/lib/assistant-transport.ts`,
  and their test files — a different concurrent session's connection-timeout/pool-exhaustion fix (2
  of its own commits, `8da9a9ae`/`f0f5e027`, are already on `general-work`, unrelated to this
  session, landed there by that other session directly). Some further edits to these files are STILL
  uncommitted in the working tree as of this handoff — not this session's work, not touched.
- `src/themes/static/basic/pages/index.html` — a one-line, uncommitted "Leon"→"Elon" text edit.
  Unclear whose or whether intentional. Not touched.
- `src/themes/static/mui-marketing/` (untracked), and a batch of `ADS-memory/reports/swarm-consensus/`
  theme-invariant reports (untracked) — unrelated theme-editor work from another session, same as
  flagged in session 12's handoff, still sitting there untouched.
- Several untracked report files not part of this chase:
  `ADS-memory/reports/2026-08-17-admin-to-jini-port-audit.md`,
  `2026-08-17-detection-tooling-build.md`, `2026-08-17-sourcedir-generated-dir-gate-fix.md`,
  `2026-08-17-theme-authoring-guide-v2-writeup.md`, `2026-08-17-vite-proxy-pool-saturation-investigation.md`.

### Uncertainty worth flagging, not resolved

The measurement-contamination bug (see "Completed Work" #6) means it's genuinely unclear whether
session 12's own reported before/after numbers (the very first "8.51% → 8.80%" table, further back
than this session touched) were measured cleanly or not — never checked. If a future session needs
to cite historical propagation-cost trend numbers precisely, re-verify from a clean worktree first
rather than trusting any number quoted in a prior handoff, including this one's own "10.81% →
11.29%" — that one WAS clean-worktree-measured, but treat every number before it with appropriate
skepticism.

## Suggested Skills

- None of this repo's slash-command skills map cleanly onto "resolve a specific module cycle" — this
  is closer to a Software Architect consult (for the vendor-credentials redesign specifically) than a
  mechanical `/implement` pass. Consider `talk to software architect` for that one specific question
  before dispatching more conversion agents.

## Next Steps

1. Try `media` alone first (see "Cheapest next win") — cheap, might just work, resolves it either way.
2. Get the user's answer on the `process.env`-routing question (still open) before touching those 3
   files, or drop it if they'd rather not.
3. For `source-control`/`deployments`/`static-publish`/`database` — these need an actual design
   decision (relocate `dual-read.ts`, or move `VendorCredentialPort` wiring, or something else) before
   another batch-style agent dispatch would help. Don't repeat the batch-2 pattern on these without
   that decision first; it'll just produce the same revert again.
4. `settings`/`themes`/`post` stay excluded until their own upstream blockers clear.
5. Ask the owner whether to push the 12 commits currently ahead of `origin/general-work` (nothing
   this session pushed beyond the 6 pre-existing ones handled early on).

## Handoff Contract

- Inputs used: `git log`/`git status`/`git show --stat` against current HEAD, direct file reads of
  `tool-registrations.ts`/`tool-catalog-manifest.ts`/the contract test file post-merge, live
  `npm run check:architecture` and scoped `node --test` runs (not relayed from any subagent claim
  without independent re-verification), both batch-2 agents' own final reports.
- Output summary: an accurate resume point for continuing the registry rollout, with the real
  (non-mechanical) blockers named per remaining domain so the next session doesn't re-discover them
  by re-attempting and reverting the same ones again.
- Risks: same as "Risks And Open Questions" above, compressed — 4 of the 8 remaining domains share
  one unfixed root cause; the measurement-contamination bug's blast radius on OLDER reported numbers
  is not fully known; two small process mistakes this session (a missed re-commit, a baseline measured
  in a dirty checkout) were both caught before this handoff, but underline: verify, don't trust, even
  your own prior claims within the same session.
- Suggested next assignee: Claude Code, same repo, ideally after a quick Software Architect
  consultation on the vendor-credentials cycle specifically.
