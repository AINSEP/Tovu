# Handoff: registry rollout COMPLETE (25/25) — next workstream is deep-import triage

Generated: 2026-08-17 (end of session 15)
Source agent/session: Claude Code (Sonnet 5, then Opus 5), same repo as sessions 12-14
Target: Claude Code, next session, same repo
Save note: written to `reports/continuity/` (committed), NOT `.local-artifacts/` — that path is
gitignored and one `git clean` from gone. Session 14's handoff used this same location.

---

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then
> `ADS-memory/reports/continuity/2026-08-17-session-15-registry-rollout-complete-handoff.md`.
> **The Stage 2 tool-contribution registry rollout is DONE — 25 of 25 domains, zero exceptions**,
> merged and pushed to `general-work` (HEAD `95991167`). Do not propose converting domains;
> `DOMAIN_SLICES` holds only two env-gated demo stubs. `check:architecture` is at 0 module cycles /
> 0 largest SCC. The branch DOES show one red metric (`module API surface 211 -> 213`) — that is a
> DIFFERENT concurrent session's `custom-credentials` feature, proven by measurement, and the owner
> deliberately left it visible rather than absorbing it into the baseline. Do not "fix" it.
> The recommended next workstream is the deep-import triage described under "Next Steps".

---

## Current State

- Branch `general-work`, HEAD `95991167`, **0 commits ahead of origin** (everything pushed).
- No agent worktrees; no background agents running.
- `npx tsc -p tsconfig.json --noEmit`: **0 errors** (verified directly in the real checkout).
- `npm run check:architecture`: **0 module cycles, 0 largest SCC** (both HARD constraints).
  Propagation cost 11.21% all-import / 1.69% runtime-only, core size 16.96%.
  **FAILS on one RATCHET metric — see Risks. Not ours.**
- `npm run check:boundaries`: 235 warnings, **0 errors** (was 255 / 1 error at session start).
- `DOMAIN_SLICES` in `src/assistant/tool-registrations.ts` verified by reading the array directly:

      { domain: "demo-choices", ... },
      { domain: "demo-a2ui", ... },

  Nothing else. All 25 real domains converted.

## Completed Work (this session)

1. **`vendor-credentials/store.ts` blocker fixed** (`90c85779`) — session 14's single named blocker.
   `extractGitHubLogin` injected structurally instead of value-imported.
2. **`deployments` + `static-publish` converted** (`46e6c57b`) — had to convert TOGETHER; the module
   graph is per-directory and both live in `features/deployments`, so converting one alone
   reintroduced a live 2-module cycle.
3. **`themes` converted** (`5cc93892`).
4. **`post` design investigation** (Software Architect dispatch) →
   `ADS-memory/reports/architecture/2026-08-17-post-listpublishedposts-design-options.md`.
   Found the blocking edge is `listPublishedPosts`, whose filter is the ONLY thing keeping
   draft/trashed posts from anonymous visitors (`PostRepoPort.list()` is status-blind) — so the fix
   had to inject the real function, never reimplement it.
5. **`post` converted** (`fc8ad2a6`) — last of the 25.
6. **`settings` exception REMOVED** (`27df78ab` cut the 3 side-door edges, `82a6c351` converted it
   the standard way). Owner-directed reversal; see Decisions.
7. **A boundary-guard hole found and fixed** (`1c4423cd`) — see Decisions, this is the most
   generalizable finding of the session.
8. Three stale processes killed (a 5-day-old test server squatting on port 39217, its esbuild child,
   a 5-day-old vitest worker) and two stale worktrees removed.

## Active Files And Artifacts

- `src/assistant/tool-registrations.ts` — `DOMAIN_SLICES`, now demo-stubs-only. The historical
  blocker commentary above the array is HISTORY; check the array, not the prose.
- `src/server/tool-catalog-manifest.ts` — `installFirstPartyToolContributors()`, wires all 25
  uniformly including `contributeSettingsTools()`. Its header documents the settings reversal.
- `.dependency-cruiser.cjs` — `TOOL_REGISTRATION_SEAM_FROM` / `_TO` now cover the moved seam caller.
- `ADS-memory/reports/architecture/2026-08-17-settings-exception-removal-scoping.md` — the measured
  scoping + the owner's reasoning for the reversal.
- `ADS-memory/reports/architecture/2026-08-17-post-listpublishedposts-design-options.md` — Option A
  design and the two rejected alternatives.
- `ADS-memory/reports/architecture/2026-08-17-settings-blocker-investigation.md` — mechanism detail
  still accurate; its RECOMMENDATION is superseded, do not follow it.

## Decisions And Constraints

- **`settings` is no longer an exception, by owner decision.** The prior investigation recommended
  keeping it permanently special-cased because removing it only moved ratchet-tier metrics. The
  owner reversed that on a different criterion, worth preserving because it generalizes: *the
  exception was protected only by a comment telling future readers not to restore consistency, and
  a comment is not an enforcement mechanism.* Cutting the 3 side-door edges moved that protection
  into the CI gate. `SCOPE_BIT`/`INSTRUCTIONS_NAMESPACE` were injected rather than relocated —
  sourcing them from `@jini-ai/cms/settings` directly would have reopened a deep-import bypass,
  i.e. traded one prose-guarded exception for another.
- **A big refactor can move code out from under its own guard rails.** Converting the domains moved
  the seam caller from `assistant/tool-registrations.ts` to `server/tool-catalog-manifest.ts`, which
  was never registered in `.dependency-cruiser.cjs`. All 25 conversions came through an unregistered
  door: 19 violations (18 silent `warn` + 1 real `error` on `features/post`). Nobody caught it
  because `check:boundaries` is `severity: "warn"` throughout and **exits 0 by design — CI can never
  fail on it**, and `check:architecture` (the metric check) stayed green the whole time.
  Fixed narrowly as a second seam entry, NOT by adding the file to `COMPOSITION_ROOTS` (which would
  grant blanket access to every module's internals). `publish-agent-tools.ts` needed naming in
  `TOOL_REGISTRATION_SEAM_TO` too — the hyphen defeats the `(^|/)` anchor.
  **Rule for next time: after any pass that relocates who-imports-what, re-run the RULE-based check,
  not just the metric-based one.**
- **Baseline `--update` only from a clean checkout.** `check:architecture` measures the WORKING TREE.
  Mid-session it "failed" in the main checkout purely because another session had 8 untracked `.ts`
  files there. Disproof recipe (~20s, no `git stash` — which is banned in this shared repo):
  `git worktree add --detach <scratch> HEAD` + `ln -s <main>/node_modules <scratch>/node_modules`
  + `cd <scratch> && ./node_modules/.bin/tsx development/scripts/check-architecture.ts`.
  The symlink is the non-obvious step; without it `npm run` dies with `tsx: command not found` and
  an external `.bin/tsx` still fails because `depcruise` resolves relative to CWD.
- Owner approved, each explicitly: push after each verified merge; delegate all implementation to
  Sonnet 5 subagents in isolated worktrees; remove the settings exception; register the moved seam
  narrowly; leave the foreign red metric visible.

## Risks And Open Questions

### The branch is RED, and it is NOT this workstream's doing

`module API surface (files exposed) 211 -> 213`. Cause: a **different concurrent session** landed a
new `custom-credentials` module (`6ca2d53c`, `2199480a` — also `apps/admin` security/media UI work)
which took the repo from 48 to 49 modules. **Proven, not assumed:** measured `general-work` at
`1c4423cd` — *before* the settings merge — and it already read 213.

Owner's decision: **leave it red** so that session reviews its own +2, rather than `--update`-ing it
silently into the shared baseline. Do not resolve this by updating the baseline. If that session
asks, the number is theirs to justify.

### Pre-existing test failures — still unowned across four sessions

`tool-registrations.database-recovery.test.ts`, `tool-registrations.menus.test.ts`, a
`byok-provider-turn.test.ts` cluster, `publish-site-route.test.ts`, and 2 SPEC-046 client-directive
SSE tests in `site-assistant-routes.test.ts` (a `stubGeminiFetch` network-isolation gap, confirmed
against unmodified HEAD). None are caused by this workstream. Nobody has chased them.

### Not ours — in the working tree, do not touch or attribute

`.gitignore`, `apps/admin/vite.config.ts`, `src/themes/static/basic/pages/index.html`, and untracked
`ADS-memory/` + `swarm-consensus/` files belonging to other concurrent sessions.

## Suggested Skills

- None of the pipeline slash-commands map onto the recommended next workstream. It is a
  well-specified, repeatable triage — dispatch per-module with
  `AI-Dev-Shop/agents/programmer/skills.md`, isolated worktree, Sonnet 5, per this session's pattern.
- `AI-Dev-Shop/agents/software-architect/skills.md` if a module's triage turns out to need design
  work rather than mechanical redirects (that is what happened with `post`).

## Next Steps — the recommended next workstream

The rollout is finished, so the remaining architecture headroom is elsewhere. Measured this session:

    235 check:boundaries warnings, 0 errors
    194  no-deep-imports                                  <- 83% of everything
     26  only-composition-constructs-concrete-adapters    <- the actual DI rule
      8  feature-no-express-or-admin-imports              <- RouteDeps leaking

**Current scores and how to read them.** `propagation cost` answers "if I change one random file,
what percentage of the codebase could be affected?" — lower is better. For rough scale, from
published DSM studies of real systems (approximate, recalled not measured): Linux ~5%, Mozilla ~17%
before its redesign and ~3% after.

| metric | value | read |
|---|---|---|
| module cycles | 0 | perfect — HARD constraint |
| largest SCC | 0 | perfect — HARD constraint |
| propagation cost (runtime-only) | 1.69% | genuinely good |
| propagation cost (all-import) | 11.21% | middling |
| core size | 16.96% | moderate |

Cycles and SCC at 0 are what decide whether a module can ever be extracted into its own package —
those are done. The percentages are gradual-improvement dials, not pass/fail.

1. **Lever 1 — deep-import triage (194 violations, the whole gap).** Each module should expose only
   its `index.ts`. Today **211 private files are reachable from outside via 574 deep-import edges**,
   and that is most of what the 11.21% all-import number is. There is a proven recipe already in
   this repo: the 2026-08-13 `features/post` trace resolved its 25 violations (20 wrong-door
   redirects, 2 barrel additions, 3 seam exemptions), re-verified at 0, then **promoted the module
   from `warn` to `error`** in `.dependency-cruiser.cjs`'s `PROMOTED_NO_DEEP_IMPORTS`. That is
   **1 of ~24 modules done.** Repeat per module. Start with whichever module has the most
   violations; get the count with
   `npm run check:boundaries 2>&1 | grep "warn no-deep-imports" | sed 's/.*no-deep-imports://;s/:.*//' | sort | uniq -c | sort -rn`.
2. **Lever 2 — the DI rule (26 violations).** `only-composition-constructs-concrete-adapters`: 26
   places select a concrete implementation instead of being handed one. Same structural-injection
   technique this session used four times.
3. **Lever 3 — `RouteDeps` leaking (8 violations).** Small count, structurally heavy: it is an
   intersection of all 25 domains' deps types, and it is what killed the `providers/` restructuring
   idea (investigated to a negative result — do not re-propose; see
   `reference_tovu_tool_contribution_registry_coupling`).
4. **The meta-fix, and the point of all of it:** none of the above can currently fail CI. Every
   `.dependency-cruiser.cjs` rule is `severity: "warn"` and the check exits 0 by design, so it is
   advice nobody is forced to take. Promotion to `error` per triaged module is what makes an
   improvement stick — and this session's own guard-hole (19 violations sitting silently) is the
   evidence for why warn-only checks get ignored.

## Handoff Contract

- Inputs used: live `git status`/`git log`/`git worktree list`; `npx tsc --noEmit`,
  `npm run check:architecture`, and `npm run check:boundaries` run directly in the real checkout
  after every merge (not relayed from subagent claims); a clean-worktree re-measurement at
  `1c4423cd` to attribute the red metric; direct reads of `tool-registrations.ts`,
  `tool-catalog-manifest.ts`, `.dependency-cruiser.cjs`; and all four subagents' final reports.
- Output summary: an accurate "the rollout is finished" resume point, the reasoning behind two
  owner decisions that reverse earlier written recommendations, and a measured, prioritized next
  workstream with a proven per-module recipe.
- Risks: the red metric belongs to another session and must not be baselined away; the prose above
  `DOMAIN_SLICES` still describes historical blockers and will mislead a reader who does not check
  the array; 6+ pre-existing test failures remain unowned.
- Suggested next assignee: Claude Code, same repo. Programmer-persona dispatch per module, isolated
  worktree, Sonnet 5.
