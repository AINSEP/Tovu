# Admin UI Design Spec — Collections, Categories & Tags, Storage/Timeline, Recovery

- Author: Web Design agent (AI Dev Shop)
- Date: 2026-07-15
- Status: Design-ready for Programmer. Read-only design pass — no production code was written or edited to produce this document.
- Inputs: ADR-022, ADR-043, ADR-044, ADR-041, ADR-045 (full text); `apps/admin/src/styles.css`; `apps/admin/src/App.tsx`; `apps/admin/src/components/Sidebar.tsx`; `apps/admin/src/nav.ts`; `apps/admin/src/sections/{Media,FormsList,Settings,Analytics}.tsx`; `src/features/{content-types,entries,taxonomy,storage,recovery}/**` (production TypeScript, not just ADR prose).

## 0. Cross-cutting decisions

### 0.1 Screen count — 4 nav entries, not 5

The dispatch brief flagged ADR-045 §1 ("two separate screens, not tabs") as implying 5 total screens. Having read ADR-045 in full, the "two separate screens" it names are **Storage** and **Recovery** — not "Backups" and "Recovery." ADR-045's own Consequences section is explicit: *"`/admin/backups` and `/admin/database` (pre-ADR-041 sitemap entries) are superseded... Recovery supersedes `/admin/backups`."* There is no third screen called "Backups."

**Binding structure used below: 4 nav entries / 4 routes** — Collections, Categories & Tags, Storage (Timeline), Recovery. Recovery's own screen (ADR-045 §3) has two internal *views*, not two routes: a **restore-points list view** (informally "Backups" — newest-first list of restore points) and a **restore-flow view** (the plan→confirm→execute ceremony for a selected restore point), the same list+detail shape `Settings.tsx` and `FormsList.tsx`/`FormEditor.tsx` already use elsewhere in this codebase. Section 4 below documents both views under one screen. Do not build a separate "Backups" route — that would contradict ADR-045 §1 and reintroduce the exact tab-adjacent mis-click risk the ADR rejects.

### 0.2 Design system — extend, do not invent

No shadcn/ui or other component library is present in `apps/admin` (`package.json` has only React + TipTap + Vite). The design system is `apps/admin/src/styles.css`'s hand-rolled CSS custom-property system (oklch tokens, light/dark via `:root[data-theme]`). All 4 screens below reuse existing classes verbatim wherever the shape matches (`.list-table`, `.notice`, `.notice.error`, `.status`/`.status-*`, `.editor-header`, `.editor-actions`, `.dash-grid`/`.dash-card`, `.settings-*` family) and introduce new classes only where no existing pattern fits, following the naming convention already established (`.{screen}-{part}`, e.g. `.settings-detail-panel`). Do not introduce a new font, new radius scale, new shadow, or new color — the existing token set already covers everything these 4 screens need (status pills for lifecycle states, `--danger`/`--ok` for destructive/safe actions, `--accent-dim` for selection).

### 0.3 Structural pattern per screen

| Screen | Closest existing structural reference | Why |
|---|---|---|
| Collections | `FormsList.tsx` + `FormEditor.tsx` (list → detail) crossed with `Settings.tsx`'s namespace-entry idiom | Collections is a registry (content types) with entries nested under each type — two-level list/detail, like Forms' list/editor but with an extra registry layer |
| Categories & Tags | `Settings.tsx`'s two-pane namespace-list + detail-panel layout | Taxonomies (2 seeded: category, tag) are the "namespace" equivalent; terms within a taxonomy are the "settings row" equivalent, with a similar select-to-inspect detail panel |
| Storage (Timeline) | `Analytics.tsx` (read-heavy, honesty-labeled partial data) + `.list-table` | Timeline is explicitly read-first (ADR-041 §1); Analytics.tsx's "raw ingest, not a dashboard, said so explicitly" pattern is the direct precedent for Storage's own "partial disclosure, said so explicitly" requirement |
| Recovery | `Settings.tsx`'s dialog/confirm pattern (`ResetNamespaceDialog`) + `Media.tsx`'s destructive-action confirm idiom | Recovery's plan→confirm→execute ceremony is a heavier version of Settings' reset-confirm dialog; the "confirm mints a token, second gate" shape has no existing precedent in this codebase — new pattern, documented in full below |

### 0.4 Backend gap — read this before estimating build time

Only **one** route exists across all 5 backend feature modules: `GET /api/admin/v1/storage/timeline` (`src/server/routes/admin/storage/timeline.ts`). Confirmed by direct filesystem search of `src/server/routes/admin/` — no `content-types/`, `entries/`, `taxonomy/`, or `recovery/` route directory exists at all, and no `storage/plan`, `storage/confirm`, `storage/execute`, `storage/restore-points` routes exist either, despite the domain logic being fully implemented and tested in `src/features/`.

This means: **Collections and Categories & Tags cannot be built at all yet** — zero HTTP surface exists for either domain. **Storage** can show a working Timeline (list view only) but the "migrate forward" write action has no route. **Recovery** can show nothing live — no restore-point list route, no plan/confirm/execute routes, no deep-link resolution route. Every screen below is designed assuming its full backend contract *will* exist (per the ADRs and the `src/features/**` signatures actually read), with each screen's own section explicitly marking which pieces are blocked on route-wiring today. Programmer/Coordinator should treat "wire the missing admin routes over the existing `src/features/**` write-services" as a prerequisite work item that likely precedes or interleaves with this UI build, not a detail to discover mid-implementation.

### 0.5 Nav wiring (apps/admin/src/nav.ts)

`nav.ts` already has placeholder entries for 3 of the 4 screens, each `soon: true` with no `href`:

- `collections` (Content group) → wire to `#/section/collections`, drop `soon: true`.
- `taxonomy` (Content group, labeled "Categories & Tags") → wire to `#/section/taxonomy`, drop `soon: true`.
- `database` (Design & System group, labeled **"Database"**) → **rename label to "Storage"** before wiring (ADR-041's entire premise is "Storage, not Database" — shipping a nav item literally labeled "Database" directly contradicts the ADR's category-error argument). Wire to `#/section/storage`, drop `soon: true`.
- `backups` (Design & System group, labeled "Backups") → **rename label to "Recovery"** (ADR-045: Recovery supersedes Backups as a concept; there is no separate Backups screen — see §0.1). Wire to `#/section/recovery`, drop `soon: true`.

Keep `storage`/`recovery` adjacent in the same nav group (ADR-045 §5 Open Questions: "keeps them in one shared nav group with adjacent wording"), which the existing `database`/`backups` placement (both in "Design & System," adjacent) already satisfies — only the labels need to change, not the grouping.

`App.tsx`'s `route.sectionId` switch needs 4 new branches (`collections`, `taxonomy`, `storage`, `recovery`) added to the `case "section":` chain, following the exact same ternary-chain shape already used for `media`/`settings`/etc. `Collections` needs its own sub-route for entry detail (see §1.3) the same way `posts`/`post-editor` and `forms`/`form-editor` already have paired routes — add `{ view: "collection-entry-editor"; contentTypeKey: string; entryId: string | null }` to the `Route` union and a matching `parseHash` branch (e.g. `#/collections/{typeKey}/{entryId|new}`).

---

## 1. Collections (ADR-022, ADR-043)

### 1.1 What this screen is

A two-level registry: **content types** (operator-defined, e.g. "Recipe," "Product") each own a set of **entries** (the actual content rows). This is structurally a content-type builder sitting on top of a per-type entry list — closer to Airtable's "base → table → rows" shape than a flat CMS post list.

### 1.2 Layout — content-type list (landing view, `#/section/collections`)

```
[ H1 "Collections" + intro copy, matching .admin-content h1 pattern ]
[ editor-header: "New content type" button, right-aligned ]

[ list-table, one row per content type ]
  columns: Label · Key · Fields (count) · Queryable fields (count) · Status (pill) · Entries (count, link) · —
  row click / "Manage entries" link -> #/collections/{key}
  status pill classes: status-active (ok-bg/ok) · status-deprecated (surface-3/muted) · status-tombstone (danger-bg/danger)
```

Empty state (no content types registered yet): `.notice` — "No Collections yet. Create your first content type to start adding entries." + inline "New content type" button (mirrors `FormsList.tsx`'s `forms.length === 0` empty-state idiom exactly).

Loading state: `.notice` "Loading content types…" (mirrors every existing list screen's `if (!data) return <div className="notice">Loading…</div>` convention).

Error state: `.notice error` with the raw `ApiError`-derived message (mirrors `Media.tsx`/`FormsList.tsx`).

### 1.3 New / edit content type (modal or inline panel — recommend modal, matching `.settings-dialog` pattern)

Fields, per `ContentTypeFieldDef` (`src/features/content-types/types.ts`):

- `label` (text input, required)
- `key` (text input, required, grammar-constrained `^[a-z][a-z0-9_]{0,63}$` per ADR-043 §4 — validate client-side before submit to give a fast reject, but the server's `VALIDATION_ERROR` is the authoritative check, same disclosed pattern `Settings.tsx` uses for scope validation). **Reject `post`/`page` as a key client-side too** (ADR-043 §4's reserved-key rule) — show the error inline before hitting the network.
- Field-definition builder — a repeatable row list, one row per field:
  - `name` (text, same grammar constraint as `key`)
  - `kind` — a `<select>` over the **closed 5-entry enum** `CONTENT_TYPE_FIELD_KINDS = ["text","integer","real","boolean","datetime"]` (`content-types/types.ts`) — never a free-text kind field, this enum is closed by design (ADR-043 §4 round-3 correction: kind is interpolated into `CAST(... AS {type})`, never operator text).
  - `required` (checkbox)
  - `queryable` (checkbox) — label this with a short inline hint ("adds a database index; keep this list small") since ADR-022/ADR-043 both name queryable-field-count as a capped, cost-bearing choice, and there's a per-type cap enforced server-side (§ Failure modes, ADR-043) that the UI should not silently let an operator hit blind.
  - "Add field" / per-row delete (delete only reachable pre-save on the client for fields with no data yet; post-save field removal is a tombstone operation per ADR-043 Failure modes, "field removal is a tombstone, never a destructive drop" — surface that distinction in copy if a saved field's delete is clicked: confirm dialog reading "This field will stop accepting new values but existing entries keep their data" rather than a plain delete confirm).
- Save button calls `registerContentType` (create) — no `update` route exists yet for field-set edits beyond `updateContentTypeFields` (see backend note below).

**Lifecycle actions** (from a content type's detail context, e.g. a kebab menu on its list row): Deprecate / Reactivate / Tombstone, mapping directly to `deprecateContentType` / `reactivateContentType` / `tombstoneContentType` (`content-types/lifecycle.ts`). Each needs its own confirm dialog (reuse `.settings-dialog` pattern):
- **Deprecate**: "Existing entries stay readable; no new entries can be created." — non-destructive, single-click-confirm is acceptable.
- **Tombstone**: "Entries stop being served publicly. This is not reversible from this screen." — needs the same confirm-dialog weight `Media.tsx`'s trash/purge distinction uses (a plain confirm, not a token — tombstone is not the export-backed destructive cleanup step, which ADR-043 §6 describes as a *separate*, later-window action not yet in this UI's scope at all).
- Reactivate is a plain button, no confirm needed (reversing a non-destructive state).

### 1.4 Entries list (`#/collections/{typeKey}`)

Same `.list-table` shape as `Posts`/`FormsList`:

```
[ H1 "{Content type label}" — breadcrumb-style "Collections / {label}" above it ]
[ editor-header: "New entry" -> #/collections/{typeKey}/new ]
columns: Title · Slug · Status (pill: draft/published/unpublished) · Updated · —
```

Status pill values come straight from `EntryStatus` (`entries/types.ts`): `draft | published | unpublished`. Reuse `.status-draft` (exists) and add `.status-published`/`.status-unpublished` following the exact same token pattern already in `styles.css` (`--ok-bg`/`--ok` for published, `--surface-3`/`--muted` for unpublished — mirrors `.status-draft`).

### 1.5 Entry editor (`#/collections/{typeKey}/{entryId|new}`)

Mirrors `PostEditor.tsx`'s shape (not read in full this pass, but its role is confirmed by `App.tsx`'s route pairing convention) crossed with `Settings.tsx`'s dynamic-field-from-schema idiom:

- Title input (maps to `EntryRecord.title`) — same `.editor-title` styling as posts/pages.
- Body — TipTap editor bound to `EntryRecord.bodyJson`, reusing the exact `.editor-shell`/`.editor-toolbar`/`.editor-body` component set `PostEditor.tsx` already owns. **Do not build a second TipTap wiring from scratch** — extract/reuse.
- **Dynamic extension fields** — one form control per field declared on the parent content type (`ContentTypeFieldDef[]`), rendered into `fieldsJson.ext.site.{name}` on save:
  - `kind: "text"` → text input
  - `kind: "integer" | "real"` → number input (`step="1"` vs unset)
  - `kind: "boolean"` → checkbox
  - `kind: "datetime"` → `<input type="datetime-local">`
  - `required` fields get client-side required validation before submit; server validation (against the registry) is authoritative regardless, same disclosed-tradeoff pattern `Settings.tsx`'s header comment already documents for its own raw-JSON fallback.
- Publish/Unpublish/Save-draft actions map to `createEntry`/`updateEntry`/`publishEntry`/`unpublishEntry` (`entries/write-service.ts`). Publish/Unpublish are a `.status` pill toggle plus a confirm-free action button (these are reversible transitions, unlike content-type tombstone).
- Slug field, same `.editor-slug` treatment as posts/pages.

### 1.6 Taxonomy assignment on the entry editor

ADR-044 §4: a content type declares which taxonomies apply to it (an allow-list carried on the `content_types` registry). When a Collection's content type has taxonomies enabled, the entry editor needs a term-picker panel (checkbox/tag-multiselect against `terms` filtered to the allowed `taxonomyId`s) that calls `assignTerms`. **This is genuinely cross-screen wiring** between Collections and Categories & Tags — build it as a shared, reusable `<TermPicker>` component (not duplicated per screen) since Categories & Tags' own term-assignment UI (§2) needs the identical control.

### 1.7 States

| State | Treatment |
|---|---|
| Loading (type list, entry list, entry detail) | `.notice` "Loading…" text, matching existing convention |
| Empty (no content types) | `.notice` + CTA, mirrors `FormsList` |
| Empty (a type has no entries yet) | `.notice` "No entries yet in {label}." + "New entry" CTA |
| Error (any fetch) | `.notice.error` with server message |
| Validation error (key/field-name grammar, reserved key, queryable cap) | Inline field-level error text (`.save-error` class already exists), never a silent reject |
| Save-in-flight | Disable submit button, swap label to "Saving…" — exact `FormsList`/`Media` pattern (`disabled={uploading}` idiom) |

### 1.8 Accessibility

- Field-definition rows: each row is a `<fieldset>` with a `<legend>` reading "Field {n}" for screen-reader row boundaries — the repeatable-row pattern has no existing precedent in this codebase to copy, so it needs this from scratch.
- The `kind` `<select>` must have a visible `<label>`, not a placeholder (per `frontend-accessibility` skill's Understandable checklist).
- Lifecycle confirm dialogs: reuse `Settings.tsx`'s `ResetNamespaceDialog` shape exactly — `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, Escape-to-close, focus trap, `autoFocus` on the primary (non-destructive) button never the destructive one by default — actually for Tombstone, per accessibility guidance do NOT autofocus the destructive action; autofocus Cancel instead, deviating deliberately from `ResetNamespaceDialog`'s existing "autoFocus on the confirm button" pattern, because Tombstone is a heavier, less-reversible action than a settings-namespace reset.
- Status pills communicate lifecycle state by both text and color (never color-only) — already the existing convention, keep it.
- Dynamic field inputs must each carry a `<label htmlFor>`, not a placeholder-only affordance (several existing screens already violate this loosely with placeholder-only inputs in `Menus`/`Integrations` forms — do not repeat that gap here; this is new-build, hold it to the stricter standard).

### 1.9 Data / backend wiring

| Action | Backend function | Route status |
|---|---|---|
| List content types | needs a new `listContentTypes` read — **not found** in `content-types/` at all (only `registerContentType`, `updateContentTypeFields`, lifecycle transitions exist) | **Blocked** — no list route, arguably no list *function* yet either |
| Create content type | `registerContentType` (`write-service.ts`) | **Blocked** — no route |
| Edit fields | `updateContentTypeFields` | **Blocked** — no route |
| Deprecate/Reactivate/Tombstone | `content-types/lifecycle.ts` | **Blocked** — no route |
| List entries for a type | needs a new read — **not found** in `entries/` (only `createEntry`/`updateEntry`/`publishEntry`/`unpublishEntry` write-service exports exist) | **Blocked** — no route, no list function |
| Create/update/publish/unpublish entry | `entries/write-service.ts` | **Blocked** — no route |
| Assign terms | `taxonomy/write-service.ts` `assignTerms` | **Blocked** — no route |

**Flag for Coordinator:** this screen is fully blocked end-to-end today. Beyond route-wiring, a **list/read capability doesn't yet exist in the domain layer itself** for both content-types and entries (every file in both packages is write-side only) — this is more than "wire a route over an existing function," it's "the read-side of the domain layer needs building too." Surface this explicitly before scoping a Programmer dispatch's time estimate.

---

## 2. Categories & Tags (ADR-044)

### 2.1 What this screen is

Two seeded taxonomies (`category`, hierarchical; `tag`, flat) that any content type (built-in `post`/`page`, or a Collection) can opt into. This is a smaller, flatter surface than Collections — no per-taxonomy schema builder, just term management within the 2 (or more, if the schema is later extended to custom taxonomies — ADR-044's Open Questions leaves that possibility open but explicitly out of v1 admin UI scope) seeded taxonomies.

### 2.2 Layout — `Settings.tsx`-style two-pane

```
[ H1 "Categories & Tags" ]

[ two-column grid, mirrors .settings-body ]
  LEFT  .taxonomy-list           RIGHT  .taxonomy-detail-panel
  - "Categories" group            - selected term's detail:
    (hierarchical tree,             label, slug, parent (if hierarchical),
     indent = parentId depth)       status pill, "content tagged with this" count
  - "Tags" group                    (derived from entry_terms reverse index)
    (flat list)                   - Rename / Reparent (categories only) / Merge / Deprecate actions
  - "New term" button per group   - term picker is this exact panel, reused by Collections (§1.6)
```

Term rows use the same `.settings-row` click-to-select idiom as `Settings.tsx`'s `SettingRow` (click or Enter/Space to select, `aria-selected`, `.is-selected` background) — this exact interaction pattern already exists in the codebase and should be reused verbatim rather than re-invented.

Hierarchical rendering for `category` (the one taxonomy with `hierarchical: true`): indent child terms under parent using the same left-guide-rule technique `styles.css` already uses for nested menu items (`.menu-item-row[style*="margin-left"]` — a left border rule, not raw indentation alone, "so nesting reads visually").

### 2.3 New term / rename term (inline form or small modal — recommend inline, since this is a lighter action than Collections' content-type builder)

- `label` (text, required)
- `slug` (text, required, auto-suggested from label like other editors in this codebase already do — e.g. `PostEditor`'s pattern, not re-read this pass but a safe inference from `.editor-slug`'s existing UI shape)
- `parentId` — **only shown for the `category` group**, a `<select>` of existing category terms (excluding the term itself and its own descendants, to pre-empt the cycle-detection error ADR-044 Failure modes names — client-side filtering as a UX nicety, server remains authoritative). **Never shown for `tag`** — ADR-044 §4's hierarchy validation rejects a non-null `parentId` when `hierarchical=0`; don't even offer the control.

### 2.4 Merge term (destructive, needs explicit warning copy)

ADR-044's Failure modes section is explicit that merge is **not reversible** for deduplicated `entry_terms` rows ("that dropped assignment is permanently lost... Operators should be warned before merging"). This is a direct, binding copy requirement, not a suggestion:

```
[ Merge dialog, .settings-dialog pattern ]
  "Merge '{fromTerm}' into '{intoTerm}'?"
  "All content tagged '{fromTerm}' will be re-tagged '{intoTerm}'. If content already has both
   tags, the duplicate assignment is permanently lost — there is no way to recover which content
   had both tags after this merge. This cannot be undone."
  [ Merge ]  [ Cancel ]
```

Two-step backend flow per `taxonomy/merge-term.ts`'s exported functions: `planMergeTerm` → `confirmMergeTerm` → `executeMergeTerm` — this is a **plan/confirm/execute triple**, structurally identical in shape (though lower-stakes) to Recovery's restore ceremony (§4.6). Do not collapse it into a single button-click call; the UI needs to call all three in sequence (plan on dialog-open to preview the affected content count, confirm on the user's explicit merge click, execute after confirm succeeds) — mirrors the two-phase-gateway pattern this codebase already uses for Storage's migrate-forward (ADR-041 §3).

### 2.5 Deprecate term

Single confirm dialog, non-destructive framing ("Deprecated terms stay assigned to existing content but can't be assigned to new content.") — same weight as Collections' content-type Deprecate action (§1.3).

### 2.6 States

| State | Treatment |
|---|---|
| Loading | `.notice` "Loading taxonomies…" |
| Empty (no terms in a taxonomy yet) | `.notice` inline under that group's heading — "No {categories/tags} yet." |
| Error | `.notice.error` |
| Cycle-detection rejection (reparent) | Inline `.save-error` under the `parentId` select, using the server's `VALIDATION_ERROR` message verbatim (same disclosed-honesty pattern `Settings.tsx` already uses for its own server-authoritative validation) |
| Cross-workspace / lens-mismatch rejection (assignTerms) | Should never be user-reachable from this UI (the picker only ever offers same-workspace terms) — if it somehow surfaces, treat as a generic `.notice.error`, not a special state, since it indicates a client-side bug rather than an expected user path |

### 2.7 Accessibility

- Reuse `Settings.tsx`'s exact `SettingRow` keyboard pattern (`tabIndex={0}`, `onKeyDown` handling Enter/Space, `role="listitem"`/`aria-selected`) for term rows — do not re-derive this from scratch, copy the working pattern.
- Hierarchical tree rows: add `aria-level` reflecting depth and `role="treeitem"`/`role="tree"` on the container if the nesting depth ever exceeds 1-2 levels in practice; for the shallow depth categories realistically have in v1, a simple `aria-label` stating "{label}, subcategory of {parent label}" on each indented row is a lighter, equally-compliant alternative — Programmer's call based on how deep real category trees turn out to be.
- Merge dialog: focus starts on **Cancel**, not Merge (same non-default-to-destructive rule as Collections' Tombstone dialog, §1.8).

### 2.8 Data / backend wiring

| Action | Backend function | Route status |
|---|---|---|
| List taxonomies + terms | No read function found in `taxonomy/` (only `write-service.ts`'s mutations and `merge-term.ts`) | **Blocked** — no route, no list function |
| Create taxonomy/term | `createTaxonomy` / `createTerm` | **Blocked** — no route |
| Rename term | `renameTerm` | **Blocked** — no route |
| Reparent term | (validated by `validation-chain.ts`, exported as part of the write-service surface per ADR-044's sample — confirm exact export name at implementation time, the write-service listing shows `assignTerms`/`renameTerm`/`createTaxonomy`/`createTerm`/`onContentDeleted` but reparent's own top-level export wasn't found by name in this pass — flag for Programmer to double check) | **Blocked** — no route |
| Merge term | `merge-term.ts`: `planMergeTerm`/`confirmMergeTerm`/`executeMergeTerm` | **Blocked** — no route |
| Assign terms to content | `assignTerms` | **Blocked** — no route |
| Deprecate term | Not found as a distinct exported function in this pass — `terms.status` column exists per ADR-044's schema sample, but the write-service export list captured doesn't show a `deprecateTerm` — flag for Programmer to verify | **Blocked** — no route, function existence itself unconfirmed |

**Flag for Coordinator:** same shape as Collections — fully blocked, and (like Collections) the **read/list side of the domain layer appears not to exist yet**, not just the route layer. Confirm this precisely before scoping build time.

---

## 3. Storage — Timeline (ADR-041)

### 3.1 What this screen is

A **read-first** ledger view (never a database console — ADR-041 §1's "Why Storage, not Database" is a hard constraint, not a preference) plus exactly one write action: "migrate this site forward now." No raw row edit, no SQL console, ever, in this screen or any future iteration of it.

### 3.2 Layout

```
[ H1 "Storage" + intro copy: "A read-first record of every migration, snapshot, index change, and
   template upgrade on this site." ]

[ DRIFT BANNER — conditional, sits above the timeline, only rendered when drift is ahead|diverged ]
   "This site's schema is ahead of / diverged from what's on disk. Forward-migrate to resolve."
   [ Review migration ] button -> opens the migrate-forward flow (§3.4)

[ FILTER BAR ]  kind (select) · outcome (select) · date range (from/to) — mirrors query params
   getTimeline() already accepts (kind, outcome, fromDate, toDate, cursor, limit)

[ TIMELINE — .list-table, newest first, cursor-paginated ("Load more" button, not infinite scroll,
   matching this codebase's lack of any existing infinite-scroll precedent) ]
   columns: Kind (badge) · Outcome (status pill) · Restore point (link if non-null, "—" if null) · Time
   kind values (LedgerRow.kind, from src/features/storage/timeline.ts's port contract):
     core.migration | plugin.ddl | index.provision | index.drop | template.upgrade |
     restore_point.created | restore.executed | migration.interrupted
   NOTE: index.provision/index.drop rows have restorePointId=NULL by design (ADR-041 §4's ADR-023 §4
   carve-out) — render "—" for these, never a broken link or an error state.
```

### 3.3 Migrate-forward action

- Entry point: a persistent "Migrate forward" button in the page header, disabled (not hidden) with a tooltip/inline note when no migration is pending — never a dead button with no explanation.
- Flow (ADR-041 §3's two-phase gateway, `plan → confirm → execute`):
  1. **Plan** (read-only, `storage.read`) — shows target schema version/tag, `quiesceIntegrity` note (surface the literal string when `'chokepoint-only'` is present — ADR-041 §9's "known residual, not a defect" language: *"A Tier-3 plugin is enabled on this site. '0 discarded' is guaranteed only for chokepoint-visible writes while a plugin like this runs."*), and — when `costClass === 'expensive'` — a cost/disk estimate the confirmer must explicitly acknowledge before proceeding (checkbox, not implicit).
  2. **Confirm** (`storage.migrate`) — mints a single-use, ~10-minute-TTL token. UI shows a countdown or at minimum states the token's time-limited nature, since a stale confirm re-triggers `PLAN_STALE` server-side and the UI needs a clear retry path for that rejection rather than a generic error.
  3. **Execute** — a **blocking, non-dismissable progress panel** (ADR-045 §3 Step 4's language, same requirement applies here) reflecting the live state machine (`IDLE→PLANNED→CONFIRMED→QUIESCING→SNAPSHOTTING→APPLYING→VERIFYING→JOURNALING→DONE` for SQLite, the longer blue/green sequence for Postgres). Poll or stream state from the sidecar journal — **never assume success from a one-shot response**, per ADR-045 §4's identical requirement for Recovery's own progress panel (a page refresh mid-migration must not lose state).
- `costClass === 'unavailable'`: the migrate button is **replaced by a runbook pointer**, never rendered as a disabled/dead button (ADR-041 §2's "no attestation override," restated verbatim as a UI requirement in ADR-045 §4).

### 3.4 `PENDING_MIGRATION` boot state

If the site boots into `PENDING_MIGRATION` (ADR-041 §10), Storage is where the operator resolves it — this is the interactive plan→confirm→execute flow described above, not a distinct UI. Render a page-level banner (reuse the drift-banner treatment, §3.2) stating public serving is refused until this completes, with the migrate-forward flow as the single action. (Recovery links here for this exact state per ADR-045 §4 — see §4.4.)

### 3.5 Tier-3 read-only browser (ADR-041 §8)

**Off by default, deliberately out of this pass's primary scope** — it's an optional, permission-gated (`storage.read` on site-scope-exempt tables specifically) secondary surface. If Programmer builds it this pass: a simple `describeTables()` → `readRows({table, where, orderBy, cursor, limit≤200})` list+table view, bounded predicate builder (never a free-text SQL input — `readRows`'s `where` uses ADR-022's bounded expression language only). **Sensitive columns are excluded server-side before the row ever reaches the client** (ADR-041 §8's mandatory redaction) — the UI does not need its own redaction logic, but should also never assume a column is present just because a table is; render only what the response actually contains. Recommend deferring this sub-feature to a follow-up pass given it's explicitly optional and off-by-default in the ADR — flag this recommendation to Coordinator rather than deciding unilaterally.

### 3.6 States

| State | Treatment |
|---|---|
| Loading | `.notice` "Loading timeline…" |
| Empty (no ledger rows yet — a brand-new site) | `.notice` "No storage activity recorded yet." |
| Error | `.notice.error` |
| Drift (ahead/diverged) | Persistent banner, see §3.2 |
| `PENDING_MIGRATION` | Full-width blocking banner, see §3.4 |
| Migration in flight | Blocking progress panel, non-dismissable, see §3.3 step 3 |
| `costClass: unavailable` | Migrate button replaced by runbook link, never a dead button |

### 3.7 Accessibility

- Filter bar controls need visible `<label>`s (not placeholder-only) — same rule as every other screen in this spec.
- The blocking progress panel during migration must be an `aria-live="assertive"` region (state changes are safety-critical, unlike Settings' `aria-live="polite"` save-confirmation toasts) — trap focus inside it while non-dismissable, same as a modal dialog per the `frontend-accessibility` skill's keyboard-trap rules, but only for the duration the operation is genuinely non-cancelable.
- Status/kind pills: text + color, never color-only (existing convention, keep it).
- "Load more" pagination button, not a keyboard trap, focus stays put after load (append below current scroll position, matching ordinary list-append UX, not resetting scroll to top).

### 3.8 Data / backend wiring

| Action | Backend function | Route status |
|---|---|---|
| List timeline | `getTimeline` (`storage/timeline.ts`) | **Wired** — `GET /api/admin/v1/storage/timeline` exists and is the one real route in this entire 5-screen scope |
| Plan migrate-forward | (state machine in `storage/migrate-forward/state-machine.ts`, execute in `execute.ts`) | **Blocked** — no route |
| Confirm / execute migrate-forward | `executeMigrateForward` (`migrate-forward/execute.ts`) | **Blocked** — no route |
| Create restore point (ad hoc, not migration-triggered) | `createRestorePoint` (`storage/restore-points.ts`) | **Blocked** — no route |
| Drift status | `getDriftStatus` (`storage/drift.ts`) | **Blocked** — no route (needed for the drift banner, §3.2) |
| Tier-3 browser | `describeTables`/`readRows` (`storage/tier3-browser.ts`) | **Blocked** — no route (also recommended deferred, §3.5) |
| Boot policy / interrupted-migration state | `evaluateBootMigrationPolicy`/`reconcileInterruptedMigrationOnBoot` (`storage/boot/`) | Server-boot-time logic, not directly UI-called — the UI needs a way to *read* the resulting state (`PENDING_MIGRATION`, `migration.interrupted`), which isn't exposed by any route today |

**This is the one screen that's partially buildable today.** Build the Timeline list view (§3.2, filter bar + table + pagination) against the real wired route now. Everything else in this section (migrate-forward flow, drift banner needing live drift data, PENDING_MIGRATION banner, Tier-3 browser) is blocked on new routes and should be built as a second pass once those routes exist, or stubbed behind a feature flag if Programmer wants to ship the read-only Timeline sooner.

---

## 4. Recovery (ADR-045)

### 4.1 What this screen is

The single most consequential screen in the admin (ADR-045's own words) — restore-point management and the destructive restore ceremony. Per §0.1, this is **one screen with two views**: a restore-points list (the "Backups" list) and a restore-flow (the "Recovery" ceremony for a selected point).

### 4.2 Layout — full structure, per ADR-045 §3 verbatim

```
[ CAPABILITY / STATUS BAR ]
   costClass: cheap|expensive|unavailable  ·  in-flight operation indicator (blocking if true)

[ DEGRADED BANNER — conditional, single highest-precedence banner only, per
  src/features/recovery/ui/degraded-banners.ts's resolveDegradedBanner() precedence: ]
   1. migration-interrupted  (highest)
   2. pending-migration
   3. operation-in-flight
   4. cost-unavailable
   5. watermark-baseline-unavailable  (lowest)
   -> exact accessibleText strings are defined in degraded-banners.ts; use them verbatim, don't
      re-author the copy (see §4.4 below for the literal text + required action per banner)

[ RESTORE POINTS LIST — newest-first, .list-table ]
   columns: Timestamp · Trigger (pre-migration auto | manual | template upgrade) ·
            Captured schema (version+tag) · Size · Cost class (badge) · —
   row click -> selects the point, opens the restore-flow panel below (or navigates to a
   sub-view — Programmer's call on modal-vs-inline, but keep it a single screen/route either way)
   costClass:'unavailable' rows: render as a plain read-only marker, replace any per-row
   "Restore" action with a runbook-pointer link, never a dead button (mirrors §3.3's identical rule)

[ SELECTED RESTORE POINT -> RESTORE FLOW, once a point is selected ]
   Step 1  Plan       preview target schema, quiesceIntegrity note, cost/disk estimate
   Step 2  DISCLOSURE  (see §4.3 — the load-bearing, blocking centerpiece of this screen)
   Step 3  Confirm     mint human token (every actor, including the owner — no exception)
   Step 4  Execute     blocking, non-dismissable progress panel, live state machine
                        (QUIESCING -> SNAPSHOTTING -> RESTORING -> RESTORED|RESTORE_FAILED)
   Step 5  Completion  deep-link back to Storage Timeline (the incident thread closes)
```

### 4.3 Step 2 — the discarded-write-window disclosure (the screen's core UX problem)

This is not a summary line. Build it as its own dedicated, full-width panel the user cannot scroll past without engaging:

```
"Since {restorePoint.capturedAt}, restoring here would discard at least:
  · {count.posts_pages} posts/pages writes
  · {count.plugin_table} plugin-table rows
This covers watermark-stamped write paths only (posts/pages and plugin-table writes today) and
is NOT a complete count of everything written since this restore point — change-sets, taxonomy
writes, Collections entries, and sessions are not yet counted here. See {link to ADR-041's
write-path-inventory status} for what's covered."

[ ] I understand this count is partial, not exhaustive, and accept the loss window described above.
    (checkbox — must be checked before "Continue to confirm" enables)
```

**Binding constraints from `computeDisclosure`'s actual contract (`recovery/disclosure.ts`), read directly, not paraphrased from the ADR:**

- `coveredCategories` is a fixed, versioned list — **render only what the response's `counts` object actually contains**, never invent a row for a category the response doesn't include (e.g. do not pre-render a "Collections entries" row with a placeholder — ADR-045 §3's round-2 fold explicitly forbids naming `entries` here until its write path is watermark-stamped, which it isn't yet).
- `counts[category]` is typed `number | "unknown"` — **render `"unknown"` distinctly from `0`**. Suggested copy: "at least an unknown number of {category} writes" vs. "0 {category} writes" — these are not interchangeable, a `0` implies verified-zero-loss while `"unknown"` means the baseline couldn't be computed at all (`content.db` unreadable, or the restore point predates the `watermarkAtCapture` column). Never silently coerce `"unknown"` to `0` or omit the row — that's the exact false-reassurance failure mode ADR-045's Failure modes section names as "the highest-stakes UX failure in this whole feature."
- The acknowledge checkbox's label must reference the partial-coverage caveat explicitly, not just "I understand this will discard data" — the checkbox is acknowledging *partiality*, not just *loss*, per ADR-045 §2's binding correction ("+ explicit acknowledge checkbox (acknowledges the partial-coverage caveat, not just the number)").

### 4.4 Degraded banners — exact copy and required action, from `degraded-banners.ts`

| Banner kind | Text (verbatim from source) | Required action |
|---|---|---|
| `migration-interrupted` | "A migration was interrupted mid-run. This is a real, accepted planned downtime vector, not a bug — resolve it to reopen normal Storage/Recovery navigation." | Single unblock button (`unblock-interrupted-migration`) |
| `pending-migration` | "This site is pending a schema migration before normal public serving can resume. Resolve it from Storage's own migration ceremony." | Deep-link to Storage's migrate-forward flow (`deep-link-to-storage-migration`) — **never a restore action**. Recovery does not get its own migration UI; a restore from Recovery does not clear this state even after completing (ADR-045 §4, explicit — restoring to an older snapshot doesn't resolve schema drift against the current runtime) |
| `operation-in-flight` | "An operation is already in progress for this site. A second migrate or restore cannot start until it finishes." | No action (`none`) — informational only, blocks the restore-flow's own entry points |
| `cost-unavailable` | "No restore-point mechanism is available for this site. See the runbook for external backup guidance." | No action (`none`) — this is why individual restore-point rows also lose their per-row Restore button, §4.2 |
| `watermark-baseline-unavailable` | "The discarded-write-window baseline could not be computed for this site right now." | No action (`none`) — Step 2's disclosure (§4.3) must show "unknown" for every category in this state, not a plain warning banner substituting for the itemized disclosure |

Use these strings verbatim as each banner's accessible text — they're already written to be screen-reader-appropriate (`accessibleText` field name in the source itself signals this is the intended a11y string, not just visual copy).

### 4.5 Deep-link arrival (ADR-041 §7 / ADR-045 §5)

When Recovery is reached via a `StorageContextEnvelope` (e.g. from a Site-Health storage card or a Storage Timeline row), the UI:
- Renders the envelope's carried context for **display continuity only** (e.g. pre-scrolling/pre-selecting the relevant restore point) — never trusts it as authoritative.
- On arrival, calls `resolveDeepLinkContext` (`recovery/deep-link.ts`) to re-look-up the restore point server-side. If `found: false` (stale/forged/pruned envelope), fall back to the plain restore-points list with no pre-selection and no error-toast alarm — a stale deep link is an expected, non-exceptional case per the source's own framing ("resolves to `{found:false}` rather than proceeding"), not a failure state needing scary red copy.
- On completion (Step 5), deep-link back to the Storage Timeline, minting continuity the same direction.

### 4.6 States (screen-wide, beyond §4.4's banners)

| State | Treatment |
|---|---|
| Loading restore-points list | `.notice` "Loading restore points…" |
| Empty (no restore points exist yet) | `.notice` "No restore points yet." — do not imply this is an error state, a brand-new site legitimately has none |
| Error (any fetch) | `.notice.error` |
| `PLAN_STALE` rejection at confirm/execute | Explicit inline message distinguishing "the underlying state changed since you started" from a generic error — offer a "Re-plan" action that restarts at Step 1, not a dead-end error |
| Confirm token expired (10-min TTL from Storage's ADR-041 §3, same shape applies here) | Explicit "Your confirmation expired — start over" message with a one-click restart at Step 1, not silent failure |
| Restore execution failure (`RESTORE_FAILED`) | Non-panic framing — ADR-041's boot reconciliation and forensic re-snapshot mean a failed/regretted restore is itself reversible; state this plainly rather than presenting a bare failure |

### 4.7 Accessibility

- Step 2's disclosure panel and its checkbox: the checkbox's `disabled`/`aria-disabled` state on the "Continue" button must be reflected via `aria-describedby` pointing at the disclosure text, not just a visually-disabled button — a screen-reader user needs to know *why* Continue is inert.
- The Step 4 execute progress panel: identical `aria-live="assertive"` + focus-trap treatment as Storage's migration progress panel (§3.7) — this is the more consequential of the two, treat it at least as strictly.
- Confirm step's token/actor-class requirement ("every actor, including the owner") means there is no UI path that skips human confirmation, ever, even for a site-admin — do not build a "quick restore" shortcut (ADR-045's own Open Questions explicitly declines to build one for v1: "this ADR defaults to uniform ceremony (no shortcut)").
- Degraded banners: role="alert" or `aria-live="polite"` depending on severity — `migration-interrupted`/`pending-migration` (blocking, action-required) should be `role="alert"` (assertive); `operation-in-flight`/`cost-unavailable`/`watermark-baseline-unavailable` (informational, non-blocking-of-navigation) can be `aria-live="polite"`.

### 4.8 Data / backend wiring

| Action | Backend function | Route status |
|---|---|---|
| List restore points | Not found as a distinct read export in `storage/restore-points.ts` (only `createRestorePoint`) or anywhere in `recovery/` — needs a new read function | **Blocked** — no route, no list function |
| Plan restore | `planRestore` (`recovery/recovery-orchestrator.ts`) | **Blocked** — no route |
| Confirm restore | `confirmRestore` (`recovery/recovery-orchestrator.ts`) | **Blocked** — no route |
| Execute restore | `executeRestore` (`recovery/recovery-orchestrator.ts`) | **Blocked** — no route |
| Discarded-window disclosure | `computeDisclosure` (`recovery/disclosure.ts`) | **Blocked** — no route |
| Degraded banner precedence | `resolveDegradedBanner` (`recovery/ui/degraded-banners.ts`) — this one is pure client-computable logic (takes a `capabilities` object, returns the banner) once the capability inputs themselves are fetched | **Function is UI-portable as-is** (no I/O), but its **inputs** (`costClass`, `operationInFlight`, `pendingMigration`, `migrationInterrupted`, `watermarkBaselineAvailable`) all come from routes that don't exist yet |
| Deep-link resolution | `resolveDeepLinkContext` (`recovery/deep-link.ts`) | **Blocked** — no route |

**Flag for Coordinator: this is the most fully-blocked of all 4 screens** — every single data need, including the read-side, requires new routes, and (like Collections/Categories & Tags) some of the underlying read functions don't exist in the domain layer yet either (restore-point listing specifically). Recovery cannot render anything beyond static layout/copy until this route work lands. Given ADR-045's own framing ("the single most consequential, most carefully-designed screen in the admin"), recommend this screen's route-wiring work be sequenced deliberately rather than left to fall out incidentally from whatever else gets wired first.

---

## 5. Summary handoff table

| Screen | Buildable today (real data) | Blocked on | Recommended build order |
|---|---|---|---|
| Storage (Timeline list view only) | Yes — `GET /storage/timeline` is wired | Migrate-forward flow, drift banner, PENDING_MIGRATION banner, Tier-3 browser all need new routes | 1st — ship the read-only Timeline now, layer in the write flow once routed |
| Collections | No | Full route layer + read-side domain functions for both content-types and entries | 2nd or 3rd, contingent on route-wiring sprint |
| Categories & Tags | No | Full route layer + read-side domain functions for taxonomies/terms | 2nd or 3rd, alongside Collections (shares the `<TermPicker>` component, §1.6/§2) |
| Recovery | No | Full route layer, including some read-side functions (restore-point listing) not yet built at all | Last — highest stakes, most blocked, most worth getting right rather than fast |

## 6. Open design questions (not resolved by the ADRs, flagged rather than decided unilaterally)

- Collections' content-type builder: modal vs. dedicated route for the "New content type" flow — recommended modal (§1.3) for parity with `Settings.tsx`'s dialog pattern, but a dedicated `#/collections/new` route is equally defensible if the field-builder grows complex; Coordinator/Programmer call.
- Recovery's restore-points list vs. restore-flow: modal-over-list vs. inline-expand vs. full sub-view swap (§4.2) — ADR-045 doesn't specify the interaction mechanics, only the information architecture. Given the stakes, recommend a full inline swap (list disappears, restore-flow takes the full content area) rather than a modal-over-list, so there's no ambiguity about whether the underlying list is still "live" during a destructive ceremony.
- Whether the Tier-3 read-only browser (§3.5) ships this pass at all — ADR-041 marks it off-by-default and optional; recommend deferring to a follow-up.
