# API-Surface Trace B — `widgets`, `features/taxonomy`, `features/entries`, `features/recovery`

**Role:** Software Architect (trace) → Refactor (propose-only). Both persona files loaded
(`AI-Dev-Shop/agents/software-architect/skills.md`, `AI-Dev-Shop/agents/refactor/skills.md`).
**Mandate: PROPOSE ONLY.** No production code was changed to produce this report. The only file
written is this one.

**Tooling used:** `npm run check:architecture -- --list` (run live) for the module-level counts;
a direct `depcruise src --output-type json` dump (same command the script itself shells out to,
same flags) piped into a small local script that re-implements the script's exact `moduleOf()` /
`deepImports()` logic to recover *which specific file* each edge lands on and *who the importer
is* — the ratcheted tool only prints per-module aggregates, not per-file detail, so this was
necessary to get past "16 files, 45 edges" into an actionable list. Every file cited below was then
read directly (`Read`/`grep`) to check its header comment, its actual export list, and what each
importer actually uses from it — several header comments turned out to be load-bearing evidence
(see `features/entries/index.ts` and `features/taxonomy/write-service.ts` below), consistent with
this repo's standing note that comments here sometimes encode inference as observation and need
checking, not just citing.

**Not used:** `codebase-memory-mcp`. This session's questions were all "which file imports which
file, and what does it actually use" — direct, single-hop lookups depcruise + `rg`/`Read` answer
without indirection, per the Refactor skill's Phase-0 gate guidance.

---

## Summary table

| module | files exposed now | proposal reaches | category breakdown |
|---|---|---|---|
| `widgets` | 16 | **16 (unchanged)** | 16× Category 3 |
| `features/taxonomy` | 9 | **3** | 6× Category 1 (+ Category 2 prerequisite on `write-service.ts`), 3× Category 3 |
| `features/entries` | 7 | **2** | 5× Category 1, 2× Category 3 |
| `features/recovery` | 8 | **7, or 6–7 pending an Architect decision already on record** | 7× Category 3, 1× **defer to existing cycle fix**, not a new proposal |

Two of four modules get a truthful "leave it alone." Two get a concrete, mechanical, already-half-documented fix. Nothing here proposes a re-export barrel that leaves the same files reachable under a new name — see the per-module reasoning for why each fix is real narrowing, not relabeling.

---

## 1. `widgets` — 16 files, 45 edges. **Leave it alone.**

### Why this isn't the same shape as taxonomy/entries

`widgets` has **no `index.ts` at all** (`src/widgets/` — confirmed by directory listing). That
means literally every cross-module edge into it counts as "deep" by the metric's definition; the
16-file/45-edge number is not evidence of scattered, redundant access — it is what *any* module
with real per-route capabilities and no barrel would show. The question that matters is not "does
`widgets` have an index.ts" but "would adding one narrow anything real, or just relabel the same
breadth of commitment under fewer file paths" (the second is exactly the anti-goal's forbidden
shape — see the reasoning below for why it applies here and not to taxonomy/entries).

I read every one of the 16 files and every importer edge into them. Every file is a genuinely
distinct, single-purpose capability, and every importer needs specifically the capability it
reaches for — there is no case in this module of several consumers reaching several different
internal files to assemble one coherent thing they should have gotten from one place.

| file | importer edges | what it is | who imports it, for what |
|---|---|---|---|
| `deps.ts` | 10 | the module's own composed deps bag (`WidgetsRouteDeps`, `buildWidgetsDeps`, `buildWidgetsRegionDeps`) | every `server/routes/admin/widgets/*.ts` route file |
| `write-service.ts` | 5 | create/update/trash/purge a widget instance | `agent-tools.ts`, `create.ts`, `purge.ts`, `trash.ts`, `update.ts` |
| `embed-service.ts` | 5 | insert/remove/reorder embeds | `server/http/admin/widgets.ts` (DTO layer, 1 error class only), `agent-tools.ts`, `embed-insert.ts`, `embed-remove.ts`, `embed-reorder.ts` |
| `types.ts` | 5 | shared domain types/DTOs | `server/http/admin/widgets.ts`, `server/http/site/render.ts`, `agent-tools.ts`, `region-get.ts`, `region-mutate-placements.ts` |
| `entry-payload.ts` | 3 | widget-area/instance payload parsing | `agent-tools.ts`, `region-get.ts`, `regions-list.ts` |
| `region-area-service.ts` | 3 | region binding + placement mutation | `agent-tools.ts`, `region-bind.ts`, `region-mutate-placements.ts` |
| `errors.ts` | 2 | typed widget error classes | `server/http/admin/widgets.ts`, `agent-tools.ts` |
| `read-service.ts` | 2 | read a widget instance / list | `get-by-id.ts`, `list.ts` |
| `resolver-service.ts` | 2 | resolve widget embeds for public render | `server/http/site/render.ts`, `server/routes/site/pages.ts` |
| `resolvers/index.ts` | 2 | resolver registry (a sub-barrel — see note below) | `server/app.ts`, `server/deps.ts` |
| `html-embeds.ts` | 1 | HTML-page embed resolution | `server/http/site/render.ts` |
| `ports.ts` | 1 | `WidgetRegionBindingRepoPort` | `server/routes/types.ts` (the composition root's central `RouteDeps`) |
| `repo.memory.ts` | 1 | in-memory adapter | `server/app.ts` (composition root picks the in-memory adapter) |
| `repo.sqlite.ts` | 1 | Drizzle/SQLite adapter | `server/deps.ts` (composition root picks the real adapter) |
| `tool-registrations.ts` | 1 | AI-tool catalog wiring | `assistant/tool-registrations.ts` |
| `where-used.ts` | 1 | usage lookup for delete-guard UI | `server/http/admin/widgets.ts` |

Category, per file:
- `repo.memory.ts`, `repo.sqlite.ts` — **Category 3**, same justification the taxonomy/entries
  barrels already document explicitly for their own persistence adapters: the composition root
  (`server/app.ts` picks in-memory, `server/deps.ts` picks SQLite) is the one place allowed to
  choose a concrete adapter; nothing else imports either file.
- `tool-registrations.ts` — **Category 3**. Confirmed by reading `assistant/tool-registrations.ts`
  directly: **all 22 domains**, not just `widgets`, are imported as `../<domain>/tool-registrations`
  — a hardcoded, uniform block (verified lines 39–139+). `features/entries/tool-registrations.ts`'s
  own header states this explicitly: *"Pointing only entries somewhere else would make the ported
  domain the odd line out... this file and its siblings retire together."* This is a deliberate,
  repo-wide convention, not a `widgets`-specific gap.
- `deps.ts` — **Category 3**, and worth citing because it's the module's own prior fix for exactly
  this diagnostic. Its header states it replaced "~11 independently hand-built copies" of the same
  deps object across routes and two separately-written `widgetsDeps()` helpers, after that
  duplication caused a real bug (`NOT NULL constraint failed: outbox_events.id`, cited by path in
  the header). `widgets` already solved "several consumers reaching several files for one coherent
  purpose" for its write-path deps — the single composer *is* the genuine, intentional API this
  audit's Category 2 asks modules to have. Nothing to add.
- Every other file — **Category 3**. Each is reached by exactly the route(s)/tool(s)/DTO-layer file
  that need that one capability; multiple importers of the same file (`types.ts`, `errors.ts`,
  `write-service.ts`) are healthy reuse of one purpose-built file, not the "different consumers,
  different internal files" smell.

### Why a `widgets/index.ts` would be the forbidden shape, not a fix

I checked explicitly whether bundling these files behind one new barrel would be real narrowing.
It would not: taxonomy/entries' fix works because their curated `index.ts` **already existed**,
re-exporting from an **external package** (`@jini-ai/cms/*`), and the local files being bypassed
were themselves nothing but re-export shims of that *same* package — redirecting importers to the
barrel makes the shim files provably dead, so they get deleted, and the reachable set shrinks for
real (see §2, §3). `widgets` has no such external package backing it and no redundant shim files:
`embed-service.ts`, `write-service.ts`, etc. hold first-party logic that nothing else duplicates.
Adding an `index.ts` that re-exports all of it and redirecting every current importer would relabel
the exact same 16 files' worth of commitment under one file path without removing anything — the
anti-goal's own description of a failed proposal ("a barrel that re-exports everything ... leaves
the same things reachable under a new name"). I'm not proposing it.

**One observation, not a proposal:** `resolvers/index.ts` is itself already a deliberate barrel for
the `resolvers/` subdirectory, but because the metric's exemption is hardcoded to
`src/${module}/index.ts` exactly, a nested barrel one level down doesn't get the same exemption —
it still counts as an exposed file. Not actionable (folding `resolvers/index.ts`'s contents into
`widgets/index.ts` would conflate an unrelated concern — widgets doesn't otherwise have a top-level
barrel — and creating one now for this alone would be exactly the relabeling problem above, for a
1-file gain). Noted for completeness only.

---

## 2. `features/taxonomy` — 9 files, 29 edges. **Proposal reaches 3 files.**

### The finding: a curated barrel already exists and has zero importers

`src/features/taxonomy/index.ts` exists, is explicitly documented, and is imported by **nobody**
(`rg` for `from ['"].*taxonomy['"]` outside the module returns zero hits on the barrel path). Its
own header names exactly which three files stay legitimately outside it and why:

> `repo.sqlite.ts` — the Drizzle adapters ... host persistence, not library code.
> `gated-hooks.ts` — the `mergeTerm` ceremony's `GatedMutationHooks` factory. It composes
> `core/gated-mutations`, a kernel that has not been extracted, so it is composition over a
> host-owned module.
> `tool-registrations.ts` — the same, plus it binds the gateway's `plan()` into the agent-tool
> layer and is the seam `assistant/tool-registrations.ts` reaches uniformly across domains.

Every other file in the module — `content-lookup.ts`, `list.ts`, `merge-term.ts`, `repo.memory.ts`,
`validation-chain.ts`, `write-service.ts` — is **itself** nothing but a re-export shim of
`@jini-ai/cms/taxonomy`, the same upstream package `index.ts` re-exports from directly. I traced
every symbol every route file actually imports from these six files against `index.ts`'s export
list:

| exposed file | edges | consumers | every used symbol on `index.ts`? |
|---|---|---|---|
| `repo.memory.ts` | 7 | `server/app.ts`, `assign-terms.ts`, `create-taxonomy.ts`, `create-term.ts`, `delete-taxonomy.ts`, `delete-term.ts`, `rename-term.ts` | yes — `toTaxonomyOutbox`, `InMemoryTaxonomyRepo`, `InMemoryTermRepo`, `InMemoryEntryTermRepo`, `InMemoryTaxonomyRevisionRepo`, `noopStampWatermark` all already exported |
| `write-service.ts` | 7 | 6 route files + `server/routes/types.ts` | **no** — `deleteTerm`, `deleteTaxonomy`, `TermHasAssignedContentError`, `TermHasChildTermsError`, `TaxonomyHasAssignedContentError` (values), and `DeleteTermRequired`, `DeleteTaxonomyRequired`, `DeletableTaxonomyRepoPort`, `DeletableTermRepoPort`, `AssignmentCountEntryTermRepoPort`, `TransactionalRepoPort` (types) are exported by `write-service.ts` and consumed by routes, but **missing from `index.ts`** — see below |
| `content-lookup.ts` | 6 | 6 route files (`assign-terms.ts`, `create-taxonomy.ts`, `create-term.ts`, `delete-taxonomy.ts`, `delete-term.ts`, `rename-term.ts`) | yes — `createPostBackedContentLookup` already exported |
| `validation-chain.ts` | 2 | `create-term.ts`, `assign-terms.ts` | yes — all 7 error classes already exported |
| `list.ts` | 2 | `list.ts` route, `server/routes/types.ts` | yes — `listTaxonomiesWithTerms`, `TaxonomyListPort`, `TermListPort` already exported |
| `merge-term.ts` | 1 | `merge-term.ts` route | yes — `confirmMergeTerm`, `executeMergeTerm`, `planMergeTerm`, `SameTermMergeError` already exported |
| `gated-hooks.ts` | 2 | `merge-term.ts` route, `server/routes/types.ts` | **N/A** — documented as deliberately excluded (Category 3) |
| `repo.sqlite.ts` | 1 | `server/deps.ts` | **N/A** — documented as deliberately excluded (Category 3) |
| `tool-registrations.ts` | 1 | `assistant/tool-registrations.ts` | **N/A** — uniform 22-domain convention (Category 3) |

`write-service.ts`'s own header is explicit about *why* it hasn't been deleted yet, and the reason
is exactly this exposure: *"This file stays as a re-export rather than being deleted because
`server/routes/types.ts` and five `server/routes/admin/taxonomy/*` modules import these ports and
error classes by path."* That's a self-diagnosed Category 1 finding sitting in the code already —
this report just confirms it, finds the one gap that blocks it (below), and gives the concrete
sequence.

### The one prerequisite: `index.ts` is missing the delete-taxonomy/delete-term names

`deleteTerm`, `deleteTaxonomy`, and their five supporting error/type names exist in
`write-service.ts`'s re-export (confirmed reading `src/features/taxonomy/write-service.ts:16-53`,
sourced from the same `@jini-ai/cms/taxonomy` package `index.ts` already re-exports from) but were
never added to `index.ts`. This looks like an oversight from whenever delete-taxonomy/delete-term
shipped, not a deliberate exclusion — nothing in `index.ts`'s header explains omitting them the way
it explains omitting the three Category-3 files, and every other write-service export *is* present.
**This is Category 2**: the module's already-curated API is missing five genuinely public names.

### Proposed fix (ordered, cheapest first)

1. **Add the 5 missing names to `index.ts`** (`deleteTerm`, `deleteTaxonomy`,
   `TermHasAssignedContentError`, `TermHasChildTermsError`, `TaxonomyHasAssignedContentError` as
   values; `DeleteTermRequired`, `DeleteTaxonomyRequired`, `DeletableTaxonomyRepoPort`,
   `DeletableTermRepoPort`, `AssignmentCountEntryTermRepoPort`, `TransactionalRepoPort` as types),
   sourced from `@jini-ai/cms/taxonomy` exactly like every existing entry. **1 file. Trivial.
   No sign-off — it's completing an existing curated list with names that already exist one layer
   down, not a new design decision.**
2. **Redirect the ~19 deep-import edges** (`content-lookup.ts`, `list.ts`, `merge-term.ts`,
   `repo.memory.ts`, `validation-chain.ts`, `write-service.ts` → all 6) to import from
   `#src/features/taxonomy` instead. **9 files touched**: `server/app.ts`, `server/routes/types.ts`,
   and the 7 route files (`assign-terms.ts`, `create-taxonomy.ts`, `create-term.ts`,
   `delete-taxonomy.ts`, `delete-term.ts`, `list.ts`, `merge-term.ts`, `rename-term.ts` — 8, not 7,
   listing all named consumers). Mechanical import-path rewrite; every symbol used is confirmed
   present on the barrel after step 1. **No behavior change** — same package, same names, one hop
   shorter.
3. **Delete the 6 now-dead files.** Verified by repo-wide `grep` that no file *inside*
   `features/taxonomy` and no test file references any of the 6 by path once step 2 lands — their
   only consumers were the ones being redirected. `content-lookup.ts`, `list.ts`, `merge-term.ts`,
   `repo.memory.ts`, `validation-chain.ts`, `write-service.ts` retire. **Files touched: 6 deletions.**

**Blast radius:** low. Every step is either additive (step 1) or a same-package import-path swap
with no behavior change (step 2), followed by deleting files nothing references anymore (step 3).
No public HTTP contract changes; no test behavior changes (types/values are identical, just
resolved through one fewer hop).

**Sign-off:** none required for steps 1–3 individually; recommend doing all three in one PR since
step 3 depends on step 2 depending on step 1, and reviewing them separately would show two
"pointless"-looking diffs before the payoff.

**Metric moved:** `features/taxonomy` 9 → 3 exposed files (`gated-hooks.ts`, `repo.sqlite.ts`,
`tool-registrations.ts` remain, all Category 3, all with a comment already justifying them).

---

## 3. `features/entries` — 7 files, 25 edges. **Proposal reaches 2 files. Already in-flight.**

### The finding: identical shape to taxonomy, and the code already says so

`src/features/entries/index.ts` exists, same "moved to `@jini-ai/cms/entries`" design, same
deliberate exclusion of `repo.sqlite.ts` (host persistence) and `tool-registrations.ts` (uniform
convention — confirmed against the same `assistant/tool-registrations.ts` 22-domain block cited in
§1). Unlike taxonomy, entries' barrel header states the fix outright:

> A handful of the moved files also survive as per-file re-export shims (`errors.ts`, `list.ts`,
> `repo.memory.ts`, `types.ts`, `write-service.ts`). They exist only because `src/widgets/` still
> deep-imports those paths and is being ported by separate work in flight; when that lands, the
> shims retire and its imports come through this barrel like everyone else's.

I read all five shim files directly — each is a single-purpose, 8–19 line re-export from
`@jini-ai/cms/entries` with a header repeating the same sentence: *"Only `src/widgets/` still
imports this path directly... When that lands, this shim retires."* I then confirmed by `grep`
that **100% of the exposure is `src/widgets/`**: every one of the 25 edges into these 5 files comes
from a `widgets/*.ts` file (production: `deps.ts`, `embed-service.ts`, `entry-payload.ts`,
`read-service.ts`, `region-area-service.ts`, `resolver-service.ts`, `resolvers/create-core-
resolvers.ts`, `resolvers/recent-entries.ts`, `write-service.ts`; plus 6 test files under
`widgets/__tests__/`). No other module deep-imports entries at all.

Cross-checked every symbol `widgets/*` actually imports (`EntryListPort`, `EntryRepoPort`,
`VersionConflictError`, `toEntryOutbox`, `EntryRecord`, `createEntry`, `updateEntry`,
`InMemoryEntryRepo`) against `index.ts`'s export list — **all eight are already exported.** No
Category 2 gap here, unlike taxonomy; this one is pure Category 1, fully unblocked.

### Proposed fix

1. **Redirect all `widgets/*` imports** of `../features/entries/{errors,list,repo.memory,types,
   write-service}` to `../features/entries` (the barrel; `resolvers/*.ts` two levels deep use
   `../../features/entries`, test files under `#src/features/entries`). **~9 production files + 6
   test files**, all within `widgets/`, none within `entries/` itself. Purely mechanical — same
   package, same names, confirmed present on the barrel already.
2. **Delete the 5 shim files** once their only consumer is redirected: `errors.ts`, `list.ts`,
   `repo.memory.ts`, `types.ts`, `write-service.ts`.

**Blast radius:** low — every touched file is in `widgets/` (a module I also own in this dispatch)
or its own tests; no cross-team coordination needed, and no public-signature change (same names,
same types, one import hop removed).

**Sign-off:** none — this is finishing an in-flight migration the code itself already announced,
not a new design decision. Flagging one thing explicitly per the dispatch brief's instruction not
to silently pick a side when two things might conflict: **this fix and the widgets-side "the shims
retire when that lands" comment are the same fix, not two.** Doing this is literally the "separate
work in flight" the comment refers to landing — I did not find a second, different plan for
`widgets`→`entries` anywhere else to reconcile against.

**Metric moved:** `features/entries` 7 → 2 exposed files (`repo.sqlite.ts`, `tool-registrations.ts`
remain, both Category 3, both with the same justification pattern as taxonomy's).

---

## 4. `features/recovery` — 8 files, 12 edges. **Proposal reaches 7, one file deferred entirely.**

`features/recovery` has no `index.ts` (confirmed, same as `widgets`). Unlike `widgets`, its ratio
(12 edges / 8 files ≈ 1.5, the closest to 1 of anything in this trace) looked at first like the
starkest case of "no real API" the dispatch brief flagged it as. Reading every file changed that
conclusion for 7 of the 8.

### 7 files: genuinely 1-capability-per-file, genuinely 1-consumer-per-file. Leave alone.

| file | edges | consumer(s) | what it is |
|---|---|---|---|
| `deep-link.ts` | 2 | `server/routes/admin/recovery/deep-link.ts`, `server/routes/types.ts` (port type) | envelope re-verification (SPEC-019 C-306) |
| `disclosure.ts` | 2 | `server/routes/admin/recovery/disclosure.ts`, `server/routes/types.ts` (port type) | discarded-write-window disclosure (SPEC-019 C-305) |
| `gated-hooks.ts` | 1 | `server/routes/admin/recovery/restore.ts` | the restore ceremony's `GatedMutationHooks` factory |
| `recovery-orchestrator.ts` | 1 | `server/routes/admin/recovery/restore.ts` (same route, second file it needs) | `planRestore`/`confirmRestore`/`executeRestore` |
| `repo.memory.ts` | 2 | `server/app.ts`, `server/deps.ts` | disclosed stand-in adapters (composition root, both modes) |
| `tool-registrations.ts` | 1 | `assistant/tool-registrations.ts` | same uniform 22-domain convention as §1/§2 |
| `ui/degraded-banners.ts` | 1 | `server/routes/admin/recovery/status.ts` | banner-precedence resolver |

Checked every consumer's full import list directly (`restore.ts`, `deep-link.ts` route,
`disclosure.ts` route, `status.ts` route, `server/app.ts`, `server/deps.ts`,
`server/routes/types.ts`) — each imports exactly the one file implementing the one capability it
needs, nothing more. `restore.ts` needing both `gated-hooks.ts` and `recovery-orchestrator.ts` is
one consumer needing two distinct facets of one ceremony (hooks + orchestration), not scattered
access — the same non-smell shape `widgets/agent-tools.ts` showed in §1. **Category 3 across all
7**, same reasoning as `widgets`: no pre-existing barrel is being bypassed (there's nothing to
redirect to), and every file's own header traces it to a specific SPEC/ADR clause with no sibling
file it duplicates. Adding an `index.ts` here would face the identical objection raised in §1 —
these files hold real, distinct ceremony logic; a barrel would relabel, not narrow.

### The 8th file: `restore-points.ts` — this is not a separate finding, it's the known cycle

`restore-points.ts`'s 2 edges are `db/sqlite/database-journal-repo.ts` and
`features/database/repo.memory.ts`, both importing the type `CreateRestorePointRepoPort`. I traced
this directly (not from the prior report) and it is **exactly** the `features/database ↔
features/recovery` module cycle documented in `ADS-memory/reports/architecture/2026-08-13-
architecture-audit.md` §4 item 7 / §5 item 5, which I read in full before writing this section per
the dispatch brief's instruction.

That prior audit's disposition: genuinely bidirectional (5 files each side cross-import the other's
concrete implementation files), root-caused to two capabilities — create a restore point,
recover from one — split without a shared vocabulary, with the concrete fix proposed as *"extract a
shared ports location ... owning `LedgerAppendPort`, `RestorePointListPort`,
`CreateRestorePointRepoPort`, and the reconciliation types ... Sign-off: Architect — naming and
owning the shared module is a real decision."*

**My finding and the prior audit's finding are the same defect, viewed from two different
ratchets** (module cycles vs. API surface), and **they share one fix, not two**. I am not proposing
a competing shape. What this trace adds is the API-surface-specific consequence, which the prior
audit didn't need to compute:

- **If the shared ports module lands inside `features/recovery/`** (e.g.
  `features/recovery/ports.ts`), `db`/`features/database`'s two importers would resolve to that new
  file instead of `restore-points.ts` — recovery's exposed-file **count stays at 8** (one file's
  name swaps for another in the list), even though the *cycle* is genuinely fixed. Worth flagging
  precisely because the owner asked not to launder numbers — this would be a real architectural win
  reported honestly as a **non-improvement on this specific ratchet**, not hidden as one.
- **If the shared ports module lands in a genuinely neutral third location** (outside both
  `features/database` and `features/recovery` — `core/`, or wherever the Architect decides is
  correct), `restore-points.ts` stops having any external importer at all: recovery's count drops to
  **7**. The new file's own exposure becomes whichever module ends up owning it — not scoped to this
  trace, and not one of my four modules.

I'm explicitly not re-deciding where the ports module lives — that's the Architect-level call the
prior audit already routed correctly. This section exists so whoever executes that fix knows its
API-surface side effect on `features/recovery` up front, and so this report doesn't duplicate or
quietly diverge from work already in motion.

**Proposal for `features/recovery`:** ship the 2026-08-13 audit's §5 item 5 as-is; no additional or
alternative fix from this trace. Once it lands, re-run `check:architecture -- --list` to see whether
recovery landed at 7 or stayed at 8, and treat either outcome as expected rather than a surprise.

---

## What I did not touch

- No proposal in this report re-exports an internal file through a *new* barrel to make the counter
  read lower while the same breadth stays reachable. `widgets` and 7 of `features/recovery`'s 8
  files get an explicit "leave alone" for exactly that reason — I checked each one against the
  "would this really narrow commitment, or just relabel it" test before writing "Category 3."
- No proposal grows the SCC or introduces a module cycle. Taxonomy/entries fixes are same-package,
  same-name import-path rewrites (no new edges of any kind, only edges that already terminate at
  the barrel losing their now-redundant detour through a shim). Recovery's one open item is
  deliberately deferred to the Architect-level fix already on record rather than me inventing a
  parallel shape that could disagree with it.
- I did not run `check:architecture -- --update` or any test suite — analysis only, per the
  dispatch brief's operating rules.
