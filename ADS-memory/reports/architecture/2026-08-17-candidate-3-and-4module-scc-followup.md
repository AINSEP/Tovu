# Candidate 3 execution + new 4-module SCC diagnosis — 2026-08-17 (follow-up round)

**Dispatch mode:** Refactor agent, Direct Mode, IMPLEMENT (Coordinator-authorized). This is a
follow-up to `2026-08-17-back-edges-decoupling-plan.md` (the "original plan"), executed after
Candidates 1 and 2 from that plan had already landed (relocating `agent-daemon-server.ts` +
`daemon-supervisor.ts` out of `assistant/`, and `surface-exchanges.ts` into `core/`). This document
covers ground the original plan explicitly deferred: Candidate 3's real investigation, and the
4-module SCC the original plan's own "SCC-size caveat" section predicted might exist but could not
diagnose in advance (it only reports aggregate SCC size, not individual longer cycles).

## Part 1 — Candidate 3, executed: `db <-> features/deployments`

**Root cause (confirmed by reading `features/deployments/static-publish/publish-history.ts` in
full):** `resolvePublishHistoryListLimit` (a pure, dependency-free clamp function) and its two
constants (`DEFAULT_PUBLISH_HISTORY_LIST_LIMIT`, `MAX_PUBLISH_HISTORY_LIST_LIMIT`) lived in
`features/deployments/static-publish/publish-history.ts` — the port-and-in-memory-adapter file for
`PublishHistoryStore`. `db/sqlite/publish-history-repo.sqlite.ts` (the port's SQLite adapter)
imported the function as a runtime value from there — an adapter reaching UP into a feature module
for business logic, backwards, and the sole cause of the `db <-> features/deployments` module cycle.

**Where it actually belongs:** the function is used by BOTH implementations of `PublishHistoryStore`
— `InMemoryPublishHistoryStore` (in `publish-history.ts` itself) and `SqlitePublishHistoryStore`
(`db/sqlite/publish-history-repo.sqlite.ts`). The original plan's suggested target, `db/sqlite/`
specifically, would have been backwards for the in-memory side (a pure in-memory test double has no
reason to depend on a specific SQLite adapter's own directory). The actual fix: a new file,
`src/db/sqlite/publish-history-list-limit.ts` — still module `db` (same cycle-breaking effect, since
`moduleOf()` treats all of `src/db/**` as one module regardless of subdirectory), but a genuinely
neutral "shared bound both implementations depend on" file, matching the precedent
`db/sqlite/repo-helpers.ts` sets for shared-across-adapters logic (though that one is
Drizzle/SQLite-specific and this one deliberately isn't — no `better-sqlite3`/`drizzle-orm` import).

**Mechanism:** moved the function + both constants verbatim (no logic changes). Repointed
`publish-history.ts` and `publish-history-repo.sqlite.ts` to the new file. Dropped the 3 symbols from
`static-publish/index.ts`'s own barrel — grepped first and confirmed zero real external consumers
used them via that barrel (only a direct-file test import and the sqlite adapter's now-fixed direct
import existed). The type-only import in the sibling file
(`publish-credential-repo.sqlite.ts` → `publish-credentials/types`) was confirmed untouched, as the
original plan predicted — it doesn't count toward the runtime-only cycle graph.

**Measured result:** `db <-> features/deployments` cycle: gone (1 pair → 0). Largest SCC: 5 → 4
modules. Small, directly-caused cost: propagation cost (all-import) +0.02pts, module API surface
+1 file (the new file itself becomes `db`'s one new deep-import target from
`features/deployments/static-publish/publish-history.ts`) — both accepted as the honest price of the
fix, same shape as the `server/agent-daemon/index.ts` "+1 file" cost accepted in the Candidate 1/2
round. `--update` run afterward with Coordinator approval; `check:architecture` now reports
"OK: at baseline."

## Part 2 — New finding: `[4] assistant, comments, features/plugins, newsletter` SCC

**Not predictable from the original plan.** That plan's own "SCC-size caveat" section already flagged
that the 30-module SCC "is not fully explained by the 6 listed mutual pairs" and that longer,
indirect cycles (length 3+) could be hiding inside it — but explicitly could not name them
("the tool doesn't report individual longer cycles, only the aggregate SCC size"). This is that
missing diagnosis, for the piece that survived Candidates 1-3: once the other entanglement was cut
away, this 4-module cluster was left standing on its own as the sole remaining SCC.

**None of these 4 modules form a direct mutual pair** (`check:architecture --list`'s "module cycles"
section is empty since Candidate 3 landed) — this is a longer indirect cycle, confirmed by tracing
every edge between the 4 modules by hand (exhaustive grep both directions for all 6 possible pairs;
confirmed exactly one file per direction, no smaller/alternate edge exists):

1. **`assistant/tool-registrations.ts` → `comments/tool-registrations.ts`** (value:
   `buildCommentsRegistrations`, `commentsDerivedRisk`) **and → `newsletter/tool-registrations.ts`**
   (value: `buildNewsletterRegistrations`, `newsletterDerivedRisk`). This is
   `assistant/tool-registrations.ts`'s actual job — it is the hub that aggregates every feature's own
   tool-registrations.ts into one catalog for the AI assistant (post/deployments/source-control/
   redirects/etc. all go through the identical pattern already). Nothing to relocate here; this
   *is* the file's purpose.

2. **`comments/data-module-install.ts` + `newsletter/data-module-manifest.ts` →
   `features/plugins/data-module.ts`** (value: `declareDataModule`). `data-module.ts` is 973 lines of
   real migration/snapshot/identifier-validation machinery (imports `better-sqlite3`,
   `migration-journal.ts`, `plugin-identity.ts`, `snapshot.ts`) — not a misplaced leaf like
   `surface-exchanges.ts` was. `declareDataModule` is the single entry point and performs real DDL
   I/O; there is no thin sub-piece to split out without touching the actual migration logic (a
   behavior-risk change, out of Refactor's scope). It is also consumed by `db/migration/manifest.ts`
   and `features/plugin-runtime/agent-tools.ts`, confirming it is genuinely shared cross-cutting
   infrastructure, correctly housed under `features/plugins`.

3. **`features/plugins/supabase-mcp/supabase-mcp-plugin.ts` → `assistant/index.ts`** (value:
   `FEDERATED_CONNECTION_DEFAULTS`, `isFederationEnabled`, `parseAllowedToolNames`,
   `positiveIntOrDefault`, `registerFederatedMcpPreset`). Already explicitly decided in the original
   plan document (Candidate 1 section, this same architecture-decoupling effort, same day): *"the
   reverse edge, `supabase-mcp-plugin.ts` importing federation helpers from `assistant/index.ts`, is
   one-directional and not itself a problem."* A prior dispatch deliberately chose to leave this edge
   in place. Reversing that call was explicitly out of scope for this round.

These three edges close the loop as two 3-cycles sharing one return edge:
`assistant → comments → features/plugins → assistant` and
`assistant → newsletter → features/plugins → assistant` — which is why all 4 modules land in one SCC
rather than two separate 3-node ones.

**Why this is not a mechanical "relocate the misplaced file" fix, unlike Candidates 1-3:** each of
the three edges above is independently a deliberate, correct design choice on its own terms. The
cycle exists only because all three intersect. Breaking it requires giving up one of the three, not
moving a leaf file.

**Options, not yet decided — for whoever picks this up next:**

- **(a) Dependency inversion for tool-registration aggregation.** Have `comments`/`newsletter`
  (and, for consistency, every other feature `assistant/tool-registrations.ts` already imports —
  post/deployments/source-control/redirects/etc.) self-register their tool sets into a shared
  registry that `assistant` reads from, instead of `assistant` importing each feature module by
  name. This is the standard fix for hub-and-spoke cycles, but it is a real architectural pattern
  change touching far more files than just these two, with real testing implications for
  registration-order/completeness semantics. Architect-scope, not a Refactor move.
- **(b) Relocate what `supabase-mcp-plugin.ts` needs out of `assistant/index.ts`'s surface** (the 5
  federation-config helpers) to a neutral module both `assistant` and `features/plugins` can depend
  on one-directionally — the same `core/`-relocation pattern used for `tool-surface-exchanges.ts`
  earlier tonight. This reopens the Candidate-1 decision that explicitly closed this edge as "not a
  problem" — needs sign-off from whoever made that call, not a unilateral reversal.
- **(c) Accept this 4-module SCC as a legitimate architectural reality**, the same way the
  one-directional `features/deployments → db` edge (via `repo.sqlite.ts` → `db/schema`) is already
  accepted as fine — three independently-good decisions producing one small, stable, well-understood
  cluster is a defensible outcome, not automatically a defect.

**Coordinator decision (2026-08-17, same night):** leave undone for now — do not pursue the
redesign, do not reopen the Candidate-1 decision. This document exists so the diagnosis isn't lost;
next steps are (a), (b), or (c) above, whenever this is picked back up.

## Final state, this round

```
check:architecture — 866 files, 48 modules, production files only
  propagation cost (all-import)                        10.02%
  propagation cost (runtime-only)                      2.19%
  back-edges into composition root                     11
    └ back-edges, runtime-only (informational)         0
  module cycles (mutual pairs, runtime-only)           0
  largest strongly-connected component (runtime-only)  4
  module API surface (files exposed)                   213
    └ deep-import edges (informational)                550
  core size                                            16.05% (139/866)
check:architecture — OK: at baseline.
```

(File count jumped 846 → 866 between the pre-`--update` measurement and this one — other agents were
active on this same tree throughout the night, per every prior report's own "flapping graph" caveat;
the `--update` run captured whatever was live at that moment, same discipline as every prior round.)

---

## Addendum: Codex peer (gpt-5.6-tier, high reasoning) recommendation on the long-term pattern

**Dispatched** as a targeted forward-looking design question (not a general audit), in response to the
owner asking what the most scalable/responsible/flexible long-term architecture would be for how
`assistant` discovers feature tool-registrations, given the still-open 4-module SCC diagnosed above.
Caveat disclosed by the peer itself: it could not run `check:architecture` live in its sandbox
(`tsx` denied its IPC pipe, `EPERM`), so its reasoning is source-read-based, not freshly
metric-verified — treat as a design recommendation to validate on implementation, not a re-measured
fact.

**Recommendation: an explicit boot-installed tool-contribution registry, modeled on the existing
`src/assistant/mcp-federation/presets.ts` federated-preset registry pattern already in this repo** —
not the current assistant-owned import list, and explicitly NOT "register on import" side-effect
magic (called out as its own anti-pattern: still needs a hidden importer, obscures boot order, leaks
registration state across tests/process compositions).

Shape:
```
server composition manifest -> feature contribution installers -> assistant registry -> final tool catalog
```
- Each feature owns a `contributeXTools(registry)` installer next to its own tool-builder/risk-map
  code (instead of `assistant/tool-registrations.ts` importing each feature by name).
- A small server composition manifest decides which first-party features are installed; both the
  daemon and BYOK paths call it before building a fresh catalog.
- `assistant` keeps ownership of registry semantics and whole-catalog invariants: deterministic
  order, duplicate-tool-ID rejection, cross-domain risk validation, final build — the actual
  quality-control logic doesn't move, only the "reach into every feature by name" import shape does.

**Explicitly does NOT recommend moving the Supabase federation helpers** (Task B's option (b) from
the prior diagnosis) — calls the `features/plugins -> assistant` edge a "deliberate extension point"
that should stay; once the registry lands, it no longer closes a cycle anyway, since `assistant` no
longer imports `comments`/`newsletter` directly. Reframes the earlier a/b/c framing: this is a 4th
option the original diagnosis didn't have — fix the pattern, not any single edge.

**Second constraint:** don't conflate plugin/data-module membership with AI-tool membership — a
feature can have one without the other. Third-party plugin tool contributions should enter through
the same policy-checked registry seam, not get auto-discovered from disk.

**Recommended test coverage for the eventual implementation:** exact installed contributors,
duplicate-ID rejection, omitted-contributor failure, deterministic order, daemon/BYOK catalog parity.

**On leaving the SCC as-is long-term:** explicitly against it — the current pattern (assistant
directly importing ~25 features by name) will keep growing and will keep dragging legitimate
plugin-system edges into unrelated tool-catalog cycles as new features are added. Frames the registry
as "a targeted pattern extension" of an existing repo convention, not a foreign framework
introduction — lower-risk than it might sound.

**Independently reconfirmed** (third time tonight, across two different investigators) that Comments'
`data-module` usage is real, load-bearing infrastructure, not incomplete scaffolding — cites the
actual boot-order fix for a SQLite lock race and the real `p_comments__comments`/moderation-log table
reads in `comments/repo.sqlite.ts`.

**Status: recommendation only, not implemented.** This is real, valuably-scoped future work — a
repo-wide pattern change touching ~25 features' registration code, not a same-night fix. Owner has
not yet decided whether/when to schedule it.
