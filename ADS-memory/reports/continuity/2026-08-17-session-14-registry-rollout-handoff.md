# Session 14 — Stage 2 registry rollout handoff (2026-08-17)

Generated: 2026-08-17 (end of session)
Source agent/session: Claude Code (Sonnet 5, then Opus 5), same repo as sessions 12–13
Target: Claude Code, next session, same repo

**Read `AI-Dev-Shop/AGENTS.md` first per the repo's own bootstrap rule, then this document.**

---

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then
> `ADS-memory/reports/continuity/2026-08-17-session-14-registry-rollout-handoff.md` (this file).
> The Stage 2 registry rollout is now at **21 of 25 domains converted**, all merged to
> `general-work` (HEAD `ce88e968`), verified clean: 0 module cycles, 0 largest SCC, tsc 0 errors.
> **4 real domains remain — `deployments`, `static-publish`, `themes`, `post` — and ALL FOUR are
> blocked by ONE single edge**, newly discovered this session and NOT yet fixed:
> `src/features/vendor-credentials/store.ts:5` value-imports `extractGitHubLogin` from
> `../deployments/static-publish/index`. Fixing that one import with the same structural-injection
> technique already applied to `dual-read.ts` (commit `996203a7`) is the whole remaining job. Start
> there. 15 commits are unpushed — ask the owner before pushing.

---

## Current State

- Branch `general-work`, HEAD `ce88e968`, **15 commits ahead of `origin/general-work`, 0 behind.**
  Nothing from this session's second half has been pushed.
- `npm run check:architecture`: **OK, at baseline** — 0 module cycles, 0 largest SCC (both HARD
  constraints), 11 back-edges, propagation cost 11.36% all-import / 2.15% runtime-only.
- `npx tsc -p tsconfig.json --noEmit`: 0 errors.
- **21 of 25 domains converted.** Remaining in `DOMAIN_SLICES`: `deployments`, `static-publish`,
  `post`, `themes` — plus `demo-choices`/`demo-a2ui`, which are demo stubs gated behind
  `TOVU_ENABLE_DEMO_TOOLS` and were never in scope. Do not count the demo pair as work.
- All agent worktrees removed; no background agents running.

## Completed Work (this session)

1. **`media` converted** (retry succeeded, commit `d2c996ea`) — its old blocker (`widgets`) had been
   converted in a prior batch and never re-tested together. Independently re-verified after merge:
   0 cycles, tsc clean, 90/90 scoped tests.
2. **`process.env` routing fix landed** (commit `c1c69d39`, merged `83c66ef7`) — the open question
   from session 13, resolved by owner decision to do it despite losing the env-override test trick.
   4 files (`source-control/commit-site.ts`, `deployments/export-run.ts`,
   `deployments/static-publish/adapter.ts`, `cli/commands/export.ts`) now take values threaded from
   the composition root via 3 new `RouteDeps` fields; 8 test files migrated to explicit injection.
   Independently verified: tsc 0, architecture unchanged, 139/140 scoped (1 pre-existing failure).
3. **Three design investigations completed and written up** (read these before acting):
   - `ADS-memory/reports/architecture/2026-08-17-vendor-credentials-cycle-design-options.md`
   - `ADS-memory/reports/architecture/2026-08-17-database-cycle-investigation.md`
   - `ADS-memory/reports/architecture/2026-08-17-settings-blocker-investigation.md`
4. **Batch 3 landed 4 more domains/fixes** (merged, 8 commits):
   - `database` converted (`668c4f45`) — required relocating `drift.ts` from `features/database/`
     into `db/` first, cutting the `db -> features/database` edge. The cycle had already shrunk
     16 → 10 modules since session 13 because sibling domains converted in between.
   - `settings` wired (`1f7e542a`) — **deliberate one-off exception**: wired directly in
     `server/tool-catalog-manifest.ts` rather than `settings` calling `registerToolContributor`
     itself, because the standard pattern would create a NEW cycle (3 files inside `assistant/`
     already import `features/settings` directly). Those 3 side-door files were deliberately LEFT
     ALONE — `features/settings` is a shared library like `db`, not a bounded domain.
   - vendor-credentials `dual-read.ts` fix (`996203a7`) — Option B structural injection.
   - `source-control` converted (`8ce8c0ce`) — unblocked by the above, exactly as designed.
   - `deployments`/`static-publish`/`themes`/`post` retried and reverted with updated trailing
     comments (`97ce2dbe`, `cb469e6b`, `20cf6ad3`, `bdc66d83`).
5. Architecture baseline recomputed twice in the real checkout (`f50c45a4`, `ce88e968`).

## Active Files And Artifacts

- `src/assistant/tool-registrations.ts` — legacy `DOMAIN_SLICES`; 4 real entries left, each with a
  trailing comment naming its specific blocker (all updated this session with fresh evidence).
- `src/server/tool-catalog-manifest.ts` — `installFirstPartyToolContributors()`, now wires 21
  domains, including `settings`'s one-off exception (commented as such — do not "restore
  consistency" on it or the cycle returns).
- `src/features/vendor-credentials/store.ts:5` — **THE remaining blocker.** See below.
- `src/features/vendor-credentials/dual-read.ts` — the worked example of the fix technique to copy.

## Decisions And Constraints

- Owner approved and executed: push (done for the first 14 commits, mid-session); do the
  `process.env` fix; bundle the 3 fixes into one agent rather than one agent each.
- **`settings`'s side-door files stay as-is.** Not an oversight — `features/settings` is a shared
  library. Rerouting would touch every `server/**` deps-assembly site to move a non-blocking metric.
- **`settings`'s registry wiring is an intentional exception** to the uniform shape. Commented in
  place. A future "make it consistent" pass would reintroduce a hard-constraint cycle failure.
- **The propagation-cost ratchet is expected to tick up per conversion.** Each conversion trades a
  small all-import propagation increase for cycle elimination. `--update` the baseline after each
  verified merge; that is the established precedent, not a way to dodge a gate. Hard constraints
  (module cycles, largest SCC) must stay 0 and were never relaxed.

## Risks And Open Questions

### THE remaining blocker — one edge, four domains

`src/features/vendor-credentials/store.ts:5` value-imports `extractGitHubLogin` from
`../deployments/static-publish/index` (used by `createVendorCredential`'s GitHub-login probe).
This is **separate from `dual-read.ts`** and was NOT covered by the Option B design note — it was
discovered empirically by batch 3 only after Option B landed and `deployments` still failed.

- Converting `deployments` or `static-publish` closes a 3-module cycle
  `[assistant, features/deployments, features/vendor-credentials]` through this edge.
- `themes` and `post` were both retried after `source-control` converted. Their SCCs **shrank but
  did not clear** (themes 6→5 modules, post 7→5), same cluster. Note: `largest SCC` regressed 0→5
  while `mutual pairs` still read 0 — **a hard-constraint failure that the "cycles" line alone does
  not show.** Check both metrics, not just mutual pairs.
- Recommended fix: apply the same structural-injection technique to that one `extractGitHubLogin`
  call. Small and well-precedented (`dual-read.ts` is the worked example), but it IS new design
  work that batch 3 deliberately did not force.

### Pre-existing failures — not this work, still unfixed

`tool-registrations.database-recovery.test.ts` (6 failures, authorize()/
`INSTANCE_AUTHORIZATION_NOT_CONFIGURED`), `tool-registrations.menus.test.ts`, a
`byok-provider-turn.test.ts` cluster, and one `publish-site-route.test.ts` GITHUB_TOKEN
guidance-string mismatch. All confirmed pre-existing against unmodified baselines. Nobody has
chased these across three sessions.

### A closed investigation — do not reopen

A `providers/` top-level folder for shared dependency-free code was proposed and **investigated to
a negative result.** `tool-contribution-registry.ts` is a dead end in the *runtime* graph only —
it type-imports `AssistantToolRegistryDeps`, which is an intersection of all 25 domains' deps
types. Moving it into `providers/` carries that edge along, so a "providers imports nothing from
features" gate is not satisfiable without decomposing that type first. Measured: repointing all 18
domains' imports off the `assistant/index` barrel gains 13.6% relative on runtime propagation
(2.21%→1.91%) and ~nothing on all-import (11.30%→11.22%) — roughly 2 fewer files reachable per
file. Owner's verdict: not worth pursuing. Full detail in the memory note
`reference_tovu_tool_contribution_registry_coupling.md`.

### Not ours — in the working tree, do not touch or attribute

`apps/admin/vite.config.ts`, `.gitignore`, `src/themes/static/basic/pages/index.html` (a one-line
"Leon"→"Elon" edit), `src/themes/static/mui-marketing/` (untracked), and a batch of untracked
`ADS-memory/reports/` + `swarm-consensus/` files from other concurrent sessions.

## Suggested Skills

- None of the pipeline slash-commands map cleanly onto "fix one import edge." This is a small,
  well-specified Programmer task now that the design is known — dispatch it directly with
  `AI-Dev-Shop/agents/programmer/skills.md`, in an isolated worktree, per the established pattern.

## Next Steps

1. Fix `vendor-credentials/store.ts:5`'s `extractGitHubLogin` import via structural injection
   (copy the `dual-read.ts` pattern from commit `996203a7`).
2. Then convert `deployments` and `static-publish`, verifying each independently.
3. Then retry `themes` and `post` — they may clear as a side effect. **Verify empirically; both
   have now been predicted-to-clear and failed once each.** Check `largest SCC`, not just cycles.
4. Ask the owner whether to push the 15 commits currently ahead of `origin/general-work`.
5. Optional, low value: the barrel-import cleanup (see "closed investigation"). Owner declined it.

## Handoff Contract

- Inputs used: live `git status`/`git log`/`git worktree list`, `npm run check:architecture` and
  `npx tsc --noEmit` run directly in the real checkout after each merge (not relayed from subagent
  claims), scoped `node --import tsx --test` runs, direct reads of `tool-registrations.ts` /
  `tool-catalog-manifest.ts` / `tool-contribution-registry.ts`, and all four subagents' final
  reports.
- Output summary: an accurate resume point at 21/25 domains, with the single remaining blocker
  named precisely enough to fix without re-investigation.
- Risks: the one unfixed edge blocks all 4 remaining domains; `themes`/`post` have each been
  wrongly predicted to clear once already, so verify rather than assume; 6+ pre-existing test
  failures remain unowned; 15 commits unpushed.
- Suggested next assignee: Claude Code, same repo. Programmer-persona dispatch, isolated worktree.
- **Verification note for honesty:** I re-ran `check:architecture` and `tsc` myself after every
  merge. I did NOT independently re-run batch 3's full 292-test scoped sweep — that number
  (286 pass / 6 pre-existing failures) is the subagent's own report, not my verification.
