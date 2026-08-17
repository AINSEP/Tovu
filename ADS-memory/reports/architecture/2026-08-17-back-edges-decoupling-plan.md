# Back-edges / cycle decoupling plan — next round, 2026-08-17

**Dispatch mode:** Agent Direct Mode (Software Architect persona), ad-hoc — not a spec-pipeline run.
Pipeline-only Required Inputs (spec-manifest, red-team-findings, system-blueprint, governance
constitution, NFR discovery, etc.) are **N/A** for this dispatch; none exist for this ad-hoc task and
none were needed to reach the conclusions below. This document is propose-only — no source files were
changed to produce it.

**Skills loaded:** `agents/software-architect/skills.md` (base), plus the two conditional skills the
dispatch named: `harness-engineering/sensors/dependency-structure.md` (no-cycle rule semantics, hard
vs. ratchet vs. sensor-validation-status distinctions) and
`skills/codebase-analysis/references/component-coupling-metrics.md` (Ca/Ce/instability framing —
applied qualitatively below using the numbers `check-architecture.ts --list` already reports; the
Python `main_sequence.py` script itself was not run, since it doesn't cover this TS/JS tree — see its
own "Python only" limitation — and the JS-graph numbers this repo's own tool already produces are the
right instrument here).

**Prior work this builds on, not duplicates:** `ADS-memory/reports/2026-08-17-arch-scc-cuts.md`
(same-day, different dispatch) executed the two SQLite-adapter relocations
(`integrations → db`, `features/database → db`) and the propagation-cost/module-cycles graph split.
That report's committed baseline (15 back-edges, 6 cycle pairs, 30-module SCC) is the starting point
here, and its numbers were independently re-verified live for this dispatch — they match exactly. That
report explicitly declined the `createApp` extraction (a ratchet-tier, ~0.7pp core-size item) as not
worth the collision risk; nothing below revisits that call. This document covers ground that report did
not: the `assistant`-centered cycles and the `db <-> features/deployments` pair.

## Current measured state (re-verified live, this dispatch)

```
843 files, 48 modules, production files only
propagation cost (all-import)                        10.51%
propagation cost (runtime-only)                       2.31%
back-edges into composition root                     15        (hard, ratcheted)
  └ back-edges, runtime-only (informational)           4
module cycles (mutual pairs, runtime-only)             6        (hard, ratcheted)
largest strongly-connected component (runtime-only)   30        (hard, ratcheted)
module API surface (files exposed)                   208        (ratchet)
core size                                       16.49% (139/843) (ratchet)
```

The 6 mutual cycle pairs:

```
assistant <-> features/deployments
assistant <-> features/plugins
assistant <-> features/post
assistant <-> features/source-control
assistant <-> server
db <-> features/deployments
```

**Five of six pairs touch `assistant`.** That is not six independent problems — traced below, it
resolves to two root causes inside `src/assistant/`, plus one small, separate `db`-adjacent issue.

## Candidate 1 (highest value): relocate `agent-daemon-server.ts` + `daemon-supervisor.ts` out of `src/assistant/`

**Edges cut:** `assistant <-> server` (full pair) and `assistant <-> features/plugins` (full pair, as
a side effect — see below). Also removes 4 of 15 all-import back-edges into the composition root and
**100% of the runtime-only back-edges (4 → 0)**.

**Why this is highest-value — Ca/Ce/instability reading:** `assistant` currently sits at
`I=0.58, Ca=37, Ce=52` — a genuine hub (Ce=52 is the second-highest efferent count in the repo after
`server` itself at Ce=507). Per the coupling-metrics reference, a component in this shape with high
`Ce` is not "pain," it's a hub problem, and "the move is to split by client, not by noun." That is
exactly the shape here: `agent-daemon-server.ts` and `daemon-supervisor.ts` are not assistant *domain*
logic — they are a second process-bootstrap entrypoint (the daemon runs in its own OS process,
spawned via `child_process.spawn`) that happens to be filed inside the `assistant` directory. Traced:

- `agent-daemon-server.ts` imports `createRouteDeps` (`server/app.ts`), `installUnhandledRejectionGuard`
  (`server/boot/process-error-guards.ts`), `createSqliteRouteDepsForWorkspace`/`defaultContentDbPath`
  (`server/deps.ts`), and `registerSupabaseMcpPreset` (`features/plugins/supabase-mcp/`) — i.e. it
  builds its own Express app the same way `src/index.ts` does. **It has zero importers anywhere in
  `src/` — it is only ever spawned as a subprocess**, confirmed by grep (no `import`/`from` reference
  to the file outside itself).
- `daemon-supervisor.ts` imports `clearAssistantDaemonFailure`/`recordAssistantDaemonFailure`
  (`server/readiness-state.ts`). `readiness-state.ts`'s own file-header comment already treats
  `daemon-supervisor.ts` as an outer-composition participant: *"`index.ts`'s `startAssistantDaemon()`
  (`src/assistant/daemon-supervisor.ts`) starts the daemon deliberately AFTER `app.listen()`"* — the
  file already documents itself as belonging at `index.ts`'s layer, just not filed there.
- `daemon-supervisor.ts` is imported by exactly one thing: `assistant/index.ts`'s barrel re-export
  (`export { startAssistantDaemon, restartAssistantDaemon, ensureAssistantDaemonStarted } from
  "./daemon-supervisor"`). Every real consumer (`src/index.ts`, `server/modules/assistant.ts`,
  `server/routes/admin/system/assistant-daemon.ts`) goes through that barrel, not the file directly.

**Mechanism (same "relocate, leave a port behind" pattern as `d9a61b44`/`2f73732b`):** move both files
to an outer-layer location — `src/server/agent-daemon/` fits best, since both files' actual job is
constructing a `RouteDeps`/Express app, the same responsibility `server/app.ts`/`server/deps.ts`
already own (alternative: a new top-level `src/daemon/`, mirroring `src/cli/`'s existing exemption in
`isOuterCompositionCaller()` — either works; `src/server/agent-daemon/` needs no change to that
function, a new top-level dir would need one line added there). Update `assistant/index.ts`'s
re-export source path to the new location — **zero changes required in any of the three real
consumers**, because the barrel path they import (`#src/assistant/index`) doesn't move. `registerSupabaseMcpPreset`
travels with `agent-daemon-server.ts`, which is why the `assistant <-> features/plugins` pair also
disappears as a side effect: that was the *only* `assistant → plugins` edge in the whole module (the
reverse edge, `supabase-mcp-plugin.ts` importing federation helpers from `assistant/index.ts`, is
one-directional and not itself a problem).

**Expected metric impact:** back-edges into composition root 15 → 11 (all-import, hard/ratcheted);
runtime-only back-edges 4 → 0; module cycles 6 pairs → 4 pairs (removes `assistant<->server` and
`assistant<->plugins`); `assistant`'s `Ce` drops meaningfully (loses at least 7 outgoing edges:
3×server files, 1×plugins, 2×tool-audit, 1×db/sqlite/content-db — `core`/`runtime-mode` stay since
those are still needed elsewhere in assistant). SCC impact: **cannot be claimed in advance** — see the
SCC caveat below.

**Effort/risk:** LOW. Two files, no logic changes, no port-interface design needed (the barrel
re-export already *is* the port), zero external caller edits. The main implementation risk is the
same one flagged in the prior report's "flapping-graph problem": this is a live, multi-agent tree, so
whoever executes this should re-run `check:architecture --list` immediately before and after, not
trust this document's numbers as of publish time.

## Candidate 2 (second-highest value): relocate `surface-exchanges.ts` out of `src/assistant/`

**Edges cut:** `assistant <-> features/deployments`, `assistant <-> features/post`,
`assistant <-> features/source-control` — **three pairs from one file move.**

**Why this is high-value:** `surface-exchanges.ts` (440 lines) imports only `node:crypto` and
`type { SurfaceEmission, SurfaceEmitter }` from `@jini-ai/core` — **zero imports from anywhere else in
`src/`.** It is a fully self-contained "ask the user a question mid-tool-run" mediator, not
`assistant`-domain logic with incidental reuse. Three separate feature modules
(`features/deployments/publish-agent-tools.ts`, `features/post/tool-registrations.ts` +
`delete-confirmation-ui.ts`, `features/source-control/tool-registrations.ts`) each import
`askOnce`/`askThenReport`/`AssistantSurfaceDeps`/`SurfaceExchange`/`SurfaceMessage` from it at
runtime (not type-only) — while `assistant/tool-registrations.ts` independently imports *those same
three features'* own `tool-registrations.ts` files (to register their tools into assistant's catalog).
That forward+back shape is the entire mechanism behind 3 of the 6 cycle pairs. This is the textbook
"hub with high `Ce`, split by client" move again, except here the file itself has `Ce=0` (it depends on
nothing local) — it's misplaced, not over-coupled. Its natural home is wherever the repo's other
zero-dependency, widely-depended-on primitives already live: `core` currently sits at
`I=0.00, Ca=106, Ce=0` — a stable, dependency-free module used everywhere, exactly the role
`surface-exchanges.ts` already plays informally. Recommend `src/core/` as the target.

**Mechanism:** move the file (e.g. `src/core/tool-surface-exchanges.ts`), update the three feature
consumers' import paths. **Pre-check before executing:** confirm nothing else inside `src/assistant/`
also imports `surface-exchanges.ts` internally (this dispatch did not exhaustively grep every
in-assistant caller, only the cross-module ones relevant to the cycle) — if something does, the
existing `assistant/index.ts` re-export precedent handles it the same way Candidate 1 does.

**Expected metric impact:** module cycles 6 pairs → 3 pairs (stacking with Candidate 1: 6 → 1,
leaving only `db <-> features/deployments`). Does not touch back-edges-into-server (this file never
touched `server`). Further reduces `assistant`'s `Ce`.

**Effort/risk:** LOW-MEDIUM. Larger fan-out than Candidate 1 (3 consumers to repoint instead of 0-1),
but each repoint is a single import-path change, no logic touched.

## Candidate 3 (lowest value, but the only remaining pair after 1+2): `db <-> features/deployments`

**Edges:** `db/sqlite/publish-history-repo.sqlite.ts` imports `resolvePublishHistoryListLimit`
(runtime function) plus `PublishHistoryEntry`/`PublishHistoryStore`/`PublishTrigger` (types) from
`features/deployments/static-publish/publish-history.ts`; `db/sqlite/publish-credential-repo.sqlite.ts`
imports types only (type-only, doesn't count for this cycle) from
`features/deployments/publish-credentials/types`. The reverse edge:
`features/deployments/repo.sqlite.ts` imports `db/schema` (runtime) and `type ContentDb` from
`db/sqlite/content-db` (type-only).

**Why lowest priority:** only 1 of 6 pairs, and unlike Candidates 1-2 it does **not** collapse cleanly
via the established "relocate the concrete adapter" pattern — `features/deployments/repo.sqlite.ts` is
itself a candidate for that exact treatment (it's a SQLite adapter filed inside a feature module,
same shape as the two adapters `2f73732b` already relocated), but relocating *that* file alone does
not break *this* cycle, because the cycle's other leg is two different `db/sqlite/` adapter files
reaching back into `features/deployments/static-publish/publish-history.ts` for a runtime helper
function. The actual fix needs `resolvePublishHistoryListLimit` (list-limit clamping, looks like pure
logic with no feature-specific state) relocated to wherever its one real caller
(`publish-history-repo.sqlite.ts`) already lives, or to a neutral ports location — this needs the
implementer to read `publish-history.ts` in full to place it correctly without creating a new edge
elsewhere, which this survey-level dispatch did not do.

**Effort/risk:** MEDIUM (needs real investigation, not just a move) for LOW payoff (1 pair). Do this
last, and only after Candidates 1-2 land and the SCC is re-measured — it may turn out not to matter for
the SCC number at all if the SCC's remaining size is dominated by other, longer (non-mutual-pair)
cycles once the assistant-centered ones are gone.

## SCC-size caveat — do not claim a specific number in advance

The 30-module SCC is **not** fully explained by the 6 listed mutual pairs. `stronglyConnectedComponents`
groups by *any* cycle, including ones of length 3+ that never show up in the mutual-pairs list (e.g.
`A → B → C → A` with no direct `A↔B`, `B↔C`, or `A↔C` edge). `assistant` participating in 5 of 6 direct
pairs strongly suggests it is also a hub for some of the longer paths stitching the other ~25
SCC members together, but that is a hypothesis, not a measured fact — the tool doesn't report
individual longer cycles, only the aggregate SCC size. **Re-run `check:architecture --list` after each
candidate lands and read the actual SCC membership list; do not assume it collapses to a small number
just because the direct pairs are gone.** This matches the discipline `arch-scc-cuts`'s own report
applied throughout (re-measuring rather than trusting handoff-doc numbers, and explicitly disclosing
the multi-agent "flapping graph" risk on this same tree).

## Process observation, not a code cut: `back-edges into composition root` mixes two different signals

Of the current 15 all-import back-edges, **11 are `import type` only** (8 × `RouteDeps` from
`server/routes/types.ts`, 3 × `PageHeadContext`/`HeadElement` from `server/http/site/page-head.ts`,
all confirmed by direct inspection of every importing line) — pure signature/change-coupling, erased by
`tsc`, no runtime risk. Only the remaining 4 (all from Candidate 1's two files) are real runtime edges.
`propagation cost` and `module cycles` were already split into all-import vs. runtime-only versions for
exactly this reason (2026-08-17, same-day, `arch-scc-cuts`'s Task B) — but `back-edges into
composition root` is still gated as a single hard/ratcheted number on the all-import graph, with the
runtime-only count computed and printed but never compared. The script's own top-of-file comment
already flags this as an inference needing confirmation ("`back-edges into composition root` is
classified HARD below by inference, not by explicit instruction"). **Recommendation, not urgent:**
apply the same split already used for the other two metrics — gate hard/ratcheted on the runtime-only
count, report all-import as informational — so that a future `RouteDeps`-consumer added to a 9th
`tool-registrations.ts` file doesn't fail the build over a type-only signature import. This is
explicitly a metric-definition question, not a source change, and is orthogonal to Candidates 1-3
above (Candidate 1 reduces the runtime-only count to 0 regardless of whether this split ever happens).
Not raising the `RouteDeps` god-type itself as a target — per the dispatch's own settled framing, that
coupling is change-time only and deliberately deprioritized here.

## Ranked plan

| Order | Candidate | Cycle pairs cut | Runtime back-edges cut | Effort | Risk |
|---|---|---|---|---|---|
| 1 | Relocate `agent-daemon-server.ts` + `daemon-supervisor.ts` | 2 (`assistant<->server`, `assistant<->plugins`) | 4 → 0 | Low | Low |
| 2 | Relocate `surface-exchanges.ts` | 3 (`assistant<->{deployments,post,source-control}`) | 0 | Low-Medium | Low |
| 3 | Fix `db <-> features/deployments` (relocate `resolvePublishHistoryListLimit` + types) | 1 | 0 | Medium | Low |
| — | Split `back-edges into composition root` into all-import/runtime-only tiers | 0 (metric-definition only) | n/a | Low | Low |

Doing 1 and 2 together is expected to leave exactly one cycle pair (`db <-> features/deployments`) and
zero runtime-only back-edges into the composition root. Do 3 only after re-measuring post-(1+2), since
its payoff may shrink or its context may change once the dominant hub is gone.

## Risks and mitigations

- **Concurrent-agent drift on this same tree** (documented precedent: `arch-scc-cuts`'s
  "flapping-graph problem," a transient cycle from another agent's uncommitted WIP). Mitigation: whoever
  executes any candidate re-runs `check:architecture --list` immediately before touching files, and
  again before committing, not trusting this document's numbers as time passes.
- **`assistant/index.ts` barrel re-export must be updated in the same commit as the file move**
  (Candidate 1) or every external consumer breaks at once — this is the one place a caller does need a
  path change, and it's a single line.
- **Unverified in-assistant callers of `surface-exchanges.ts`** (Candidate 2) — flagged explicitly above
  as a pre-check, not yet ruled out by this dispatch.
