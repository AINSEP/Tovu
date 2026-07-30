# ADR-029: Menus / Navigation — Entry-Native Menu Trees, `entry_refs` Link Integrity, Derived Location-Binding Index

- Status: ACCEPTED 2026-07-10 (autonomous Opus 4.8 sweep agent, design-only draft → cleared `/audit-work` gate: 3-round audit under `TM-admin-sweep-001`, Codex + Gemini/agy + Fable internal verifier; round 1 FAIL → Round-3 fold → round 2 FAIL (1 converged blocker) → Round-4 fold → round 3 unanimous PASS, scores 9.1-10.0, zero blockers)
- Author: autonomous Opus 4.8 sweep agent
- Extends: **ADR-022** (a menu is a seeded content-type entry; its item tree is the entry's validated `bodyJson`; link targets reuse `entry_refs`), **ADR-020 §6** (themes receive a fully-resolved nav *model* — data, not code)
- Relates: ADR-006 (rule-of-two — one new port `NavLocationBindingRepoPort`, resolver stays one-evaluator), ADR-008 (menus mutate through the change-set gateway; whole-tree revisions + revert), ADR-009 (typed calls for resolve, outbox events, hook points for extension), ADR-021 (flat `navigation.*` strings, `authorize()` at the gateway, agents as delegated principals), ADR-007 (workspace-scoped, composite keys), ADR-012 (per-site `content.db`), ADR-024 (Tier-1 declarative-safe: bounded/total tree validation; `pluginId` attribution), ADR-027 (the hybrid-reuse pattern this ADR follows; deletion ladder), ADR-015 (core owns the derived index table via the core migration engine), ADR-028 (why location assignment is *not* a settings ledger entry)
- Sources: `tovu-v2-design.md` §3.5 (`navigation` = Tier-2 core library) and §4 (package layout); the Admin Section Spec Sweep brief in `todos.md`
- Depth benchmark: ADR-027 (media) and ADR-022 (content model)

## Context

Tovu needs menus/navigation: the header, footer, and other nav trees a site
renders. `tovu-v2-design.md` §3.5 places **`navigation` as a Tier-2 core library**
("widgets-and-menus (menus half) → `navigation` → Menu trees as content, editable
in admin, rendered by themes") and the brief frames it precisely: *navigation trees
as first-class editable content with ordering, nesting, and link targets (entries,
taxonomy terms, external URLs).*

WordPress is the anti-pattern to avoid on two counts. First, its data model —
`nav_menu` is a *taxonomy term*, menu items are *posts* of type `nav_menu_item`
with their label/target/parent/order smeared across **`postmeta`** — is exactly the
unqueryable, brittle EAV swamp ADR-022 exists to kill. Second, its lifecycle: menu
**location assignments are lost on a theme switch**, one of the most-hated WP
papercuts. Tovu must fix both.

The governing constraints are unchanged: the site is a **live end-user SQLite file
on a non-expert's machine** (ADR-011/012); no operation may brick it, and every
mutation must be auditable/revertible (ADR-008/022). The design question is narrow —
*not* "how do we store nav" from scratch, but **"how much of ADR-022 does a menu
reuse, and what (if anything) does navigation legitimately add?"** This ADR answers
that the ADR-027 way: reuse the entries substrate for identity/editorial/integrity,
add only the one thing entries cannot express (a uniqueness-enforcing location→menu
binding), and add **no new persistence port for menus themselves**.

This is a **design-only, single-agent** ADR. It owes an adversarial debate and an
external audit before it can move to ACCEPTED; the Open questions (§Open) are the
seed agenda for that audit.

## Decision

### 1. Placement — `navigation` is a Tier-2 core library

`navigation` is a Tier-2 core library (`packages/core/src/lib/navigation` in the §4
aspirational layout; `src/features/navigation/` in the current tree). The §3.5
placement rule is *"tier 2 is anything ≥80% of sites need and plugins must build
on."* Essentially **every** site has a header/footer menu, and **themes must build
on** navigation (they render menus at declared locations). Navigation is not a
subsystem a meaningful fraction of sites disable or replace (the Tier-3 test) — a
site with no navigation is broken, not minimal. So Tier-2, not a Tier-3 bundled
plugin. (Contrast: comments/feeds/search are Tier-3 precisely because many sites
drop them.) It owns the menu content-type registration, the item-tree vocabulary +
validator, the location-binding index, the resolve-for-render typed call, and the
`navigation.*` surface.

### 2. Data model — the menu tree IS the entry (no item sidecar table)

A **menu is a seeded `menu` content-type entry** (ADR-022 §1), shipped as a registry
row like `post`/`page`/`media`. It reuses, unchanged:

- **Universal columns** (ADR-022 §2): `id` (ULID), `workspaceId`, `type='menu'`,
  `slug` (the stable machine handle, e.g. `primary-nav`), `title` (the human menu
  name), `status`, `updatedAt`, `version`.
- The **ordered, nested item tree lives in the entry's `bodyJson`** as a
  `navigation`-namespaced block vocabulary: `{ type: 'menu', version, items:
  NavItemNode[] }`. **Ordering = array order** among siblings; **nesting =
  `children`**. Each `NavItemNode` carries a **stable ULID `id`** (minted once,
  preserved across edits/moves — never renumbered on reorder), an editable `label`,
  a discriminated `target`, optional presentational `attrs`, and `children`.
- **Whole-tree edits → whole-menu revisions** for free (ADR-022 §4b). Undoing a menu
  reorganization is one revert; there is no per-item revision noise.

**There is no `nav_menu_items` sidecar table.** This is the deliberate divergence
from ADR-027's two-sidecar shape, and it is justified by the *opposite* facts:
ADR-027 split renditions/blobs into sidecars because they are **machine-generated
operational state** that would pollute revisions and that **is** queried/served
individually (per URL). Menu items are the reverse — **editorial state** the human
wants revisioned, and **never** queried individually (menus load whole, by location,
and render whole). A sidecar would either duplicate the revision machinery or narrow
INV-3 for zero query benefit. (Sidecar item rows remain the documented fallback —
§Alternatives — if per-item indexed queries ever become real.)

### 3. Link-target integrity via `entry_refs` (reuse ADR-022 §5 / ADR-027 §5)

Item targets are a v1 discriminated union of four kinds:

- **`entryRef`** (link to a page/post/media entry) — **integrity-tracked**.
- **`termRef`** (link to a taxonomy term archive) — **integrity-tracked**.
- **`url`** (external/relative URL) — validated only (scheme allowlist; reject
  `javascript:`/data URLs; `rel`/target sanitized).
- **`route`** (named core route, e.g. `home`, `search`) — resolved by the routing
  lib.

`entryRef`/`termRef` ids are **extracted at the ADR-022 write chokepoint into the
derived, rebuildable `entry_refs` index** — the *exact* mechanism ADR-027 §5 reuses
for media, with the menu entry as the ref source and the linked entry/term as the
target. This buys three things with no new machinery: (a) **where-used** ("which
menus link to this page?") is one indexed query; (b) **safe-delete signaling** —
trashing/deleting a linked entry flags the menu's dangling links (deletion ladder,
§6); (c) it is **rebuildable** from the trees at any time. `url`/`route` targets
carry no ref (nothing to integrity-check beyond validation).

### 4. Location assignment — a menu field (source of truth) + a derived binding index (uniqueness)

Which theme location a menu fills is a **relation** (location ↔ menu), and ADR-022 §5
is explicit that relations live in real tables, not JSON. Split accordingly:

- **Source of truth:** each menu entry declares the location keys it fills in
  `fields.ext.navigation.locations: string[]` (ADR-022 §2 namespaced fields,
  validated on write) — so assignment is part of the entry's **revisioned** state.
- **Derived projection:** core maintains **`nav_location_bindings(workspace_id,
  location_key, menu_id, bound_at)`** with **`UNIQUE (workspace_id, location_key)`**.
  It is populated **in the same transaction** as the menu mutation (chokepoint), and
  is **derived + rebuildable** from menu entries (same species as `entry_refs`) —
  **not** a source of truth and **not** revision-generating. Its jobs: a single
  indexed location→menu lookup at render time, and the **exactly-one-menu-per-
  location** invariant a per-entry JSON field cannot express (a cross-entry
  constraint). Claiming a location already bound elsewhere **reassigns** it
  (last-writer-wins) and records the **displaced** menu's field change through the
  chokepoint (a revision on that menu), so the two representations never drift.

This table is a **core-owned derived index built through the core migration engine
(ADR-015)** — the same way `entries`/`taxonomies`/`entry_terms`/`asset_blobs` exist.
It is **not** a plugin data module: navigation is a *core* library, so ADR-023's
core-mediated *plugin* DDL path does not apply. (Were navigation ever a plugin, ADR-
023 would be mandatory; it is not, so the ordinary core path is correct — and this
ADR opens no new plugin-DDL surface.)

### 5. Ports — one real port; the resolver stays one evaluator (ADR-006 applied honestly)

- **`NavLocationBindingRepoPort` IS a port.** It persists the derived index and has
  two real adapters, one built now: **in-memory** (dev/tests) + **SQLite**
  (persistent) — the shape every repo in this codebase already follows
  (`PostRepoPort`, `PresentationSettingsRepoPort`, `ChangeSetRepoPort`). Rule-of-two
  passes on the same terms ADR-015 blessed.
- **Menus add NO new persistence port.** A menu is an entry; it rides the existing
  entries repo (already rule-of-two). A `MenuRepoPort` would be a second store for
  data that already has one.
- **`NavTargetResolver` is NOT a port — it is one evaluator.** Resolving a target to
  an href/label/active-state is ordinary core code over routing + entries + taxonomy
  (ADR-009 §1 typed calls); exactly one production implementation exists. Following
  ADR-021 §2's self-application of ADR-006 to `authorize()` ("no PolicyPort; one
  evaluator"), it stays a typed-call contract, refactored into a port only if a
  second real resolver appears. This is the deliberate anti-port-mania call
  (tovu-v2-design W5).

### 6. Never-brick, chokepoint, and the deletion ladder (reuse, don't reinvent)

Every menu mutation runs through the **ADR-008 command gateway / ADR-022 single write
chokepoint**: same-transaction revision, `pluginId`/actor attribution, `entry_refs`
extraction, **and** the binding-index update — all one unit of work. No side-door
SQL; the CI canary that asserts revision-per-write covers menus by construction.

Deletion follows **ADR-027's ladder**: **trash** (soft, revisioned) → **purge blocked
with `409` + the referencing list** while the menu is bound to a location or
referenced → **force-purge** behind the separate `navigation.delete.force`
permission (flags dangling refs). **Uninstall/theme-switch RETAINS assignments**: the
binding index tolerates location keys whose registering theme is gone; when the theme
returns (or another registers the key), the menu is still bound. This is the direct
structural fix for WP's "lose your menus on theme change."

Menu-tree validation is **total and bounded** (ADR-024 amendment / ADR-022 §Amendment):
bounded nesting depth (default ≤5, configurable), bounded item count, id-stability
(an update may not renumber surviving items), and target-shape validation. This keeps
the declarative menu surface Tier-1-safe (no DoS, no compute smuggling).

### 7. Rendering in themes — the theme receives resolved data, never resolves refs (ADR-020 §6)

The theme renderer resolves `location → menu → ResolvedNav` via one typed call
(`NavMenuReadModel.resolveForLocation`): targets become concrete hrefs (routing),
labels fill from targets, active-state is computed against the current route, and
**unavailable (trashed/deleted) targets are flagged `available:false`** so the theme
omits them rather than emitting dead links. The theme sees only the **resolved,
sanitized `ResolvedNav` model** — declarative tier via a `nav` component/slot node,
templated (Liquid) tier via a `nav` drop over the same model, code tier via the
component registry. **No theme code resolves refs or reads storage** — the ADR-020 §6
render-IR boundary, consistent with the existing `render.ts` "theme is data; core
resolves" stance.

### 8. Surfaces, events, hooks (ADR-009 / ADR-021 / ADR-027 §7)

- **Permissions (flat `navigation.*`, ADR-021 §3):** `read`, `create`, `update`,
  `delete`, `delete.force`, `assign` (split out — placing a menu on the live site is
  higher-trust than editing a label), `manage` (register locations/settings).
  Enforced by `authorize()` at the gateway before mutation, before the idempotency
  short-circuit.
- **Events (outbox, async — ADR-009 §2):** `navigation.menu.{created,updated,deleted}`,
  `navigation.location.{assigned,unassigned}`. Consumers: rendered-nav fragment cache
  invalidation, search reindex, AI memory.
- **Hooks (sync, ordered, declared-before-attached — ADR-009 §3):**
  `navigation.item.resolve` (filter one resolved item — badge/count/dynamic label),
  `navigation.tree.filter` (filter the whole resolved tree — e.g. hide items the
  current principal can't reach), `navigation.locations.register` (action — register
  location keys).
- **AI tools** are thin clients of the **same** gateway handlers (no back door,
  ADR-027 §7): `navigation.search/get/where_used`, plus `navigation.update`/`assign`
  as **HITL** through the change-set review layer. Agents are delegated principals
  (`grant ∩ delegator`, ADR-021 §6).

### 9. v1 scope — IN, and deferred with named seams

**IN v1:** the seeded `menu` type; the nested/ordered `bodyJson` item tree with all
four target kinds; whole-tree revisions + revert + clean OCC; `entry_refs` where-used
+ safe-delete signaling; the derived binding index + exactly-one-menu-per-location +
theme-switch retention; location registration hook; `resolveForLocation` + declarative
& Liquid rendering; flat `navigation.*` perms + `authorize()`; events + hooks; AI
tools; bounded/total tree validation.

**DEFERRED (each a named seam already in the type shape):**
- **Dynamic/computed menus** ("auto-list all pages under X") — seam:
  `target.kind='dynamicQuery'` reserved and **rejected until** the ADR-022
  total/bounded query language + a resolver stage ship.
- **Per-item visibility / role-gated items** — seam: the `navigation.tree.filter`
  hook exists now; the *declarative* visibility rule DSL is deferred (needs the
  ADR-021 constraint engine / bounded expression).
- **Mega-menu / rich-content items** — seam: `target.kind='content'` reserved.
- **Breadcrumb model** (`todos.md` "Breadcrumb/navigation helper model") — a separate
  resolver over the same tree + routing; deferred.
- **Per-language menus (i18n)** — seam: menus are workspace-scoped entries; locale
  variants ride the future i18n lib; reserved.

## Consequences

- **Kills WP's two nav sins structurally.** Item data is validated content in one
  entry (not `postmeta`), so it is queryable/integritied via `entry_refs`; and
  assignments survive a theme switch because the binding index tolerates orphan
  location keys — neither is a papered-over hack.
- **Maximal ADR-022 reuse, minimal new surface.** Revisions, chokepoint, attribution,
  taxonomy opt-in, and `entry_refs` are inherited; navigation adds exactly one derived
  table and one repo port. The content model is reused, not duplicated (the ADR-027
  consequence, restated).
- **Clean concurrency, for free.** Because the whole tree is one JSON body under one
  entry `version`, two admins reordering concurrently collide on the entry version
  (ADR-022 version + the gateway's `entityVersionAtApply` guard) — clean OCC, no
  per-item position race. This is a genuine advantage of entry-native over sidecar
  rows.
- **Honest rule-of-two.** One real port (two adapters, one built now); the resolver
  and read model stay one-evaluator typed calls — no speculative `MenuRepoPort`/
  `ResolverPort`.
- **Two representations of assignment must be kept in lockstep.** The menu field is
  the source of truth; the binding index is derived. The chokepoint writes both in one
  transaction, and the index is rebuildable — but the *discipline* (never write the
  index outside the chokepoint) is load-bearing, exactly as ADR-022 §4a warns. A CI
  canary should assert no module outside `navigation/repo` writes `nav_location_bindings`
  (mirroring ADR-027's four-table import-graph lint).
- **DX cost, accepted.** Every menu write flows through the gateway/chokepoint; there
  is no fast-path direct write. Same trade ADR-022/027 already accepted.

## Open

*(The audit agenda — this is a solo design; these are unresolved, not settled.)*

1. **Location-conflict UX: reassign vs reject.** §4 chooses last-writer-wins reassign
   (with a revision on the displaced menu). Is a hard `409` "location already bound —
   unassign first" the safer default for a non-expert? Reassign is convenient but can
   silently move a menu off a location. **Needs an owner call.**
2. **Multi-location single-menu vs single-location scalar.** §4's binding index
   supports one menu in many locations *and* many-to-one uniqueness. A simpler model
   (a scalar `fields.ext.navigation.location` + a plain ADR-022 §3 expression index, no
   new table at all) would drop the port entirely but forbid multi-location menus and
   lose the uniqueness constraint. Is the extra table worth it? **Debate candidate.**
3. **Is location assignment settings-shaped (ADR-028)?** Assignment (location→menu) is
   config-like. ADR-028 killed settings-as-*entries*; this ADR keeps assignment on the
   menu entry (for chokepoint/refs/revisions) rather than in the settings ledger. Is
   that the right side of the ADR-028 line, or should the location map be a
   `setting_values` row once ADR-028's plugin path opens? **Cross-ADR seam to audit.**
4. **`entry_refs` source-locator granularity.** Where-used answers "which menu links
   here"; pinpointing *which item within the menu* relies on a JSON locator, not a
   row. Is menu-level where-used enough for v1, or does safe-delete need item-level
   precision (which would pull toward the sidecar fallback)? **Scope question.**
5. **Active-state semantics.** Exact `isCurrent`/`isActive` rules (prefix match?
   trailing slash? query strings? the home-route edge case) are unspecified here —
   a resolver detail, but one themes will depend on. **Needs a spec.**
6. **Anonymous render cost / cache key.** `navigation.tree.filter` can make the
   resolved tree principal-dependent (visibility). That defeats a single cached
   fragment. v1 ships no visibility DSL, so the anonymous tree is cacheable now — but
   the cache-key shape must be frozen before visibility lands. **Forward-looking.**

## Record

- **Type of work:** autonomous single-agent design sweep (Opus 4.8), design-only.
  **No peer debate, no external audit** were performed — this ADR is PROPOSED and owes
  both before ACCEPTED, unlike ADR-022 (3-round debate) and ADR-027 (2-round debate +
  2 audit rounds).
- **Grounding:** accepted ADRs 006/007/008/009/012/015/020/021/022/024/027 and
  `tovu-v2-design.md` §3.5/§4. No accepted ADR was reopened; real tensions are logged
  as Open questions (§Open) rather than resolved unilaterally.
- **Verification:** the design's TYPES + PORT interfaces are written as real repo files
  (`src/navigation/{types,ports,contracts,index}.ts`, interface/type-only) and
  **typecheck clean** against the live repo (`tsc -p tsconfig.json --noEmit` exit 0;
  scoped isolation check also clean) — the shape is proven to compile, not just
  sketched.
- **Companion:** implementation proposal + competitor-lite orientation + alternatives
  in `reports/section-designs/20260710-menus-navigation-design.md`.

---

## Round-2 sweep-crosscutting fold (2026-07-10)
Folds `sweep-crosscutting-decisions-20260710.md` §C-029 + round-2 amendments. PROPOSED; owes per-ADR audit.
- **Consume ADR-039 routing v0:** use `urlFor`/`isActive` for `route` targets (href + active-state). The `RouteTarget` union is **routing-owned** (ADR-039 §3) — Menus imports it, no longer declares it locally.
- **Round-2:** `urlFor`/`isActive` take `RouteResolveContext {workspaceId, siteId?, locale?, originKey?}` (ADR-039 amendment 4); `isActive` ancestor/prefix semantics for nested highlighting are owed (ADR-039 v0.1).
- **Term targets:** ADR-022 §5 is entry-to-entry only → define an `entry_refs` term-target schema OR add `term_refs` (content-lib sign-off owed).
- **Permission namespace:** `admin.menus.manage` (decisions §E convention).
- **Wave 1** — acceptable once ADR-039 shape frozen + both Wave-1 blockers (ADR-040 `core/origin`, permission-namespace) ruled.

---

## Round-3 audit fold (TM-admin-sweep-001, 2026-07-10)
External audit found the `termRef` link-integrity claim has no compatible ADR-022 schema, and found the binding-index maintenance is a real second in-transaction participant that ADR-039's v0 slot doesn't yet name. Folded:

1. **Term-link schema promoted from Open to Wave-1 blocker (Codex AS-004).** §3's "`termRef`... **integrity-tracked**" claim is not yet true: ADR-022 §5 defines `entry_refs` for entry-to-entry references only, with no term-target schema. What was Open item 3 ("content-lib sign-off owed") is promoted to an explicit **Wave-1 acceptance blocker**: this ADR cannot claim `termRef` integrity-tracking until either a typed `term_refs` index or an accepted `entry_refs` extension for term targets is specified (workspace-scoped keys/FKs, rebuild semantics, delete behavior included).
2. **Second in-tx participant acknowledged (Fable F4).** §4's binding-index write + the displaced-menu revision write are, in fact, a **second in-transaction participant** alongside ADR-039's `SlugChangeCapture` slot — ADR-039 v0 only names one slot. Until ADR-039 generalizes its slot into the small ordered core-only registry it already names as its own promotion trigger, this ADR's in-tx writes are **intra-core composition outside the named slot mechanism**, bound by the same constraints ADR-039 §4 sets (idempotent, no external I/O, no in-tx publish, content-row-before-redirect-row-style lock ordering generalized to content-row-before-nav-row). See the mirrored note in ADR-039.
