# Database domain — 16-module cycle investigation

**Status: investigation only. Working tree confirmed clean at the end (see §5).**
**Agent:** CodeBase Analyzer (database-cycle-investigation)
**Date:** 2026-08-17

## Summary

The cycle that blocked `database`'s conversion earlier today has **shrunk from 16 modules to 10**
purely because six sibling domains (`entries`, `pages`, `plugin-runtime`, `recovery`, `workspace`,
`seo`) converted to the registry later in the same session and are no longer statically wired.
Root-causing the remaining 10-module SCC found **one single value import** closes it —
`db/sqlite/database-introspection-adapter.sqlite.ts`'s import of `getDriftStatus` from
`features/database/drift.ts`. I verified this empirically, not just by inspection: stubbing out
that one import locally collapsed the SCC from 10 modules to **0**. `getDriftStatus` is a pure,
side-effect-free function with only two call sites in the whole repo. This is a narrow, mechanical
fix — **not** a "needs a dedicated Software Architect pass" problem, unlike the framing implied by
the original 16-module finding.

This is a **different, non-overlapping** root cause from the vendor-credentials cycle
(`ADS-memory/reports/architecture/2026-08-17-vendor-credentials-cycle-design-options.md`) — see §4.

## 1. Reproducing the finding

Baseline (`npm run check:architecture`, before any change): 0 module cycles, largest SCC 0 — clean.

I mirrored `recovery`'s conversion pattern (the closest already-converted sibling, since it also
touches `features/database`) onto `database`, locally and uncommitted:

- `src/features/database/tool-registrations.ts` — added `contributeDatabaseTools()`, calling
  `registerToolContributor({ domain: "database", build: buildDatabaseRegistrations, risk:
  databaseDerivedRisk })` (imported from `../../assistant/tool-contribution-registry`).
- `src/server/tool-catalog-manifest.ts` — imported and called `contributeDatabaseTools()` in
  `installFirstPartyToolContributors()`.
- `src/assistant/tool-registrations.ts` — removed the `database` `DOMAIN_SLICES` entry and its
  value import of `buildDatabaseRegistrations`/`databaseDerivedRisk` (kept `type DatabaseToolDeps`
  as `import type`, matching how `RecoveryToolDeps` stayed type-only after recovery converted).

Running `npm run check:architecture -- --list` with just these three edits:

```
module cycles (mutual pairs, runtime-only)           0
largest strongly-connected component (runtime-only)  10

strongly-connected components (mutually inseparable modules):
  [10] assistant, db, export, features/database, features/deployments, features/post,
       features/presentation, features/settings, features/source-control,
       features/vendor-credentials
```

## 2. The cycle shrank 16 → 10 since the original revert

Original 16-module SCC (from `features/database/tool-registrations.ts`'s trailing comment, recorded
when `database` was first tried and reverted, earlier in Stage 2 batch 2):

```
assistant, db, export, features/database, features/deployments, features/entries,
features/pages, features/plugin-runtime, features/post, features/presentation,
features/recovery, features/settings, features/source-control, features/vendor-credentials,
features/workspace, seo
```

Six of those (`features/entries`, `features/pages`, `features/plugin-runtime`,
`features/recovery`, `features/workspace`, `seo`) have since converted to the tool-contribution
registry and are no longer statically wired in `assistant/tool-registrations.ts`'s
`DOMAIN_SLICES`. Removing them from the static graph removed them from the SCC too — 16 − 6 = 10,
exactly matching the re-run above. Current still-static `DOMAIN_SLICES` entries (confirmed via
`grep -n 'domain: "' src/assistant/tool-registrations.ts`): `media, database, deployments,
static-publish, source-control, settings, post, themes` (+2 demo domains, irrelevant).

## 3. Root cause: one back-edge, not a diffuse tangle

**Question posed in the task: is this one shared `db` module several domains import statically, or
is it more diffuse?** Answer: **both, but the fix is narrow anyway.** The paths *into* the cycle are
diffuse — `features/settings` and `features/post` (both still `DOMAIN_SLICES` entries) each
independently value-import `db` for their own repo persistence
(`src/features/settings/repo.sqlite.ts`, `src/features/post/repo.sqlite.ts` import
`../../db/schema`, `../../db/sqlite/content-db`, `../../db/sqlite/repo-helpers`), and `export`
reaches into `features/post`/`features/presentation` via `#src/*` subpath value imports
(`src/export/route-manifest.ts` — the same `#src/*`-subpath pattern the `themes` revert's own
comment already named as invisible to a plain relative-path grep). But the path *out of* the cycle
— the one edge that closes any of those back into `features/database` (and, via the new registry
edge, back into `assistant`) — is a **single file**:

```
src/db/sqlite/database-introspection-adapter.sqlite.ts:4
  import { getDriftStatus } from "../../features/database/drift";
```

This is the **only** value import anywhere in `db/`, `export/`, `features/post/`,
`features/presentation/`, `features/settings/`, `features/deployments/`,
`features/source-control/`, or `features/vendor-credentials/` that reaches into
`features/database` (confirmed by grep across all of them; the file itself even documents this in
its own header — see below). Everything else `db/` imports from `features/database` in that same
file (`DatabaseHealthSummary`, `DatabaseIntrospectionPort`, `PendingMigration`,
`SchemaStateSummary`, `SchemaSnapshot`) is `import type` — erased from the runtime-only graph
`check:architecture` gates on.

**This edge is a known leftover, not something I'm discovering fresh.** The same file's own header
comment (lines 38–45) records that its *concrete adapter class* was **already relocated** out of
`features/database/adapter.sqlite.ts` into `db/` earlier the same day, specifically to cut a
`features/database → db` edge — and explicitly says `getDriftStatus` "stays untouched." That
earlier cut fixed the *other* direction; this one direction was deliberately left alone because, at
the time, `database` wasn't registered into the registry yet, so `db → features/database` being
one-directional wasn't a problem. It only becomes one once `features/database` gets its own
`registerToolContributor` edge into `assistant`.

**Empirical confirmation.** I temporarily replaced the import with an inlined copy of the function
body (`getDriftStatus` is a pure comparison of two `SchemaSnapshot` values — no I/O, 8 lines, see
`src/features/database/drift.ts:38-48`) and re-ran `check:architecture`:

```
module cycles (mutual pairs, runtime-only)           0
largest strongly-connected component (runtime-only)  0
```

The entire 10-module SCC collapsed to zero from removing this one edge — with the `database`
registry conversion, the `settings`/`post`/`deployments`/`source-control`/`vendor-credentials`
`DOMAIN_SLICES` entries, and everything else, **all still in place, untouched**. This proves the fix
is sufficient on its own; it doesn't depend on any of those other domains converting first or any
other edge being cut.

**Blast radius of relocating `getDriftStatus`:** exactly 2 files reference
`features/database/drift` anywhere in the repo (excluding tests) —
`src/features/database/adapter.sqlite.ts` (type-only: `DriftStatus`, `SchemaSnapshot`) and
`src/db/sqlite/database-introspection-adapter.sqlite.ts` (the one value import).

## 4. Relationship to the vendor-credentials cycle — different, non-overlapping root cause

The vendor-credentials report (`2026-08-17-vendor-credentials-cycle-design-options.md`) traces a
**separate** chain: `assistant → features/vendor-credentials → features/source-control (via
dual-read.ts) → features/deployments (via static-publish/index.ts)`. That chain does not touch
`db` or `features/database` at all. Its recommended fix (Option B: inject the two legacy-read
functions into `dual-read.ts` as deps instead of importing them directly) would unblock
`source-control`/`deployments`/`static-publish`, which would also remove `assistant`'s static
import of `features/deployments`/`features/source-control` — but **that alone would not unblock
`database`**, because `assistant → settings → db → features/database → assistant` (or the same
shape through `post`) closes independently of anything in the vendor-credentials chain, as long as
`settings` or `post` remains a static `DOMAIN_SLICES` entry. My empirical test confirms this
directly: I collapsed the SCC to 0 **without** touching `deployments`/`source-control`/
`vendor-credentials`/`settings`/`post` at all — the `getDriftStatus` edge was the only thing that
needed to move.

Conversely, fixing `getDriftStatus` does not fix the vendor-credentials cycle — that chain would
still close a cycle if `source-control`/`deployments` tried to convert today, independent of
`database`.

**These are two separate, complementary fixes**, both needed for full Stage 2 rollout, neither a
prerequisite for the other:
- Vendor-credentials chain → blocks `source-control`, `deployments`, `static-publish` (and
  `themes`, transitively).
- `getDriftStatus` edge → blocks `database` only.

## 5. Also checked: does `database` have a settings-style side-door problem?

The settings investigation (`2026-08-17-settings-blocker-investigation.md`) found `settings` has 3
files *inside* `assistant/` itself that import `features/settings` directly (a pre-existing reverse
edge unrelated to the registry), which makes the *standard* registry-conversion pattern actively
create a new 2-node cycle for `settings` specifically. I checked whether `database` has the same
problem: `grep -rn "features/database" src/assistant` finds exactly one real import (the
`DOMAIN_SLICES` entry itself, already accounted for above) — every other hit is a comment/doc
reference. **`database` has no side-door problem.** The standard `contributeDatabaseTools()`
pattern (the same shape `comments`/`recovery`/etc. use) is safe for `database` once the
`getDriftStatus` edge is cut — no server-side-wiring exception needed, unlike `settings`.

## 6. Recommendation

**Fix, in order:**
1. Relocate `getDriftStatus` (and, for cohesion, probably the whole tiny `drift.ts` file — it's 48
   lines, pure logic, and its only two consumers are both already `db`-side or type-only) from
   `src/features/database/drift.ts` into `src/db/` (e.g. colocated with
   `database-introspection-adapter.sqlite.ts`, or a new `db/drift.ts`). If anything else outside
   these 2 files ever needs `DriftStatus`/`SchemaSnapshot`/`getDriftStatus` as domain vocabulary,
   re-export the types from `features/database/adapter.sqlite.ts` (already the port-owning file) —
   but nothing found in this investigation needs that today.
2. Convert `database` to the registry using the exact pattern I prototyped in §1 (which I've already
   confirmed compiles-and-passes the architecture check once step 1 lands): add
   `contributeDatabaseTools()` to `features/database/tool-registrations.ts`, wire it into
   `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, remove the
   `DOMAIN_SLICES` entry and its value import in `assistant/tool-registrations.ts`.

This does **not** need a dedicated Software Architect design pass — it's a same-shape fix to the
one the codebase already applied to the concrete-adapter-class half of this exact file earlier the
same day (see §3), just the other direction of the same seam.

**Not in scope of this fix:** `media` (separate `widgets`-cycle, may now convert cleanly per the
`tool-catalog-manifest.ts` header — worth a fresh check, task tracker shows this in progress by
another agent), `settings`/`post`/`deployments`/`static-publish`/`source-control`/`themes` (blocked
by the vendor-credentials chain and/or their own issues, not this one).

## 7. Working tree confirmation

All edits made during this investigation (`src/assistant/tool-registrations.ts`,
`src/features/database/tool-registrations.ts`, `src/server/tool-catalog-manifest.ts`,
`src/db/sqlite/database-introspection-adapter.sqlite.ts`) were reverted with
`git checkout -- <files>` before finishing. `git status --short` after the revert shows only the
same pre-existing, not-mine dirty files that were present before this investigation started
(`apps/admin/src/components/AssistantDock/AssistantDock.tsx`,
`src/themes/static/basic/pages/index.html`, and various untracked files from concurrent sessions) —
nothing from this investigation remains uncommitted.
