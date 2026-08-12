# API Surface Trace — Set A: `forms`, `comments`, `newsletter`, `site-dir`

**Status:** PROPOSAL ONLY — no production code touched. Every finding below is verified against
the actual source (import statements, docblocks, and the dependency-cruiser graph), not inferred.
**Mandate:** `check:architecture`'s `moduleApiSurfaceFiles` ratchet (`development/scripts/check-architecture.ts`).
**Method:** `npm run check:architecture -- --list` for the authoritative counts, cross-checked with
a standalone parse of the same `depcruise --output-type json` output (script in
`development/scripts/check-architecture.ts`'s own `deepImports()`/`moduleOf()` logic, reproduced to
get per-file importer lists the `--list` flag doesn't print). Every "who imports this / for what
symbol" claim below was verified with `grep -n` against the actual import line, not assumed from
file names.

## Executive summary

| Module | Files now | Files proposed | Edges now | Edges proposed | New files | Behavior change |
|---|---|---|---|---|---|---|
| `comments` | 7 | **4** | 11 | 4 | 0 (fixes existing bypassed `index.ts`) | none |
| `forms` | 11 | **8** | 19 | ~10 | 1 (`src/forms/index.ts`) | none |
| `newsletter` | 13 | **11** | 45 | ~33 | 1 (`src/newsletter/index.ts`) | none |
| `site-dir` | 8 | **6** | 10 | ~6 | 1 (`src/site-dir/index.ts`) | none |
| **Total** | **39** | **29** | **85** | **~53** | 3 | — |

All four proposals are the **same move**, applied consistently: re-export each module's **data
contract** (port interfaces, typed domain errors, and — for `comments`, which already has this —
the settings/type re-exports) through `index.ts`, and redirect the handful of importers that reach
past an already-open (or about-to-exist) door. Nothing else moves. Every file left exposed is left
exposed with a specific, evidenced reason, not a shrug.

This is **not** the "re-export everything" cover-up the brief explicitly ruled out. The dividing
line was not invented for this report — it is `src/comments/index.ts`'s own existing shape, written
before this trace and already the pattern the other three modules are missing. See the `comments`
section below: three of its seven "exposed" files are exposed only because importers are walking
around a door that has been open the whole time.

Applying all three module-002/003/004 proposals together would move
`moduleApiSurfaceFiles` from **228** (current, regressed) to **~218** — *below* the committed
baseline of 220 — using zero barrel-cover-up, zero new cycles (verified: every redirected edge is
type-only or an interface, and the module-level adjacency these consumers already have to
`comments`/`forms`/`newsletter`/`site-dir` doesn't change — only the file *within* that module they
resolve to changes), and zero behavior change (every proposed edit is either an import-specifier
swap or a 3-line re-export file).

---

## A calibration note before the per-module detail

The dispatch brief's diagnostic — "when imports ≈ files reached, the module has no real API" — does
not hold uniformly here, and I want to flag that before walking through the files so the per-file
verdicts below don't read as arbitrary. The reference "healthy" modules in the brief (`core`: 104→15,
`db`: 82→19) are held up as having "a genuine narrow door," but **`db` has no `index.ts` at all**
(verified: `src/db/*.ts` contains no `index.ts`), and `core/index.ts` is itself a two-line barrel
(`export * from "@jini-ai/cms/core"; export * from "./events"`). Their healthy ratio comes from
**convergence** — many importers reusing the *same* small file set (schema types, connection
helpers) — not from a narrow-door barrel.

`forms`/`comments`/`newsletter`/`site-dir` converge worse because of *who* is importing them, not
because the modules are badly shaped. I traced every importer of every exposed file in all four
modules (39 files, 85 edges) and every single one resolves to one of exactly four things:

1. **A global composition root** (`server/app.ts`, `server/deps.ts`, `cli/commands/serve.ts`)
   picking a concrete adapter (`repo.memory.ts` vs `repo.sqlite.ts`) or wiring a boot-time
   singleton (rate limiter, hook registry, data-module installer). This pattern is not local to
   these four modules — the identical `repo.memory`/`repo.sqlite` direct-import shape is used by
   **14 other modules** from the same two files (`analytics`, `core/entry-refs`,
   `features/database`, `features/plugin-runtime`, `features/recovery`, `features/taxonomy`,
   `widgets`, `features/commerce`, `features/content-types`, `features/entries`,
   `features/settings`, `navigation`, plus `forms`/`comments`/`newsletter` themselves — verified via
   `grep -oE 'from "\.\./[a-z/-]+/repo\.(memory|sqlite)"' src/server/{app,deps}.ts`).
2. **A per-domain local composition file inside `server`** (`server/routes/admin/<module>/deps.ts`,
   `server/modules/<module>.ts`, `server/http/admin/<module>.ts`) — every one of these is a
   *type-only* import shaping a narrower deps bundle for that domain's own service functions. This
   is also systemic: 32 `server/modules/*.ts` files exist, one per domain.
3. **A fragmented HTTP route handler**, one file per REST operation (`create.ts`, `update.ts`,
   `cancel-campaign.ts`, `archive-list.ts`, ...), each importing the *one* function it actually
   calls as a value import (`createFormDefinition`, `saveCampaign`, `archiveList`, ...). Verified
   directly — every route-handler import checked below is a plain named-function value import, not
   a namespace or wildcard import.
4. **A genuine cross-module dependency-inversion seam** through `ports.ts` — `widgets` implementing
   a read view over `forms`' `FormDefinitionRepoPort`, `members` implementing `newsletter`'s
   `SubscriberDirectoryPort`. Both are extensively ADR-documented (`widgets/resolvers/contact-form.ts`
   cites ADR-047 and an explicit invariant enforced by a code-review grep; `members/subscriber-
   directory.ts` cites ADR-030 §4). These are the pattern working *correctly*, not a leak.

None of (1)–(4) is "the module has no real API." They are the *composition root's* fan-out, which
is structurally required to touch many files in any ports-and-adapters system — the composition
root's entire job is choosing concrete adapters and wiring narrow deps bundles for each of a
domain's many independent operations. Collapsing them behind one barrel per module, as the anti-goal
warns, would make the counter read lower while every one of these distinct pieces would still need
enumerating in a real `exports` map — pure cover-up, correctly ruled out.

What *is* a real, fixable defect — and the subject of every proposal below — is category (4)'s type
surface (`ports.ts`, plus the error/type "data contract" route handlers use for HTTP-status mapping
and request/response shaping) not being routed through the one door each module already has, or
should have, for exactly that purpose.

---

## `comments` (7 files exposed, 11 edges)

`src/comments/index.ts` **already exists** and already re-exports exactly the right shape:
`CommentRepoPort`, `CommentIngressPolicy`, `SpamCheckPort` (from `ports.ts`), `CommentRecord`,
`CommentStatus`, `CommentsSettings`, `CommentSubmission`, `ModerationAction`, `ModerationLogEntry`
(from `types.ts`), `CommentWriteService` (the *type*, from `write-service.ts`), and
`CommentsSettingsValidationError` (from `errors.ts`). This is precisely the "data contract" shape
this whole report recommends for the other three modules — it was written first and independently
of this trace.

Three of the seven exposed files are exposed **only** because specific importers bypass that
existing door for no reason evidenced in the code — not a design gap, an inconsistency.

| File | Importers | What's imported | Category | Verdict |
|---|---|---|---|---|
| `ports.ts` | `server/routes/types.ts:56`, `server/routes/admin/comments/moderation-queue.ts:3`, `server/routes/site/comments-submit.ts:5` | `CommentIngressPolicy`, `CommentRepoPort` (all type-only) | **1 — wrong import path** | Redirect to `../../comments` / `#src/comments`. `index.ts` already re-exports these exact symbols (line 131). |
| `write-service.ts` | `server/routes/types.ts:57`, `server/routes/admin/comments/moderate.ts:3` | `CommentWriteService` (type-only) | **1** | Redirect. Already re-exported (line 134). |
| `types.ts` | `server/routes/admin/comments/moderate.ts:4`, `server/routes/admin/comments/moderation-queue.ts:4` | `CommentStatus`, `ModerationAction` (type-only) | **1** | Redirect. Already re-exported (line 132). |
| `repo.memory.ts` | `server/app.ts` | concrete adapter class, constructed at boot | **3 — legitimate** | Composition-root adapter selection. Same shape used by 14 other modules against the same two files. Leave. |
| `repo.sqlite.ts` | `server/deps.ts` | concrete adapter class | **3** | Same as above. Leave. |
| `tool-registrations.ts` | `assistant/tool-registrations.ts` | plugin tool registry entry | **3** | Systemic: 12 modules follow this exact convention for the AI-agent tool registry. Leave. |
| `data-module-install.ts` | `server/deps.ts` | `installCommentsDataModule`, called once at boot | **3** | Single boot-time DB-table-declaration call, single caller, no consolidation opportunity exists (comparable `newsletter/data-module-manifest.ts` follows the identical single-purpose shape). Leave. |

**Category tally:** 1 → 3 files (all fixable, zero risk); 3 → 4 files (leave, evidenced).

### Proposal C-1 — redirect 5 import statements to the existing `comments/index.ts`

- **Category:** 1 (wrong dependency — the door is already open).
- **Files touched (5, one-line import-specifier edit each):**
  - `src/server/routes/types.ts:56-57` — merge the two `../../comments/ports` / `../../comments/write-service` type imports into one `../../comments` import.
  - `src/server/routes/admin/comments/moderation-queue.ts:3-4` — `#src/comments/ports` + `#src/comments/types` → `#src/comments`.
  - `src/server/routes/admin/comments/moderate.ts:3-4` — `#src/comments/write-service` + `#src/comments/types` → `#src/comments`.
  - `src/server/routes/site/comments-submit.ts:5` — `#src/comments/ports` → `#src/comments`.
- **Blast radius:** 4 files, all `import type`/named-type edits. No runtime behavior changes (TypeScript erases type-only imports; the re-exported types are structurally identical, same declarations, just reached via a different specifier).
- **Result:** `comments` drops from 7 exposed files / 11 edges to **4 files / 4 edges**.
- **Sign-off needed:** None beyond the owner's usual review — this is a mechanical, zero-risk cleanup, not a design decision. Safe to batch with C-2/C-3/C-4 below or land alone.
