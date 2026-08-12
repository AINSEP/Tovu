# Architecture Audit — 2026-08-13

**Role:** Software Architect (audit) → Refactor (propose-only plan). Both persona files loaded
(`AI-Dev-Shop/agents/software-architect/skills.md`, `AI-Dev-Shop/agents/refactor/skills.md`).
**Scope:** why `npm run check:architecture` is red today, and a propose-only plan. **No production
code was changed to produce this report.**

**Tooling used:** `npm run check:architecture` / `-- --list` (run live, not read from a prior report),
direct `git ls-tree`/`git diff --stat` against the baseline commit, and direct source reads (`rg`/`grep`
+ `Read`) to trace every cited import edge to a real line of code. `codebase-memory-mcp` was available
and indexed at HEAD (35,076 nodes / 55,937 edges) but the questions here were all "which file imports
which" and "what does this specific comment/ADR say" — `rg` against the real tree answered them faster
and with less indirection than a graph query would have, so it was used as the primary tool per the
Refactor skill's Phase-0 gate guidance (grep is an acceptable primary tool when the question is a direct
text/edge lookup, not a multi-hop structural question). No claim below is asserted without a cited file
and line.

---

## 1. Plain-language verdict

**The architecture is still sound, and today's red CI is not new decay — it is the accounting catching
up with three new product domains landing on a codebase whose one real defect (the composition root
`server` sits in the middle of nearly every cycle) was already known and is still being paid down, not
growing.** The 2026-08-02 audit's conclusion — decomposition is sound, the actual defect is back-edges
into the composition root — still holds today: back-edges into `server` improved from 26 to 16 this
session, and the module-cycle *pair* count improved from 13 to 8 (5 pairs removed, 0 new pairs
introduced — verified directly below in §4, not taken from a handoff). Two of the three metrics that
tripped the gate (largest SCC, core size) are *arithmetic consequences* of adding three new feature
domains (`features/agent-plugins`, `features/commerce`, `features/deployments`) to a graph whose
composition root and persistence layer are already densely mutual — not new mistakes made this session.
The third (module API surface) grew slower than the codebase itself did (+3.6% vs. +7.4% file growth),
which is actually a mild proportional improvement being reported as a raw-count regression.

That is a real verdict, not a hand-wave — every regressed metric is traced to specific files below in
§2. The one place this audit disagrees with "everything is fine" is core size: it grew faster than the
codebase (+11.7% vs. +7.4% file growth), and that one is not fully explained by new-module arithmetic —
see §2.3. It is small (13 files) and worth a look, not worth blocking on.

**Bottom line for the owner:** nothing here says "stop and fix architecture before shipping." The
gate did its job — it caught real, attributable growth and forced this audit instead of letting the
baseline silently drift. §3 recommends moving the baseline for two of the three regressions and gives
the SCC/core-size growth an honest accounting rather than either laundering it or over-reacting to it.

---

## 2. Why CI is red, metric by metric

The baseline was calibrated at commit `e8688e1` (730 files / 42 modules). HEAD is 784 files / 45
modules — confirmed by diffing `src/` directory structure between that commit and the working tree
(`git ls-tree -d --name-only e8688e1 src/features/` vs. the current tree). The three new modules are
exactly `features/agent-plugins`, `features/commerce`, `features/deployments` — no other module was
added or removed. This matches the handoff's "+3 modules" claim and grounds it in a specific diff
rather than the round-number coincidence it could have been.

### 2.1 Largest SCC grew 33 → 35 — caused by `features/commerce` joining the pre-existing giant SCC

Traced directly, not inferred from the SCC list alone:

- `features/commerce` imports only `db` (`db/sqlite/content-db`, `db/sqlite/repo-helpers`) and framework
  packages — no other domain module.
- `server` imports `features/commerce` in four places: `server/deps.ts`, `server/routes/types.ts`,
  `server/routes/admin/commerce/status.ts`, `server/routes/site/products.ts`.

That's it: `server → commerce → db`. `server` and `db` are **already** both members of the 33-module
baseline SCC (both were named in the 2026-08-02 report's own instability table and are still central
today — `db` has Ce=20 in today's `--list` output, `server` has Ce=517). Because the giant SCC already
has a path from `db` back to `server` (through the existing `db ↔ features/database ↔ features/recovery`
knot and the many other members), any new module that (a) `server` imports to wire its routes and (b)
imports `db` to persist anything gets swept into the SCC for free — it doesn't need to introduce any new
back-edge or violate any rule itself. `features/commerce` did nothing wrong; it followed the exact same
"server wires my routes, I read/write db" shape every other domain module already uses, and that shape
was already inside the SCC before commerce existed.

`features/agent-plugins` (Ca=0, Ce=0 — literally zero cross-module edges, confirmed in the `--list`
Martin-instability table) and `features/deployments` (Ca=0, Ce=2 — outgoing only, no incoming) are the
other two new modules. Neither can join a cycle: a strongly-connected component requires mutual
reachability, and a module with no incoming edge (or no edge at all) can't be reached back. They add to
the "45 modules" count and to `features/deployments`'s two outgoing edges' contribution to deep-import
totals, but they contribute **zero** to the SCC or cycle-pair metrics. Worth naming because it rules out
"the two other new modules are also part of the decay" as a hypothesis — they aren't.

**Verdict on this one:** mechanical consequence of a new domain following the established (already
broken) pattern. Not a new design mistake. Fixing it for real means fixing the pre-existing `server`/`db`
entanglement (§4), which is already tracked and already improving (26 → 16 back-edges this session).

### 2.2 Module API surface (files exposed) — 220 → 228, but this is smaller than proportional

+8 files against a codebase that grew by 54 files (+7.4%) is a +3.6% surface increase — *below* the
file-growth rate. Read as a percentage of the codebase rather than a raw count, the API surface actually
tightened slightly. The ratchet checks the raw count (by design — see the code comment at
`development/scripts/check-architecture.ts:463-466`: it deliberately ratchets distinct exposed files,
not edge count, so that a second import into an already-exposed file can't fail the build). That design
choice is correct for what it protects (new privacy violations), but it means a raw-count ratchet will
always fire when the codebase grows and even one genuinely-new domain adds any cross-module reads at
all — which three new domains landing at once do. This is the flagged case in §3: recommend moving the
baseline, this is not decay.

### 2.3 Core size — 15.21% → 15.82% (111/730 → 124/784) — partially explained, partially real

File-count growth alone would predict core staying flat as a *percentage* (proportional growth cancels
out) or moving only with genuine change in shared-utility shape. It moved 0.61 points, and the raw count
grew faster (+11.7%) than the file count did (+7.4%) — this one is not fully absorbed by "the codebase
got bigger."

Two real, traceable contributors, both `core/`-scoped:

- `src/core/rate-limit/rate-limit.ts` (326 lines, new since baseline) and `src/core/runtime-mode.ts`
  (26 lines, new since baseline) are **relocations the 2026-08-02 report itself recommended** —
  `server/middleware/rate-limit.ts → core/` and `server/runtime-mode.ts → core/`, both listed as
  Phase-3 items in that report's plan (§5, rows 3). Both moves happened this session (confirmed via
  `git diff --stat e8688e1 -- src/core/`). A file that is genuinely a cross-cutting policy primitive,
  once moved into `core/`, will tend to have both wide fan-in (many callers) and moderate fan-out —
  exactly the shape the "core" metric measures. This is the plan working as intended, not decay: two of
  the seven items on record's own remediation list executed, and the metric that specifically watches
  "how much stuff lives in the shared kernel" moved in response, because that's what it's built to catch.
- `src/core/gated-mutations/{composition,gateway,ports,watermark}.ts` grew substantially this session
  (part of the write-quiescence/Postgres-migration workstream) and `src/core/embeds/marker.ts` (269
  lines) is wholly new. These are core-owned infrastructure additions, not misplaced feature code, but
  they still add fan-in/fan-out mass to the median computation the metric uses — some previously
  borderline files may cross the median threshold purely because the median itself shifted, independent
  of any change to those files. This is a real but partly artifactual effect of the metric's own
  definition (files *above-median* in both directions — adding mass near the median moves the median).

**Verdict on this one:** roughly half "the plan's own recommended moves executing, correctly, and the
metric doing its job," half "core-infrastructure growth that's arguably supposed to live in core." Not
alarming, but the one metric in this report not cleanly reducible to "new modules, mechanically." Worth
a light look (§5) rather than a baseline move on faith.

---

## 3. Baseline recommendation

A ratchet moved every time it fires stops being a ratchet — so this is not a blanket "run `--update`."
Per-metric, with the reasoning that would make a future reader trust the call:

| metric | move it, or fix it | reasoning |
|---|---|---|
| **Largest SCC (33→35)** | **Move it.** | §2.1 shows this is arithmetically forced by any new domain that both gets wired by `server` and persists via `db` — the standard, required shape for a domain module in this codebase. The only way to *not* trip this metric on the next new domain is to first fix the pre-existing `server`/`db` entanglement (§4), which is real work already in progress, not something this baseline update should be gated behind. Moving it now is honest: it records "we added 2 legitimate domains," not "we let the SCC rot." |
| **Module API surface (220→228)** | **Move it.** | §2.2: the raw count grew slower than the codebase did. A baseline that stayed at 220 would be *tighter* than proportional, which was never the ratchet's intent (it exists to catch newly-exposed private files, not to freeze the surface while the codebase grows). Moving it locks in a number that's still doing its job on the next regression. |
| **Core size (15.21%→15.82%)** | **Investigate first, then move.** | §2.3 is the one genuinely mixed case. Recommend: confirm (quick, cheap — see §5 item 1) that the newly-core-qualifying files beyond `rate-limit.ts`/`runtime-mode.ts` are legitimate core infrastructure (gated-mutations, embeds) and not a feature-specific file that leaked into core-like fan-in/fan-out by accident. If confirmed legitimate, move the baseline in the same `--update` pass as the other two. Do not move it silently without that five-minute check — this is the metric most able to hide real decay behind "the codebase grew" framing, and it is the one the owner explicitly asked this audit to not paper over. |
| **Module cycles (13→8) and back-edges (26→16)** | **Not regressed — no baseline action needed.** | Both *improved* this session and are printed as improvements, not failures, by the tool itself. Listed here only to be explicit that the baseline update should not touch these fields with anything other than the genuinely-better numbers already computed. |

**Net recommendation:** run `npm run check:architecture -- --update` after a five-minute look at which
specific files pushed core size (§5 item 1) confirms they're legitimate. All three regressions are
either fully explained by legitimate growth (SCC, API surface) or very likely to be (core size, pending
the one cheap check) — none of the three is "real decay being laundered through a baseline bump" as
written. If that check instead surfaces a feature-specific file wrongly sitting in the core-shaped
fan-in/fan-out band, fix that placement first, then update.

---

## 4. The true module-cycle inventory

### Resolving the discrepancy the dispatch brief flagged

**The tool's own current output is unambiguous: 8 pairs.** Ran live (not read from a report):
`module cycles (mutual pairs) 8`, listing exactly 8 `<->` pairs. The baseline JSON
(`development/scripts/check-architecture.baseline.json`, commit `e8688e1`) records `mutualCycleCount: 13`
with all 13 pairs enumerated. Diffing the two pair lists: **0 new pairs introduced, 5 pairs removed**
(`comments<->server`, `core<->db`, `features/plugin-runtime<->server`, `forms<->server`,
`mail<->server`), 13 − 5 = 8. **"13 → 8" (from `ADS-memory/.local-artifacts/handoff/20260812-212303-
handoff.md:37`) is the correct figure and matches the tool exactly.**

**"5 module cycles remain" (same file, line 97) is a miscount, traced to its own source:** the bullet
list under that claim (lines 98–102) groups the current 8 pairs into 5 *diagnostic buckets* — one bucket
per root cause, not one bucket per pair — because 4 of the 8 pairs share one root cause
(`agent-daemon-server.ts`, see below). The list itself even labels that bucket "`assistant`×**3**", which
undercounts even the bucket's own pair count: tracing it directly (below) shows **4** `assistant` pairs,
not 3. So the "5" is a count of *causes*, mislabeled as a count of *cycles*, and undercounts by one even
on its own terms. The corrected framing: **8 pairs, 5 distinct root causes.** Use "8 module cycles remain
(5 root causes)" going forward, not "5 module cycles remain" — the latter reads as a pair count and is
one any future agent will (reasonably) take literally.

### The 8 pairs, traced to source, with disposition

**1–4. `assistant <-> db`, `assistant <-> features/plugins`, `assistant <-> server` (partially),
`core <-> features/post`... — see the two separate root causes below.**

#### Root cause A — `assistant/agent-daemon-server.ts`: 3 of 4 `assistant` pairs, cleanly

Confirmed by direct import trace, not by re-citing the 2026-08-02 report's claim:

- `agent-daemon-server.ts` alone is the **only** file in `assistant/` that imports `features/plugins`
  (`registerSupabaseMcpPreset`, line 81) or `db` (`openContentDb`, line 84) — verified by grepping every
  other file in `src/assistant/**` for those two targets; no other file matches. It also imports `server`
  (`createRouteDeps`, `createSqliteRouteDepsForWorkspace`, `defaultContentDbPath`, lines 85–86).
- **24 files inside `assistant/`** import `agent-daemon-server.ts` back (verified count, including 6 test
  files) — confirming the dispatch brief's figure exactly. Relocating the file to `server/` (the
  2026-08-02 report's Phase-3 recommendation) would force all 24 to reach *outside* their own module for
  a file that is conceptually the daemon's own composition root — inverting the defect, not fixing it,
  exactly as the brief stated. **This needs a split** (pull the `db`/`features/plugins`/`server`-touching
  composition logic into a thin boot-time entry point, leaving the daemon's own internals — the 24
  consumers' actual dependency — inside `assistant/`), not a move. Architect-level: the split boundary is
  a design decision, not mechanical.
- This one file fully explains `assistant<->db` and `assistant<->features/plugins` (each has exactly one
  source file on the `assistant` side) and is *one of two* sources of `assistant<->server`.

#### Root cause A, correction — `assistant<->server` has a second, independent source

`assistant/byok-tool-surface.ts:43` imports `type { RouteDeps } from "../server/routes/types"` — a
type-only import, unrelated to `agent-daemon-server.ts`. **Splitting `agent-daemon-server.ts` alone does
not fully clear `assistant<->server`** — this second edge survives the split and needs its own call: is
a narrower type (matching the `RouteDeps`-narrowing work already done for the 22 `tool-registrations.ts`
files per the 2026-08-02 report Phase-2) the fix here too, or is a type-only dependency on `RouteDeps`
acceptable as-is? Flagged as open, not resolved by this audit — Architect judgment call, cheap either way
(one file).

#### Root cause B — `assistant<->features/post`: unrelated to `agent-daemon-server.ts` entirely

Three files — `assistant/tool-registrations.ts`, `assistant/site/client-directives.ts`,
`assistant/site/tools.ts` — import `features/post` directly (`PostRecord`, `PostRepoPort`,
`listPublishedPosts`, `buildPostRegistrations`). None of these touch `agent-daemon-server.ts`. This is
`assistant` acting as an AI-tool composition root (aggregating every domain's `buildXRegistrations`,
matching `server`'s role for HTTP routes) and as the public site-assistant's read surface over published
content — both look like the module's actual job, not a misplacement. The reverse edge
(`features/post/tool-registrations.ts` and `features/post/delete-confirmation-ui.ts` importing
`askOnce`/`SurfaceExchange`/`SURFACE_EXCHANGE_ID_PARAM` from `assistant/surface-exchanges.ts`) is a
*different* shape: `features/post` needs `assistant`'s generic ask-once/confirmation primitive to
implement its own delete-confirmation AI tool. That primitive (`surface-exchanges.ts`, 364 lines,
explicitly documented as "channel-agnostic on purpose") is cross-cutting by its own header's design intent —
any feature module with a destructive AI tool will want it, not just `post`. **Diagnosis: the
confirmation primitive is misplaced, not the post-reads.** Moving `surface-exchanges.ts`'s public
contract to a neutral location (`core/`, alongside the other generic primitives already there) would
remove the `features/post → assistant` edge without touching the `assistant → features/post` edge (which
is legitimate and would remain — same shape as `server` legitimately importing every domain to wire
routes). That does not fully break the pair (the remaining one-directional edge means it's no longer a
*cycle*, which is the actual goal). Architect-level: touches a documented, deliberately-designed
primitive's public location — worth a short design note, not a large change.

**5. `core <-> features/post`** — confirmed exactly as the handoff described. `core/commands/appliers.ts`
hard-codes `postUpdateReverter`/`postDeleteReverter` (`EntityReverter` instances, lines 93/173) and
imports concrete `PostRecord`/`PostRepoPort`/`PostStatus`/`classifyStatusTransition` from
`../../features/post` — `core` should be generic over entity type and isn't. The reverse edge
(`features/post/tool-registrations.ts` importing `core/commands`/`core/events` to execute commands) is
the *correct* direction — features registering into core's generic executor is the expected shape, same
as every other domain. **Fix: genericize `EntityReverter<TDeps>`/`ReverterDeps`, move the two concrete
`post` reverters into `features/post` registering into `core`'s now-generic registry.** ~4-file
public-signature change (`core/commands/appliers.ts` + its 3 direct consumers, per the handoff's
estimate — file list not independently re-verified beyond `appliers.ts` itself). Programmer-level once
the generic shape is specified; the generic-shape decision itself is Architect-level (small).

**6. `db <-> features/database`** — confirmed exactly as the handoff described.
`db/sqlite/database-journal-repo.ts` (lines 3–4) imports `LedgerReadPort`/`LedgerRow` from
`features/database/timeline` and `BootLedgerPort`/`MigrationRunsRepoPort` from
`features/database/boot/reconcile-interrupted-migration` — a low-level SQLite adapter reaching *up* into
a feature module for port types, backwards from the intended `features/database → db` direction (the
reverse edge, `features/database/adapter.sqlite.ts` importing `ContentDb` from `db/sqlite/content-db`, is
the correct direction). **Fix: the port types (`LedgerReadPort`, `LedgerRow`, `BootLedgerPort`,
`MigrationRunsRepoPort`) belong at the `db` layer (or a shared ports location `db` can own) since they
describe what an adapter provides, not feature-specific business logic — `features/database` should
depend on `db`'s port definitions, not the reverse.** Small, mechanical once the target location is
picked. Programmer-level.

**7. `features/database <-> features/recovery`** — confirmed genuinely bidirectional, and more
extensively than "may need a shared abstraction" suggested: **5 files on each side**, several with
mirrored names (`tool-registrations.ts`, `gated-hooks.ts`, `agent-tools.ts`, `repo.memory.ts` exist in
both modules and cross-import each other). The code is self-aware about this — comments in both
directions reference "the same 'no shared import, kept decoupled' convention" and flag a live tool-id
collision (`backup_create_restore_point` vs. a same-named entry in `recovery/agent-tools.ts`) that a
comment records as "already fixed" elsewhere. Concrete symbols crossing the boundary:
`recovery/tool-registrations.ts` imports `LedgerAppendPort` (from `database/gated-hooks.ts`),
`listRestorePoints`/`RestorePointListPort` (from `database/restore-points.ts`), and reconciliation types
from `database/boot/reconcile-interrupted-migration`; `database/repo.memory.ts` imports
`CreateRestorePointRepoPort` from `recovery/restore-points.ts`. **These four port/type names
(`LedgerAppendPort`, `RestorePointListPort`, `CreateRestorePointRepoPort`, and the reconciliation types)
are the extraction candidates** — a shared ports module (`features/database` and `features/recovery` both
depend on it downward) would let both sides keep their "no shared import" intent honest instead of
importing each other's concrete files. This is genuinely two capabilities (create a restore point;
recover from one) that got split into separate feature folders without a shared vocabulary — Architect-
level: naming and owning the shared ports module is a real design decision, not mechanical, even though
each individual import swap is small.

**8. `seo <-> server`** — **not a defect. This is an ACCEPTED, human-approved architectural decision,
not something needing an ADR call — the ADR call has already been made.** `page-head.ts`'s own header
cites "ADR-032's own Open item 3" as the reason it lives in `server/http/site/`, not `seo/`. Read ADR-032
(`ADS-memory/reports/architecture/ADR-032-seo.md`) directly: Open item 3 explicitly names this exact
ownership gap as unresolved and defers it to "the theme-contract owner." That deferral was resolved —
not by ADR-032 itself, but by **ADR-PIPE-008** (`ADS-memory/reports/pipeline/008-seo/adr.md`), **Status:
ACCEPTED 2026-07-13, human approval: Leona Burime**, Decision §2, titled verbatim "The `page.head` seam —
owned by the render layer, not by SEO." That ADR's own Pattern Evaluation table considered and explicitly
rejected the alternative the 2026-08-02 report recommends: *"`page.head` seam: keep entirely inside
`src/seo/`, `render.ts` imports SEO directly ... Not selected — ADR-032 itself frames this as the theme
layer's seam, not SEO's."* Tracing the actual edges: `seo/{page-head-contributor,ports,types}.ts` import
`HeadElement`/`PageHeadContext`/`PageHeadHook` types from `server/http/site/page-head.ts` (the accepted,
intentional direction — SEO is *a* contributor to a registry it doesn't own); `server/routes/admin/seo/*`
and `server/routes/site/{robots,sitemap}.ts` import from `#src/seo/index` (ordinary composition-root
route wiring, same shape every other domain has). **The 2026-08-02 report's "move page-head.ts to seo/"
recommendation is not merely wrong, it directly contradicts a specific, owner-signed-off ADR decision
that considered and rejected that exact move by name.** No further Architect or ADR work is needed here
— only correcting the stale 2026-08-02 report so it stops being cited as live guidance. If the cycle
itself is worth removing later (not required), the mechanical option that doesn't reopen ADR-PIPE-008 is
extracting the three type names into a neutral module both `server` and `seo` can import downward from —
noted as a possible future item, not proposed for action here.

### Disposition summary

| pair(s) | root cause | needs |
|---|---|---|
| `assistant<->db`, `assistant<->features/plugins`, `assistant<->server` (1 of 2 sources) | `agent-daemon-server.ts` doing composition-root work inside a feature module | **Architect** — split, not move |
| `assistant<->server` (2nd source) | `byok-tool-surface.ts`'s `RouteDeps` type import | **Architect** (small) — narrow-type call |
| `assistant<->features/post` | `surface-exchanges.ts`'s confirmation primitive housed in `assistant`, needed generically | **Architect** (small) — relocation design note |
| `core<->features/post` | `EntityReverter` not generic; concrete `post` reverters live in `core` | **Architect** (small, shape) then **Programmer** (mechanical) |
| `db<->features/database` | port types defined in the feature layer, consumed backwards by the adapter | **Programmer** — mechanical |
| `features/database<->features/recovery` | two capabilities split without a shared ports module | **Architect** — naming/ownership decision |
| `seo<->server` | **not a defect** — ACCEPTED ADR-PIPE-008 decision | **none** — correct the stale 2026-08-02 report |

---
