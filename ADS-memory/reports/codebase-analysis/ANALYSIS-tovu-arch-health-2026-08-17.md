# ANALYSIS — Tovu architecture health, 2026-08-17

**Dispatch mode:** Agent Direct Mode (CodeBase Analyzer persona), ad-hoc standalone health check —
not tied to a pending feature/spec. Analysis only, no migration plan, no production code changed.

**Note:** this agent's tool policy blocked writing its own report file mid-run ("subagents should
return findings as text, not write report files"), so its findings were returned as a text message
to the dispatching session and persisted to this file by that session afterward, verbatim.

Commit analyzed: `eeb79feb14bf4c85bc3fdce3cb0df554d3f1a90c` (general-work). Reconfirmed live this
session that `check:architecture` is at baseline: 15 back-edges, 30-module SCC, 208 exposed files,
541 deep-import edges — matches the numbers supplied at dispatch time exactly.

Checked `ADS-memory/reports/` first (5 architecture reports + 3 admin DI/port audit reports, read in
full) to avoid duplicating known findings. Everything below is either genuinely new or an explicit
"still open, reconfirmed live" status check on a previously-scoped-but-undone item.

## PORTS

**PORT-1 (High confidence, informational).** The port/adapter file-split pattern (port interface in
the feature module, concrete class in `db/sqlite/`) is now universal, not exceptional. The
2026-08-17 SCC-cuts dispatch split 2 files that combined a port+adapter; exhaustive check of all 36
*other* `*.sqlite.ts` files (grep for co-occurring `export interface *Port` + `export class` in the
same file) found **zero** still combine them. Stronger repo-wide confirmation than the original
2-file fix implied.

**PORT-2 (High confidence, informational).** `src/assistant/index.ts` and sibling barrels
(`media/index.ts`, `features/content-types/index.ts`) are genuinely curated, not boilerplate. Every
re-export in `assistant/index.ts` has a documented external consumer; the header cites a live
propagation-cost measurement (7.6%→12.43%→8.20%) for a specific 3-symbol widening decision.
`media`/`content-types` barrels explicitly withhold their SQLite adapter export "so nothing outside
the composition root can accidentally depend on this host's persistence choice." No `export *`
sprawl found anywhere sampled.

**PORT-3 (Medium severity, High confidence, NEW — not in any prior report).** Found a live
counter-example to PORT-1: `db <-> features/deployments` is a currently-active module cycle
(confirmed in live `check:architecture --list` output) caused by
`db/sqlite/publish-history-repo.sqlite.ts:5-10` importing `resolvePublishHistoryListLimit` as a
**value** (not `import type`) from `features/deployments/static-publish/publish-history` — the
adapter reaching UP into the feature module for business logic, backwards from the intended
direction. This is the exact same anti-pattern as the already-fixed `db <-> features/database` cycle
(SCC-cuts report), just a different pair that dispatch wasn't scoped to touch. Proposed fix by direct
analogy (not executed): relocate `resolvePublishHistoryListLimit` to `db/sqlite/` or a shared
location `db` owns.

**PORT-4 (Medium confidence, informational).** Spot-checked 2 `core/` ports (`DbOpsPort`,
`MirrorStorePort` in `core/gated-mutations/ports.ts`) — both narrow (3-4 methods), dialect-neutral,
seam-justified per ADR-006. Consistent with the admin-side finding that port-authoring discipline is
generally good.

## EXTRACTABILITY

**EXT-1 (Low-Medium severity, Medium confidence).** Exactly 3 files under `src/features/` read
`process.env` directly instead of through their composition root:
`features/source-control/commit-site.ts:184-185`, `features/deployments/export-run.ts:134`,
`features/deployments/static-publish/adapter.ts:133` — all directory-path overrides with hardcoded
fallbacks. Small real blocker: each would carry an implicit undeclared env-var contract if extracted
standalone. (Exhaustive 19-file repo-wide grep; the other 16 sites are all in
`server/`/`cli/`/`index.ts`/`db/` composition-root files, which is appropriate.)

**EXT-2 (High confidence, informational).** Extraction precedent already exists and is proven, not
hypothetical — `media` and `content-types` are already extracted into `@jini-ai/cms/*` packages with
documented host-vs-package boundaries. Useful as a real cost template for estimating any future
extraction, not just theory.

**EXT-3 (Medium confidence, informational).** 5 module-level mutable singletons found repo-wide
(exhaustive grep). Two are exemplary test-isolation patterns worth naming as precedent:
`routing/routing.ts` has a dedicated non-public `resetRoutingRegistrationsForTests()`;
`assistant/daemon-supervisor.ts` wraps a constructor-injected, fully unit-testable class with only a
thin `process.on`-touching singleton shell. The other two live inside T-1 below and aren't a
separate problem.

## TESTABILITY

**T-1 (High severity, High confidence — the single highest-leverage finding in this report).**
`assistant/agent-daemon-server.ts`: 781 lines, **zero test files** (confirmed via `find`, not
assumed), still doing composition-root wiring inside a feature module — imports `db`,
`features/plugins`, and `server` directly at lines 82-88. This was named as Architect item 8 in the
2026-08-13 audit and explicitly marked not-yet-done there. Reconfirmed it's STILL open today, live:
internal consumers dropped 24→18 since 2026-08-13 (partial improvement, not resolution), and this
one file is now the root cause of **5 of the current 6** live module-cycle pairs
(`assistant <-> {features/deployments, features/plugins, features/post, features/source-control,
server}`) — cross-referenced against the current `check:architecture --list` output. Highest-risk-
by-the-book module in the repo: largest untested file, most internal dependents, sits at the root of
most of the currently-open cycle inventory.

**T-2 (High confidence, informational — contrast/precedent case).** `assistant/daemon-supervisor.ts`
shows exactly what T-1's fix should look like, already living one file over: `createDaemonSupervisor()`
is a pure factory with injected `spawnDaemonProcess`, fully unit-testable; only a 20-line
module-singleton wrapper touches real `process.on`. This is proven in-repo precedent, not a new
pattern to invent.

## SURVIVING-CYCLES MACHINERY

**CYC-1 (High confidence, reconfirmed-live, not new).** `server/app.ts:687` and
`server/deps.ts:891`'s lazy `require("../export/index")` calls do NOT remove their static graph edge
— dependency-cruiser resolves `require()` identically to `import` regardless of position in the file
(already proven empirically in the 2026-08-17 SCC-cuts report). Both sites still present, verified by
direct read this session. Real purpose: avoids a genuine Node CJS circular-require boot crash (both
files have eager top-level side effects) — legitimate fix for a different problem than the one a
casual reader would assume it solves.

**CYC-2 (High confidence, informational).** Exhaustive repo-wide grep found exactly 3 total
`require()`/dynamic-`import()` sites: the 2 CYC-1 sites, plus
`server/middleware/admin-static.ts:27`'s `require("node:sea")` — a legitimate try/catch-wrapped
feature-detection probe for Node's optional Single-Executable-Application API, not a cycle
workaround. No dynamic `import()` exists anywhere in `src/`. This is the complete inventory — not the
visible tip of a larger defensive-require pattern.

## Recommended next step

Two items are concrete enough to hand straight to implementation (proven fix-shape precedent exists
in-repo for both):
1. **T-1** — apply the `daemon-supervisor.ts` split pattern to `agent-daemon-server.ts` (Architect
   item 8, already scoped in the 2026-08-13 report). Would clear 5/6 current cycle pairs and make the
   repo's largest untested composition-adjacent file unit-testable.
2. **PORT-3** — apply the identical `db<->features/database` fix already executed once to
   `db<->features/deployments`.

Both should route to the parallel Architect/Refactor pipeline, not be treated as ready-to-execute
from this message alone — this dispatch was diagnosis-only, matching the "analysis only" scope given
at dispatch.

## What was NOT analyzed

`apps/admin/src/**` (already exhaustively covered by 3 recent reports, not re-sampled), no full
Phase-4 testability sweep across all ~50 feature modules (T-1 was surfaced by tracing the live cycle
list, not an exhaustive search — other untested/hard-to-test modules likely exist), `packages/`
source not independently read (EXT-2's claims come from the consuming barrels' doc comments), no
security/code-quality/dead-code pass (out of scope for this dispatch).
