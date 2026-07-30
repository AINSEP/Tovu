# Section Design — Menus / Navigation (`navigation` Tier-2 core library)

- Date: 2026-07-10
- Author: autonomous Opus 4.8 sweep agent (design-only; no peer debate, no external audit)
- Companion ADR: [ADR-029](../architecture/ADR-029-menus-navigation.md) (PROPOSED)
- Brief: `todos.md` → "⛔ BLOCKER — Admin Section Spec Sweep" → *Menus — navigation trees as editable content (`navigation` lib, tier 2)*
- Typed interfaces (compile-checked): `src/navigation/{types,ports,contracts,index}.ts`

---

## 1. Competitor-lite orientation

How the four reference CMSes model menus, and the one lesson each teaches Tovu.

| CMS | Menu model | Item targets | Location model | Lesson for Tovu |
|---|---|---|---|---|
| **WordPress** | `nav_menu` is a **taxonomy term**; items are **posts** (`nav_menu_item`) with label/url/parent/order in **`postmeta`** | entry/term/custom URL (post-meta keyed) | `theme_mod['nav_menu_locations']` map; **assignments lost on theme switch** | The two sins to avoid: EAV `postmeta` (unqueryable, no integrity) and losing assignments on theme change. |
| **Ghost** | Navigation is **site settings** — a flat JSON array of `{label, url}` on the settings object; two fixed slots (primary/secondary) | URL strings only (no entry refs, no integrity) | Two hardcoded slots | Simplicity is seductive but too flat: no nesting, no referential integrity, no per-entry where-used. Tovu wants more. |
| **Directus** | No first-class menu; you model it as a **collection** (a relational table you define) + M2A relations | whatever you relate (relational FKs) | app-side | Relational items give integrity + queryability — but making the *user* build the schema is not a CMS menu feature. Tovu should give the relation for free. |
| **Payload** | Menus are a **custom collection/global** the developer defines; nested via array/blocks fields | relationship fields (real refs) | developer-wired | Nested array/blocks-in-a-document is a clean nesting model — Tovu's `bodyJson` tree is the same idea, but *seeded*, not hand-rolled per project. |

**Synthesis.** Ghost proves menus-as-content is viable and pleasant; WP proves *how
not* to store it and *how not* to bind locations; Directus/Payload prove that
relational item targets (real refs) are what buy integrity and where-used. Tovu's
ADR-022 already has the exact primitives that give all of this **for free**: entries
(identity + revisions + validated JSON body), `entry_refs` (rebuildable ref index =
integrity + where-used), and taxonomy. The design is therefore mostly *reuse*, plus
the one thing none of the primitives express: a uniqueness-enforcing location binding.

---

## 2. Tier rationale (§3.5)

`tovu-v2-design.md` §3.5 lists `navigation` in the **Tier-2 core library** table
("widgets-and-menus (menus half) → `navigation`"). The placement rule: *"tier 2 is
anything ≥80% of sites need and plugins must build on … Tier 3 is anything a
meaningful fraction of sites disable or replace."*

- **≥80% need it:** effectively every site renders a header/footer menu.
- **Plugins/themes must build *on* it:** themes render menus at declared locations;
  plugins add locations and filter items. It is a substrate, not a feature bolt-on.
- **Not disable/replace-able:** a site with no navigation is broken, not lean —
  unlike comments/feeds/search (the Tier-3 exemplars, which many sites drop).

⇒ **Tier-2 core library.** Confirmed, not borderline. (The §3.5 tie-breaker "when in
doubt, start it as a bundled plugin" does not bite — there is no doubt.)

---

## 3. The design in prose

A **menu is an ADR-022 content entry** of the seeded type `menu`. Its universal
columns carry identity (`id`, `workspaceId`, `slug` = machine handle like
`primary-nav`, `title` = human name, `status`, `version`, `updatedAt`). Its
**ordered, nested item tree lives in the entry's validated `bodyJson`** as a
`navigation` block vocabulary: `{ type: 'menu', version, items: NavItemNode[] }`,
where ordering is array order and nesting is `children`. Each item has a **stable
ULID** (preserved across reorders), an editable `label`, a discriminated `target`,
optional presentational `attrs`, and `children`.

Targets are one of four kinds: **`entryRef`** and **`termRef`** (link to a content
entry or a taxonomy term — *integrity-tracked*), **`url`** (external, validated),
and **`route`** (named core route). The two ref kinds are extracted at the ADR-022
**write chokepoint into the rebuildable `entry_refs` index** — the identical
mechanism ADR-027 §5 reuses for media — which yields **where-used**, **safe-delete
signaling**, and rebuildability with zero new machinery.

Because the whole tree is one JSON body under one entry `version`, editing a menu is
a **whole-tree replace** → a **whole-menu revision** (undo a reorganization in one
revert) and **clean optimistic concurrency** (two concurrent editors collide on the
entry version, no per-item position race). This is the crux of choosing **entry-
native over an item sidecar table**: menu items are *editorial* state the human wants
revisioned and *never* queried individually — the mirror image of media renditions,
which are machine state queried per-URL and therefore correctly sidecar'd in ADR-027.

**Location assignment** — which theme slot ("primary", "footer") a menu fills — is a
*relation*, and ADR-022 §5 says relations live in real tables. The source of truth is
a revisioned menu field (`fields.ext.navigation.locations: string[]`); the derived,
rebuildable **`nav_location_bindings`** table (`UNIQUE (workspace_id, location_key)`)
is the projection that gives a fast location→menu lookup **and** enforces
exactly-one-menu-per-location (a cross-entry constraint a JSON field can't express).
Both are written in the same chokepoint transaction; the index tolerates location
keys whose theme is gone, so **assignments survive a theme switch** — the direct fix
for WP's worst nav papercut.

**Rendering:** the theme renderer calls `resolveForLocation(location)` and receives a
fully-resolved `ResolvedNav` — hrefs computed by routing, labels filled, active-state
computed, unavailable (trashed) targets flagged. The theme renders *data*, never
resolving refs or touching storage (ADR-020 §6). Declarative themes get a `nav`
component node; Liquid themes a `nav` drop over the same model.

**Ports (ADR-006, honest):** exactly one new port — `NavLocationBindingRepoPort`
(in-memory + SQLite, one built now, matching every repo in the tree). Menus add no
persistence port (they are entries). The target resolver and read model stay
one-evaluator typed calls (ADR-009 §1), following ADR-021 §2's refusal to port a
single evaluator.

**Surfaces:** flat `navigation.*` permissions (`assign`/`delete.force` split out as
higher-trust), enforced by `authorize()` at the gateway; outbox events for cache/
search/AI; three declared hook points for extension; AI tools as clients of the same
handlers (HITL for writes). All standard ADR-021/009/027 patterns.

---

## 4. Alternatives considered

1. **Menu items as a core sidecar table (`nav_menu_items`), the literal ADR-027
   shape.** *Rejected as primary.* Items are editorial (want whole-tree revisions +
   clean OCC) and small (no per-item query surface). A sidecar would duplicate the
   revision machinery or narrow INV-3 for no query benefit. **Kept as the documented
   fallback** if per-item indexed queries ever become real (Open Q4).
2. **Single-location scalar + plain expression index, no new table.** Store
   `fields.ext.navigation.location: string` and use an ADR-022 §3 expression index to
   find the menu for a location; drops the port entirely. *Rejected* because it
   forbids a menu in multiple locations and cannot enforce exactly-one-menu-per-
   location (no cross-entry uniqueness). Logged as Open Q2 — a legitimate simpler
   alternative for the debate.
3. **Menus as a settings ledger entry (ADR-028).** *Rejected.* Menus are editorial
   content with nesting/refs/revisions, not scoped key/value config; ADR-028 killed
   settings-*as-entries* for authority reasons and the inverse (content-as-settings)
   is worse — you'd lose `entry_refs`, taxonomy, and the content revision UI. Location
   *assignment* is settings-shaped, but even it benefits from the chokepoint/refs, so
   it rides the menu entry field (Open Q3 keeps the ADR-028 seam visible).
4. **A bespoke `navigation` own-table subsystem (menus + items + bindings all custom
   tables).** *Rejected.* Reinvents revisions/refs/chokepoint that ADR-022 already
   provides; violates "reuse entries where it fits"; only justified if menus were
   relational-heavy at scale (they are not — a menu is tens of items).
5. **The WP model verbatim (menu = term, item = post + postmeta).** *Rejected
   explicitly* — this is the postmeta swamp ADR-022 exists to kill.

---

## 5. Implementation Proposal

### 5.1 Modules to add (current tree: `src/features/navigation/`; §4 aspirational: `packages/core/src/lib/navigation/`)

> ADR-029 ships only the **interface/type** files (already written + typechecked):
> `src/navigation/{types.ts, ports.ts, contracts.ts, index.ts}`. The files below are
> the *implementation* the phases fill in. (The interface files are placed at the
> brief-specified `src/navigation/`; the eventual home follows repo convention
> `src/features/navigation/`.)

- `navigation/navigation.ts` — command handlers (`createMenu`, `updateMenu`,
  `assignLocation`, `unassignLocation`, `trashMenu`, `purgeMenu`), the tree validator
  (bounded/total), and the `NavTargetResolver` + `NavMenuReadModel` implementations.
  Mirrors `features/post/post.ts` (deps-in, pure, throws typed errors).
- `navigation/repo.memory.ts` + `navigation/repo.sqlite.ts` — the two
  `NavLocationBindingRepoPort` adapters (mirror `presentation/repo.{memory,sqlite}.ts`).
- `navigation/validator.ts` — the bounded tree validator (depth/breadth caps,
  id-stability, target-shape, `url` scheme allowlist).
- `navigation/index.ts` — public surface (already stubbed type-only).
- **Registry seed** (in `server/seed.ts`, an existing file — *described here, not
  edited by this sweep*): seed the `menu` content-type registry row + a starter
  `primary-nav` menu.
- **Routes** (in `server/routes/admin/navigation/*` + `server/http/admin/*`): CRUD +
  assign endpoints, all going through the command gateway.
- **Render wiring** (in `server/http/site/render.ts`): a `nav` component/slot that
  calls `resolveForLocation`.

### 5.2 Schema / DDL sketch

Menus reuse the ADR-022 `entries` table (no DDL). The one new core table (core
migration engine, ADR-015 — **not** ADR-023, which is the *plugin* path):

```sql
-- Derived, rebuildable location→menu index. Source of truth is the menu entry's
-- fields.ext.navigation.locations; this projection enforces uniqueness + fast lookup.
CREATE TABLE nav_location_bindings (
  workspace_id  TEXT NOT NULL,
  location_key  TEXT NOT NULL,
  menu_id       TEXT NOT NULL,
  bound_at      TEXT NOT NULL,             -- ISO-8601; audit/debug only
  PRIMARY KEY (workspace_id, location_key),-- exactly one menu per location
  -- ADR-021 §4 composite workspace-isolated FK into entries(workspace_id, id):
  FOREIGN KEY (workspace_id, menu_id) REFERENCES entries(workspace_id, id)
);
CREATE INDEX idx_nav_binding_menu ON nav_location_bindings(workspace_id, menu_id);
```

Reused, no DDL: `entries` (the menu row + `bodyJson` tree), `entry_refs` (target
integrity + where-used), the revision log (whole-menu revisions), `content_types`
(the seeded `menu` registry row). Menu-level extension fields validated on write:
`fields.ext.navigation.locations: string[]`.

The seeded `menu` content-type registry row (data, not DDL):

```jsonc
{
  "type": "menu",
  "queryableFields": [],            // items live in bodyJson; no per-item expr index in v1
  "taxonomies": [],                 // opt-in later; not needed for v1
  "bodyValidator": "navigation.menuDoc@1",
  "extFields": {
    "navigation.locations": { "type": "string[]", "validate": "locationKeys" }
  }
}
```

### 5.3 Permission strings (ADR-021)

`navigation.read`, `navigation.create`, `navigation.update`, `navigation.delete`,
`navigation.delete.force`, `navigation.assign`, `navigation.manage` — registered in
the code-side catalog, enforced by `authorize()` at the gateway before the
idempotency short-circuit. (`assign` and `delete.force` are split as higher-trust,
per the ADR-027 precedent.)

### 5.4 Hooks + events

- **Hooks (sync):** `navigation.item.resolve`, `navigation.tree.filter`,
  `navigation.locations.register`.
- **Events (outbox):** `navigation.menu.{created,updated,deleted}`,
  `navigation.location.{assigned,unassigned}`.

### 5.5 Phased plan

- **Phase A — seed + read-only render.** Seed the `menu` type + a starter menu;
  implement the tree validator, `resolveForLocation`, the in-memory
  `NavLocationBindingRepo`, and a `nav` render node. *Exit: a seeded primary menu
  renders in a declarative theme from resolved data.*
- **Phase B — authoring through the chokepoint.** Menu CRUD via the command gateway
  (create/update/trash) with whole-tree revisions, `entry_refs` extraction, and
  binding-index maintenance in-transaction; register `navigation.*` + `authorize()`;
  SQLite `NavLocationBindingRepo`. *Exit: admin creates/edits/reorders a nested menu,
  reverts a reorg; deletes are 409-guarded.*
- **Phase C — integrity + rendering polish.** where-used query; safe-delete signaling
  for trashed targets; active-state resolution; Liquid `nav`; location-registration
  hook; outbox events; theme-switch retention test. *Exit: trashing a linked page
  flags the menu; a menu survives a theme switch.*
- **Phase D — AI + deferred seams as no-ops.** AI tools (search/get/where_used +
  HITL update/assign) as clients of the same handlers; reserve
  `dynamicQuery`/`content`/visibility seams (recognized-and-rejected with a clear
  "coming later" error). *Exit: an agent lists/edits menus under delegated perms;
  deferred kinds rejected cleanly.*

### 5.6 v1-scope cut with named deferred seams

**IN v1:** §9 of ADR-029 (seeded type, nested/ordered tree, four target kinds,
revisions+revert+OCC, `entry_refs` where-used + safe-delete, binding index +
uniqueness + theme-switch retention, resolve+render declarative & Liquid, flat perms
+ authorize, events + hooks, AI tools, bounded validation).

**DEFERRED, each with the seam already in the type shape:**
- Dynamic/computed menus → `target.kind='dynamicQuery'` (reserved, rejected).
- Per-item visibility / role-gating → `navigation.tree.filter` hook present; rule DSL
  deferred.
- Mega-menu rich items → `target.kind='content'` (reserved).
- Breadcrumb helper model → separate resolver over the same tree.
- Per-language menus → ride the future i18n lib.

---

## 6. Open questions for the morning audit

The six ADR-029 §Open items, ranked for the human:

1. **Location conflict: reassign (last-writer-wins) vs hard `409`?** (owner UX call)
2. **Keep the binding table (multi-location + uniqueness) vs the simpler single-
   location scalar + expression index (no new table/port)?** (the core debate)
3. **Is location assignment on the right side of the ADR-028 settings line?**
4. **`entry_refs` granularity — is menu-level where-used enough, or is item-level
   precision needed (pulls toward the sidecar fallback)?**
5. **Active-state semantics** (prefix/trailing-slash/query/home-route rules) — needs a
   spec.
6. **Anonymous render cache-key shape** — freeze before visibility filtering lands.

---

## 7. Honesty note

This is a **solo, design-only** sweep: no adversarial debate and no external audit
were run, unlike ADR-022 (3-round debate) and ADR-027 (2-round debate + 2 audit
rounds). The design stays strictly inside accepted ADRs; every real tension is logged
as an Open question rather than resolved unilaterally. The typed interfaces are real
and **compile against the live repo** (`tsc -p tsconfig.json --noEmit` clean), so the
shape is proven, but the *decisions* still owe the debate+audit gate before ACCEPTED.
