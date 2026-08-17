# Session 12 — architecture chase handoff (2026-08-17)

**Target:** Claude (same tool, next session). **Focus:** finish rolling out the tool-contribution
registry pattern to the remaining ~22 feature domains (Stage 2 of a proven-safe redesign).

**Nothing from tonight is committed.** All of tonight's work is sitting as uncommitted changes in the
working tree, left deliberately for the owner's review before any commit. Separately, 5 pre-existing
commits from before this session (theme/docs fixes) are already committed locally but still unpushed
to `origin/general-work` — unrelated to tonight, not part of this handoff's scope, just noting they're
there.

**Read `AI-Dev-Shop/AGENTS.md` first per the repo's own bootstrap rule, then this document, then
continue from "What's left" below.**

---

## What this session was

Started as: "check the last four handoffs, is the architecture rock solid." Became: a live
`npm run check:architecture` audit → dispatching a Software Architect for a decoupling plan →
implementing it → chasing a metric regression the fix itself caused → a Codex peer second opinion →
implementing that peer's recommended redesign → proving it works on 2 real features → stopping here,
by owner's choice, to hand off the remaining rollout to a fresh session.

Two Codex peer dispatches happened tonight (both via `codex exec` with the `<<PEER_DISPATCH>>` +
stdin protocol, not a formal `/consensus` or `/debate` run — this was ad-hoc targeted consultation).
Model resolved to whatever the CLI's config pointed at that moment (`gpt-5.6-terra` per
`~/.codex/config.toml`, reasoning effort `high`) — the earlier "gpt-5.6-sol" name from a prior
session is not a selectable model, it's a per-session codename the provider assigns; don't try to
request it by name again.

## Fixed and verified clean tonight (in order)

1. **`src/export/site-exporter.ts <-> src/server/app.ts`** — NOT this session's work, already landed
   before tonight (`d9a61b44`), confirmed live and cited as precedent throughout.
2. **`integrations <-> db` and `features/database <-> db`** — NOT this session's work either, already
   landed before tonight (`2f73732b`), also confirmed live and cited as precedent.
3. **`assistant <-> server` + `assistant <-> plugins`** (this session) — relocated
   `agent-daemon-server.ts` + `daemon-supervisor.ts` from `src/assistant/` to
   `src/server/agent-daemon/`. Runtime back-edges into the composition root: 4 → 0.
4. **`assistant <-> {deployments, post, source-control}`** (this session) — relocated
   `surface-exchanges.ts` from `src/assistant/` to `src/core/tool-surface-exchanges.ts`.
5. **Module-API-surface side effect of #3/#4** — moving those files initially exposed 18 more files
   than before (208→226, failed the gate). Fixed via `src/assistant/agent-daemon-port.ts` (a narrow,
   named-exports-only port — NOT a broad barrel), landing at 212. Codex's targeted second opinion
   proposed this narrow-port design; the executing agent found and fixed a flaw in that exact design
   (it would've dragged 3 unrelated callers into a big transitive closure) before landing it.
6. **`db <-> features/deployments`** (this session) — `resolvePublishHistoryListLimit` relocated from
   `features/deployments/static-publish/publish-history.ts` to a new
   `src/db/sqlite/publish-history-list-limit.ts` (a shared file both the real SQLite store and the
   in-memory test double depend on — NOT nested inside one adapter's private space, which the original
   plan's suggested target would have gotten backwards).
7. **`assistant <-> comments <-> plugins <-> newsletter` (4-module SCC)** (this session, the big one)
   — root-caused as `assistant/tool-registrations.ts` importing every feature's own
   `tool-registrations.ts` by name. Diagnosed as NOT a misplaced-file problem (unlike 1-6) — every
   edge was doing its real job. Got a second Codex opinion specifically on the best long-term pattern;
   it recommended an explicit contribution-registry, modeled on the *already-existing*
   `src/assistant/mcp-federation/presets.ts` pattern, not a foreign framework. Built
   `src/assistant/tool-contribution-registry.ts` + `src/server/tool-catalog-manifest.ts`, wired into
   BOTH real boot paths (`server/agent-daemon/agent-daemon-server.ts` daemon path,
   `server/modules/assistant-byok.ts` BYOK path). Converted `comments` and `newsletter` to it.
   **Result: SCC 4 → 0. The original target this whole chase was diagnosed for is fully resolved.**

**Before/after tonight, live-measured (`npm run check:architecture`):**
```
                                          START    END      
back-edges into composition root:        15    →  11
  runtime-only:                           4    →   0
module cycles (mutual pairs):             6    →   0
largest SCC (runtime-only):              30    →   0
propagation cost (all-import):        10.51%  → 8.80%
propagation cost (runtime-only):       2.31%  → 1.94%
module API surface (files exposed):     208   →  213
core size:                            16.49%  → 16.17%
```
Every metric improved or stayed flat except module API surface (+5 net) and core size (+0.12 net at
the very last step) — both small, both directly and honestly caused by adding a handful of necessary
composition-adjacent files (ports/barrels/manifest), same "small honest price" pattern accepted at
every step tonight, not a side effect or a sign of a deeper problem. `check:architecture` currently
reports **"OK: at baseline"** (the baseline file itself, `development/scripts/check-architecture.baseline.json`,
is part of the uncommitted diff — this is expected, it's a generated/checked-in file the `--update`
runs wrote).

Full detail and evidence trail for all of the above:
- `ADS-memory/reports/architecture/2026-08-17-back-edges-decoupling-plan.md` (original Software
  Architect plan, candidates 1-3)
- `ADS-memory/reports/architecture/2026-08-17-candidate-3-and-4module-scc-followup.md` (candidate 3
  execution + the 4-module SCC diagnosis + Codex's registry-pattern recommendation in its Addendum —
  **this is the design spec for the remaining rollout work below, read it before continuing**)
- `ADS-memory/reports/codebase-analysis/ANALYSIS-tovu-arch-health-2026-08-17.md` (independent
  CodeBase Analyzer pass, found the same root cause from a different angle, cross-confirmed)

## What's left — full list, nothing hidden

### 1. Stage 2: convert the remaining ~22 feature domains to the registry pattern (the actual next task)

`comments` and `newsletter` are converted. `post` was **tried and reverted** — converting it opened a
NEW, worse 7-module cycle (`assistant -> widgets -> features/post -> assistant`, since `widgets` and
`export` both depend on `post`, a shape comments/newsletter don't have since nothing else imports
them). **A comment was left on `post`'s `DOMAIN_SLICES` entry and in `tool-catalog-manifest.ts`**
explaining this — read it before touching `post` again.

**The critical lesson for whoever does the rest:** before converting any domain, check "does anything
ELSE in the repo depend on this domain" (not just "does `assistant` import it"). Comments/newsletter
were safe because nothing else touches them. Post was not. Check each of the remaining ~22 the same
way before converting — this is real per-domain investigation, not a mechanical find-replace across
all 22 at once.

**Model guidance, per the owner:** this proved out fine on Sonnet at high reasoning effort tonight —
no need to escalate to Opus for the rollout. Do continue using the same staged, verify-after-each-batch
discipline (typecheck + scoped tests + `check:architecture` after each batch, not just at the end).

**11 contract tests already exist** at `src/assistant/__tests__/tool-contribution-registry.test.ts` —
covering exact installed contributors, duplicate-tool-id rejection (both registry-vs-registry and
registry-vs-legacy-DOMAIN_SLICES), omitted-contributor failure, deterministic order, and daemon/BYOK
catalog parity. Extend this file's coverage as more domains convert, don't replace it.

### 2. Not urgent, but real — from tonight's investigation

- `assistant/index.ts` and 2 other barrels' back-edges-into-composition-root metric mixes type-only
  and runtime signals (11 of the original 15 were `import type` noise). Recommended, not executed:
  split it the same way propagation-cost and module-cycles already got split tonight. Metric-definition
  change only, no source risk.
- 3 files under `src/features/` read `process.env` directly instead of through composition root
  (`source-control/commit-site.ts:184-185`, `deployments/export-run.ts:134`,
  `deployments/static-publish/adapter.ts:133`) — small extractability blocker, low priority.
- Jini (sibling repo, `/Users/la/Programming/Jini`) got its own architecture health pass tonight —
  it's clean (zero cross-package cycles), has its own gate (`pnpm guard`) that's stricter in some ways
  than Tovu's, and doesn't need Tovu's graph-metric approach as a replacement, only as a genuine
  addition (general cross-package cycle detection, which `guard`'s 12 rules don't currently cover).
  See `/Users/la/Programming/Jini/ADS-memory/reports/codebase-analysis/ANALYSIS-002-jini-arch-health-2026-08-17.md`
  (already corrected once tonight after an initial overstated "zero violations" claim — the correction
  is inline at the top of that file).

### 3. Found tonight, NOT ours, flagging for awareness only

- **Another concurrent session left uncommitted debug instrumentation in
  `src/server/middleware/dev-auth.ts`** — wraps `requireAdminSession` in a try/catch that was silently
  returning `500 "internal error debug"` and breaking 7/11 tests in `assistant-byok-routes.test.ts`
  before this session traced it. Not touched, not ours to remove without checking whose WIP it is
  first — same policy applied to Jini's uncommitted "Tovu" string-leak finding earlier tonight.
- The current working tree also has unrelated uncommitted changes from other sessions: theme-editor
  work (`src/themes/static/mui-marketing/`, `apps/admin/src/lib/api.ts`,
  `development/e2e/themes-presentation-request-timeout.spec.ts` and its Playwright config) and a batch
  of swarm-consensus/theme-invariant reports under `ADS-memory/reports/swarm-consensus/`. **None of
  these are part of tonight's architecture work** — don't attribute them to this handoff, and don't
  commit them as part of landing the architecture work without separately confirming with the owner
  whose work they are.
- 3 pre-existing test failures, confirmed unrelated to any of tonight's changes (reproduce in
  isolation, touch files never modified tonight): `tool-registrations.database-recovery.test.ts`,
  `tool-registrations.menus.test.ts`, `byok-provider-turn.test.ts`. Also 8 longer-standing pre-existing
  failures from earlier in the night (7 BYOK protocol wire-shape assertions + 1 stale
  `credentialGuidance` string), proven pre-existing via a disposable-worktree check against untouched
  HEAD, reconfirmed unrelated at every subsequent checkpoint.

### 4. Decisions only the owner can make

- Whether/when to commit tonight's architecture work (nothing is committed yet).
- Whether to push the 5 pre-existing unpushed commits (unrelated to tonight).
- Whether Stage 2 (the ~22-domain rollout) happens next session or gets deprioritized further.

## Source evidence inspected for this handoff

- Live `git status --short` (89 changed paths — see the "not ours" caveat above for how many of those
  are unrelated concurrent work, not tonight's architecture chase)
- Live `npm run check:architecture` output (multiple points throughout the session, final state
  reported above)
- All 3 architecture report files listed under "Fixed and verified clean tonight"
- Direct agent reports from `refactor-assistant-cycles` (tonight's primary implementer, Sonnet) and
  `registry-redesign` (Stage 1 of the registry rollout, Sonnet) — both ran with real, live-measured
  before/after numbers at every checkpoint, not predicted ones
- Two Codex peer-dispatch outputs (`peer-codex-assistant16.jsonl`,
  `peer-codex-future-pattern.jsonl` in this session's scratchpad — ephemeral, not on a durable path,
  their conclusions are captured in the architecture report files above instead)

## Next-agent opening prompt

If resuming this specific thread in a fresh session, open with:

> Read `AI-Dev-Shop/AGENTS.md`, then
> `ADS-memory/reports/continuity/2026-08-17-session-12-architecture-handoff.md` (this file), then
> `ADS-memory/reports/architecture/2026-08-17-candidate-3-and-4module-scc-followup.md`'s Addendum
> section (the registry design spec). Continue Stage 2: convert the remaining ~22 feature domains
> from `assistant/tool-registrations.ts`'s legacy `DOMAIN_SLICES` array to the
> `tool-contribution-registry.ts` pattern, one batch at a time, checking each domain for "does
> anything else in the repo depend on it" before converting (per `post`'s reverted attempt — see the
> code comments left on its `DOMAIN_SLICES` entry). Verify with typecheck + scoped tests +
> `check:architecture` after each batch. Dispatch to a Sonnet subagent at high reasoning effort —
> proven sufficient tonight, no need for Opus.

## Known limits of this handoff

- Written by the same session that did the work, not an independent auditor — the "Fixed and
  verified" claims above are traceable to the cited report files and live command output, but this
  document itself hasn't been adversarially re-checked by a fresh reader.
- The two Codex peer-dispatch raw transcripts live only in this session's scratchpad (ephemeral,
  gitignored, will not survive past this session) — their conclusions are preserved in the committed
  report files, but the raw reasoning trace is not.
- Did not independently re-verify the "3 pre-existing test failures" and "8 longer-standing pre-
  existing failures" claims myself in this handoff pass — relayed from the implementing agents'
  reports, which did do the disposable-worktree verification described.
