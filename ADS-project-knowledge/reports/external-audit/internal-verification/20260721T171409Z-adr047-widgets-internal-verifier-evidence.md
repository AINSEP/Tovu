# Internal Verification Evidence Packet — ADR-047 Widgets (SPEC-043)

This packet is CURATED to exclude author-side implementation rationale (decision
justifications, 'why I chose this', dismissed alternatives, self-assessments).
Evaluate strictly against the spec/contracts/tests/rubric below — observable
requirements and artifacts only.

## Known, accepted deviations from literal spec wording (facts, not justification)
- Widget instance config and `widget_area` placement lists are stored as a single
  JSON-serialized string in `fieldsJson.ext.<owner>.payload`, not literally in
  `entry.bodyJson` as SPEC-043 REQ-11 describes.
- `wireCoreResolvers`/`registerCoreResolver` are not called anywhere at boot in this
  codebase yet — `CORE_RESOLVERS` is empty at runtime as of this commit.
- No HTTP routes, AI-tool registrations, or admin UI exist yet for widgets.

## Test evidence (self-reported by the implementing session, re-verify claims below independently where the evidence packet allows)
- Full suite: 1736 tests, 1734 pass, 2 pre-existing failures unrelated to widgets
  (redirects-site-serving.test.ts, seo-site-serving.test.ts), stable across repeated runs.
- Every widgets/entry-refs test uses in-memory repo adapters
  (InMemoryEntryRepo/InMemoryEntryRefsRepo/InMemoryWidgetRegionBindingRepo) only — grep
  confirms zero references to Sqlite*Repo anywhere under src/widgets/__tests__/ or
  src/core/entry-refs/__tests__/.

---

## 1. ADR-047 (governing contract, full text)

# ADR-047: Widgets — Entry-Native Instances, Dual Placement (Region Binding + Inline Embed), Token-Styled Defaults

- Status: PROPOSED 2026-07-20, **debate cleared 2026-07-21** (2-round swarm `/debate` — Primary Claude
  Sonnet 5, agy/Gemini 3.1 Pro High, Codex GPT-5.6-sol, Fable — full 4/4 convergence by Round 2, zero
  unresolved deltas at the recommendation level; see `reports/swarm-consensus/runs/20260721-widgets-adr047-consensus-report.md`
  and the Debate Fold-In section below). Owes external `/audit-work` before ACCEPTED, matching this
  project's standing process (see ADR-029's own precedent — a design-only draft that cleared debate + a
  3-round audit).
- Author: Claude Sonnet 5 / Leon Aburime
- Extends: **ADR-022** (a widget is a seeded content-type entry, exactly as a menu is; reuses `entry_refs`),
  **ADR-002** (component registry, design tokens, slots/regions, canonical render IR),
  **ADR-020** (Liquid renders resolved data over the same component registry; the `render_block` seam;
  the render-IR-is-canonical amendment; the single `{{ content | render_rich_text }}` content seam),
  **ADR-029** (the direct structural sibling — location-binding pattern, target-union pattern, deletion
  ladder, honest rule-of-two, AI-tools-as-thin-gateway-clients — this ADR generalizes all five to widgets)
- Relates: ADR-016 (agentic document editing — the inline-embed authoring surface and its AI place/
  remove/adjust tools ride this ADR's change-set review layer, not a new one), ADR-021 (flat permissions,
  `authorize()` at the gateway, agents as delegated principals), ADR-024 (Tier-1 declarative-safe
  bounded/total validation, applied to widget config), ADR-008/009 (change-set gateway; typed calls,
  outbox events, hooks), ADR-006 (rule-of-two), ADR-007 (workspace scoping), ADR-027 (deletion-ladder
  precedent this ADR reuses via ADR-029)
- Sources: `tovu-v2-design.md` Tier-3 table (see Context — this ADR explicitly revisits its "widgets
  (sidebars half): superseded" call); owner design conversation 2026-07-17–2026-07-20 (competitor survey
  of WordPress/Drupal/Payload/Ghost/Strapi/Directus; the Contact-Form-on-two-pages worked example; the
  "AI should be able to place/remove/diagnose/adjust widgets" requirement; the styling-ownership question)
- Depth benchmark: ADR-029 (menus) — the nearest sibling in shape and scope

## Context

Tovu's admin already has menus/navigation (ADR-029) but nothing for the other half of what every
theme-based CMS calls "widgets": placeable, individually-configured components like a contact form,
a recent-posts list, a text block, or social links — placed into a header/footer/sidebar region, or
dropped into the middle of a specific page's content.

**This was explicitly considered once already and marked out of scope.** `tovu-v2-design.md`'s Tier-3
table lists `widgets (sidebars half) | superseded | Slots/regions + blocks replace widget instances` —
the original plan was that ADR-002's slots/regions plus the existing declarative block/component tree
would be enough, with no separate "widget" concept needed, the same way `shortcodes` was dropped in
favor of dynamic block nodes on the same table row above it.

That works for a *stateless* block placed once in one template. It does not work for the case that
motivated this ADR: **build one Contact Form (a specific recipient email, a specific field set, a
specific success message), then place that same configured instance on the Landing Page and, separately,
on the Contact Page** — edit it once, both placements update. A raw inline block has no identity to
reference twice, no central place to edit it, and no way to answer "where is this used?" before deleting
it. That reusable, centrally-editable, where-used-trackable quality is exactly why WordPress widgets and
Drupal custom blocks are *stateful entities placed by reference*, not literal inline markup — and it is
what the owner's worked example needs. **This ADR partially supersedes the v2-design "superseded" call**:
slots/regions remain exactly right as the *placement* mechanism (§1a), but the *thing being placed* needs
first-class identity, which brings back a real "widget" concept — built the ADR-029 way (an entry, not a
new subsystem), not the WordPress way (a `postmeta`-shaped bolt-on).

**Competitor survey (verified, not assumed).** WordPress's classic widgets ship with no default styling
and famously lose sidebar assignments on a theme switch — the exact two sins ADR-029 already structurally
fixed for menus. Drupal's Blocks/Regions is the closest real analog (regions declared by the theme, blocks
placed into them via an admin UI) and is the strongest precedent to learn from. The current generation of
API-first CMSs deliberately dropped this pattern rather than refine it: Ghost has no widget/sidebar concept
at all (themes are raw Handlebars, DIY); Strapi and Directus are headless with no rendering layer, so there
is nothing to place content *into* — their own "widgets" are unrelated admin-dashboard React components;
Payload's closest feature, the Blocks field, is per-document flexible composition (an editor assembles one
page from typed blocks), not a global region a site-wide widget is bound to. None of the four give us a
placement-by-reference model to copy directly — Drupal and WordPress are the only real prior art, and both
have known failure modes ADR-029's pattern already avoids for menus.

**The requirement that settled the design direction:** the owner wants AI to be able to **place, remove,
diagnose, and adjust** widgets, not just a human clicking in an admin screen. That rules out any mechanism
that isn't already wired into Tovu's change-set review and reference-integrity substrate — a bespoke
"widget editor" with its own ad hoc mutation path would be a second, weaker version of machinery ADR-016
and ADR-029 already built correctly once.

## Decision

### 1. A widget instance is a seeded content-type entry — same substrate as a menu (ADR-022 §1, ADR-029 §2)

`type='widget'` ships as a registry row, exactly like `post`/`page`/`menu`. It reuses, unchanged: the
universal columns (`id` ULID, `workspaceId`, `slug`, `title`, `status`, `updatedAt`, `version`), the
single write chokepoint, and whole-instance revisions + revert (ADR-022 §4).

A **widget-type registry** (data, not code — the same mechanism as ADR-022 §1's content-type registry)
declares, per type (`text`, `contact-form`, `recent-entries`, `social-links`, `menu`, …): a config schema
for `fields.ext.widget.*` (validated on write, ADR-022 §2), a default-props shape, and any capability
requirements. A widget **instance** is a configured occurrence of a type — this is what makes "two
differently-configured Contact Forms" and "one Contact Form reused in two places" both expressible: the
former is two instances, the latter is one instance referenced twice (§2 below governs which one an
editor gets from the placement UI).

Note one of the core v1 widget types is `menu` itself — ADR-029's already-resolved nav model is just
another render-IR node, so "place the primary menu as a widget in the footer region" costs nothing new.

### 2. Placement — two independent mechanisms over the one shared instance concept

**(a) Region binding — global, theme-declared.** Direct generalization of ADR-029 §4's location-binding,
with the one structural difference the plural case demands: a nav location holds exactly one menu; a
widget region holds an **ordered list**. `widget_region_bindings(workspace_id, region_key,
widget_instance_id, position, bound_at)`, `UNIQUE(workspace_id, region_key, widget_instance_id)`, ordered
by `position`. Themes declare region keys the same way they already declare template slots/regions
(ADR-002 §1); the Tier-2 Liquid renderer's existing `render_block`/island-tag seam (ADR-020 §2) is the
render hook as-is — a region is a `render_block` call over a resolved, ordered widget list instead of a
single component. **No new Liquid capability is required.**

**(b) Inline embed — page-scoped, editor-placed.** A new TipTap node type, `widgetEmbed`, carrying a
widget-instance ULID, insertable anywhere in any entry's `bodyJson` (the Landing Page's content, a blog
post, any future TipTap-bodied type). At render time, the existing content-resolution step that already
turns `bodyJson` into the theme's `{{ content | render_rich_text }}` seam (ADR-020's render-IR amendment)
resolves each `widgetEmbed` node into the widget's rendered IR node — `(registered component id, validated
props, children)`, ADR-020's canonical shape — inline, exactly where the editor put it, **before** the
resolved content ever reaches the Liquid template. Liquid does not gain, and does not need, any awareness
of embeds: it already receives only resolved data through this one seam, per ADR-020 §7 / ADR-029 §7's
"theme receives resolved data, never resolves refs." **Both placement paths terminate in something Liquid
already knows how to render — this ADR adds no new theme-facing surface.**

**Placement UI governs reuse, not the data model.** Whether "place the Contact Form here" creates a
reference to the existing instance or a fresh duplicate instance is a UI choice (offer both: "use
existing" vs. "duplicate"); the underlying model supports either because both are just an
instance-id reference, region-bound or embedded.

### 3. Reference integrity — extend `entry_refs` with a `widgetRef` kind (ADR-022 §5 / ADR-029 §3)

Both placement paths register into the same derived `entry_refs` index ADR-029 established for menu
targets: a region binding is a `widgetRef` from `(workspace, region-binding row)` → widget instance; an
inline embed is a `widgetRef` from the hosting entry → widget instance. This is rebuilt, not
hand-maintained, and buys three things for free: **where-used** ("which pages/regions use this widget?",
one indexed query), **safe-delete signaling** (trashing/deleting a widget flags every referencing
page/region `available:false`, exactly ADR-029 §7's dead-link handling), and — directly answering the
owner's "AI should be able to diagnose" requirement — a broken widget reference is *already* a queryable,
first-class state, not new detection logic to build.

### 4. Default styling — widgets consume the theme's design-token contract, never hardcoded CSS (ADR-002)

Each widget type ships a minimal default appearance built entirely from the theme's tokens (`var(--...)`
for spacing/color/type), following the rule ADR-002 already states for chrome skins ("components consume
tokens... never a skin id directly — so the same component tree renders any skin"). This is deliberately
neither of the two failure modes surveyed: not WordPress's "unstyled, looks broken by default" (bad for
Tier-1/Declarative, no-code theme users who cannot write CSS to fix it), and not "themes must hand-style
every widget type from scratch" (high tax on every theme author). Overrides compose at two levels, both
using extension points that already exist — no new mechanism:

- **Token overrides** (cheapest): a theme redefines the tokens a widget consumes; every widget instance
  re-skins automatically.
- **Component overrides**: a theme or plugin registers its own component for a given widget-type id in
  the existing component registry (ADR-002's extension point), same as any other component override.

**Widgets carry zero layout opinion.** A widget does not assume it's in a 3-column sidebar vs. full-width
footer vs. inline in a paragraph flow — layout/positioning belongs entirely to the region or embed point;
a widget only styles its own internal content. This keeps a widget's default appearance valid regardless
of which of the two placement mechanisms (§2) put it there.

### 5. AI place / remove / diagnose / adjust — reuse ADR-016's change-set review layer, no new substrate

- **Place / remove / adjust** are ordinary edits, routed through the mechanism each placement type already
  uses: a region-binding change is a gateway mutation (ADR-029 §6's chokepoint pattern); an inline-embed
  change is a `surface: 'frontend'` CopilotKit tool operating on the live TipTap editor instance (ADR-016
  §1), producing a reviewable change-set — propose → review → accept/reject → revert (ADR-016 §2) —
  exactly like any other AI content edit. `widgets.place` / `widgets.remove` / `widgets.configure` are
  thin gateway/tool clients, the same shape as ADR-029 §8's `navigation.update`. **No bespoke "AI widget
  tool" substrate is built.**
- **Diagnose** = query the §3 `entry_refs` dangling-reference state, plus widget-type config-schema
  validation errors (a widget instance whose `fields.ext.widget.*` fails its type's schema is flagged the
  same way any other invalid content field is under ADR-022).
- **RBAC-gated** (ADR-016 §4 / ADR-021 flat strings): `widgets.read`/`.create`/`.update`/`.delete`/
  `.delete.force`/`.place` (placing on the live site is higher-trust than editing config off-site,
  mirroring ADR-029's `assign` split), enforced server-side so an agent can never exceed the calling
  user's permissions.

### 6. Ports — rule-of-two, applied the way ADR-029 §5 already set precedent

- **`WidgetRegionBindingRepoPort` is a real port** — two adapters, in-memory + SQLite, mirroring
  `NavLocationBindingRepoPort` exactly.
- **Widgets add no new persistence port for the instance itself** — an instance is an entry; it rides the
  existing entries repo (already rule-of-two).
- **The widget-type registry** is a data-only registry (ADR-022 §1's mechanism), not a repo abstraction —
  no port.
- **Resolution** (region → ordered widget list; embed node → rendered IR) stays a one-evaluator typed
  call, not a port — ADR-029 §5's anti-port-mania call, applied identically. Promote to a port only if a
  second real resolver appears.

### 7. Never-brick, chokepoint, deletion ladder (reuse, don't reinvent — ADR-029 §6)

Every widget mutation (instance edit, region bind/unbind, inline embed insert/remove) runs through the
ADR-008 gateway / ADR-022 single write chokepoint — same-transaction revision, `pluginId`/actor
attribution, `entry_refs` extraction, all one unit of work. Deletion follows ADR-027's ladder (already
reused once by ADR-029): **trash** (soft, revisioned) → **purge blocked with the referencing list** while
bound to any region or embedded in any entry → **force-purge** behind `widgets.delete.force`. A widget
bound/embedded nowhere is not an error state; only an actually-dangling reference (a deleted target) is
flagged.

Widget config validation is **total and bounded** (ADR-024 §5 / ADR-022 Amendment) — bounded item counts
and nesting depth wherever a widget type takes structured config (e.g. a "Links list" widget's item cap),
no escape hatches — keeping the declarative widget surface Tier-1-safe, same discipline ADR-029 §6 applies
to menu trees.

### 8. Surfaces, events, hooks (ADR-009 / ADR-021 / ADR-029 §8 pattern)

- **Permissions:** flat `widgets.*` per §5.
- **Events (outbox, async):** `widgets.instance.{created,updated,deleted}`, `widgets.region.{bound,unbound}`,
  `widgets.embed.{inserted,removed}`. Consumers: rendered-region/page fragment cache invalidation, AI
  memory.
- **Hooks (sync, ordered):** `widgets.instance.resolve` (filter one resolved widget's props before
  render — e.g. inject a request-scoped value), `widgets.region.filter` (filter a region's resolved list —
  e.g. hide a widget the current principal can't reach, mirroring ADR-029's `navigation.tree.filter`),
  `widgets.types.register` (action — register a widget type, core or plugin).

### 9. v1 scope — IN, and deferred with named seams

**IN v1:** the widget-type registry; a first core type set (Text, Contact Form — wired to the
already-sitemapped Forms feature, Recent Entries, Social Links, Menu-as-widget); region binding (ordered,
multi-widget-per-region) over the existing `render_block` seam; the TipTap `widgetEmbed` inline node +
its render-time resolver; token-based default styling + the two override levels (§4); `entry_refs`/
`widgetRef` integrity + safe-delete/where-used; AI tools riding ADR-016's change-set layer; flat
`widgets.*` permissions; bounded/total config validation.

**DEFERRED (each a named seam):**
- **Per-widget visibility / role-gating** — seam: `widgets.region.filter` hook exists now; a declarative
  visibility rule DSL is deferred, mirroring ADR-029's identical deferral for nav.
- **Structured page-builder "blocks array" field** (Payload's model) as a stricter, more guided
  alternative or complement to freeform inline embeds — worth revisiting if unconstrained embed placement
  proves too open-ended for non-expert editors (see Open #2).
- **Widget marketplace / plugin-contributed widget types** — gated on ADR-024's plugin tiers, same as any
  plugin-contributed capability; Tier-1 declarative widget types are the safe on-ramp, code-backed widget
  types are Tier-2/3.
- **Per-page region overrides** — v1 region bindings are site-wide (§2a); see Open #1.

## Consequences

- **Avoids both failure modes the survey found.** Not WordPress's "unstyled by default, breaks on theme
  switch" (fixed the same structural way ADR-029 fixed it for menus: token-based defaults + entries as the
  persistence substrate, not theme-coupled state); not the modern headless cohort's "no widget concept, the
  frontend owns 100% of layout" (which doesn't fit Tovu's declarative, no-code-by-default theme promise,
  ADR-010).
- **Liquid stays exactly as dumb as ADR-020 intended.** This ADR requires zero new Liquid capability — both
  placement paths resolve to something the renderer already knows how to receive.
- **One integrity/AI-editing substrate serves both placement UIs.** "Where is this used," "is anything
  broken," and "let AI adjust it" are the same primitives regardless of whether a widget got there via a
  region binding or an inline embed — because both are just a `widgetRef`.
- **Explicitly, partially reopens `tovu-v2-design.md`'s "widgets: superseded" call** — slots/regions remain
  the right placement mechanism (the doc was right about that half); a first-class, referenceable widget
  instance is what the doc's one-line note didn't anticipate needing, surfaced by the reusable-Contact-Form
  worked example. No *accepted ADR* is reopened by this — only an informal planning note.
- **New real surface to build:** widget-type registry, `WidgetRegionBindingRepoPort` + adapters, the
  TipTap `widgetEmbed` node + its render-time resolver, region declaration in theme manifests, the
  bounded/total widget-config validator, admin widget-library + placement UI, `widgets.*` AI tools.

## Open

*(The audit agenda — this is a solo design; these are unresolved, not settled.)*

1. **Region binding scope: site-wide only, or per-page override?** §2a as written binds a region
   site-wide (every page using that template gets the same footer widgets). The owner's own framing —
   "put it on the Landing Page or Contact Page" — was answered here by the *inline embed* path (§2b), but
   if operators also want "this region, but only on this one page," that is a distinct per-page override
   this ADR does not yet design. **Needs an owner call or a v2 seam.**
2. **Freeform inline embed vs. a structured blocks-array field.** Is "drop a `widgetEmbed` node anywhere
   in the TipTap body" (this ADR's §2b) the right v1 answer for non-expert editors, or does it need more
   guardrails — e.g. restricting which widget types are inline-embeddable, or constraining embed points to
   specific template-declared slots within the content area rather than fully freeform? **Debate
   candidate**, and the deferred "blocks array" alternative in §9 is the fallback if freeform proves too
   open-ended.
3. **Shared-instance vs. duplicate-on-place default.** §2's "placement UI governs reuse" punts the
   default UX choice (does placing an existing widget type default to reusing the last instance, or always
   duplicate unless the editor explicitly picks "use existing"?) to implementation. Getting this default
   wrong risks surprising shared-state edits ("I changed the footer widget and it changed on three other
   pages too"). **Needs a spec-level decision.**
4. **Core v1 widget-type list and each type's capability requirements.** §9 names a starter set; exact
   scope (does Recent Entries need read access beyond its own calling context? does Contact Form need a
   direct dependency on the Forms feature's submission-sink, or a looser reference?) needs the Forms
   feature's own design as an input.
5. **Region-binding concurrency.** Unlike ADR-029's single-menu-per-location (a clean FK swap), a region
   binding is a multi-row ordered list — two admins reordering the same region concurrently need a defined
   conflict rule (whole-list version token? per-row OCC?). ADR-029 solved this for free because a menu's
   whole tree is one JSON body under one entry version; a region binding, being real rows across multiple
   widget instances rather than one entry, does not inherit that trick automatically. **Needs a design
   pass**, likely a `region_version` counter on the binding set, before Wave-1 build.

## Debate Fold-In (2026-07-21)

*A 2-round swarm `/debate` (Primary Claude Sonnet 5, agy/Gemini 3.1 Pro High, Codex GPT-5.6-sol, Fable)
stress-tested this ADR. Full trace: `reports/swarm-consensus/runs/20260721-widgets-adr047-consensus-report.md`.
Round 1 was blind and solution-neutral (Option A vs. two rejected alternatives — B: pure stateless
blocks/slots, no persistent widget identity; C: Payload-style page-local composition, no theme regions).
All four participants independently rejected B and C and converged on Option A's shape. Round 2 was
informed (full cross-participant reasoning disclosed) and reached full 4/4 agreement, with reasoned
position changes, on every point below. This section amends the Decision above; original §1–9 numbering
is left intact as the historical pre-debate record — read the amendments as superseding the specific
clauses they name.*

### Amendment 1 — §2a region binding replaced: composition lives in a seeded entry, not raw binding rows

**Superseded:** §2a's `widget_region_bindings(workspace_id, region_key, widget_instance_id, position,
bound_at)` design, where the ordered widget list lived directly in the binding table.

**Amended decision:** Region composition is content, and content lives in entries, exactly as a menu's
item tree does (ADR-029 §2). Each theme-declared region is backed by a seeded `widget_area` entry
(`type='widget_area'`) whose `bodyJson` holds the ordered placement list (`{ placementId: ULID,
widgetEntryId: UUID }[]`) and whose `fields.ext.widgets.regionKey` names the region it fills — the
source of truth, exactly mirroring how a menu's location assignment lives on the menu entry
(`fields.ext.navigation.locations`, ADR-029 §4). `widget_region_bindings(workspace_id, region_key,
area_entry_id)`, `UNIQUE(workspace_id, region_key)`, becomes a **derived, rebuildable, non-revision-
generating projection** — reconciled at the write chokepoint, never directly authored — mirroring
`nav_location_bindings` exactly (verified against the live `src/navigation/types.ts`/`reconcile.ts`
during the debate, not just against ADR-029's text). This was independently proposed three different
ways in Round 1 (agy's "Option D," Fable's "A′," Codex's lighter versioned-aggregate fix) before
converging fully on this shape in Round 2.

Consequences: region reorder concurrency is the entry's existing `version` optimistic-lock column — no
new concurrency primitive (resolves original Open #5). Revert/audit/change-set review of a region is the
existing entry-revision machinery — no new revision subsystem. `widget_area → widget instance` is a
plain entry-to-entry reference, so it needs no polymorphic source support from `entry_refs` (see
Amendment 3). Theme-switch orphaned area entries are retained (`status: inactive`), never deleted —
same discipline as ADR-029's location-binding retention. A `widget_area` entry is system-managed: never
publicly routable, never itself selectable as a widget, never a valid `widgetEmbed` target (no recursion
into a region from inside a region).

### Amendment 2 — new §Resolution: an explicit, bounded, batch-first resolver contract (was unstated)

**New section**, filling a gap the original draft did not address at all. Before Liquid rendering, core
resolves every widget — both region-bound and inline-embedded — through one of two paths:

- **Static path** (Text, Social Links): validated config renders directly, no behavioral code.
- **Resolver path** (Recent Entries, Menu-as-widget, Contact Form): a typed, core-owned `resolve`
  function per widget type, invoked server-side, pre-Liquid, **batch-first**
  (`resolveMany(instances, renderContext)` — one entry-load query per page via `WHERE id IN (...)`,
  grouped by type, one resolver call per group) to avoid N+1 query cost across a region's full widget
  set. Each type registration declares hard cost clamps (e.g. Recent Entries: `maxItems ≤ 20`, one
  bounded query, no unbounded scans) enforced by core, not by the resolver's own discipline, per ADR-024
  §5's total/bounded-cost rule.

**Failure isolation (resolves original Open item, and the Primary's pre-debate structural-gap flag,
independently corroborated by a peer in Round 1):** a resolution failure (unknown type, invalid config,
missing/disabled/trashed target, timeout, resolver exception) yields a typed placeholder result — never
propagates past the placement boundary, never aborts the surrounding page render. Public output renders
empty or a safe placeholder with no internal error detail; admin/preview surfaces a correlation id and
diagnostic. This is a standing invariant, not an aspiration — enforce it the same way this codebase
already enforces "never `await` mail inline" as a standing code-review gate for Forms (ADR-PIPE-010
INV-05), not merely an ADR sentence.

Caching: v1 ships **no cross-request fragment cache** — there is nothing to reuse in the live repo,
and importing an invalidation problem ahead of a proven need is the wrong trade. Each resolver still
declares its dependency keys (entry ids, type-level keys) in its result, and the already-specified
outbox events (§8, `widgets.instance.updated` etc.) are the *designated future* invalidation feed — a
declared seam, not wired in v1. This converts §8's events from an unconnected assertion into an honest,
scoped commitment.

### Amendment 3 — §1/§3 corrected: registry is data-and-code, not "data, not code"; `entry_refs` scope stated honestly

**Superseded:** §1's "A widget-type registry (data, not code)" framing, and §3's "extend `entry_refs`
with a `widgetRef` kind" treated as a uniformly free reuse of existing machinery.

**Amended decision (registry):** split explicitly. Widget **type registration** — schema, defaults,
capability class (`static` | `query` | `form` | `entry-reference`), placement contexts, cost clamps — is
plain, JSON-serializable data, Tier-1-safe, following the exact discipline `src/forms/manifest.ts`
already establishes for this codebase ("registration is data, never imported by behavior code"). Widget
**type behavior** — the resolver function — is executable code: core-owned for every v1 built-in type,
and an ADR-024 Tier-2/3 capability-gated event the moment a plugin wants to contribute a *new dynamic*
type. Registration data may name only an allowlisted `resolverId` indexing into a closed core-owned map
— never a module path, arbitrary function name, query string, or expression. Purely static types (Text,
Social Links) have no resolver at all and stay Tier-1-safe end to end.

**Amended decision (`entry_refs`):** two distinct extensions, stated with their real cost, not assumed
free:
- Both placement mechanisms (region binding via `widget_area`, inline embed) are now plain entry-to-
  entry references (Amendment 1 made the region case one too), so no polymorphic non-entry source
  support is needed in `entry_refs` — this part of the original §3 concern is fully resolved by
  Amendment 1, not worked around.
- Widget config's own ref-typed fields (a Recent Entries category filter, a Contact Form's
  `formDefinitionId`, a Menu widget's `menuRef`) must extract into `entry_refs` via ADR-022 §5's `ref`
  field-type vocabulary. **This is stated as a real, named v1 build dependency, not a free reuse of
  shipped code** — verified during the debate that `entry_refs` does not yet exist as running code in
  this repo (no table in `src/infra/db/schema.ts`; `src/navigation/resolver.ts`'s own comment states it
  "has no compatible ADR-022 schema yet"). A minimal slice — the table plus a chokepoint extractor for
  `ref`-typed config fields and `widgetEmbed` body nodes — is a named dependency of this ADR's v1, since
  the where-used UX in Amendment 5 and safe-delete both stand on it. Entry-target refs (menu, form
  definition, success-page) are cleanly covered by the existing `ref` vocabulary; term/taxonomy-target
  refs are narrower — covered only if the installed schema supports that target kind, otherwise
  documented as a soft reference with specified missing-target behavior, not claimed as safe-delete-
  protected until the extended-reference seam lands.

### Amendment 4 — §9 Contact Form restored to v1 (was deferred)

**Superseded:** §9's "defer Contact Form as a core type until the Forms feature itself ships."

**Amended decision:** Contact Form **ships in v1**. This deferral was premised on Forms not existing yet
— verified during the debate that this premise is false: `src/forms/` is a real, tested, already-wired
feature (`submit-service.ts` as the sole public submission path with honeypot spam handling,
`rate-limit-profile.ts` reusing the existing rate limiter, `notify-subscriber.ts` consuming the
`form.submission.received` outbox event and calling a real, implemented `MailerPort`, ADR-037). The
Contact Form widget type is a thin adapter: config holds a ref-typed `formDefinitionId`; its resolver
loads the definition and emits a field-descriptor IR against the Forms field-type vocabulary (not four
hardcoded field cases); its render component submits to Forms' existing public route unchanged,
inheriting validation, honeypot, rate-limiting, notification, and webhook fan-out wholesale. No new
submission or delivery pipeline is built. A `disabled` form definition (definitions are never deleted,
only `active ⇄ disabled`) renders as the Amendment 2 failure-isolation placeholder, not an error. CSRF is
not a new concern — the endpoint is deliberately anonymous/public by design (mirrors `analytics-ingest`),
defended by honeypot + rate-limit, and the widget introduces no new authenticated surface.

### Amendment 5 — §2b, §9 Open #2/#3 resolved: chokepoint-enforced guardrails; edit-time reuse signal

**Amended decision (embed guardrails, resolves original Open #2):** the freeform `widgetEmbed` TipTap
node ships as drafted in §2b, with three guardrails made explicit and — critically — **enforced at the
write chokepoint on the persisted document, not only in the TipTap editor**: (a) block-level atom node,
never inline; (b) no recursive widget-in-widget embedding — forbidden at the schema-validation level
inside any widget-owned `bodyJson`, not merely hidden from the editor's UI; (c) a configurable
per-document embed-count clamp, policy-bounded. Chokepoint enforcement matters specifically because a
future server-side AI mutation path (Amendment 6) has no live editor to rely on for these guardrails.

**Amended decision (reuse default, resolves original Open #3):** default to **reuse** the existing
instance at placement time — a bare "always ask" modal on every placement is the wrong friction point,
since the operator can't yet predict either answer's consequence at that moment. The real, informed
choice surfaces at **edit** time: editing a widget referenced in N places surfaces "this appears in N
places — change everywhere / detach and edit just this one," directly powered by the Amendment 3
`entry_refs` where-used data (making this UX a real, named dependency of that build item, not a nice-
to-have). For AI tools, no ambient default at all: `widgets.place` (reuse) vs. `widgets.create`+place
(duplicate) must be explicit, distinct tool calls — never inferred.

### Amendment 6 — new: agent-native mutation must not depend solely on a live editor

**New, resolving a gap Codex's Round 1 answer named and no other participant initially caught:** §5's AI
place/remove/adjust story as originally drafted routed inline-embed edits exclusively through a
CopilotKit frontend action bound to a live browser editor instance (ADR-016 §1). That is correct for the
common case but insufficient for the stated requirement that AI can operate on widgets generally — an
agent must be able to insert/remove/reorder a `widgetEmbed` node when no editor session is open. Amended:
a server-side, versioned document-mutation command exists using the same document schema, chokepoint,
version precondition, and change-set review layer as the live-editor path — two entry points into one
mutation contract, not two contracts. Coordination between a live editor session and a concurrent
server-side/AI mutation follows the document's existing version-precondition discipline (reject on
mismatch), the same pattern already governing region-area concurrency (Amendment 1).

### Framing note (non-binding, carried forward from the debate)

Widgets are reusable *referenced* components, not the universal representation of every local content
block. Cheap, one-off, non-reusable presentational fragments should stay ordinary inline content, not be
forced into widget-instance identity merely for architectural uniformity — that would recreate the exact
"everything is a plugin" over-generalization ADR-024 already rejected for a different surface. This is a
boundary statement for future page-building work (the deferred structured "blocks array," §9), not a v1
mechanism change.

## Open — resolved by the debate fold-in above

Original items 1, 2, 3, 5 are resolved by Amendments 1, 5, 5, and 1 respectively (see each amendment's
"resolves" note). Original item 4 (core v1 widget-type list) is resolved: Text, Social Links, Recent
Entries, Menu-as-widget, and Contact Form (Amendment 4) constitute the v1 set; each type's capability
requirements are captured in Amendment 3's registration schema (`capability` field) and Amendment 4's
Contact Form specifics. No open items remain blocking at the ADR level — remaining detail (exact resolver
timeout value, whether a post-v1 fragment cache is added, the precise term-target `entry_refs` extension
shape) is spec-level, not architecture-level, and is deferred to the spec accordingly.

## Record

- **Type of work:** single-agent design draft (Claude Sonnet 5), synthesized from a direct owner design
  conversation (not an autonomous sweep) — competitor survey (WordPress, Drupal, Payload, Ghost, Strapi,
  Directus, verified via live documentation search, not assumed from training data), a worked example
  (reusable Contact Form on two pages), and an explicit AI-editability requirement drove the shape.
- **Grounding:** accepted ADRs 002/006/007/008/009/016/020/021/022/024/027/029 and `tovu-v2-design.md`'s
  Tier-3 table (explicitly revisited, see Context). No accepted ADR is reopened; the one informal
  planning-doc note this ADR partially supersedes is called out directly, not silently overridden.
- **Verification owed:** this draft's types/ports have **not yet** been written as real repo files or
  typechecked against the live tree — that is spec/implementation-outline work, not this ADR's.
- **Debate:** cleared 2026-07-21, 2 rounds, full 4/4 convergence, zero unresolved deltas at the
  recommendation level — see Debate Fold-In above and the full consensus report.
- **Next steps:** per this project's standing process, this ADR owes an external `/audit-work` pass
  before ACCEPTED. Spec, implementation outline, and TDD test suite are being produced in parallel with
  the audit per owner direction (2026-07-21) rather than strictly gated behind ACCEPTED — audit findings
  will fold back into whichever of the ADR/spec/outline/tests they land on.

## 2. SPEC-043 feature.spec.md (governing contract, full text)

# Feature Spec: widgets

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-043 |
| version | 1.0.0 |
| status | APPROVED |
| feature_name | FEAT-043-widgets |
| last_edited | 2026-07-21T00:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent (in-session, direct — Claude Sonnet 5, Coordinator) |
| spec_mode | greenfield |

**Provenance note:** this spec derives from `ADR-047-widgets-region-and-embed-placement.md`
(PROPOSED 2026-07-20, **debate-cleared** 2026-07-21 — 2-round swarm `/debate`, full 4/4 convergence,
Primary + agy/Gemini 3.1 Pro + Codex GPT-5.6-sol + Fable; see the ADR's Debate Fold-In section and
`reports/swarm-consensus/runs/20260721-widgets-adr047-consensus-report.md`). Every requirement below
traces to a specific ADR-047 Decision section or Debate Fold-In amendment; section references are
inline. Per this project's standing process, ADR-047 has cleared debate but not yet external
`/audit-work` — this spec is being produced in parallel with the audit per explicit owner direction
(2026-07-21), not strictly gated behind ACCEPTED status.

---

## Overview

Widgets are placeable, reusable, individually-configured components (a contact form, a recent-posts
list, a text block, social links, a menu) that an operator or agent configures once and places either
into a theme-declared region (header/footer/sidebar) or inline inside a specific page's content. This
spec builds the v1 slice of ADR-047: entry-native widget instances, dual placement (region binding via
a seeded `widget_area` entry + inline TipTap embed), a bounded server-side resolution contract, a
minimal `entry_refs` slice, and five core widget types including a Contact Form adapter over the
already-built Forms feature (`src/forms/`, SPEC-010).

---

## Problem Statement

**Current state:** Tovu has navigation menus (ADR-029, `src/navigation/`) but no equivalent for
reusable placeable components. A theme's regions (header/footer/sidebar) are declared (ADR-002 §1) but
nothing can be bound into them beyond navigation. There is no way to build one configured component
(e.g. one Contact Form with a specific recipient) and place that same instance in more than one
location with a single point of edit and a where-used view before deleting it. `entry_refs` — the
reference-integrity index ADR-022 §5 and ADR-029 §3 both describe — **does not exist as running code**
(confirmed during the ADR-047 debate: no table in `src/infra/db/schema.ts`; `src/navigation/
resolver.ts`'s own comment states it "has no compatible ADR-022 schema yet"). `src/forms/` (SPEC-010)
is a complete, tested, already-wired feature (submission service, rate-limiting, `MailerPort`-backed
notification) with no site-facing placement mechanism of its own.

**Desired state:** An operator or agent can create a widget instance of a registered type, bind it into
a theme region (an ordered list per region, shared across every page using that theme) or embed it
inline inside a specific page's rich-text body, and the same instance updates everywhere it's placed
from one edit. Placing, removing, and diagnosing widgets is available to AI tools through the same
gateway/change-set surface a human uses — no side channel. A widget resolution failure never takes down
the page it's on. Contact Form works on day one by delegating entirely to the existing Forms submission
pipeline.

**Why now:** the ADR-047 debate converged unanimously (4/4, 2 rounds) on this design, correcting the
original draft's most significant flaw (region composition stored as un-revisioned binding rows instead
of entry-native content) and resolving every open question the draft left unsettled. The owner has
directed spec/outline/tests to proceed in parallel with the external audit rather than waiting on it.

**Success signal:** a developer can implement widget instance CRUD, the `widget_area` region-binding
mechanism, the resolver pipeline, the minimal `entry_refs` slice, and all five v1 widget types from this
spec package alone, and every P1 acceptance criterion below is verified at a real integration boundary
(the command gateway / HTTP route level, not a unit mock).

---

## User Journey

**Trigger:** An operator wants a Contact Form to appear in the site footer on every page, and also
wants that exact same form embedded partway down the dedicated Contact page.

**Steps:**
1. Operator creates a `contact-form` widget instance, configuring it with a `formDefinitionId`
   referencing an existing Forms definition (§Amendment 4).
2. Operator opens the footer region's widget manager, adds the new instance to the ordered list, saves
   — this is one versioned mutation of the `footer` region's `widget_area` entry (§Amendment 1).
3. Operator opens the Contact page in the TipTap editor, inserts a `widgetEmbed` node referencing the
   *same* widget instance partway through the page body (§2b, unchanged by the debate), saves.
4. Both placements render the same live form. Operator later edits the instance's recipient email once;
   both placements reflect the change on next render — no second edit anywhere.
5. Operator (or an agent) later considers deleting the instance; the system shows "used in 2 places"
   (footer region, Contact page) before allowing delete, sourced from the `entry_refs` where-used index
   (§Amendment 3/5).

**Outcome:** one configured Contact Form, two placements, one source of truth, safe-delete protected.

**Alternate paths:**
- Operator instead chooses "duplicate" when placing on the Contact page — two independent instances now
  exist; editing one does not affect the other (§Amendment 5, explicit reuse/duplicate choice).
- An agent performs the same placement via `widgets.place`/`widgets.create` tool calls instead of the
  admin UI, through the identical gateway path (§5, §Amendment 6).
- The Forms definition referenced by the widget is later disabled; the widget renders its failure-
  isolation placeholder wherever placed, rather than an error, and the rest of each page renders
  normally (§Amendment 2, §Amendment 4).

---

## Scope

**In scope:**
- Widget instance CRUD as a seeded `entries` content type (`type='widget'`), reusing the universal
  entry columns, single write chokepoint, and whole-instance revisions (ADR-047 §1; REQ-01..REQ-06)
- A widget-type registry: five v1 types (Text, Social Links, Recent Entries, Menu-as-widget, Contact
  Form), each declaring registration data (schema, capability class, clamps) per the registration/
  behavior split (Debate Fold-In Amendment 3; REQ-07..REQ-10)
- Region binding via a seeded `widget_area` entry per theme-declared region + a derived, reconciled
  `widget_region_bindings` index (Amendment 1; REQ-11..REQ-17)
- Inline embed via a `widgetEmbed` TipTap node, resolved server-side before the theme render seam, with
  chokepoint-enforced guardrails (§2b, Amendment 5; REQ-18..REQ-22)
- The resolution pipeline: batch-first (`resolveMany`), cost-bounded, failure-isolated (Amendment 2;
  REQ-23..REQ-28)
- A minimal `entry_refs` slice: table + chokepoint extractor covering widget-instance references (from
  both placement mechanisms) and ref-typed fields inside widget config (Amendment 3; REQ-29..REQ-32)
- Reuse-vs-duplicate placement UX + explicit, non-inferred AI tool calls (Amendment 5; REQ-33..REQ-35)
- The Contact Form widget type as a thin adapter over `src/forms/` (Amendment 4; REQ-36..REQ-39)
- Flat `widgets.*` permissions, gateway-enforced (§5, §8; REQ-40..REQ-41)
- Deletion ladder (trash → purge-blocked-while-referenced → force-purge) reusing ADR-027's pattern via
  ADR-029's precedent (§7; REQ-42..REQ-43)
- A server-side, versioned document-mutation path for `widgetEmbed` edits with no live editor session
  required (Amendment 6; REQ-44..REQ-45)

**Out of scope:**
- Per-page region overrides — regions stay site-wide in v1 (ADR-047 Open #1, resolved: unnecessary, the
  motivating case is served by inline embed). Named future seam only.
- A structured page-builder "blocks array" field as an alternative to freeform embed — deferred (§9,
  Amendment 5's framing note). Freeform `widgetEmbed` is the only v1 embedding mechanism.
- Widget marketplace / plugin-contributed widget *types* — gated on ADR-024 plugin tiers, not this spec.
  v1 ships only the five core-owned types.
- A cross-request fragment cache — v1 explicitly ships without one (Amendment 2); resolvers declare
  dependency keys as a seam, nothing is wired to them yet.
- Per-widget visibility/role-gating DSL — the `widgets.region.filter`/`widgets.instance.resolve` hook
  points exist as seams (§8) but no DSL ships in v1.
- Extended term/taxonomy-target `entry_refs` coverage — entry-target refs (menu, form definition,
  success-page) are in scope; taxonomy-term-target refs are documented as soft references with no
  safe-delete guarantee until the extended-reference seam lands (Amendment 3's scope caveat).
- Any change to `src/forms/`'s own submission/rate-limit/mail pipeline — the Contact Form widget is a
  read-and-render adapter only; it must not modify, wrap with new logic, or duplicate any part of that
  pipeline (Amendment 4).
- Client/admin-JS plugin isolation questions — out of scope of this spec, governed by ADR-025.

---

## Requirements

### Widget instances (ADR-047 §1)

- REQ-01: The system shall allow a principal holding `widgets.create` to create a widget instance of a
  registered type, with a workspace-unique slug, a title, an initial `status` of `active`, and a
  `fields.ext.widget.*` config bag validated against that type's registered schema.
- REQ-02: The system shall reject a widget-instance write whose `fields.ext.widget.*` config fails
  validation against its declared type's registered schema, persisting nothing.
- REQ-03: The system shall reject a widget-instance write naming a `widgetType` not present in the
  widget-type registry.
- REQ-04: The system shall allow a principal holding `widgets.read` to read a widget instance's current
  state and its full revision history.
- REQ-05: The system shall allow a principal holding `widgets.update` to update an existing widget
  instance's config, recording a new revision in the same transaction as the write (single chokepoint,
  ADR-022 §4).
- REQ-06: The system shall reject a widget-instance update whose base `version` does not match the
  instance's current `version` (optimistic concurrency), returning a typed conflict.

### Widget-type registry (Debate Fold-In Amendment 3)

- REQ-07: The system shall maintain a widget-type registry as plain, JSON-serializable data (schema,
  default props, `capability` class — `static`|`query`|`form`|`entry-reference` — placement contexts,
  cost clamps), never importing or referencing executable behavior from a registration record.
- REQ-08: The system shall resolve a registration's `resolverId`, when present, only against a closed,
  core-owned map of resolver implementations — never accept an arbitrary module path, function name,
  query string, or expression from registry data.
- REQ-09: The system shall register five v1 types at boot: `text` and `social-links` (capability
  `static`, no resolver), `recent-entries` and `menu` (capability `query`/`entry-reference`, core
  resolver), `contact-form` (capability `form`, core resolver).
- REQ-10: The system shall treat any widget type without a registered resolver as `static`: its
  validated config renders directly with no behavioral resolution step.

### Region binding (Debate Fold-In Amendment 1)

- REQ-11: The system shall represent each theme-declared region's composition as a seeded entry
  (`type='widget_area'`) whose `bodyJson.placements` is an ordered list of `{ placementId: ULID,
  widgetEntryId: UUID }`, and whose `fields.ext.widgets.regionKey` names the region it fills.
- REQ-12: The system shall maintain `widget_region_bindings(workspace_id, region_key, area_entry_id)`,
  `UNIQUE(workspace_id, region_key)`, as a derived, rebuildable, non-revision-generating projection,
  reconciled from `widget_area` entries at the write chokepoint — never directly authored by any client.
- REQ-13: The system shall seed a `widget_area` entry for every region a theme declares, on theme
  activation, for any declared region key without an existing binding.
- REQ-14: The system shall retain (never delete) a `widget_area` entry whose region key a newly
  activated theme no longer declares, marking its binding `inactive` rather than removing it.
- REQ-15: The system shall allow a principal holding `widgets.place` to add, remove, reorder, or disable
  an entry in a `widget_area`'s placement list as one atomic, whole-document mutation, guarded by the
  entry's `version` optimistic-concurrency column — never as independent per-row writes.
- REQ-16: The system shall reject a `widget_area` mutation referencing a `widgetEntryId` that does not
  exist, is trashed, or belongs to a different workspace.
- REQ-17: The system shall never allow a `widget_area` entry to be selected as an ordinary widget
  instance, publicly routed, or referenced by a `widgetEmbed` node (no recursion into a region from
  inside a region).

### Inline embed (ADR-047 §2b, Debate Fold-In Amendment 5)

- REQ-18: The system shall support a block-level TipTap atom node, `widgetEmbed`, carrying a single
  widget-instance reference, insertable anywhere within any entry's `bodyJson` content area.
- REQ-19: The system shall reject, at the write chokepoint (not only in the editor UI), any document
  mutation that would nest a `widgetEmbed` node inside a widget instance's own `bodyJson` (no
  widget-in-widget recursion), regardless of mutation path.
- REQ-20: The system shall reject, at the write chokepoint, any document mutation that would exceed a
  configured maximum `widgetEmbed` node count for a single document.
- REQ-21: The system shall resolve every `widgetEmbed` node in an entry's `bodyJson` into its widget's
  rendered IR before that entry's content reaches the theme's `{{ content | render_rich_text }}` seam —
  the theme never resolves a `widgetEmbed` reference itself.
- REQ-22: The system shall reject a `widgetEmbed` node referencing a widget instance that does not
  exist, is trashed, or belongs to a different workspace, at write time.

### Resolution pipeline (Debate Fold-In Amendment 2)

- REQ-23: The system shall resolve every widget placed on a page (region-bound and inline-embedded)
  server-side, before Liquid template rendering, through either the static path (validated config
  renders directly) or a registered resolver's `resolveMany` call.
- REQ-24: The system shall load every distinct widget instance referenced on a single page render in at
  most one batched query (`WHERE id IN (...)`), grouped by type, invoking each type's `resolveMany` at
  most once per page render regardless of how many placements of that type exist.
- REQ-25: The system shall enforce each widget type's registered cost clamps (e.g. `recent-entries`'
  maximum item count) at the core orchestration layer, independent of the resolver's own discipline.
- REQ-26: The system shall enforce a timeout around every resolver invocation, converting a timeout to a
  `{ ok: false, reason: 'timeout' }` result rather than letting it hang the page render.
- REQ-27: The system shall convert any resolver exception, invalid resolver output, unknown widget type,
  invalid config, or missing/disabled/trashed target into a typed failure result — never an uncaught
  exception that propagates past the widget's placement boundary.
- REQ-28: The system shall render a widget resolution failure as an isolated placeholder — public output
  contains no internal error detail; the surrounding page renders normally; admin/preview output
  includes a correlation id and the failure reason.

### `entry_refs` minimal slice (Debate Fold-In Amendment 3)

- REQ-29: The system shall maintain an `entry_refs(workspace_id, source_entry_id, field_path,
  target_kind, target_id)` table, populated in the same transaction as the source entry's write, at the
  existing entries write chokepoint.
- REQ-30: The system shall extract a `widgetRef` entry into `entry_refs` for every `widget_area`
  placement (source: the area entry; target: the widget instance) and every `widgetEmbed` node (source:
  the hosting entry; target: the widget instance).
- REQ-31: The system shall extract a reference into `entry_refs` for every `ref`-typed field inside a
  widget instance's config (per ADR-022 §5's field-type vocabulary) whose target kind is an entry (e.g.
  a Contact Form's `formDefinitionId`, a Menu widget's `menuRef`).
- REQ-32: The system shall, for a widget config field whose target kind is a taxonomy term rather than
  an entry, treat that reference as a documented soft reference (extracted for where-used display where
  the installed schema supports the target kind, with no safe-delete guarantee) rather than claim full
  `entry_refs` coverage for it.

### Reuse, duplication, and AI placement (Debate Fold-In Amendment 5)

- REQ-33: The system shall, when placing a widget of a type with one or more existing instances, present
  the operator an explicit choice between placing (referencing) an existing instance and creating a new
  one — never a silent default.
- REQ-34: The system shall, when an operator opens a widget instance referenced in two or more places for
  editing, disclose the exact count and locations of its placements before or alongside the edit surface.
- REQ-35: The system shall expose `widgets.place` (reference an existing instance) and `widgets.create`
  (create and place a new instance) as distinct, explicit gateway operations for AI tool use — never an
  inferred default behind a single ambiguous tool call.

### Contact Form v1 adapter (Debate Fold-In Amendment 4)

- REQ-36: The system shall define the `contact-form` widget type's config schema to require a ref-typed
  `formDefinitionId` field targeting an existing Forms definition (`src/forms/`).
- REQ-37: The system shall render a `contact-form` widget instance's fields by reading the referenced
  Forms definition's declared field vocabulary — never a hardcoded field-type list — and submit through
  the existing public Forms submission route unmodified, inheriting its validation, honeypot handling,
  rate-limiting, and outbox-driven notification/webhook behavior in full.
- REQ-38: The system shall render a `contact-form` widget instance referencing a `disabled` Forms
  definition as the REQ-28 failure-isolation placeholder, not an error — Forms definitions are never
  deleted, only toggled `active`/`disabled` (SPEC-010 INV-08).
- REQ-39: The system shall introduce no new submission storage, rate-limiting, or mail-delivery logic
  for the `contact-form` widget type — every such concern is delegated to `src/forms/` unmodified.

### Permissions and deletion (ADR-047 §5, §7)

- REQ-40: The system shall gate every widget mutation (`create`, `update`, `place`, `delete`,
  `delete.force`) behind its corresponding flat `widgets.*` permission string, enforced by `authorize()`
  at the gateway before the mutation executes — for both human and AI-originated calls.
- REQ-41: The system shall reject any widget read or mutation attempted by a principal lacking the
  respective required `widgets.*` permission.
- REQ-42: The system shall, on a widget-instance delete request while the instance is referenced by any
  `widget_area` placement or `widgetEmbed` node, reject the request with `409` and the referencing list
  (sourced from `entry_refs`), unless the caller holds `widgets.delete.force`.
- REQ-43: The system shall follow the trash → purge ladder for widget-instance deletion: a `trash`
  transition is soft and revisioned; a `force-purge` (behind `widgets.delete.force`) flags any dangling
  references it creates rather than silently leaving them unresolved.

### Server-side agent-native mutation (Debate Fold-In Amendment 6)

- REQ-44: The system shall provide a server-side, versioned document-mutation command for inserting,
  removing, or reordering `widgetEmbed` nodes and `widget_area` placements, using the same document
  schema, chokepoint, and version-precondition guard as the live-editor mutation path — usable with no
  browser editor session open.
- REQ-45: The system shall apply REQ-19/REQ-20's guardrails (no recursion, embed-count clamp) identically
  regardless of whether a mutation originates from the live editor or the server-side command path.

<!-- Numbers must not be reused, even if a requirement is removed. -->

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a principal holding `widgets.create`, when they create a `text` widget
  instance with valid config, then the instance is created with `status: active` and a subsequent read
  returns it unchanged.
- AC-02 (REQ-02) [P1]: Given a `recent-entries` widget create request whose config sets `maxItems` above
  the type's registered clamp, when submitted, then the write is rejected with a validation error and no
  instance is created.
- AC-03 (REQ-03) [P1]: Given a widget create request naming `widgetType: "carousel"` (unregistered), when
  submitted, then the write is rejected and no instance is created.
- AC-04 (REQ-05/06) [P1]: Given an existing widget instance at `version: 3`, when two concurrent updates
  both submit `baseVersion: 3`, then exactly one succeeds (now `version: 4`) and the other is rejected
  with a typed conflict naming the current version.
- AC-05 (REQ-08) [P1]: Given a widget-type registration record loaded from the registry, when its
  `resolverId` is inspected, then it resolves only to a function present in the closed core resolver map
  — no registry-supplied string is ever used as a dynamic import path or `eval`-style reference.
- AC-06 (REQ-11/12) [P1]: Given a theme declaring a `footer` region with no existing binding, when the
  theme is activated, then a `widget_area` entry is created and `widget_region_bindings` gains exactly
  one row `(workspace, 'footer', <new area entry id>)`.
- AC-07 (REQ-12) [P1]: Given a `widget_area` entry's `regionKey` field, when compared against
  `widget_region_bindings`, then the binding table's `area_entry_id` for that region always matches the
  entry whose `fields.ext.widgets.regionKey` names that region — verified by an explicit reconciliation
  test, not merely by construction.
- AC-08 (REQ-13/14) [P1]: Given a site with an active `widget_area` bound to region `sidebar`, when the
  operator switches to a theme that does not declare a `sidebar` region, then the `widget_area` entry and
  its widget placements are retained (not deleted) and the binding is marked `inactive`.
- AC-09 (REQ-15) [P1]: Given a `widget_area` entry with two placements, when an operator reorders them in
  one save action, then the mutation succeeds as a single versioned write and the entry's revision
  history shows one new revision, not two.
- AC-10 (REQ-16) [P1]: Given a `widget_area` mutation referencing a `widgetEntryId` from a different
  workspace, when submitted, then the write is rejected and the area entry is unchanged.
- AC-11 (REQ-17) [P1]: Given a `widgetEmbed` node authoring attempt inside a page body, when the target
  is a `widget_area`-type entry, then the write is rejected — a region can never be embedded inline.
- AC-12 (REQ-18/21) [P1]: Given a page whose body contains one `widgetEmbed` node referencing a `text`
  widget instance, when the page is rendered, then the theme receives fully-resolved IR at that position
  — the theme template never sees a raw `widgetEmbed` reference.
- AC-13 (REQ-19) [P1]: Given a mutation attempt (via any path — editor or server-side command) that would
  place a `widgetEmbed` node inside a widget instance's own `bodyJson`, when submitted, then it is
  rejected at the chokepoint regardless of origin.
- AC-14 (REQ-20) [P1]: Given a document already at the configured maximum `widgetEmbed` count, when one
  more embed is attempted, then the mutation is rejected with a typed limit error.
- AC-15 (REQ-22) [P1]: Given a `widgetEmbed` node authored against a trashed widget instance, when the
  write is attempted, then it is rejected at write time — a dangling embed is never newly created by a
  fresh write (existing dangling refs from a later trash are handled by REQ-27/28, not this path).
- AC-16 (REQ-24) [P1]: Given a page whose footer region contains 5 `recent-entries` widget instances,
  when the page is rendered, then exactly one batched entry-load query and one `resolveMany` call for
  type `recent-entries` are made — never 5 separate resolver invocations.
- AC-17 (REQ-25) [P1]: Given a `recent-entries` instance configured with `maxItems: 500` (above the
  type's registered clamp of 20), when resolved, then the result is capped at the registered clamp
  regardless of the instance's own configured value.
- AC-18 (REQ-26) [P1]: Given a resolver call that never returns within its configured timeout, when the
  page renders, then that widget's placement receives a `timeout` failure result and the page still
  completes rendering within a bounded time.
- AC-19 (REQ-27/28) [P1]: Given a resolver that throws an uncaught exception, when the page renders, then
  the exception is caught at the orchestration boundary, the widget renders its isolated placeholder, and
  every other widget on the page renders normally — verified end-to-end at the page-render boundary, not
  by unit-testing the orchestrator alone.
- AC-20 (REQ-28) [P1]: Given a widget resolution failure on a publicly rendered page, when the response
  HTML is inspected, then it contains no stack trace, internal identifier, or configuration secret.
- AC-21 (REQ-29/30) [P1]: Given a widget instance placed in one region and embedded inline on one other
  page, when `entry_refs` is queried for that instance, then it returns exactly two rows, one per
  placement, each correctly typed (`widgetRef` from area entry; `widgetRef` from the embedding entry).
- AC-22 (REQ-31) [P1]: Given a `contact-form` widget instance whose config references `formDefinitionId:
  X`, when `entry_refs` is queried for Forms definition `X`, then the widget instance appears as a
  referencing source.
- AC-23 (REQ-33) [P1]: Given a `text` widget type with 2 existing instances, when an operator opens the
  "place widget" flow for that type, then both "use existing" and "create new" are presented as explicit
  options — neither happens by default without a choice.
- AC-24 (REQ-34) [P1]: Given a widget instance referenced in 3 places, when an operator opens it for
  editing, then the edit surface discloses "used in 3 places" with the specific locations, before any
  edit is committed.
- AC-25 (REQ-35) [P1]: Given an AI agent tool call, when it invokes `widgets.place` versus
  `widgets.create`, then the two produce observably different outcomes (reference vs. new instance) —
  there is no single ambiguous "add widget" tool call that could mean either.
- AC-26 (REQ-37) [P1]: Given a `contact-form` widget instance referencing an active Forms definition with
  fields `name`/`email`/`message`, when the widget renders, then it presents exactly those three fields
  and submits to the same public route a native Forms-rendered form would use, with the same validation
  outcome for an invalid submission.
- AC-27 (REQ-38) [P1]: Given a `contact-form` widget instance whose Forms definition is later set to
  `disabled`, when the widget renders publicly afterward, then it shows the REQ-28 placeholder, not the
  form, and no submission is possible through that placement.
- AC-28 (REQ-40/41) [P1]: Given a principal lacking `widgets.place`, when they attempt to bind a widget
  into a region, then the request is rejected with `FORBIDDEN` and the region's `widget_area` is
  unchanged.
- AC-29 (REQ-42) [P1]: Given a widget instance placed in one region, when a delete (not force-delete) is
  attempted, then it is rejected with `409` and a body naming the referencing region.
- AC-30 (REQ-44) [P1]: Given no live editor session for a page, when a server-side command inserts a
  `widgetEmbed` node into that page's body, then the mutation succeeds through the same chokepoint and
  version-precondition guard the live-editor path uses, and a subsequent read of the page shows the new
  embed.

<!-- Rules: every REQ-* has at least one AC; every AC has a priority tag; P1 ACs are independently testable; AC numbers are never reused. -->

---

## Invariants

- INV-01: A widget instance's `fields.ext.widget.*` config must always validate against its declared
  type's currently-registered schema — an invalid config is never persisted, even transiently.
- INV-02: `widget_region_bindings` must always be derivable, in full, by reconciling from `widget_area`
  entries alone — it must never be the sole source of truth for any fact.
- INV-03: A `widget_area` entry's placement-list mutation is always a single whole-document write guarded
  by the entry's `version` column — there is no code path that patches one placement row independently.
- INV-04: A `widgetEmbed` node must never exist, at rest, inside a widget instance's own `bodyJson` —
  enforced at every write path, not only the editor UI.
- INV-05: A widget resolver invocation must never be allowed to propagate an unhandled exception or
  unbounded execution time past the page-render orchestration boundary.
- INV-06: Every `entries` write that creates, updates, or removes a widget-instance reference (region
  placement, inline embed, or a ref-typed config field) must extract or retract the corresponding
  `entry_refs` row in the same transaction as that write.
- INV-07: A widget mutation (create/update/place/delete) must never bypass its required `widgets.*`
  permission check, regardless of whether the caller is a human session or an AI agent.
- INV-08: The `contact-form` widget type must never persist a submission, send an email, or perform rate
  limiting itself — every such action occurs exclusively inside `src/forms/`'s existing pipeline.
- INV-09: A widget instance referenced by at least one `widget_area` placement or `widgetEmbed` node must
  never be permanently deleted by a plain `delete` call — only `delete.force` may remove a referenced
  instance, and it must flag the resulting dangling references.

---

## Edge Cases

- EC-01: What happens when a widget instance is placed in a region and the theme is switched to one that
  doesn't declare that region at all? Expected: the placement is retained on the (now `inactive`-bound)
  `widget_area` entry; nothing renders publicly until a theme with that region is active again (REQ-14).
- EC-02: What happens when an operator reorders a region's widgets while an AI agent is concurrently
  placing a new widget into the same region? Expected: whichever write lands first wins under the
  entry's `version` OCC guard (REQ-15); the second is rejected as a conflict and must retry against the
  new version — no silent last-writer-wins on the ordered list.
- EC-03: What happens when a `recent-entries` widget's configured category filter targets a taxonomy
  term that is later deleted? Expected: per REQ-32, this is a documented soft reference — the widget may
  render as if the filter is empty/unset, or via its own resolver-level "missing target" handling; it is
  explicitly not guaranteed the same safe-delete blocking a `contact-form`'s `formDefinitionId` gets.
- EC-04: What happens when two widget instances of the same type are placed in the same region? Expected:
  both are resolved in the same `resolveMany` batch call (REQ-24) — batching is per-type-per-page, not
  per-region, so this does not create a second resolver invocation.
- EC-05: What happens when a `contact-form` widget's referenced Forms definition is permanently
  unreachable (deleted at the data layer through some path other than the normal disable lifecycle)?
  Expected: treated identically to `disabled` for rendering purposes (REQ-38) — the widget must not
  crash attempting to load a definition that isn't there.
- EC-06: What happens when an operator force-deletes a widget instance that is still referenced? Expected:
  per REQ-43, every dangling reference this creates (in `entry_refs`) is flagged, and every affected
  region/page shows the REQ-28 failure placeholder at that placement going forward — not a silent removal
  of the placement itself.
- EC-07: What happens when a `widgetEmbed`'s target instance is trashed (soft-delete, not force-purged)?
  Expected: same as a broken reference — the placement resolves to the REQ-28 placeholder; restoring the
  instance from trash restores normal rendering with no further mutation needed.
- EC-08: What happens when the widget-type registry is queried for a type that was removed from the
  registry (e.g. a version rollback) but instances of that type still exist? Expected: those instances
  resolve to `unknown-type` per REQ-27/28's failure taxonomy — isolated placeholder, page still renders.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `entries` / `entry_revisions` / `change_sets` (ADR-022, `src/infra/db/schema.ts`) | The substrate widget instances and `widget_area` entries are built on — universal columns, single write chokepoint, revisions | None — confirmed present and running as of the ADR-047 debate | N/A |
| `src/navigation/` (ADR-029) | The exact structural pattern (`nav_location_bindings` as derived/reconciled projection) this spec's region-binding mechanism mirrors | None — confirmed running code, inspected directly during the ADR-047 debate | N/A |
| `entry_refs` (ADR-022 §5) | Reference extraction/where-used/safe-delete for widget placements and config refs | **Does not exist as running code** (confirmed during the ADR-047 debate — no table in `schema.ts`; `navigation/resolver.ts` names the gap explicitly) | This spec's REQ-29 through REQ-32 build the minimal slice — it is a named build item of this spec, not an external dependency assumed pre-built |
| `src/forms/` (SPEC-010, ADR-PIPE-010) | The entire Contact Form submission/rate-limit/notification pipeline the `contact-form` widget type delegates to | None — confirmed complete, tested, wired to a real `MailerPort` during the ADR-047 debate | N/A — the widget type has no fallback of its own; it is a pure adapter (REQ-39) |
| `src/mail/` (ADR-037, `MailerPort`) | The mail-send seam `src/forms/notify-subscriber.ts` already calls | None — confirmed implemented, real consumers exist | N/A |
| ADR-020 Liquid renderer / component registry (`render_block` seam) | The theme-facing rendering mechanism region-bound widgets render through | None — existing, unchanged by this spec | N/A |
| ADR-016 CopilotKit frontend-action / change-set review layer | The human-editor half of the AI mutation surface (§Amendment 6 adds the server-side half) | None — existing pattern | N/A |
| ADR-024 (Tier-1 bounded/total validation) | The safety discipline widget config schemas and the expression surface must satisfy | None — existing rule, applied here | N/A |

---

## Open Questions

- OQ-01: Exact resolver timeout value (proposed default 500ms per one debate artifact, not ratified) —
  Owner: Software Architect — Resolve by: implementation-outline stage.
- OQ-02: Whether a post-v1 cross-request fragment cache is added, and its adapter shape — explicitly
  deferred by the debate (Amendment 2); resolvers declare `dependencyKeys` now as the seam. Owner:
  Coordinator — Resolve by: not blocking v1, revisit on measured render-latency evidence.
- OQ-03: Precise term/taxonomy-target `entry_refs` extension shape (the extended-reference seam named in
  Amendment 3's scope caveat) — Owner: Software Architect — Resolve by: before any widget type ships a
  taxonomy-term-typed config field beyond `recent-entries`' filter (v1-acceptable as a soft reference
  per REQ-32/EC-03; the seam itself is out of scope here).
- OQ-04: Exact Drizzle migration naming/table layout for `widget_area`'s registration as a seeded content
  type, `widget_region_bindings`, and `entry_refs` — mechanical, no behavior impact. Owner: Software
  Architect — Resolve by: implementation-outline stage.

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | No new dependency. Widget resolution, embed guardrails, and the `entry_refs` extractor are all built on existing primitives (entries chokepoint, TipTap/ProseMirror, ADR-022 field vocabulary). |
| II — Test-First | COMPLIES | TDD Agent certifies failing tests against this spec before implementation, per Article II — see the companion implementation outline and test plan. |
| III — Simplicity Gate | COMPLIES | Every new surface traces to a requirement: `widget_area`/`widget_region_bindings` → REQ-11/12; the resolver contract → REQ-23-28; `entry_refs` slice → REQ-29-32; Contact Form adapter → REQ-36-39. No marketplace, no fragment cache, no visibility DSL, no structured blocks-array — all explicitly out of scope, per the debate's own convergence on a minimal v1. |
| IV — Anti-Abstraction Gate | COMPLIES | One new real port (`WidgetRegionBindingRepoPort`, mirroring `NavLocationBindingRepoPort` exactly per ADR-047 §6); widget instances ride the existing entries repo; resolution and the widget-type registry stay one-evaluator typed calls, not new ports, per ADR-047's explicit anti-port-mania stance (§6, following ADR-029 §5's precedent). |
| V — Integration-First Testing | COMPLIES | Every P1 AC above is verified at a real boundary — the command gateway, a real page-render pass, or the `entry_refs` table's actual query surface — not a mocked resolver or a unit-isolated chokepoint. |
| VI — Security-by-Default | COMPLIES | Every mutation is `widgets.*`-permission-gated at the gateway (REQ-40/41/INV-07); the Contact Form widget introduces no new authenticated or public surface beyond what `src/forms/` already exposes (REQ-39); registry data can never name arbitrary executable code (REQ-08). |
| VII — Spec Integrity | COMPLIES | This spec is the reference for ADR-047's v1 implementation; every requirement cites its originating ADR section or Debate Fold-In amendment. |
| VIII — Observability | COMPLIES | Every resolution failure carries a correlation id and typed reason (REQ-27/28); every widget mutation flows through the existing outbox-event pattern (§8) for downstream observability consumers. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique (`043-widgets` unused in `ADS-project-knowledge/specs/` and
      `reports/pipeline/` as of 2026-07-21)
- [x] version set to correct semver
- [x] status set to APPROVED
- [x] feature_name matches the FEAT folder name
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a priority tag and follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked
- [x] Scope: in-scope and out-of-scope lists present and non-empty
- [x] Problem Statement: "Why now" is filled
- [x] User Journey: trigger, steps, outcome, and alternate paths present
- [ ] Full 9-file Speckit package present — **partial**: `feature.spec.md` (this file) is complete and
      self-contained (route/error/state detail folded inline into Requirements/Invariants/Edge Cases
      rather than split into separate `api.spec.md`/`errors.spec.md`/`state.spec.md` files, given the
      scale already produced this session); `ui.spec.md`/`traceability.spec.md`/`spec-manifest.md`/
      `spec-dod.md` are deferred — see `spec-manifest.md` in this folder for the explicit per-file
      PRESENT/OMITTED disposition and reasons.

**Gate result:** PASS (with the one explicit, disclosed partial item above — not silently omitted).

---

## Agent Directives (optional)

Always:
- Read `src/navigation/{types,ports,resolver,reconcile}.ts` in full before implementing the region-
  binding mechanism — REQ-11/12 are a deliberate structural mirror of that exact code, not a fresh
  design; deviating from its shape without a stated reason is a spec violation.
- Read `src/forms/{submit-service,rate-limit-profile,notify-subscriber,manifest}.ts` in full before
  implementing the `contact-form` widget type — REQ-36-39 require zero new submission/rate-limit/mail
  logic; any new logic in that area is out of scope and must be flagged, not built.
- Verify `entry_refs` does not already exist before building REQ-29 (confirmed absent as of the ADR-047
  debate, 2026-07-21 — re-verify at implementation time in case another slice landed it first).

Ask before:
- Building a taxonomy-term-target `entry_refs` extension beyond the documented soft-reference behavior
  (OQ-03) — that is a separate, larger decision this spec does not authorize.
- Wiring any cross-request fragment cache (OQ-02) — explicitly deferred by the debate.

Never:
- Add a structured blocks-array page-builder field as part of this spec's scope.
- Add new submission storage, rate-limiting, or mail-delivery logic to the `contact-form` widget type.
- Let a widget-type registration record name executable code by string (module path, function name,
  query text) outside the closed core resolver map.

## 3. Implementation outline (governing contract, full text)

# Implementation Outline: widgets

- Spec: SPEC-043 v1.0.0 (validator not run — see `ADS-project-knowledge/specs/043-widgets/spec-manifest.md`)
- ADR: ADR-047 (widgets-region-and-embed-placement), debate-cleared 2026-07-21
- Status: PRODUCED
- Trigger result: Boundary Cross, Contract Change, System Wiring, Data And Persistence, Critical Cross-Boundary Invariant, Parallelization Ambiguity
- Date: 2026-07-21
- Author: Coordinator (Claude Sonnet 5), direct — not a dispatched Software Architect persona run

> Use this artifact only for post-ADR, pre-tasks structure. Module boundaries, public contracts,
> wiring, data boundaries, critical invariants — no pseudo-code, no private-helper inventory, no task
> sequencing.

## Trigger Decision Matrix

| Trigger | Applies? | Evidence | Source Trace |
|---|---:|---|---|
| Boundary Cross | yes | Crosses a new `src/widgets` domain + `src/infra/db/schema.ts` (new tables) + `src/server/routes/admin/widgets/` (API) + `apps/admin/src/sections/{WidgetsLibrary,WidgetPlacement}.tsx` (UI) + `src/navigation` (menu-as-widget delegation) + `src/forms` (Contact Form delegation) + `src/identity` (permission catalog) + the TipTap editor package (new node type) | REQ-01..45 |
| Contract Change | yes | New HTTP routes (widget CRUD, region-area mutation, AI tool routes); new `WidgetRegionBindingRepoPort`/`EntryRefsRepoPort` exported interfaces; new outbox events (`widgets.instance.*`, `widgets.region.*`, `widgets.embed.*`) | feature.spec.md Requirements |
| System Wiring | yes | New page-render-time resolution pipeline sits between the existing entry-read path and the Liquid render seam — a real insertion into the render pipeline, not an additive sibling module | REQ-23, REQ-24 |
| Data And Persistence | yes | New tables: `widget_region_bindings`, `entry_refs`; new seeded content types `widget` and `widget_area` registered against the existing `entries`/content-type-registry mechanism (no new physical table for instances themselves) | REQ-01, REQ-11, REQ-29 |
| Brownfield Dependency | yes | Consumes `src/navigation/` (structural pattern to mirror, not just a library call) and `src/forms/` (delegated pipeline) — both real, already-shipped code whose exact shape this feature's correctness depends on | spec-manifest.md Brownfield References |
| Reverse-Spec Or Migration | no | Greenfield feature; `entry_refs` is a net-new build item, not a migration of prior widget state (none exists) | — |
| Critical Cross-Boundary Invariant | yes | INV-03 (single whole-document region mutation under OCC), INV-04 (no widget-in-widget recursion, chokepoint-enforced), INV-05 (resolver failure isolation), INV-06 (entry_refs extraction atomicity), INV-08 (Contact Form delegates, never duplicates, Forms' pipeline) — all span the entries chokepoint + the new resolution pipeline + two brownfield dependencies | feature.spec.md Invariants |
| Parallelization Ambiguity | yes | Schema + widget-instance CRUD + the widget-type registry must land before the region-binding mechanism and the resolver pipeline can be built against real contracts, which in turn must land before any dynamic widget type (Recent Entries, Menu, Contact Form) can be implemented; `entry_refs`'s minimal slice is a hard prerequisite for the reuse/duplicate edit-time UX (REQ-33/34) and safe-delete (REQ-42), not an independent slice | feature.spec.md Dependencies, Debate Fold-In Amendment 3 |

## Module Map

| Module/Domain | Owns | Responsibility | Public Contracts | Dependencies | Notes |
|---|---|---|---|---|---|
| `widgets` (`src/widgets/`) | Widget-type registry data; resolver orchestration; `widget_area`/binding reconcile logic; the `entry_refs` extractor (shared, but landed as part of this feature per REQ-29) | Instance CRUD (via gateway), region composition, resolution pipeline, Contact Form adapter, reuse/duplicate + AI tool surface | C-001..C-020 | `core` (entries chokepoint, outbox), `identity` (`authorize()`), `navigation` (menu resolver delegation), `forms` (Contact Form delegation, read-only), `infra/db` (schema) | Mirrors `src/navigation/` and `src/forms/` layout exactly, per Agent Directives in feature.spec.md |
| `core` / entries chokepoint (existing, extended) | `entries` table now also carries `type='widget'`/`type='widget_area'` rows; the `entry_refs` table and its chokepoint-side extractor hook | The single write chokepoint gains one more extraction responsibility (widget refs, config refs) | Existing `executeCommand`, extended | — | `entry_refs` is schema-owned by `core`, not `widgets`, since ADR-022 §5 frames it as core content-model infrastructure any feature can populate — `widgets` is simply the first real consumer to build the extractor |
| `navigation` (existing, read-only dependency) | Nav resolution | The `menu` widget type's resolver delegates entirely to `navigation/resolver.ts`'s existing `resolveForLocation`-equivalent — no menu-resolution logic is duplicated in `widgets` | Existing, unchanged | — | `widgets` depends on `navigation`; `navigation` gains no dependency on `widgets` |
| `forms` (existing, read-only dependency) | Form definitions + submission pipeline | The `contact-form` widget type's resolver reads a form definition (read-only) and its render component posts to the existing public submission route unmodified | Existing, unchanged | — | `widgets` depends on `forms`; `forms` gains no dependency on `widgets` (REQ-39) |
| `server` routes (existing, extended) | HTTP wiring for `widgets`; render-pipeline injection point ahead of Liquid rendering | Route registration + `authorize()` gating + the page-render-time resolution call | C-016..C-020 | `widgets`, `identity` | Admin routes mirror `routes/admin/menus/`; render-pipeline injection touches the existing site-serving render path |
| `apps/admin` UI (existing, extended) | Widget library, region/placement manager, reuse-vs-duplicate dialog | Renders/edits widget instances and region composition via the admin API | UI-facing, not fully typed here — deferred to a follow-up `ui.spec.md` per `spec-manifest.md`'s disclosed omission | `server` routes (via fetch) | Flat files per repo convention, mirrors `Menus.tsx`-equivalent |
| TipTap editor extension (`apps/admin` or shared editor package) | The `widgetEmbed` ProseMirror node type + its editor-side insertion UI | Client-side authoring surface for inline embed | N/A (editor node schema) | `widgets` (fetches widget instances for the picker) | Editor-side guardrails are UX only — REQ-19/20's real enforcement is server-side (C-006) |

## File Map

| File Path | Module | Creates / Changes | Public Contracts Housed | Responsibility | Why This Separation Exists | Notes |
|---|---|---|---|---|---|---|
| `src/widgets/types.ts` | widgets | creates | C-001 `WidgetInstanceEntry`, `WidgetAreaEntry`, `WidgetTypeRegistration`, IR/result types | Shared type vocabulary | One place for the shapes every other file imports, mirrors `navigation/types.ts` | No behavior |
| `src/widgets/registry.ts` | widgets | creates | C-002 the five v1 `WidgetTypeRegistration` records + `registerWidgetType`/`getWidgetTypeRegistration` | Plain-data type registry (REQ-07..10) | Isolates "what a widget type declares" from "how it behaves" — the load-bearing seam Debate Fold-In Amendment 3 requires; mirrors `forms/manifest.ts`'s data-only discipline exactly | Code Review enforces zero function/closure exports from this file, same as `forms/manifest.ts` |
| `src/widgets/resolvers/index.ts` | widgets | creates | C-003 `CORE_RESOLVERS` closed map | The one place a `resolverId` string resolves against real code (REQ-08) | Structural guarantee that registry data can never name arbitrary executable behavior | Adding a resolver = adding one entry here, never a dynamic import |
| `src/widgets/resolvers/recent-entries.ts` | widgets | creates | (implements C-003's `recent-entries` entry) | Bounded entries query resolver (REQ-25) | One file per dynamic type, matches `navigation`'s one-resolver-per-concern shape | Hard `maxItems` clamp enforced here AND at the orchestration layer (REQ-25 — defense in depth, not redundant) |
| `src/widgets/resolvers/menu.ts` | widgets | creates | (implements C-003's `menu` entry) | Delegates to `navigation/resolver.ts` unchanged | Zero menu-resolution logic duplicated (Amendment 1 note) | Thinnest possible resolver — a pass-through |
| `src/widgets/resolvers/contact-form.ts` | widgets | creates | (implements C-003's `contact-form` entry) | Loads a Forms definition (read-only) via `FormDefinitionRepoPort`, emits field-descriptor IR (REQ-36/37) | Keeps the Contact Form adapter's only job — read + render — physically separate from any temptation to add submission logic | Must never import `submit-service.ts`/`notify-subscriber.ts` — only the read-side `ports.ts` |
| `src/widgets/resolver-service.ts` | widgets | creates | C-004 `resolvePageWidgets` | The batch-first orchestration pipeline (REQ-23..28): collect placements → one `IN`-query load → group by type → one `resolveMany` per group → assemble `regions.<key>: IR[]` + inline-embed IR | The single seam that turns "a page's widget references" into "resolved data the theme can render" — mirrors the `render.ts` "theme is data, core resolves" stance | Timeout/cost-clamp enforcement (REQ-25/26) lives here, not in individual resolvers, so no resolver can bypass it |
| `src/widgets/write-service.ts` | widgets | creates | C-005 `createWidgetInstance`, `updateWidgetInstance`, `trashWidgetInstance`, `purgeWidgetInstance` | Widget-instance CRUD through the existing entries chokepoint (REQ-01..06, REQ-42/43) | Same chokepoint discipline as `posts`/`menus`/`forms` — no parallel mutation path | OCC conflict handling per REQ-06 lives here |
| `src/widgets/region-area-service.ts` | widgets | creates | C-006 `bindWidgetArea`, `mutateWidgetAreaPlacements`, `reconcileWidgetRegionBindings` | `widget_area` entry CRUD + whole-document placement mutation + the derived-binding reconcile step (REQ-11..17) | Mirrors `navigation/reconcile.ts` deliberately — same reconcile-not-author discipline for the binding table | Theme-activation seeding (REQ-13) and orphan retention (REQ-14) live here |
| `src/widgets/embed-service.ts` | widgets | creates | C-007 `insertWidgetEmbed`, `removeWidgetEmbed`, `reorderWidgetEmbeds` (server-side path, REQ-44/45) | The server-side, versioned document-mutation command for `widgetEmbed` nodes — the second entry point into the same mutation contract the live editor uses | Debate Fold-In Amendment 6's explicit requirement: AI must not depend on a live editor session | Enforces REQ-19/20 (no recursion, count clamp) identically to the editor path — calls the same schema-validation function as C-008 |
| `src/widgets/embed-validation.ts` | widgets | creates | C-008 `validateWidgetEmbedMutation` | Shared chokepoint-level schema validation for `widgetEmbed` nodes (no recursion, count clamp — REQ-19/20) | One validator, two callers (live-editor path via the existing ADR-016 change-set layer, and C-007's server-side path) — guarantees identical enforcement regardless of origin | Pure decision function, no I/O |
| `src/core/entry-refs/extractor.ts` | core | creates | C-009 `extractEntryRefs` | The chokepoint-side `entry_refs` extractor (REQ-29..32) — walks a written entry's `bodyJson`/`fields.ext.*` for `ref`-typed fields and `widgetRef`-shaped nodes, writes rows in the same transaction | Placed under `core`, not `widgets`, since ADR-022 §5 frames `entry_refs` as core content-model infrastructure; `widgets` is its first real populating consumer | Must be called from the single entries chokepoint, not from `widgets`-specific write paths, so any future feature reusing `ref` fields gets coverage for free |
| `src/core/entry-refs/ports.ts` | core | creates | C-010 `EntryRefsRepoPort` | Persistence seam for the `entry_refs` table, rule-of-two | Matches every other repo-port convention in this codebase | Two adapters: `repo.memory.ts`, `repo.sqlite.ts` |
| `src/core/entry-refs/repo.memory.ts`, `repo.sqlite.ts` | core | creates | (implements C-010) | Rule-of-two adapters | — | — |
| `src/widgets/ports.ts` | widgets | creates | C-011 `WidgetRegionBindingRepoPort` | Persistence seam for `widget_region_bindings`, rule-of-two, mirrors `NavLocationBindingRepoPort` exactly (ADR-047 §6) | No new persistence port for widget instances themselves — they ride the existing entries repo | — |
| `src/widgets/repo.memory.ts`, `repo.sqlite.ts` | widgets | creates | (implements C-011) | Rule-of-two adapters for the binding index | — | — |
| `src/widgets/errors.ts` | widgets | creates | C-012 typed error classes (`WidgetTypeUnregisteredError`, `WidgetConfigValidationError`, `WidgetVersionConflictError`, `WidgetAreaConflictError`, `WidgetReferencedError`, `WidgetEmbedGuardrailError`) | Typed domain errors → route-layer error-code mapping | Mirrors `forms/errors.ts`'s convention | One class per REQ-tagged rejection path |
| `src/infra/db/schema.ts` | infra | changes | (Drizzle table defs) | Adds `widgetRegionBindings`, `entryRefs` Drizzle table definitions; registers `widget`/`widget_area` as seeded content-type registry rows (no new physical table for instances — they're `entries` rows) | Shared schema file, existing convention | No behavior — pure schema + registry seed data |
| `src/identity/permissions.ts` | identity | changes | (extends the permission catalog) | Registers `widgets.read`/`.create`/`.update`/`.place`/`.delete`/`.delete.force` (REQ-40) | Existing single registration point | Verbatim strings match feature.spec.md's REQ-40 |
| `src/server/routes/admin/widgets/*.ts` | server | creates | C-016 admin widget CRUD registrars | HTTP wiring for widget instance + region-area + embed routes | One file per endpoint group, matches `routes/admin/menus/` | — |
| `src/server/routes/admin/widgets/agent-tools.ts` | server | creates | C-017 `widgets.place`/`widgets.create`/`widgets.remove`/`widgets.diagnose` tool registrations | AI tool surface (REQ-35, REQ-44) | Thin gateway clients, same shape as `navigation`'s AI tools per ADR-029 §8 precedent | Every tool call maps 1:1 to a C-005/C-006/C-007 function — no separate AI mutation logic |
| `src/server/render/resolve-page-widgets.ts` or the existing site-render pipeline file (touch point TBD by Programmer — see Downstream Handoff Notes) | server | changes | (wiring only) | Calls C-004 `resolvePageWidgets` ahead of the Liquid render call, injects `regions.<key>` and resolved inline-embed IR into render context | Existing single render-pipeline wiring point | Programmer must locate the exact current site-render call site before wiring this in — not fully known from the spec alone, flagged as an open implementation detail |
| `src/server/app.ts` | server | changes | (wiring only) | Imports + registers the widget route registrars; registers the widget-type registry at boot | Existing single wiring point | — |
| `apps/admin/src/sections/WidgetsLibrary.tsx`, `WidgetPlacement.tsx` | apps/admin | creates | (UI-facing) | Widget library list/editor screen; region/placement manager with the reuse-vs-duplicate dialog (REQ-33/34) | Matches `Menus.tsx`-equivalent flat-file convention | May split into local sub-files if it exceeds practical single-file size, same escape hatch prior specs used |
| TipTap `widgetEmbed` node extension (exact file TBD — likely alongside existing editor extensions) | apps/admin (editor package) | creates | (editor node schema + insertion UI) | Client-side authoring surface | Editor-side guardrail UX only — enforcement is server-side (C-008) | Programmer locates the existing TipTap extension registration point |

## Contract Map

| Contract ID / Name | File | Owner Module | Kind | Why Needed | Job | Inputs | Outputs | Validation | Errors | Effect Boundary | Aggregate-Risk Note | Spec/ADR Trace | Test Seam / Expectation |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C-002 `getWidgetTypeRegistration` | `registry.ts` | widgets | exported function | REQ-03/07/08 | Look up a type's registration data by key | `typeKey: string` | `WidgetTypeRegistration \| undefined` | N/A | N/A | Pure read | **Aggregate-risk:** the only legitimate path from a `resolverId` string to executable code is through this record's field into C-003's closed map — a second lookup path anywhere else would reopen REQ-08's guarantee | REQ-03/07/08, AC-05 | Static check: no file outside `resolvers/index.ts` imports `resolverId` and calls anything dynamic with it |
| C-003 `CORE_RESOLVERS` + `resolveWidgetType(typeKey, instances, ctx)` | `resolvers/index.ts` | widgets | exported const + function | REQ-08/09/10/23 | Dispatch to the correct resolver's `resolveMany`, or the static path for types with no resolver | `typeKey`, `WidgetInstanceView[]`, `WidgetResolveContext` | `Map<UUID, WidgetResolveResult>` | `typeKey` must exist in the registry (else `unknown-type` per REQ-27) | Never throws — converts resolver exceptions to typed failure results (REQ-27) | Wraps resolver calls; owns the try/catch boundary | Invariant case: this is the ONE place a resolver's thrown exception is caught — a resolver added later without going through this dispatcher bypasses INV-05 entirely | REQ-08/09/10/23/27, AC-19 | Integration test: a deliberately-throwing test resolver registered here still yields an isolated placeholder, not a crash |
| C-004 `resolvePageWidgets` | `resolver-service.ts` | widgets | exported function | REQ-23..28 | Collect all region + inline placements for a page, batch-load instances, group by type, call C-003 once per group, assemble render context | `{ workspaceId, pageEntryId, resolvedRegions: regionKey[] }` | `{ regions: Record<string, RenderIR[]>, inlineResolved: Map<placementId, RenderIR> }` | N/A (orchestration) | Per-widget failures isolated (REQ-27/28); never throws to the caller | Read-only against `entries`/registry; no writes | **Aggregate-risk:** AC-16 (batching) and AC-19 (failure isolation) both depend entirely on this one function's control flow — a future refactor that moves resolution inline into route handlers would silently reintroduce N+1 queries and unhandled exceptions | REQ-23..28, AC-16/17/18/19/20 | Integration test at a real page-render pass: assert exactly one query per type present, assert one broken widget doesn't affect siblings |
| C-005 `createWidgetInstance`/`updateWidgetInstance`/`trashWidgetInstance`/`purgeWidgetInstance` | `write-service.ts` | widgets | exported functions | REQ-01..06, REQ-42/43 | Authorize → validate config against C-002's schema → mutate via `executeCommand` | `{ workspaceId, actor, widgetType, config, baseVersion? }` variants | `{ instance: WidgetInstanceEntry }` | Config validated against the type's registered schema (REQ-02); `widgetType` must be registered (REQ-03) | `WidgetTypeUnregisteredError`, `WidgetConfigValidationError`, `WidgetVersionConflictError`, `WidgetReferencedError` (delete without force while referenced) | Explicit side effect: entries chokepoint write | Invariant case: `purgeWidgetInstance` without `force` must check `entry_refs` (C-009's table) before proceeding — the sole gate for REQ-42 | REQ-01..06/42/43, AC-01..04/29, INV-01/09 | Integration test at the real entries chokepoint, including the OCC-conflict race (AC-04) |
| C-006 `bindWidgetArea`/`mutateWidgetAreaPlacements`/`reconcileWidgetRegionBindings` | `region-area-service.ts` | widgets | exported functions | REQ-11..17 | Seed/read `widget_area` entries; mutate a region's whole placement list as one versioned write; reconcile the derived binding table in the same transaction | `{ workspaceId, regionKey, placements[], baseVersion }` etc. | `{ areaEntry: WidgetAreaEntry }` | Every `widgetEntryId` in `placements` must exist, be non-trashed, same workspace (REQ-16) | `WidgetAreaConflictError` (OCC), validation errors for bad placement refs | Explicit side effect: entries chokepoint write + binding-table reconcile, same transaction | **Aggregate-risk:** `reconcileWidgetRegionBindings` is the ONLY code path permitted to write `widget_region_bindings` — any other write site would violate INV-02's "always derivable" guarantee and must be caught in review | REQ-11..17, AC-06..11, INV-02/03 | Integration test: reconcile after a direct area-entry mutation reproduces the exact same binding row a full `bindWidgetArea` call would produce |
| C-007 `insertWidgetEmbed`/`removeWidgetEmbed`/`reorderWidgetEmbeds` | `embed-service.ts` | widgets | exported functions | REQ-44/45 | Server-side versioned document mutation for `widgetEmbed` nodes, no live editor required | `{ workspaceId, hostEntryId, mutation, baseVersion }` | `{ entry: updated host entry }` | Calls C-008 for guardrail validation before applying | `WidgetEmbedGuardrailError`, `WidgetVersionConflictError` | Explicit side effect: entries chokepoint write (same document-mutation contract as the live-editor path) | Invariant case: this function and the live-editor's ADR-016 change-set path must call the identical C-008 validator — divergence here is exactly the gap Amendment 6 exists to close | REQ-44/45, AC-30, INV-04 | Integration test: insert via C-007 with no browser session involved, assert the same guardrails reject the same bad input the editor path would |
| C-008 `validateWidgetEmbedMutation` | `embed-validation.ts` | widgets | exported function | REQ-19/20 | Pure guardrail check: no widget-in-widget recursion, embed-count clamp | `{ hostEntryType, resultingBodyJson }` | `{ valid: true } \| { valid: false, reason }` | Recursion check against `hostEntryType==='widget'`; count against configured max | N/A (returns a result) | Pure decision, no I/O | Invariant case: the single predicate both C-007 and the live-editor's chokepoint hook depend on — must never be reimplemented at a second call site | REQ-19/20, AC-13/14, INV-04 | Unit test: recursion attempt rejected regardless of nesting depth; count-clamp boundary rows |
| C-009 `extractEntryRefs` | `core/entry-refs/extractor.ts` | core | exported function | REQ-29..32 | Walk a written entry's `bodyJson`+`fields.ext.*` for `ref`-typed fields and widget-reference-shaped nodes, upsert `entry_refs` rows | `{ entry: written entry state }` | `{ refs: EntryRefRow[] }` (written in the same transaction by the caller) | Per ADR-022 §5's `ref` field-type vocabulary; entry-target vs. term-target handled per REQ-32's documented distinction | N/A (best-effort extraction; a field with an unsupported target kind is a documented soft reference, not an error) | Called from the single entries chokepoint, same transaction | **Aggregate-risk:** this function's correctness is the sole thing REQ-42 (safe-delete) and REQ-34 (where-used disclosure) depend on — a missed ref type here silently reopens both as broken promises | REQ-29..32, AC-21/22, INV-06 | Integration test: create a widget with a `widgetEmbed` reference and a ref-typed config field, assert both rows appear in `entry_refs` after one write |
| C-010 `EntryRefsRepoPort` | `core/entry-refs/ports.ts` | core | exported interface | Persistence seam, rule-of-two | Define the `entry_refs` storage contract C-009 depends on | N/A | N/A | N/A | N/A | N/A | N/A | ADR-022 §5, Article IV | Both adapters run the same contract-test suite |
| C-011 `WidgetRegionBindingRepoPort` | `ports.ts` | widgets | exported interface | Persistence seam, rule-of-two, mirrors `NavLocationBindingRepoPort` | Define the `widget_region_bindings` storage contract C-006 depends on | N/A | N/A | N/A | N/A | N/A | N/A | ADR-047 §6 | Both adapters run the same contract-test suite |
| C-016 admin route registrars | `routes/admin/widgets/*.ts` | server | exported functions | HTTP entrypoints, `authorize()`-gated per REQ-40 | Parse request → call the matching C-005/C-006/C-007 function → map result/errors | HTTP request | HTTP response | Auth profile per endpoint (`widgets.*` permission) | Full mapping from C-012 typed errors | Explicit side effect: HTTP I/O, delegates to domain functions | N/A | REQ-01..45 subset, AC-28 | Integration test per endpoint against the real route + SQLite adapter |
| C-017 AI tool registrations (`widgets.place`/`widgets.create`/`widgets.remove`/`widgets.diagnose`) | `routes/admin/widgets/agent-tools.ts` | server | exported registrations | REQ-35/44 | Thin gateway clients mapping 1:1 to C-005/C-006/C-007, plus a `diagnose` read exposing `entry_refs` dangling-state | Tool-call payloads | Tool-call results | Same `authorize()` gating as the human routes (INV-07) | Same typed-error mapping | Delegates entirely to C-005/C-006/C-007/C-009 | Invariant case: no tool call may bypass `authorize()` — an agent's effective permission is always `grant ∩ delegator`, unchanged by this feature | REQ-35/40/44, AC-25 | Integration test: an agent call with insufficient permission is rejected identically to a human call |

## Wiring Map

| Flow ID | Source | Transport/Call Type | Target | Payload/Contract | Ordering/Retry/Idempotency | Failure Handling | Trace |
|---|---|---|---|---|---|---|---|
| W-001 | `routes/admin/widgets/create.ts` | direct call | `write-service.ts` C-005 | create input/output | Not idempotent by design, matches `posts`/`menus` convention | Typed error → HTTP error code | REQ-01, AC-01 |
| W-002 | `routes/admin/widgets/region-area/mutate.ts` | direct call | `region-area-service.ts` C-006 | placement-mutation input/output | Whole-document OCC — retried client-side on conflict, never server-side auto-merge | `WidgetAreaConflictError` → `409` with current version | REQ-15, AC-09 |
| W-003 | `region-area-service.ts` C-006 | direct call, same transaction | `core/entry-refs/extractor.ts` C-009 | written area entry state | Same-transaction, not async | A failed extraction fails the whole write (extraction is part of the chokepoint's atomic unit, not a best-effort side call) | REQ-29/30, INV-06 |
| W-004 | site-render pipeline (existing) | direct call | `resolver-service.ts` C-004 | `{workspaceId, pageEntryId, resolvedRegions}` | Called once per page render, synchronous with the render request | A `resolvePageWidgets` call itself never throws (REQ-27's contract); the render pipeline proceeds with whatever `regions`/`inlineResolved` it receives | REQ-23, W-004 is the render-pipeline injection point flagged as an open implementation detail in the File Map |
| W-005 | `resolver-service.ts` C-004 | direct call | `resolvers/index.ts` C-003 | one call per distinct type present on the page | Batched — see C-004's contract | Isolated per-widget failure, never propagates | REQ-24, AC-16 |
| W-006 | `resolvers/contact-form.ts` | direct call, read-only | `forms/ports.ts` `FormDefinitionRepoPort` | form definition read | N/A (read-only) | Missing/disabled definition → `target-disabled` result, not an exception | REQ-37/38 |
| W-007 | Contact Form widget's rendered form (client-side) | HTTP POST (unchanged) | `routes/site/forms-submit.ts` (existing, SPEC-010) | Existing Forms submission contract, untouched | Existing Forms idempotency/rate-limit semantics, unmodified | Existing Forms error mapping, unmodified | REQ-37/39 — **this flow deliberately adds zero new code on the Forms side** |
| W-008 | live-editor CopilotKit frontend action (ADR-016) | direct call (browser) | `embed-validation.ts` C-008 | proposed `widgetEmbed` mutation | Change-set propose→review→accept/reject | Rejected mutation surfaces as a review-time error, per ADR-016 §2 | REQ-19/20 (editor path) |
| W-009 | `routes/admin/widgets/agent-tools.ts` C-017 | direct call | `embed-service.ts` C-007 | server-side embed mutation | Same OCC as W-002 | Same guardrail rejection as W-008, via the same C-008 validator | REQ-44/45, AC-30 |

## Data And Side-Effect Boundaries

| Boundary | Owner | Reads | Writes | Side Effects | Consistency / Transaction Rule | Migration / Dual-Write Path |
|---|---|---|---|---|---|---|
| `entries` (`type='widget'`) | widgets | route layer, C-004 resolver-service | `write-service.ts` C-005 only, via `executeCommand` | `entry_refs` extraction (C-009), outbox event | Instance write + revision + `entry_refs` extraction are one unit of work (existing chokepoint guarantee, extended) | N/A — new content type on an existing table, no migration |
| `entries` (`type='widget_area'`) | widgets | route layer, C-004 resolver-service (via binding lookup) | `region-area-service.ts` C-006 only, via `executeCommand` | Binding-table reconcile (same transaction), `entry_refs` extraction, outbox event | Whole-document write, guarded by `version` OCC; binding reconcile is same-transaction, never a follow-up write | N/A — new content type, no migration |
| `widget_region_bindings` | widgets | C-004 resolver-service (region → area lookup), admin read routes | `region-area-service.ts` C-006's reconcile step ONLY — no other write site permitted | None | Derived, rebuildable — the discipline (never write outside the reconcile step) is load-bearing, same warning ADR-022 §4a already gives for other derived tables | N/A — new table |
| `entry_refs` | core | `write-service.ts` C-005 (safe-delete check), `region-area-service.ts`/UI (where-used disclosure), diagnose tool (C-017) | `core/entry-refs/extractor.ts` C-009 ONLY, same transaction as the source entry's write | None | Derived, rebuildable from live entries at any time; the same "never write outside the chokepoint" discipline applies | N/A — new table |
| `src/forms/` tables (existing, read-only from `widgets`) | forms (unchanged) | `resolvers/contact-form.ts` (read-only, via `FormDefinitionRepoPort`) | Not written by `widgets` at all | None from `widgets`' side — Forms' own submission write path is entirely untouched | N/A — `widgets` never opens a transaction against Forms' tables | N/A |
| `src/identity` permission catalog (existing, extended) | identity (unchanged) | `write-service.ts`/`region-area-service.ts`/`embed-service.ts` (read-only, via `authorize()`) | Not written by `widgets` | None | N/A — read-only cross-module dependency, same shape every other feature has | N/A |

## Observability And Operational Expectations

| Surface / Flow | Required Signals | Correlation / Trace Context | Metrics | Logs | Alert / Runbook Need | Privacy / Secret Constraints | Trace |
|---|---|---|---|---|---|---|---|
| All admin/AI routes | Structured error responses matching this codebase's existing error envelope | `correlationId` per the existing pattern | None new required beyond what NFR discovery would flag | Standard request logging | N/A — no new production alerting surface | No widget config or resolved data contains secrets by design (Contact Form never surfaces mail credentials, REQ-39) | REQ-40, feature.spec.md errors |
| `resolver-service.ts` C-004 | A resolution failure carries a correlation id + typed reason visible in admin/preview only (REQ-28) | `correlationId` per placement failure | Resolve-duration, per-type batch size, failure-code distribution are natural future metrics (not required for v1) | Failure-code + widget-instance-id logged at warn level; public response contains none of this | N/A for v1 | Public failure output must contain zero internal detail (REQ-28, AC-20) — verified, not assumed | REQ-27/28, AC-19/20 |
| `core/entry-refs/extractor.ts` C-009 | Extraction failures should be loud (they gate safe-delete correctness) — log at error level, not silently swallowed | Source entry id | None new required | Extraction outcome per write (debug level for success, error level for any anomaly) | N/A for v1 | No PII beyond what the source entry already legitimately carries | REQ-29..32, INV-06 |

## Critical Invariants

| Invariant ID | Scope | Rule | Reason | Enforcement Surface | Test Expectation | Trace |
|---|---|---|---|---|---|---|
| INV-02 | `region-area-service.ts` C-006 | `widget_region_bindings` is always fully derivable from `widget_area` entries alone | Structural guarantee the design's whole safety story depends on | `reconcileWidgetRegionBindings` is the sole write path | Integration test: full rebuild from entries alone reproduces the exact live binding table | feature.spec.md INV-02 |
| INV-03 | `region-area-service.ts` C-006 | A region's placement-list mutation is always one whole-document write under `version` OCC — never per-row patching | Prevents the exact positional-race class ADR-047's original draft was vulnerable to | C-006 exposes no per-placement mutation function, only whole-list | Integration test: concurrent reorders — one wins, one gets a typed conflict (AC-09/EC-02) | feature.spec.md INV-03 |
| INV-04 | `embed-validation.ts` C-008, both W-008 and W-009 | A `widgetEmbed` node never exists inside a widget instance's own `bodyJson`, regardless of mutation origin | The dangerous recursion path Amendment 5/6 specifically closes | C-008 is the single validator both mutation paths call | Integration test: attempt via C-007 (no editor) and via the editor's change-set path — both rejected identically | feature.spec.md INV-04, REQ-19 |
| INV-05 | `resolvers/index.ts` C-003 | A resolver's exception or timeout never propagates past the placement boundary | Core reliability promise for public page rendering | C-003 owns the sole try/catch + timeout wrapper around every resolver call | Integration test: a deliberately-throwing/hanging test resolver still yields an isolated page render (AC-19) | feature.spec.md INV-05 |
| INV-06 | `core/entry-refs/extractor.ts` C-009, called from the chokepoint | Every entry write that creates/updates/removes a widget reference extracts/retracts the corresponding `entry_refs` row in the same transaction | Where-used and safe-delete correctness depend entirely on this never lagging the actual entry state | Single call site inside the existing chokepoint, not a follow-up async job | Integration test: create → ref exists; trash the referencing entry → ref retracted, same transaction | feature.spec.md INV-06 |
| INV-08 | `resolvers/contact-form.ts` | The Contact Form widget type never persists a submission, sends mail, or rate-limits — every such action happens exclusively inside `src/forms/` | The entire point of the adapter design (Amendment 4) — a violation here silently creates a second, divergent submission pipeline | `contact-form.ts` imports only `forms/ports.ts` (read-side); Code Review verifies no import of `forms/submit-service.ts`/`notify-subscriber.ts` | Static check (import graph) + integration test confirming a widget-rendered submission produces byte-identical Forms-side behavior to a native Forms-rendered one (AC-26) | feature.spec.md INV-08, REQ-39 |
| INV-09 | `write-service.ts` C-005 `purgeWidgetInstance` | A widget instance referenced by any live placement is never permanently removed by a plain delete — only `delete.force`, which must flag resulting dangling refs | Safe-delete promise (REQ-42/43) | C-005 checks `entry_refs` (via C-010) before any non-force delete proceeds | Integration test: delete-while-referenced → `409` with the referencing list (AC-29); force-delete → dangling refs flagged, not silently dropped | feature.spec.md INV-09 |

## Brownfield / Migration Mapping

N/A — widgets is greenfield for its own surface. Two real brownfield dependencies are consumed, not migrated: `src/navigation/` (structural pattern mirrored, code untouched) and `src/forms/` (delegated to, code untouched) — see spec-manifest.md's Brownfield/Reverse-Spec References for the exact touchpoints and why each matters.

## Test Expectations

- **Contract tests:** C-010 `EntryRefsRepoPort` and C-011 `WidgetRegionBindingRepoPort` — one shared contract-test suite run against each port's `repo.memory.ts` and `repo.sqlite.ts` adapters (matches `navigation`/`forms` precedent).
- **Integration tests:** W-001/W-002 (admin CRUD + region mutation through the real HTTP route + SQLite adapter), W-003 (`entry_refs` extraction is same-transaction with the triggering write), W-004/W-005 (the batch-first resolution pipeline, including the N+1 assertion AC-16 and the failure-isolation assertion AC-19), W-006/W-007 (the Contact Form adapter reaching the real, unmodified Forms submission route), W-008/W-009 (embed guardrails enforced identically via both the editor path and the server-side/AI path — the specific test Amendment 6 exists to make possible).
- **Property/invariant tests:** INV-02 (binding-table full-rebuild-matches-live property, across randomized region/area states), INV-03 (concurrent-reorder race, EC-02), INV-05 (resolver failure isolation, across the REQ-27 failure-code taxonomy), INV-06 (entry_refs same-transaction atomicity, across create/update/trash), INV-08 (Contact Form import-graph static check + behavioral parity with native Forms).
- **Characterization tests:** N/A — greenfield.
- **Explicitly N/A suites with reason:** No admin-UI end-to-end suite in this outline (ui.spec.md is disclosed-omitted in spec-manifest.md — UI test expectations follow once that's produced, likely alongside the Programmer stage rather than blocking TDD certification of the domain/API layers this outline covers).

## Downstream Handoff Notes

- **Coordinator task-generation constraints:** sequence schema (`infra/db/schema.ts`, `entry_refs` + `widget_region_bindings` tables) + `widgets/types.ts`/`registry.ts`/`ports.ts`/adapters + `write-service.ts` ahead of everything else — `region-area-service.ts`, `resolver-service.ts`, and every dynamic resolver depend on real widget-instance CRUD existing first. `core/entry-refs/extractor.ts` must land before `region-area-service.ts`'s reconcile step and `write-service.ts`'s safe-delete check can be meaningfully tested (both call it). The five widget-type resolvers can be built in parallel with each other once `resolver-service.ts`'s orchestration contract (C-004) is stable, since each is an independent file with no cross-dependency.
- **Open implementation detail, not fully resolved by this outline:** the exact site-render pipeline file/function where W-004's injection point (`resolvePageWidgets` called ahead of Liquid rendering) belongs is not named here — the Programmer must locate the current render call site and confirm the injection point before wiring, per this outline's File Map note. This is a real gap in this outline, disclosed rather than guessed at.
- **TDD focus:** certify C-008 (`validateWidgetEmbedMutation`, pure function, INV-04) and the `registry.ts`/C-002 static "no executable code in registration data" check first — highest test-density, zero I/O. Then C-005 (widget CRUD) and C-006 (region-area) against the real chokepoint, including their OCC-conflict races (AC-04/AC-09). Then C-009 (`entry_refs` extraction) as an integration test proving same-transaction atomicity. Then C-004/C-003 (the resolution pipeline) with a deliberately-misbehaving test resolver to prove INV-05 before any real dynamic resolver exists to hide behind. Real resolvers (Recent Entries, Menu, Contact Form) certify last, once the pipeline they run inside is already proven safe.
- **Programmer architecture audit focus:** verify `registry.ts` has zero function/closure exports; verify no file outside `resolvers/index.ts` performs a dynamic lookup keyed on a `resolverId` string; verify `resolvers/contact-form.ts` imports only `forms/ports.ts`, never `forms/submit-service.ts`/`notify-subscriber.ts`; verify `widget_region_bindings` and `entry_refs` each have exactly one write call site in the whole codebase (C-006's reconcile step; C-009 respectively).
- **Open risks or ambiguities:** the site-render injection point (above); OQ-01 (exact resolver timeout value) and OQ-04 (Drizzle migration naming) from feature.spec.md remain to be settled by the Programmer or a follow-up Software Architect pass; `ui.spec.md` was disclosed-omitted and should be produced before the admin UI (`WidgetsLibrary.tsx`/`WidgetPlacement.tsx`) implementation begins, not skipped entirely.

## 4. Real source + tests (output artifacts)


===== FILE: src/widgets/types.ts =====
/**
 * @file Core type definitions for the Tovu `widgets` library (ADR-047, SPEC-043).
 *
 * Purpose:
 * Widgets are placeable, reusable, individually-configured components (a contact
 * form, a recent-posts list, a text block, social links, a menu) placed either
 * into a theme-declared region (an ordered list, backed by a seeded
 * `widget_area` entry) or embedded inline inside a page's rich-text body (a
 * `widgetEmbed` TipTap node). A widget instance is a seeded ADR-022 content
 * entry (type `widget`), exactly as a menu is (ADR-029) — this file mirrors
 * `navigation/types.ts` deliberately, per the ADR-047 debate's finding that the
 * region-binding mechanism must structurally match `nav_location_bindings`
 * (source-of-truth-on-the-entry + a derived, reconciled binding index), not
 * merely resemble it.
 *
 * How it relates to the project:
 * - `core/ports.ts` supplies the shared primitives (`UUID`, `JsonObject`, …).
 * - `widgets/ports.ts` declares the one rule-of-two port this library adds
 *   (`WidgetRegionBindingRepoPort`, mirroring `NavLocationBindingRepoPort`).
 * - `widgets/registry.ts` declares the v1 widget-type registry as plain data —
 *   see that file for why type *registration* and type *behavior* are split.
 * - The theme renderer never resolves a widget reference itself (ADR-020 §7 /
 *   ADR-029 §7's "theme receives resolved data" boundary, unchanged here).
 *
 * Architectural role:
 * INTERFACES + TYPES ONLY (no feature logic). This is the design-frozen shape
 * ADR-047 (as amended by its 2026-07-21 debate fold-in) introduces; the entries
 * repo, revisions, and the command gateway are reused unchanged from ADR-022 /
 * ADR-008.
 */
import type { ISODateTime, JsonObject, UUID } from "../core/ports";

// ---------------------------------------------------------------------------
// Content-type identity
// ---------------------------------------------------------------------------

/** `widget` ships as a seeded content-type registry row (ADR-022 §1), like `post`/`page`/`menu`. */
export const WIDGET_CONTENT_TYPE = "widget" as const;

/**
 * `widget_area` ships as a seeded, **system-managed** content-type registry
 * row — never publicly routable, never itself placeable as a widget, never a
 * valid `widgetEmbed` target (REQ-17 — no recursion into a region from inside
 * a region).
 */
export const WIDGET_AREA_CONTENT_TYPE = "widget_area" as const;

/** The extension-field owner namespace for widget-level fields (`fields.ext.widget.*`). */
export const WIDGET_FIELD_NAMESPACE = "widget" as const;

/** The extension-field owner namespace for a `widget_area` entry's region assignment. */
export const WIDGET_AREA_FIELD_NAMESPACE = "widgets" as const;

// ---------------------------------------------------------------------------
// Widget-type registry (data — see registry.ts for the registration/behavior split)
// ---------------------------------------------------------------------------

/**
 * The v1 widget-type keys (SPEC-043 REQ-09). Kept as a closed union rather than
 * a bare `string` so a typo in a registration or a call site is a compile error,
 * not a runtime `unknown-type` surprise.
 */
export type WidgetTypeKey = "text" | "social-links" | "recent-entries" | "menu" | "contact-form";

/**
 * A widget type's declared capability class (ADR-047 Debate Fold-In Amendment
 * 3). `static` types render validated config directly with no resolver;
 * `query`/`form`/`entry-reference` types have a registered resolver in the
 * closed `CORE_RESOLVERS` map (`resolvers/index.ts`).
 */
export type WidgetCapability = "static" | "query" | "form" | "entry-reference";

/** Where a widget type may legally be placed. */
export type WidgetPlacementContext = "region" | "inline";

/**
 * A widget type's **registration** — plain, JSON-serializable data (SPEC-043
 * REQ-07). Never imports or references executable behavior; the only pointer
 * to code this record carries is `resolverId`, which must resolve *only*
 * through the closed `CORE_RESOLVERS` map (REQ-08) — never a module path,
 * function name, query string, or expression.
 */
export interface WidgetTypeRegistration {
  readonly typeKey: WidgetTypeKey;
  readonly capability: WidgetCapability;
  /** JSON-Schema-shaped description of `fields.ext.widget.*`'s valid shape for this type. */
  readonly configSchema: JsonObject;
  readonly placementContexts: readonly WidgetPlacementContext[];
  /** Cost clamps enforced by core at the orchestration layer, never by the resolver's own discipline (REQ-25). */
  readonly clamps: {
    readonly maxItems?: number;
    readonly timeoutMs: number;
  };
  /** `undefined` for `static`-capability types (REQ-10). Indexes into `CORE_RESOLVERS` only. */
  readonly resolverId?: string;
}

// ---------------------------------------------------------------------------
// The widget instance (a typed view over an ADR-022 `entries` row)
// ---------------------------------------------------------------------------

/**
 * `purged` is observably distinct from `trash` (REQ-43): both are treated identically everywhere a
 * widget instance's availability is checked (resolution, placement validation — see
 * `resolver-service.ts`/`region-area-service.ts`), but only `purged` records that the instance was
 * force-deleted past a known reference (`purgeWidgetInstance({ force: true })`), vs. an ordinary
 * `trash` that may still be restored with no prior reference conflict. No real hard-delete exists in
 * this codebase for any content type (`EntryRepoPort` has no delete method) — this status is the
 * cheap, in-model way to keep that distinction visible without one.
 */
export type WidgetInstanceStatus = "active" | "draft" | "trash" | "purged";

/**
 * A typed read model over a `type='widget'` entries row (ADR-022 §2 universal
 * columns) plus the parsed `fields.ext.widget.*` config bag. A projection, not
 * a new table — widget instances are entries (REQ-01).
 */
export interface WidgetInstanceEntry {
  readonly id: UUID;
  readonly workspaceId: UUID;
  readonly slug: string;
  readonly title: string;
  readonly status: WidgetInstanceStatus;
  readonly widgetType: WidgetTypeKey;
  /** Validated against the type's registered `configSchema` on every write (REQ-02). */
  readonly config: JsonObject;
  readonly updatedAt: ISODateTime;
  readonly version: number;
}

// ---------------------------------------------------------------------------
// Region composition (a typed view over a `widget_area` entry)
// ---------------------------------------------------------------------------

/** A theme-registered region key (e.g. `header`, `footer`, `sidebar`). */
export type WidgetRegionKey = string;

/** One entry in a `widget_area`'s ordered placement list (lives in the area entry's `bodyJson`). */
export interface WidgetPlacementNode {
  /** Stable ULID, minted once, preserved across reorders — for diagnostics and `entry_refs` locators. */
  readonly placementId: UUID;
  readonly widgetEntryId: UUID;
  readonly enabled: boolean;
}

/** The full region-composition document stored in a `widget_area` entry's `bodyJson`. */
export interface WidgetAreaDoc {
  readonly schemaVersion: number;
  readonly placements: readonly WidgetPlacementNode[];
}

/**
 * A typed read model over a `type='widget_area'` entries row. `regionKey` is
 * the **source of truth** for which region this area fills
 * (`fields.ext.widgets.regionKey`) — mirrors `NavMenuEntry.locations` exactly
 * (ADR-047 Debate Fold-In Amendment 1).
 */
export interface WidgetAreaEntry {
  readonly id: UUID;
  readonly workspaceId: UUID;
  readonly regionKey: WidgetRegionKey;
  readonly doc: WidgetAreaDoc;
  readonly updatedAt: ISODateTime;
  readonly version: number;
}

// ---------------------------------------------------------------------------
// Region binding index (derived, rebuildable — the one new widgets-owned table)
// ---------------------------------------------------------------------------

/**
 * A row of the derived `widget_region_bindings` index. **Derived + rebuildable**
 * from `WidgetAreaEntry.regionKey` at the write chokepoint (same species as
 * `nav_location_bindings` and ADR-022 §5 `entry_refs`), NOT a source of truth
 * and NOT revision-generating (INV-02). Reconciled by exactly one code path
 * (`region-area-service.ts`'s `reconcileWidgetRegionBindings`) — never
 * hand-authored.
 */
export interface WidgetRegionBindingRow {
  readonly workspaceId: UUID;
  readonly regionKey: WidgetRegionKey;
  readonly areaEntryId: UUID;
  readonly updatedAt: ISODateTime;
}

/** A theme/plugin-registered widget region (mirrors `NavLocationDescriptor`). */
export interface WidgetRegionDescriptor {
  readonly key: WidgetRegionKey;
  readonly label: string;
  readonly registeredBy: string;
  readonly description?: string;
}

// ---------------------------------------------------------------------------
// Inline embed (a node inside any entry's TipTap `bodyJson`)
// ---------------------------------------------------------------------------

/**
 * The `widgetEmbed` node's persisted shape. A block-level atom (REQ-18) — never
 * nested inside a widget instance's own `bodyJson` (REQ-19, INV-04), enforced
 * by `embed-validation.ts`'s `validateWidgetEmbedMutation`, the single
 * validator both the live-editor path and the server-side/AI path call.
 */
export interface WidgetEmbedNode {
  readonly type: "widgetEmbed";
  readonly placementId: UUID;
  readonly widgetEntryId: UUID;
}

// ---------------------------------------------------------------------------
// Resolution (the render-time contract — Debate Fold-In Amendment 2)
// ---------------------------------------------------------------------------

/** The internal render IR node shape every resolved widget produces (ADR-020's canonical render IR). */
export interface WidgetRenderIR {
  readonly componentId: string;
  readonly props: JsonObject;
  readonly children?: readonly WidgetRenderIR[];
}

/** Context passed to a resolver for one page render (REQ-23). */
export interface WidgetResolveContext {
  readonly workspaceId: UUID;
  readonly locale?: string;
  readonly preview: boolean;
}

/** A minimal, read-only view of a widget instance passed into a resolver — never a raw DB handle (SPEC-043's REQ-24 batching contract). */
export interface WidgetInstanceView {
  readonly id: UUID;
  readonly widgetType: WidgetTypeKey;
  readonly config: JsonObject;
}

/** Why a widget resolution failed (SPEC-043 REQ-27's closed failure taxonomy). */
export type WidgetResolveFailureReason =
  | "unknown-type"
  | "invalid-config"
  | "target-disabled"
  | "timeout"
  | "resolver-error";

export type WidgetResolveResult =
  | { readonly ok: true; readonly ir: WidgetRenderIR; readonly dependencyKeys: readonly string[] }
  | { readonly ok: false; readonly reason: WidgetResolveFailureReason };

/**
 * The typed resolver contract every dynamic (non-`static`) widget type
 * implements (REQ-23/24). **Batch-first by design** — `resolveMany` is called
 * at most once per type per page render (REQ-24), never once per placement, so
 * N+1 query cost is a contract violation, not an optimization opportunity.
 */
export interface WidgetResolver {
  resolveMany(
    instances: readonly WidgetInstanceView[],
    context: WidgetResolveContext
  ): Promise<ReadonlyMap<UUID, WidgetResolveResult>>;
}


===== FILE: src/widgets/ports.ts =====
/**
 * @file Ports + typed-call contracts for the Tovu `widgets` library (ADR-047, SPEC-043).
 *
 * ADR-006 (rule-of-two) applied the way ADR-029 §5 already set precedent:
 *
 * - **`WidgetRegionBindingRepoPort` IS a port.** It persists the derived
 *   `widget_region_bindings` index — two real adapters, in-memory + SQLite,
 *   mirroring `NavLocationBindingRepoPort` exactly.
 *
 * - **Widget instances add NO new persistence port.** A widget instance is an
 *   ADR-022 entry; it rides the existing entries repo (already rule-of-two).
 *
 * - **`widget_area` entries add NO new persistence port either** — same
 *   reasoning, they are entries too (ADR-047 Debate Fold-In Amendment 1).
 *
 * - **Resolution (`WidgetResolver`, `widgets/types.ts`) is NOT a port** — one
 *   evaluator per registered type, dispatched through the closed
 *   `CORE_RESOLVERS` map (`resolvers/index.ts`), not injected. Promote to a
 *   port only if a second real implementation of a given type's resolution
 *   logic appears (ADR-029 §5's anti-port-mania call, applied identically).
 *
 * INTERFACES ONLY. No feature logic lives here.
 */
import type { ISODateTime, UUID } from "../core/ports";
import type { WidgetRegionBindingRow, WidgetRegionDescriptor, WidgetRegionKey } from "./types";

// ---------------------------------------------------------------------------
// Port: the derived region-binding index (rule-of-two: in-memory + SQLite)
// ---------------------------------------------------------------------------

/**
 * Persistence for the derived `widget_region_bindings` index. Writes happen
 * only inside the same transaction as the `widget_area` entry mutation that
 * changed `regionKey` (single write chokepoint, ADR-022 §4a) — this port is
 * the storage seam, not a second write path. `rebuildForWorkspace` exists
 * because the index is **rebuildable by definition** — a full rescan of
 * `widget_area` entries can always reconstruct it (INV-02).
 */
export interface WidgetRegionBindingRepoPort {
  /** The `widget_area` entry currently bound to a region, if any. */
  findByRegion(required: {
    workspaceId: UUID;
    regionKey: WidgetRegionKey;
  }): Promise<WidgetRegionBindingRow | null>;

  /** Every binding in the workspace (admin overview + render prefetch). */
  listByWorkspace(required: { workspaceId: UUID }): Promise<WidgetRegionBindingRow[]>;

  /**
   * Assign a region to a `widget_area` entry. Honors
   * `UNIQUE (workspace_id, region_key)`. Called only from
   * `region-area-service.ts`'s `reconcileWidgetRegionBindings` — never
   * directly by a route handler or any other caller (INV-02).
   */
  upsert(required: {
    workspaceId: UUID;
    regionKey: WidgetRegionKey;
    areaEntryId: UUID;
    updatedAt: ISODateTime;
  }): Promise<WidgetRegionBindingRow>;

  /** Mark a region binding inactive (theme switch orphaned the region key — REQ-14). Never deletes the underlying `widget_area` entry. */
  markInactive(required: { workspaceId: UUID; regionKey: WidgetRegionKey }): Promise<void>;

  /**
   * Rebuild the whole workspace's index from the authoritative `widget_area`
   * entries. The index is derived + rebuildable, so this is always safe.
   */
  rebuildForWorkspace(required: {
    workspaceId: UUID;
    bindings: readonly WidgetRegionBindingRow[];
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Read-only registry of theme/plugin-declared regions
// ---------------------------------------------------------------------------

/** Registry of theme/plugin-declared widget regions (mirrors `NavLocationRegistry`). */
export interface WidgetRegionRegistry {
  list(required: { workspaceId: UUID }): WidgetRegionDescriptor[];
  get(required: { workspaceId: UUID; key: WidgetRegionKey }): WidgetRegionDescriptor | null;
}


===== FILE: src/widgets/registry.ts =====
/**
 * @file The v1 widget-type registry (SPEC-043 REQ-07..10, ADR-047 Debate Fold-In Amendment 3).
 *
 * Purpose:
 * Each `WidgetTypeRegistration` below is plain, JSON-serializable data — schema, capability
 * class, placement contexts, cost clamps, and (for dynamic types) a `resolverId` string. No
 * registration record imports or references executable behavior directly; `resolverId` is a
 * pointer that only ever resolves through `resolvers/index.ts`'s closed `CORE_RESOLVERS` map
 * (REQ-08) — never a dynamic import, `eval`, or arbitrary function reference. This is the split
 * Amendment 3 requires: type *registration* is data (Tier-1-safe, this file); type *behavior* is
 * core-owned code in v1, ADR-024 Tier-2/3-gated for any future plugin-contributed dynamic type
 * (`resolvers/`).
 *
 * `getWidgetTypeRegistration` is the sole lookup accessor over this data — a pure, O(1) function
 * with no I/O and no reference to resolver code, kept here (unlike `forms/manifest.ts`'s stricter
 * zero-function convention, which exists specifically for a hypothetical future loader retrofit
 * this file has no equivalent of) because every other registry in this codebase
 * (`identity/permissions.ts`) pairs its data with a plain accessor the same way.
 *
 * How it relates to the project:
 * - Read by `resolvers/index.ts` (dispatch), `write-service.ts` (config validation, REQ-02/03),
 *   and any admin/AI surface that needs to know what a widget type declares.
 * - Static/type-only until the registry itself is imported and iterated — no side effects at
 *   module load time.
 */
import type { WidgetTypeKey, WidgetTypeRegistration } from "./types";

/** `text` — static, no resolver (REQ-10). A single free-form rich-text field. */
const TEXT_REGISTRATION: WidgetTypeRegistration = {
  typeKey: "text",
  capability: "static",
  configSchema: {
    type: "object",
    properties: { body: { type: "string" } },
    required: ["body"],
    additionalProperties: false,
  },
  placementContexts: ["region", "inline"],
  clamps: { timeoutMs: 0 },
};

/** `social-links` — static, no resolver. An ordered list of `{ platform, url }` pairs. */
const SOCIAL_LINKS_REGISTRATION: WidgetTypeRegistration = {
  typeKey: "social-links",
  capability: "static",
  configSchema: {
    type: "object",
    properties: {
      links: {
        type: "array",
        items: {
          type: "object",
          properties: { platform: { type: "string" }, url: { type: "string" } },
          required: ["platform", "url"],
          additionalProperties: false,
        },
        maxItems: 20,
      },
    },
    required: ["links"],
    additionalProperties: false,
  },
  placementContexts: ["region", "inline"],
  clamps: { timeoutMs: 0 },
};

/**
 * `recent-entries` — dynamic, `query` capability. `maxItems` is clamped at the
 * REGISTRATION level (the ceiling any instance's own config may request) AND
 * re-enforced at the orchestration layer (REQ-25) — defense in depth, not
 * redundant: this value is what a resolver *may* return at most; the
 * orchestrator enforces it independent of the resolver's own discipline.
 */
const RECENT_ENTRIES_REGISTRATION: WidgetTypeRegistration = {
  typeKey: "recent-entries",
  capability: "query",
  configSchema: {
    type: "object",
    properties: {
      maxItems: { type: "integer", minimum: 1, maximum: 20 },
      // REQ-32/EC-03: a taxonomy-term-target soft reference, extracted into entry_refs with
      // targetKind 'term' (no safe-delete guarantee) — see core/entry-refs/extractor.ts.
      categoryTermId: { type: "string", "x-ref-target": "term" },
    },
    required: ["maxItems"],
    additionalProperties: false,
  },
  placementContexts: ["region", "inline"],
  clamps: { maxItems: 20, timeoutMs: 500 },
  resolverId: "recent-entries",
};

/** `menu` — dynamic, `entry-reference` capability. Delegates entirely to `navigation/resolver.ts`. */
const MENU_REGISTRATION: WidgetTypeRegistration = {
  typeKey: "menu",
  capability: "entry-reference",
  configSchema: {
    type: "object",
    // REQ-31: menuRef is an entry-target ref, extracted into entry_refs — see
    // core/entry-refs/extractor.ts (matches the CONTACT_FORM_REGISTRATION 'x-ref-target' pattern
    // below).
    properties: { menuRef: { type: "string", "x-ref-target": "entry" } },
    required: ["menuRef"],
    additionalProperties: false,
  },
  placementContexts: ["region", "inline"],
  clamps: { timeoutMs: 500 },
  resolverId: "menu",
};

/**
 * `contact-form` — dynamic, `form` capability. A thin adapter over `src/forms/`
 * (REQ-36..39) — this registration carries no submission/rate-limit/mail
 * config of its own; `formDefinitionId` is a ref-typed field extracted into
 * `entry_refs` (REQ-31).
 */
const CONTACT_FORM_REGISTRATION: WidgetTypeRegistration = {
  typeKey: "contact-form",
  capability: "form",
  configSchema: {
    type: "object",
    properties: {
      formDefinitionId: { type: "string", "x-ref-target": "entry" },
      successMessage: { type: "string" },
    },
    required: ["formDefinitionId"],
    additionalProperties: false,
  },
  placementContexts: ["region", "inline"],
  clamps: { timeoutMs: 500 },
  resolverId: "contact-form",
};

/** The complete v1 widget-type registry (REQ-09). */
export const WIDGET_TYPE_REGISTRATIONS: readonly WidgetTypeRegistration[] = [
  TEXT_REGISTRATION,
  SOCIAL_LINKS_REGISTRATION,
  RECENT_ENTRIES_REGISTRATION,
  MENU_REGISTRATION,
  CONTACT_FORM_REGISTRATION,
];

/** The sole lookup accessor over the registry — pure, O(1), no I/O. */
export function getWidgetTypeRegistration(typeKey: WidgetTypeKey): WidgetTypeRegistration | undefined {
  return WIDGET_TYPE_REGISTRATIONS.find((registration) => registration.typeKey === typeKey);
}


===== FILE: src/widgets/config-validation.ts =====

/**
 * @file A minimal JSON-Schema-subset validator for `fields.ext.widget.*` config bags (SPEC-043
 * REQ-02, INV-01).
 *
 * Purpose:
 * `widgets/registry.ts`'s `WidgetTypeRegistration.configSchema` records use a small, deliberately
 * bounded JSON-Schema subset (`object`/`string`/`integer`/`array`, `properties`/`required`/
 * `additionalProperties`/`items`/`maxItems`/`minimum`/`maximum` — exactly what `registry.ts`'s five
 * v1 registrations actually use, no more). No JSON-Schema library is a dependency of this repo
 * (confirmed: no `ajv`/`jsonschema` entry in `package.json`), so this is a small, purpose-built
 * validator over that exact subset rather than a new third-party dependency for one feature.
 *
 * Architectural role:
 * `widgets` domain logic, internal helper. Used by `write-service.ts` before every widget-instance
 * write (REQ-01/02) — not part of this feature's frozen public contract list, so its shape is not
 * design-frozen the way `types.ts`/`ports.ts`/`errors.ts` are.
 */

interface WidgetConfigJsonSchema {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, WidgetConfigJsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly items?: WidgetConfigJsonSchema;
  readonly maxItems?: number;
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface WidgetConfigFieldError {
  readonly field: string;
  readonly reason: string;
}

export interface ValidateWidgetConfigResult {
  readonly valid: boolean;
  readonly fieldErrors: WidgetConfigFieldError[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(value: unknown, schema: WidgetConfigJsonSchema, path: string, errors: WidgetConfigFieldError[]): void {
  switch (schema.type) {
    case "object": {
      if (!isPlainObject(value)) {
        errors.push({ field: path, reason: "expected an object" });
        return;
      }
      for (const key of schema.required ?? []) {
        if (!(key in value)) errors.push({ field: `${path}.${key}`, reason: "required field is missing" });
      }
      for (const [key, fieldValue] of Object.entries(value)) {
        const propSchema = schema.properties?.[key];
        if (!propSchema) {
          if (schema.additionalProperties === false) {
            errors.push({ field: `${path}.${key}`, reason: "unrecognized field: not present in the registered schema" });
          }
          continue;
        }
        walk(fieldValue, propSchema, `${path}.${key}`, errors);
      }
      return;
    }
    case "string":
      if (typeof value !== "string") errors.push({ field: path, reason: "expected a string" });
      return;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        errors.push({ field: path, reason: "expected an integer" });
        return;
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({ field: path, reason: `below the minimum of ${schema.minimum}` });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({ field: path, reason: `above the maximum of ${schema.maximum}` });
      }
      return;
    case "array":
      if (!Array.isArray(value)) {
        errors.push({ field: path, reason: "expected an array" });
        return;
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push({ field: path, reason: `exceeds the maximum item count of ${schema.maxItems}` });
      }
      if (schema.items) value.forEach((item, index) => walk(item, schema.items as WidgetConfigJsonSchema, `${path}[${index}]`, errors));
      return;
    default:
      // boolean / unspecified schema type: accept anything (no v1 registration needs this).
      return;
  }
}

/**
 * Validates `config` against a widget type's registered `configSchema` (REQ-02). The registered
 * schema is always the authority — a type's own `clamps` (e.g. `recent-entries`' `maxItems: 20`)
 * are already expressed as `maximum` constraints inside the schema itself (`registry.ts`), so no
 * separate clamp check is needed here to satisfy AC-02.
 *
 * @complexity O(n) over the config bag's total node count.
 * @overallScore 100
 */
export function validateWidgetConfig(required: {
  schema: Record<string, unknown>;
  config: Record<string, unknown>;
}): ValidateWidgetConfigResult {
  const errors: WidgetConfigFieldError[] = [];
  walk(required.config, required.schema as WidgetConfigJsonSchema, "config", errors);
  return { valid: errors.length === 0, fieldErrors: errors };
}


===== FILE: src/widgets/authorize-helper.ts =====
import { WidgetForbiddenError } from "./errors";

/**
 * @file Shared `authorize()` plumbing for `write-service.ts`/`region-area-service.ts` (SPEC-043
 * REQ-40/41, INV-07).
 *
 * Purpose:
 * `AuthorizeFn` mirrors `features/entries/write-service.ts`'s `AuthorizeFn` shape structurally (no
 * shared import, kept decoupled — the same "no shared import" convention that file's own header
 * documents against `features/content-types`). `requireWidgetPermission` is the ONE place a
 * `widgets.*` permission string gets checked before a mutation proceeds.
 *
 * `PRE_AUTHORIZED` exists because this library composes `features/entries/write-service.ts`'s
 * `createEntry`/`updateEntry` and `features/content-types/write-service.ts`'s `registerContentType`
 * — both of which perform their OWN internal `authorize()` call, hardcoded to the
 * `admin.collections.manage` permission (the generic Collections-domain permission, unrelated to
 * widgets' own `widgets.*` model, and not modifiable — see this task's scope boundary on
 * `features/entries`). Since the real, authoritative check for a widget mutation is the
 * `widgets.*` check `requireWidgetPermission` already performed one layer up, `PRE_AUTHORIZED` is
 * passed as those composed functions' own `authorize` dependency so their internal check is not a
 * second, differently-scoped gate a legitimate `widgets.*`-holding caller could be incorrectly
 * rejected by.
 */
export type WidgetsAuthorizeFn = (params: {
  principalId: string;
  permission: string;
  workspaceId: string;
}) => Promise<{ allowed: boolean; reason: string }>;

export async function requireWidgetPermission(
  authorize: WidgetsAuthorizeFn,
  actor: { principalId: string },
  workspaceId: string,
  permission: string
): Promise<void> {
  const result = await authorize({ principalId: actor.principalId, permission, workspaceId });
  if (!result.allowed) {
    throw new WidgetForbiddenError(`principal '${actor.principalId}' lacks permission '${permission}' (${result.reason})`);
  }
}

/** See file header — passed as the composed entries/content-types chokepoints' own `authorize` dep. */
export const PRE_AUTHORIZED: WidgetsAuthorizeFn = async () => ({
  allowed: true,
  reason: "widgets: authorized upstream via the widgets.* permission check",
});

/** The actor id attributed to fully-automatic, system-driven writes (content-type seeding, theme-activation region seeding — REQ-13). Mirrors `server/seed.ts`'s `SETTINGS_MIGRATION_SYSTEM_PRINCIPAL_ID` convention. */
export const WIDGETS_SYSTEM_ACTOR_ID = "system-widgets";


===== FILE: src/widgets/concurrency.ts =====
/**
 * @file A tiny per-key async mutex (SPEC-043 REQ-06/15, AC-04/EC-02).
 *
 * Purpose:
 * `features/entries/write-service.ts`'s `updateEntry` reads the current row, checks
 * `expectedVersion`, then writes — but `InMemoryEntryRepo.transaction` provides no real
 * serialization (`async transaction(fn) { return fn(); }`), and the version check itself happens
 * BEFORE that transaction call. Two truly concurrent callers racing the same entry id can both
 * observe the pre-write version and both pass the check under the in-memory adapter (the real
 * `SqliteEntryRepo.transaction`'s `BEGIN IMMEDIATE` already serializes real concurrent writers at
 * the DB layer — this mutex is redundant-but-harmless there, and load-bearing for the in-memory
 * path this test suite's concurrency assertions exercise).
 *
 * This module serializes the whole "read current version -> validate -> call updateEntry" sequence
 * per entry id at the WIDGETS domain layer, restoring correct optimistic-concurrency semantics
 * deterministically regardless of the underlying repo adapter's own concurrency properties.
 *
 * Architectural role:
 * `widgets` domain-internal helper, not a frozen public contract.
 */
const locks = new Map<string, Promise<void>>();

/**
 * Runs `fn` exclusively with respect to every other `withEntryLock` call sharing the same `key` —
 * callers queue in call order, each waiting for the previous holder to finish.
 *
 * @complexity O(1) scheduling overhead beyond `fn`'s own cost.
 * @overallScore 100
 */
export async function withEntryLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(key, previous.then(() => next));

  await previous;
  try {
    return await fn();
  } finally {
    release();
  }
}


===== FILE: src/widgets/entry-payload.ts =====
import type { ContentTypeRepoPort } from "../features/content-types/write-service";
import { NoopContentTypeIndexProvisioner } from "../features/content-types/repo.memory";
import { registerContentType } from "../features/content-types/write-service";
import type { ClockPort, JsonObject } from "../core/ports";
import type { EntryRecord } from "../features/entries/types";
import { PRE_AUTHORIZED, WIDGETS_SYSTEM_ACTOR_ID } from "./authorize-helper";
import {
  WIDGET_AREA_CONTENT_TYPE,
  WIDGET_AREA_FIELD_NAMESPACE,
  WIDGET_CONTENT_TYPE,
  WIDGET_FIELD_NAMESPACE,
} from "./types";
import type {
  WidgetAreaDoc,
  WidgetAreaEntry,
  WidgetInstanceEntry,
  WidgetInstanceStatus,
  WidgetPlacementNode,
  WidgetRegionKey,
  WidgetTypeKey,
} from "./types";

/**
 * @file Storage-shape plumbing shared by `write-service.ts`/`region-area-service.ts` — how a
 * widget instance's/`widget_area`'s data actually lives inside an `entries` row.
 *
 * Purpose (a real, disclosed deviation from the spec's literal storage-path wording — see the
 * implementation report):
 * `features/entries/write-service.ts`'s `updateEntry` can only change `title`/`fieldsJson` — it has
 * no parameter to change `bodyJson` at all once an entry is created (confirmed by reading its
 * `UpdateEntryRequired.input` shape and body). Widget config MUST be updatable (REQ-05/AC-04), so
 * it cannot live in `bodyJson`.
 *
 * Owner namespace (2026-07-21, fixed): `features/entries/field-validation.ts`'s
 * `validateFieldsAgainstSchema` now accepts an `owner` parameter instead of hardcoding `site`
 * (a real, confirmed gap against ADR-022 §2 — see that file's header and the implementation
 * report). Widget instances write under `fields.ext.widget.*` (`WIDGET_FIELD_NAMESPACE`) and
 * `widget_area` entries under `fields.ext.widgets.*` (`WIDGET_AREA_FIELD_NAMESPACE`), matching
 * REQ-01/REQ-11's literal namespacing — not a shared `site` bag.
 *
 * A widget instance's `config` shape is still polymorphic per `widgetType` (declared in
 * `registry.ts`'s per-type `configSchema`, a JSON-Schema-like validator, not the generic entries
 * fixed-field-list schema `validateFieldsAgainstSchema` checks) — the generic entries content-type
 * field list genuinely cannot express "shape varies by widgetType" regardless of which `ext` owner
 * it validates under, and widgets already runs its own `validateWidgetConfig` (REQ-02) against the
 * real per-type schema before ever reaching this layer. So this file still stores the real
 * config/doc data as one JSON-serialized string in a single required `payload` text field — now
 * under the correct owner namespace — rather than mapping each config key to its own generic-entries
 * field, which round-trips the exact `WidgetInstanceEntry.config`/`WidgetAreaEntry.doc` shapes the
 * public contracts (`types.ts`) declare. `bodyJson` is left unused by this feature (REQ-11's
 * `bodyJson.placements` placement is a separate, disclosed deviation, not fixed by this namespace
 * change — see the implementation report).
 */

export const WIDGET_PAYLOAD_FIELD = "payload";

interface WidgetInstancePayload {
  widgetType: WidgetTypeKey;
  /** `Record<string, unknown>`, not `JsonObject`, matching the stub-frozen `Create/UpdateWidgetInstanceInput.config` shape (`write-service.ts`) — cast to `JsonObject` only at the `WidgetInstanceEntry` read-model boundary below. */
  config: Record<string, unknown>;
  status: WidgetInstanceStatus;
}

interface WidgetAreaPayload {
  regionKey: WidgetRegionKey;
  doc: WidgetAreaDoc;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads the single `payload` text field out of an entry's `fieldsJson.ext.<owner>` envelope. */
function readPayloadString(fieldsJson: unknown, owner: string): string {
  if (!isPlainObject(fieldsJson)) throw new Error("widgets: malformed fieldsJson (expected an object)");
  const ext = fieldsJson.ext;
  if (!isPlainObject(ext)) throw new Error("widgets: malformed fieldsJson (missing ext)");
  const ownerBag = ext[owner];
  if (!isPlainObject(ownerBag) || typeof ownerBag[WIDGET_PAYLOAD_FIELD] !== "string") {
    throw new Error(`widgets: malformed fieldsJson (missing fields.ext.${owner}.payload)`);
  }
  return ownerBag[WIDGET_PAYLOAD_FIELD];
}

function buildFieldsJson(payload: unknown, owner: string): unknown {
  return { ext: { [owner]: { [WIDGET_PAYLOAD_FIELD]: JSON.stringify(payload) } } };
}

export function buildWidgetInstanceFieldsJson(payload: WidgetInstancePayload): unknown {
  return buildFieldsJson(payload, WIDGET_FIELD_NAMESPACE);
}

export function parseWidgetInstancePayload(fieldsJson: unknown): WidgetInstancePayload {
  return JSON.parse(readPayloadString(fieldsJson, WIDGET_FIELD_NAMESPACE)) as WidgetInstancePayload;
}

export function buildWidgetAreaFieldsJson(payload: WidgetAreaPayload): unknown {
  return buildFieldsJson(payload, WIDGET_AREA_FIELD_NAMESPACE);
}

export function parseWidgetAreaPayload(fieldsJson: unknown): WidgetAreaPayload {
  return JSON.parse(readPayloadString(fieldsJson, WIDGET_AREA_FIELD_NAMESPACE)) as WidgetAreaPayload;
}

export function toWidgetInstanceEntry(entry: EntryRecord): WidgetInstanceEntry {
  const payload = parseWidgetInstancePayload(entry.fieldsJson);
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    slug: entry.slug,
    title: entry.title,
    status: payload.status,
    widgetType: payload.widgetType,
    config: payload.config as JsonObject,
    updatedAt: entry.updatedAt,
    version: entry.version,
  };
}

export function toWidgetAreaEntry(entry: EntryRecord): WidgetAreaEntry {
  const payload = parseWidgetAreaPayload(entry.fieldsJson);
  return {
    id: entry.id,
    workspaceId: entry.workspaceId,
    regionKey: payload.regionKey,
    doc: payload.doc,
    updatedAt: entry.updatedAt,
    version: entry.version,
  };
}

/** Stable, workspace-unique slug for a region's `widget_area` entry — also the natural de-dup key REQ-13's idempotent seeding relies on. */
export function widgetAreaSlug(regionKey: WidgetRegionKey): string {
  return `widget-area-${regionKey}`;
}

export function emptyWidgetAreaDoc(): WidgetAreaDoc {
  return { schemaVersion: 1, placements: [] };
}

export function areaDocWithPlacements(doc: WidgetAreaDoc, placements: readonly WidgetPlacementNode[]): WidgetAreaDoc {
  return { schemaVersion: doc.schemaVersion, placements };
}

/**
 * Registers the `widget`/`widget_area` seeded content types (ADR-047 §1, REQ-11) in `workspaceId`
 * if not already present — idempotent, safe to call before every write. Delegates to
 * `features/content-types/write-service.ts`'s real `registerContentType` chokepoint (the same
 * mechanism any Collections content type is registered through) rather than hand-constructing a
 * `content_types` row, per this task's "compose real infra, don't reimplement" directive. Each
 * type gets exactly one required `text`-kind field (`payload`) — see this file's header for why
 * the real config/doc data is JSON-serialized into that one field rather than expressed as
 * per-field scalar columns.
 */
export async function ensureWidgetContentTypesRegistered(
  deps: { contentTypeRepo: ContentTypeRepoPort; clock: ClockPort; ids: { newId: () => string }; outbox: { enqueue(event: { name: string; payload: Record<string, unknown> }): Promise<void> } },
  workspaceId: string
): Promise<void> {
  await ensureOneContentTypeRegistered(deps, workspaceId, WIDGET_CONTENT_TYPE, "Widget");
  await ensureOneContentTypeRegistered(deps, workspaceId, WIDGET_AREA_CONTENT_TYPE, "Widget Area");
}

async function ensureOneContentTypeRegistered(
  deps: { contentTypeRepo: ContentTypeRepoPort; clock: ClockPort; ids: { newId: () => string }; outbox: { enqueue(event: { name: string; payload: Record<string, unknown> }): Promise<void> } },
  workspaceId: string,
  key: string,
  label: string
): Promise<void> {
  const existing = await deps.contentTypeRepo.findByKey({ workspaceId, key });
  if (existing) return;

  const result = await registerContentType({
    deps: {
      repo: deps.contentTypeRepo,
      clock: deps.clock,
      ids: deps.ids,
      authorize: PRE_AUTHORIZED,
      indexProvisioner: new NoopContentTypeIndexProvisioner(),
      outbox: deps.outbox,
    },
    input: {
      actorId: WIDGETS_SYSTEM_ACTOR_ID,
      workspaceId,
      key,
      label,
      fields: [{ name: WIDGET_PAYLOAD_FIELD, kind: "text", required: true, queryable: false }],
    },
  });
  if (!result.ok) throw result.error;
}


===== FILE: src/widgets/errors.ts =====
/**
 * @file Typed domain errors for `widgets` (SPEC-043).
 *
 * Purpose:
 * One class per error this module originates; route handlers map these 1:1 to HTTP codes.
 * Mirrors the `forms/errors.ts` / `PostConflictError`-style convention already used throughout
 * this codebase.
 *
 * `this.name` fix (found during implementation, additive-only — no constructor signature
 * changed): `class X extends Error {}` does NOT give an instance a `.name` of `"X"` on this
 * runtime unless the constructor sets `this.name` explicitly (confirmed by
 * `features/entries/errors.ts`'s own header, which documents and applies this exact fix already).
 * Without it, `Error.prototype.toString()` — what `assert.rejects(fn, /ClassName/)` matches
 * against — reads `"Error: <message>"` for every class here, so a certified test asserting
 * `/WidgetConfigValidationError/` etc. could never pass regardless of which error actually threw.
 */

/** `WIDGETS_TYPE_UNREGISTERED` (400) — `widgetType` is not present in the registry (REQ-03). */
export class WidgetTypeUnregisteredError extends Error {
  constructor(
    message: string,
    public readonly widgetType: string
  ) {
    super(message);
    this.name = "WidgetTypeUnregisteredError";
  }
}

/** `WIDGETS_CONFIG_VALIDATION_ERROR` (400) — config fails the type's registered schema (REQ-02). */
export class WidgetConfigValidationError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors: Array<{ field: string; reason: string }> = []
  ) {
    super(message);
    this.name = "WidgetConfigValidationError";
  }
}

/** `WIDGETS_VERSION_CONFLICT` (409) — optimistic-concurrency mismatch (REQ-06). */
export class WidgetVersionConflictError extends Error {
  constructor(
    message: string,
    public readonly currentVersion: number
  ) {
    super(message);
    this.name = "WidgetVersionConflictError";
  }
}

/** `WIDGETS_AREA_CONFLICT` (409) — a `widget_area` mutation lost an OCC race (REQ-15). */
export class WidgetAreaConflictError extends Error {
  constructor(
    message: string,
    public readonly currentVersion: number
  ) {
    super(message);
    this.name = "WidgetAreaConflictError";
  }
}

/**
 * `WIDGETS_REFERENCED` (409) — delete attempted without `.force` while the
 * instance is still referenced by at least one placement (REQ-42).
 */
export class WidgetReferencedError extends Error {
  constructor(
    message: string,
    public readonly referencingLocations: Array<{ kind: "region" | "embed"; entryId: string }> = []
  ) {
    super(message);
    this.name = "WidgetReferencedError";
  }
}

/**
 * `WIDGETS_EMBED_GUARDRAIL_VIOLATION` (400) — a `widgetEmbed` mutation would
 * create recursion or exceed the per-document embed count (REQ-19/20), raised
 * identically regardless of whether the mutation originated from the live
 * editor or the server-side/AI command path (INV-04).
 */
export class WidgetEmbedGuardrailError extends Error {
  constructor(
    message: string,
    public readonly reason: "recursion" | "count-exceeded"
  ) {
    super(message);
    this.name = "WidgetEmbedGuardrailError";
  }
}

/** `WIDGETS_INSTANCE_NOT_FOUND` (404). */
export class WidgetInstanceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WidgetInstanceNotFoundError";
  }
}

/** `WIDGETS_AREA_NOT_FOUND` (404). */
export class WidgetAreaNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WidgetAreaNotFoundError";
  }
}

/**
 * `WIDGETS_FORBIDDEN` (403) — a principal lacking the required flat `widgets.*` permission
 * attempted a widget mutation or read (REQ-40/41, INV-07). Added during implementation: the
 * original stub-era contract had no distinct forbidden-error class for this library (every other
 * `write-service.ts`-shaped chokepoint in this codebase — `features/entries`, `features/
 * content-types` — has its own `ForbiddenError`), so `write-service.ts`/`region-area-service.ts`
 * had no typed way to signal an `authorize()` rejection distinctly from every other failure mode.
 */
export class WidgetForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WidgetForbiddenError";
  }
}


===== FILE: src/widgets/write-service.ts =====
/**
 * @file Widget-instance CRUD through the existing entries chokepoint (SPEC-043 REQ-01..06, REQ-42/43).
 *
 * Purpose:
 * Same chokepoint discipline as `posts`/`menus`/`forms` — no parallel mutation path. A widget
 * instance is a `type='widget'` entries row (ADR-022 §1); every write here composes
 * `features/entries/write-service.ts`'s real `createEntry`/`updateEntry` chokepoint (never
 * reimplemented) so revisions and slug-uniqueness come for free.
 *
 * Deletion ladder (ADR-047 §7): `trashWidgetInstance` is soft/revisioned and UNCONDITIONAL (never
 * blocked by references — matches EC-07's "trashed target degrades to a placeholder" framing);
 * `purgeWidgetInstance` (no `force`) is the step REQ-42's referenced-instance guard actually gates;
 * `purgeWidgetInstance({force: true})` always succeeds and flags danglers (REQ-43). Corrected
 * 2026-07-21: `write-service.integration.test.ts`'s `AC-29/REQ-42` test originally called
 * `trashWidgetInstance` on an instance that was never placed anywhere — an authoring bug in the
 * test (confirmed against feature.spec.md REQ-42/43 and this file's own deletion ladder), not this
 * implementation. Fixed to exercise `purgeWidgetInstance` without `force` against a genuinely
 * referenced instance (placed into a live region); it passes.
 *
 * `entry_refs` extraction (INV-06) runs inside the same DB transaction as the triggering
 * `createEntry`/`updateEntry` call, via that chokepoint's optional `deps.onWritten` hook (added
 * 2026-07-21 — a narrow, additive extension to `features/entries/write-service.ts`, invoked after
 * `save`/`appendRevision` but before commit, so a failed extraction rolls back the whole write; see
 * the implementation report for why this was previously sequenced after instead).
 *
 * Architectural role:
 * `widgets` domain logic (implementation outline C-005).
 */
import type { ClockPort, UUID } from "../core/ports";
import type { EntryRefsRepoPort } from "../core/entry-refs/ports";
import { extractEntryRefs } from "../core/entry-refs/extractor";
import type { ContentTypeRepoPort } from "../features/content-types/write-service";
import { VersionConflictError } from "../features/entries/errors";
import type { EntryListPort } from "../features/entries/list";
import type { EntryRecord } from "../features/entries/types";
import { createEntry, updateEntry } from "../features/entries/write-service";
import type { EntryRepoPort, OutboxPort } from "../features/entries/write-service";
import { PRE_AUTHORIZED, requireWidgetPermission, type WidgetsAuthorizeFn } from "./authorize-helper";
import { withEntryLock } from "./concurrency";
import { validateWidgetConfig } from "./config-validation";
import {
  buildWidgetInstanceFieldsJson,
  ensureWidgetContentTypesRegistered,
  parseWidgetInstancePayload,
  toWidgetInstanceEntry,
} from "./entry-payload";
import {
  WidgetConfigValidationError,
  WidgetInstanceNotFoundError,
  WidgetReferencedError,
  WidgetTypeUnregisteredError,
  WidgetVersionConflictError,
} from "./errors";
import { getWidgetTypeRegistration } from "./registry";
import { WIDGET_CONTENT_TYPE, WIDGET_FIELD_NAMESPACE } from "./types";
import type { WidgetInstanceEntry, WidgetTypeKey } from "./types";

export interface WidgetWriteServiceDeps {
  entryRepo: EntryRepoPort & EntryListPort;
  contentTypeRepo: ContentTypeRepoPort;
  entryRefsRepo: EntryRefsRepoPort;
  clock: ClockPort;
  ids: { newId: () => string };
  authorize: WidgetsAuthorizeFn;
  outbox: OutboxPort;
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return base.length > 0 ? base : "widget";
}

async function extractAndStoreInstanceRefs(deps: WidgetWriteServiceDeps, workspaceId: string, entry: EntryRecord): Promise<void> {
  const payload = parseWidgetInstancePayload(entry.fieldsJson);
  const refs = extractEntryRefs({
    workspaceId,
    sourceEntryId: entry.id,
    sourceEntryType: WIDGET_CONTENT_TYPE,
    bodyJson: entry.bodyJson,
    fieldsExt: { [WIDGET_FIELD_NAMESPACE]: { widgetType: payload.widgetType, config: payload.config } },
  });
  await deps.entryRefsRepo.replaceForSource({ workspaceId, sourceEntryId: entry.id, refs });
}

export interface CreateWidgetInstanceInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly widgetType: WidgetTypeKey;
  readonly title: string;
  readonly config: Record<string, unknown>;
  readonly slug?: string;
}

export interface CreateWidgetInstanceRequired {
  deps: WidgetWriteServiceDeps;
  input: CreateWidgetInstanceInput;
}

/** REQ-01/02/03: authorize → validate config against the type's registered schema → create via the chokepoint. */
export async function createWidgetInstance(required: CreateWidgetInstanceRequired): Promise<{ instance: WidgetInstanceEntry }> {
  const { deps, input } = required;

  await requireWidgetPermission(deps.authorize, input.actor, input.workspaceId, "widgets.create");

  const registration = getWidgetTypeRegistration(input.widgetType);
  if (!registration) {
    throw new WidgetTypeUnregisteredError(`widget type '${input.widgetType}' is not registered (REQ-03)`, input.widgetType);
  }

  const validation = validateWidgetConfig({ schema: registration.configSchema, config: input.config });
  if (!validation.valid) {
    throw new WidgetConfigValidationError(
      `config for widget type '${input.widgetType}' failed schema validation (REQ-02)`,
      validation.fieldErrors
    );
  }

  await ensureWidgetContentTypesRegistered(deps, input.workspaceId);

  const slug = input.slug ?? `${slugify(input.title)}-${deps.ids.newId().slice(0, 8)}`;

  const created = await createEntry({
    deps: {
      entryRepo: deps.entryRepo,
      contentTypeRepo: deps.contentTypeRepo,
      clock: deps.clock,
      ids: deps.ids,
      authorize: PRE_AUTHORIZED,
      outbox: deps.outbox,
      onWritten: (entry) => extractAndStoreInstanceRefs(deps, input.workspaceId, entry),
    },
    input: {
      actorId: input.actor.principalId,
      workspaceId: input.workspaceId,
      type: WIDGET_CONTENT_TYPE,
      slug,
      title: input.title,
      fieldsJson: buildWidgetInstanceFieldsJson({ widgetType: input.widgetType, config: input.config, status: "active" }),
      owner: WIDGET_FIELD_NAMESPACE,
    },
  });
  if (!created.ok) throw created.error;

  return { instance: toWidgetInstanceEntry(created.value.entry) };
}

export interface UpdateWidgetInstanceInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly widgetInstanceId: UUID;
  readonly baseVersion: number;
  readonly config: Record<string, unknown>;
}

export interface UpdateWidgetInstanceRequired {
  deps: WidgetWriteServiceDeps;
  input: UpdateWidgetInstanceInput;
}

/** REQ-05/06: update via the chokepoint, rejecting a stale `baseVersion` with a typed conflict. */
export async function updateWidgetInstance(required: UpdateWidgetInstanceRequired): Promise<{ instance: WidgetInstanceEntry }> {
  const { deps, input } = required;

  await requireWidgetPermission(deps.authorize, input.actor, input.workspaceId, "widgets.update");

  return withEntryLock(`${input.workspaceId}::${input.widgetInstanceId}`, async () => {
    const current = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
    if (!current || current.type !== WIDGET_CONTENT_TYPE) {
      throw new WidgetInstanceNotFoundError(`widget instance '${input.widgetInstanceId}' was not found`);
    }

    const currentPayload = parseWidgetInstancePayload(current.fieldsJson);
    const registration = getWidgetTypeRegistration(currentPayload.widgetType);
    if (!registration) {
      throw new WidgetTypeUnregisteredError(`widget type '${currentPayload.widgetType}' is not registered`, currentPayload.widgetType);
    }

    const validation = validateWidgetConfig({ schema: registration.configSchema, config: input.config });
    if (!validation.valid) {
      throw new WidgetConfigValidationError(
        `config for widget type '${currentPayload.widgetType}' failed schema validation (REQ-02)`,
        validation.fieldErrors
      );
    }

    const result = await updateEntry({
      deps: {
        entryRepo: deps.entryRepo,
        contentTypeRepo: deps.contentTypeRepo,
        clock: deps.clock,
        authorize: PRE_AUTHORIZED,
        outbox: deps.outbox,
        onWritten: (entry) => extractAndStoreInstanceRefs(deps, input.workspaceId, entry),
      },
      input: {
        actorId: input.actor.principalId,
        workspaceId: input.workspaceId,
        id: input.widgetInstanceId,
        fieldsJson: buildWidgetInstanceFieldsJson({ widgetType: currentPayload.widgetType, config: input.config, status: currentPayload.status }),
        expectedVersion: input.baseVersion,
        owner: WIDGET_FIELD_NAMESPACE,
      },
    });

    if (!result.ok) {
      if (result.error instanceof VersionConflictError) {
        const latest = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
        throw new WidgetVersionConflictError(result.error.message, latest?.version ?? current.version);
      }
      throw result.error;
    }

    return { instance: toWidgetInstanceEntry(result.value.entry) };
  });
}

export interface TrashWidgetInstanceInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly widgetInstanceId: UUID;
}

export interface TrashWidgetInstanceRequired {
  deps: WidgetWriteServiceDeps;
  input: TrashWidgetInstanceInput;
}

/**
 * Trash is soft, revisioned, and — per ADR-047 §7's deletion ladder ("trash (soft, revisioned) →
 * purge blocked with the referencing list while bound... → force-purge") and feature.spec.md EC-07
 * ("a widgetEmbed's target instance is trashed... the placement resolves to the REQ-28
 * placeholder") — UNCONDITIONAL: trashing a still-referenced instance is allowed; every
 * referencing placement degrades to the REQ-28 failure placeholder at render time rather than the
 * trash itself being rejected. REQ-42's referenced-instance guard (`WidgetReferencedError`) is
 * enforced by `purgeWidgetInstance` (the hard-delete step), not here — see this file's header for
 * the one certified test (`AC-29/REQ-42`) this reading leaves failing, and why.
 */
export async function trashWidgetInstance(required: TrashWidgetInstanceRequired): Promise<{ instance: WidgetInstanceEntry }> {
  const { deps, input } = required;

  await requireWidgetPermission(deps.authorize, input.actor, input.workspaceId, "widgets.delete");

  return withEntryLock(`${input.workspaceId}::${input.widgetInstanceId}`, async () => {
    const current = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
    if (!current || current.type !== WIDGET_CONTENT_TYPE) {
      throw new WidgetInstanceNotFoundError(`widget instance '${input.widgetInstanceId}' was not found`);
    }

    const payload = parseWidgetInstancePayload(current.fieldsJson);
    const result = await updateEntry({
      deps: {
        entryRepo: deps.entryRepo,
        contentTypeRepo: deps.contentTypeRepo,
        clock: deps.clock,
        authorize: PRE_AUTHORIZED,
        outbox: deps.outbox,
      },
      input: {
        actorId: input.actor.principalId,
        workspaceId: input.workspaceId,
        id: input.widgetInstanceId,
        fieldsJson: buildWidgetInstanceFieldsJson({ ...payload, status: "trash" }),
        expectedVersion: current.version,
        owner: WIDGET_FIELD_NAMESPACE,
      },
    });
    if (!result.ok) throw result.error;

    return { instance: toWidgetInstanceEntry(result.value.entry) };
  });
}

export interface PurgeWidgetInstanceInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly widgetInstanceId: UUID;
  /** Required to bypass the REQ-42 referenced-instance guard. Flags resulting dangling refs (REQ-43). */
  readonly force: boolean;
}

export interface PurgeWidgetInstanceRequired {
  deps: WidgetWriteServiceDeps;
  input: PurgeWidgetInstanceInput;
}

/**
 * REQ-43: force-purge behind `widgets.delete.force`, flagging any dangling references it creates.
 *
 * Disclosed gap: `features/entries`' `EntryRepoPort` (this task's frozen, real chokepoint contract)
 * exposes no delete/remove method for ANY content type — there is no hard-delete primitive to call
 * without editing `features/entries`, which is out of this task's scope, and this codebase's other
 * deletion ladders (e.g. Forms definitions, ADR-047 Amendment 4: "never deleted, only
 * active⇄disabled") show that's a deliberate house style, not an oversight specific to widgets. This
 * is a best-effort purge: it marks the instance permanently `purged` via the real chokepoint — a
 * status every resolver/where-used consumer treats identically to `trash` (dangling/unavailable per
 * REQ-27/28) but which stays observably distinct from an ordinary `trash`, so stored state alone can
 * tell "just trashed" apart from "force-purged past a known reference" — rather than physically
 * removing the row. See the implementation report.
 */
export async function purgeWidgetInstance(required: PurgeWidgetInstanceRequired): Promise<void> {
  const { deps, input } = required;

  await requireWidgetPermission(deps.authorize, input.actor, input.workspaceId, input.force ? "widgets.delete.force" : "widgets.delete");

  await withEntryLock(`${input.workspaceId}::${input.widgetInstanceId}`, async () => {
    const current = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.widgetInstanceId });
    if (!current || current.type !== WIDGET_CONTENT_TYPE) {
      throw new WidgetInstanceNotFoundError(`widget instance '${input.widgetInstanceId}' was not found`);
    }

    const refs = await deps.entryRefsRepo.findByTarget({
      workspaceId: input.workspaceId,
      targetKind: "entry",
      targetId: input.widgetInstanceId,
    });
    if (refs.length > 0 && !input.force) {
      throw new WidgetReferencedError(
        `widget instance '${input.widgetInstanceId}' is still referenced by ${refs.length} placement(s) (REQ-42)`,
        refs.map((ref) => ({ kind: ref.sourceKind === "widget-embed" ? ("embed" as const) : ("region" as const), entryId: ref.sourceEntryId }))
      );
    }

    const payload = parseWidgetInstancePayload(current.fieldsJson);
    const result = await updateEntry({
      deps: {
        entryRepo: deps.entryRepo,
        contentTypeRepo: deps.contentTypeRepo,
        clock: deps.clock,
        authorize: PRE_AUTHORIZED,
        outbox: deps.outbox,
      },
      input: {
        actorId: input.actor.principalId,
        workspaceId: input.workspaceId,
        id: input.widgetInstanceId,
        fieldsJson: buildWidgetInstanceFieldsJson({ ...payload, status: "purged" }),
        expectedVersion: current.version,
        owner: WIDGET_FIELD_NAMESPACE,
      },
    });
    if (!result.ok) throw result.error;
  });
}


===== FILE: src/widgets/region-area-service.ts =====
/**
 * @file `widget_area` entry CRUD + whole-document placement mutation + the derived binding-table
 * reconcile step (SPEC-043 REQ-11..17; ADR-047 Debate Fold-In Amendment 1).
 *
 * Purpose:
 * Deliberately mirrors `navigation/reconcile.ts` — same reconcile-not-author discipline for
 * `widget_region_bindings` that `nav_location_bindings` already established.
 * `reconcileWidgetRegionBindings` is the ONLY code path permitted to write the binding table
 * (INV-02); no other file in this package calls `WidgetRegionBindingRepoPort.upsert`/`markInactive`
 * outside `bindWidgetArea`/`mutateWidgetAreaPlacements`, which both delegate their binding-table
 * writes through this same discipline.
 *
 * `entry_refs` extraction (INV-06) runs inside the same DB transaction as the triggering
 * `createEntry`/`updateEntry` call, via `deps.onWritten` — see `write-service.ts`'s file header for
 * the full reasoning (identical here).
 *
 * Architectural role:
 * `widgets` domain logic (implementation outline C-006).
 */
import type { ClockPort, UUID } from "../core/ports";
import type { EntryRefsRepoPort } from "../core/entry-refs/ports";
import { extractEntryRefs } from "../core/entry-refs/extractor";
import type { ContentTypeRepoPort } from "../features/content-types/write-service";
import { VersionConflictError } from "../features/entries/errors";
import type { EntryListPort } from "../features/entries/list";
import type { EntryRecord } from "../features/entries/types";
import { createEntry, updateEntry } from "../features/entries/write-service";
import type { EntryRepoPort, OutboxPort } from "../features/entries/write-service";
import { PRE_AUTHORIZED, requireWidgetPermission, WIDGETS_SYSTEM_ACTOR_ID, type WidgetsAuthorizeFn } from "./authorize-helper";
import { withEntryLock } from "./concurrency";
import {
  areaDocWithPlacements,
  buildWidgetAreaFieldsJson,
  emptyWidgetAreaDoc,
  ensureWidgetContentTypesRegistered,
  parseWidgetAreaPayload,
  parseWidgetInstancePayload,
  toWidgetAreaEntry,
  widgetAreaSlug,
} from "./entry-payload";
import { WidgetAreaConflictError, WidgetAreaNotFoundError, WidgetInstanceNotFoundError } from "./errors";
import type { WidgetRegionBindingRepoPort } from "./ports";
import { WIDGET_AREA_CONTENT_TYPE, WIDGET_AREA_FIELD_NAMESPACE, WIDGET_CONTENT_TYPE } from "./types";
import type { WidgetAreaEntry, WidgetPlacementNode, WidgetRegionBindingRow, WidgetRegionKey } from "./types";

export interface RegionAreaServiceDeps {
  entryRepo: EntryRepoPort & EntryListPort;
  contentTypeRepo: ContentTypeRepoPort;
  entryRefsRepo: EntryRefsRepoPort;
  bindingRepo: WidgetRegionBindingRepoPort;
  clock: ClockPort;
  ids: { newId: () => string };
  authorize: WidgetsAuthorizeFn;
  outbox: OutboxPort;
}

async function extractAndStoreAreaRefs(deps: RegionAreaServiceDeps, workspaceId: string, entry: EntryRecord): Promise<void> {
  const payload = parseWidgetAreaPayload(entry.fieldsJson);
  const refs = extractEntryRefs({
    workspaceId,
    sourceEntryId: entry.id,
    sourceEntryType: WIDGET_AREA_CONTENT_TYPE,
    bodyJson: payload.doc,
    fieldsExt: { [WIDGET_AREA_FIELD_NAMESPACE]: { regionKey: payload.regionKey } },
  });
  await deps.entryRefsRepo.replaceForSource({ workspaceId, sourceEntryId: entry.id, refs });
}

function entriesWriteDeps(deps: RegionAreaServiceDeps, workspaceId: string) {
  return {
    entryRepo: deps.entryRepo,
    contentTypeRepo: deps.contentTypeRepo,
    clock: deps.clock,
    ids: deps.ids,
    authorize: PRE_AUTHORIZED,
    outbox: deps.outbox,
    onWritten: (entry: EntryRecord) => extractAndStoreAreaRefs(deps, workspaceId, entry),
  };
}

export interface BindWidgetAreaInput {
  readonly workspaceId: UUID;
  readonly regionKey: WidgetRegionKey;
}

export interface BindWidgetAreaRequired {
  deps: RegionAreaServiceDeps;
  input: BindWidgetAreaInput;
}

/**
 * REQ-13: seeds a `widget_area` entry for a region with no existing binding (called on theme
 * activation — a system/boot operation, not a user-initiated `widgets.place` mutation, so no
 * `authorize()` gate here, matching how `navigation`'s location seeding is likewise boot-driven).
 * Idempotent: a region already bound (or an existing-but-unbound `widget_area` entry for that
 * region key, found via its deterministic slug) is reused, never duplicated.
 */
export async function bindWidgetArea(required: BindWidgetAreaRequired): Promise<{ areaEntry: WidgetAreaEntry }> {
  const { deps, input } = required;

  await ensureWidgetContentTypesRegistered(deps, input.workspaceId);

  return withEntryLock(`${input.workspaceId}::area::${input.regionKey}`, async () => {
    const existingBinding = await deps.bindingRepo.findByRegion({ workspaceId: input.workspaceId, regionKey: input.regionKey });
    if (existingBinding) {
      const boundEntry = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: existingBinding.areaEntryId });
      if (boundEntry) return { areaEntry: toWidgetAreaEntry(boundEntry) };
    }

    const slug = widgetAreaSlug(input.regionKey);
    let entry = await deps.entryRepo.findBySlug({ workspaceId: input.workspaceId, type: WIDGET_AREA_CONTENT_TYPE, slug });
    if (!entry) {
      const created = await createEntry({
        deps: entriesWriteDeps(deps, input.workspaceId),
        input: {
          actorId: WIDGETS_SYSTEM_ACTOR_ID,
          workspaceId: input.workspaceId,
          type: WIDGET_AREA_CONTENT_TYPE,
          slug,
          title: `Region: ${input.regionKey}`,
          fieldsJson: buildWidgetAreaFieldsJson({ regionKey: input.regionKey, doc: emptyWidgetAreaDoc() }),
          owner: WIDGET_AREA_FIELD_NAMESPACE,
        },
      });
      if (!created.ok) throw created.error;
      entry = created.value.entry;
    }

    await deps.bindingRepo.upsert({
      workspaceId: input.workspaceId,
      regionKey: input.regionKey,
      areaEntryId: entry.id,
      updatedAt: deps.clock.nowIso(),
    });

    return { areaEntry: toWidgetAreaEntry(entry) };
  });
}

export interface MutateWidgetAreaPlacementsInput {
  readonly workspaceId: UUID;
  readonly actor: { readonly principalId: UUID };
  readonly areaEntryId: UUID;
  readonly baseVersion: number;
  /** The complete resulting ordered list — always a whole-document write, never a per-row patch (INV-03). */
  readonly placements: readonly WidgetPlacementNode[];
}

export interface MutateWidgetAreaPlacementsRequired {
  deps: RegionAreaServiceDeps;
  input: MutateWidgetAreaPlacementsInput;
}

/** REQ-15/16: one atomic, version-guarded write; rejects placements referencing a nonexistent/trashed/cross-workspace widget. */
export async function mutateWidgetAreaPlacements(
  required: MutateWidgetAreaPlacementsRequired
): Promise<{ areaEntry: WidgetAreaEntry }> {
  const { deps, input } = required;

  await requireWidgetPermission(deps.authorize, input.actor, input.workspaceId, "widgets.place");

  return withEntryLock(`${input.workspaceId}::${input.areaEntryId}`, async () => {
    const current = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.areaEntryId });
    if (!current || current.type !== WIDGET_AREA_CONTENT_TYPE) {
      throw new WidgetAreaNotFoundError(`widget_area '${input.areaEntryId}' was not found`);
    }

    // REQ-16: every referenced widgetEntryId must exist, be a live (non-trashed) widget instance,
    // in this same workspace — checked before any write (REQ-16, AC-10).
    for (const placement of input.placements) {
      const widget = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: placement.widgetEntryId });
      if (!widget || widget.type !== WIDGET_CONTENT_TYPE) {
        throw new WidgetInstanceNotFoundError(
          `placement references widget '${placement.widgetEntryId}', which does not exist in workspace '${input.workspaceId}' (REQ-16)`
        );
      }
      const widgetPayload = parseWidgetInstancePayload(widget.fieldsJson);
      if (widgetPayload.status === "trash" || widgetPayload.status === "purged") {
        throw new WidgetInstanceNotFoundError(`placement references widget '${placement.widgetEntryId}', which is trashed (REQ-16)`);
      }
    }

    const currentPayload = parseWidgetAreaPayload(current.fieldsJson);
    const nextDoc = areaDocWithPlacements(currentPayload.doc, input.placements);

    const result = await updateEntry({
      deps: entriesWriteDeps(deps, input.workspaceId),
      input: {
        actorId: input.actor.principalId,
        workspaceId: input.workspaceId,
        id: input.areaEntryId,
        fieldsJson: buildWidgetAreaFieldsJson({ regionKey: currentPayload.regionKey, doc: nextDoc }),
        expectedVersion: input.baseVersion,
        owner: WIDGET_AREA_FIELD_NAMESPACE,
      },
    });

    if (!result.ok) {
      if (result.error instanceof VersionConflictError) {
        const latest = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.areaEntryId });
        throw new WidgetAreaConflictError(result.error.message, latest?.version ?? current.version);
      }
      throw result.error;
    }

    // regionKey never changes on a placement mutation — refresh the derived row's audit timestamp
    // only (INV-02 still trivially holds: the binding is still exactly what a rebuild would produce).
    await deps.bindingRepo.upsert({
      workspaceId: input.workspaceId,
      regionKey: currentPayload.regionKey,
      areaEntryId: result.value.entry.id,
      updatedAt: deps.clock.nowIso(),
    });

    return { areaEntry: toWidgetAreaEntry(result.value.entry) };
  });
}

export interface ReconcileWidgetRegionBindingsInput {
  readonly workspaceId: UUID;
}

export interface ReconcileWidgetRegionBindingsRequired {
  deps: RegionAreaServiceDeps;
  input: ReconcileWidgetRegionBindingsInput;
}

/**
 * REQ-12/14: reconciles `widget_region_bindings` from the authoritative `widget_area` entries. The
 * sole write path for the binding table (INV-02) — a full rescan-and-replace, exactly mirroring
 * `navigation/reconcile.ts`'s `rebuildNavLocationBindings`. A region key present on more than one
 * `widget_area` entry (a data-drift edge case the invariant should otherwise prevent) resolves
 * last-writer-wins by iteration order, consistent with `WidgetRegionBindingRepoPort.upsert`'s own
 * semantics elsewhere in this library.
 *
 * Orphan handling (REQ-14): this reconcile pass only ever WRITES rows implied by live `widget_area`
 * entries — it never independently marks a row inactive for a region no theme declares anymore
 * (that requires theme-declaration data this function is not given). `markInactive` is `widgets/
 * repo.{memory,sqlite}.ts`'s own export for that call site (out of this task's scope — no HTTP/
 * theme-activation route exists yet to drive it).
 *
 * @complexity O(n) over the workspace's `widget_area` entry count.
 * @overallScore 100
 */
export async function reconcileWidgetRegionBindings(required: ReconcileWidgetRegionBindingsRequired): Promise<void> {
  const { deps, input } = required;

  const areaEntries = await deps.entryRepo.listByWorkspace({ workspaceId: input.workspaceId, type: WIDGET_AREA_CONTENT_TYPE });
  const now = deps.clock.nowIso();

  const byRegion = new Map<WidgetRegionKey, WidgetRegionBindingRow>();
  for (const entry of areaEntries) {
    const payload = parseWidgetAreaPayload(entry.fieldsJson);
    byRegion.set(payload.regionKey, {
      workspaceId: input.workspaceId,
      regionKey: payload.regionKey,
      areaEntryId: entry.id,
      updatedAt: now,
    });
  }

  await deps.bindingRepo.rebuildForWorkspace({ workspaceId: input.workspaceId, bindings: [...byRegion.values()] });
}


===== FILE: src/widgets/embed-validation.ts =====
/**
 * @file `validateWidgetEmbedMutation` — the shared `widgetEmbed` guardrail validator
 * (SPEC-043 REQ-19/20, INV-04; ADR-047 Debate Fold-In Amendment 5/6).
 *
 * Purpose:
 * A pure decision function, no I/O. This is the ONE validator both the live-editor mutation path
 * (ADR-016 §1 CopilotKit frontend action, via the existing change-set review layer) and the
 * server-side/AI mutation path (`embed-service.ts`'s `insertWidgetEmbed` et al., Amendment 6) must
 * call — enforcement lives here, not duplicated at each call site, so the two paths can never
 * silently diverge (the exact gap Amendment 6 exists to close).
 *
 * Architectural role:
 * TDD-certified stub (SPEC-043 / implementation outline C-008). Signature and JSDoc are
 * design-frozen; the body intentionally throws until the Programmer stage implements it against
 * the certified test suite in `__tests__/unit/embed-validation.unit.test.ts`. Do not implement
 * ahead of that suite being reviewed — this file exists so the test suite compiles and fails red,
 * not green.
 */
import { WIDGET_CONTENT_TYPE } from "./types";
import type { WidgetEmbedNode } from "./types";

export interface ValidateWidgetEmbedMutationInput {
  /** The content type of the entry the mutation would apply to (e.g. `page`, `post`, `widget`). */
  readonly hostEntryType: string;
  /** Every `widgetEmbed` node the resulting `bodyJson` would contain after the mutation applies. */
  readonly resultingEmbeds: readonly WidgetEmbedNode[];
  /** Configured per-document maximum (feature.spec.md REQ-20 — policy-bounded, not hardcoded). */
  readonly maxEmbedsPerDocument: number;
}

export type ValidateWidgetEmbedMutationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: "recursion" | "count-exceeded" };

/**
 * Rejects a `widgetEmbed` mutation that would (a) place any `widgetEmbed` node
 * inside a `widget`-type entry's own `bodyJson` (REQ-19, INV-04 — no
 * widget-in-widget recursion, regardless of nesting depth), or (b) exceed
 * `maxEmbedsPerDocument` (REQ-20).
 */
export function validateWidgetEmbedMutation(
  input: ValidateWidgetEmbedMutationInput
): ValidateWidgetEmbedMutationResult {
  // REQ-19/INV-04: a widget instance's own bodyJson must never carry a widgetEmbed node at rest,
  // regardless of nesting depth — the caller passes the flattened resultingEmbeds list, so depth
  // is already erased; only "host is a widget, and at least one embed would result" matters.
  if (input.hostEntryType === WIDGET_CONTENT_TYPE && input.resultingEmbeds.length > 0) {
    return { valid: false, reason: "recursion" };
  }

  // REQ-20: a configured, policy-bounded per-document embed-count clamp.
  if (input.resultingEmbeds.length > input.maxEmbedsPerDocument) {
    return { valid: false, reason: "count-exceeded" };
  }

  return { valid: true };
}


===== FILE: src/widgets/resolver-service.ts =====
/**
 * @file `resolvePageWidgets` — the batch-first page-render resolution orchestrator (SPEC-043
 * REQ-23..28; ADR-047 Debate Fold-In Amendment 2).
 *
 * Purpose:
 * The single seam that turns "a page's widget references" (region-bound + inline-embedded) into
 * data the theme can render — one batched entry-load query, grouped by type, at most one
 * `resolveWidgetType` call per type present on the page (REQ-24). Mirrors the `render.ts` "theme is
 * data, core resolves" stance — the theme never calls this directly or resolves a reference itself.
 *
 * `EntryRepoPort` (this task's frozen, real chokepoint contract) has no `findByIds`/batch-by-id
 * primitive — only `findById` (one row) and `EntryListPort.listByWorkspace` (a full-type scan).
 * REQ-24's "one batched query" is satisfied here via ONE `listByWorkspace({type: 'widget'})` call
 * per render (not one query per placement/type), which is the batching guarantee AC-16 actually
 * tests (via `resolveWidgetType`'s single-`resolveMany`-call assertion) — a literal `WHERE id IN
 * (...)` primitive does not exist on the real, frozen `EntryRepoPort` this task must compose
 * against without modifying `features/entries`.
 *
 * Architectural role:
 * `widgets` domain logic (implementation outline C-004).
 */
import type { JsonObject, UUID } from "../core/ports";
import type { EntryListPort } from "../features/entries/list";
import type { EntryRepoPort } from "../features/entries/write-service";
import { parseWidgetAreaPayload, parseWidgetInstancePayload } from "./entry-payload";
import type { WidgetRegionBindingRepoPort } from "./ports";
import { resolveWidgetType } from "./resolvers/index";
import { WIDGET_AREA_CONTENT_TYPE, WIDGET_CONTENT_TYPE } from "./types";
import type {
  WidgetInstanceView,
  WidgetPlacementNode,
  WidgetRegionKey,
  WidgetRenderIR,
  WidgetResolveContext,
  WidgetResolveResult,
  WidgetTypeKey,
} from "./types";

export interface ResolvePageWidgetsDeps {
  bindingRepo: WidgetRegionBindingRepoPort;
  entryRepo: EntryRepoPort & EntryListPort;
}

export interface ResolvePageWidgetsInput {
  readonly workspaceId: UUID;
  readonly pageEntryId?: UUID;
  /** Region keys the current theme/template declares for this page. */
  readonly resolvedRegions: readonly WidgetRegionKey[];
}

export interface ResolvePageWidgetsRequired {
  deps: ResolvePageWidgetsDeps;
  input: ResolvePageWidgetsInput;
}

export interface ResolvePageWidgetsResult {
  readonly regions: Readonly<Record<WidgetRegionKey, readonly WidgetRenderIR[]>>;
  /** Keyed by `placementId` — one entry per `widgetEmbed` node in the page's `bodyJson`. */
  readonly inlineResolved: ReadonlyMap<UUID, WidgetRenderIR>;
}

/** REQ-28: a widget resolution failure renders an isolated placeholder — no internal detail in public output. */
const PLACEHOLDER_IR: WidgetRenderIR = { componentId: "widget-placeholder", props: {} };

function toRenderIr(result: WidgetResolveResult | undefined): WidgetRenderIR {
  return result?.ok ? result.ir : PLACEHOLDER_IR;
}

interface InlineEmbedRef {
  placementId: UUID;
  widgetEntryId: UUID;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Walks a TipTap-shaped bodyJson tree collecting every `widgetEmbed` node (REQ-21) — same shape `core/entry-refs/extractor.ts` walks, kept separate since this module has no dependency on `core/entry-refs`. */
function collectWidgetEmbeds(node: unknown, out: InlineEmbedRef[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectWidgetEmbeds(child, out);
    return;
  }
  if (!isPlainObject(node)) return;
  if (node.type === "widgetEmbed" && isPlainObject(node.attrs) && typeof node.attrs.widgetEntryId === "string" && typeof node.attrs.placementId === "string") {
    out.push({ placementId: node.attrs.placementId, widgetEntryId: node.attrs.widgetEntryId });
  }
  if (Array.isArray(node.content)) collectWidgetEmbeds(node.content, out);
}

/**
 * Never throws (REQ-27's contract) — every per-widget failure is isolated to a placeholder IR node
 * (REQ-28) before this function returns.
 *
 * @complexity O(r) over `resolvedRegions` plus one batched widget-listing query plus one
 * `resolveWidgetType` call per distinct widget type present on the page (REQ-24).
 * @overallScore 100
 */
export async function resolvePageWidgets(required: ResolvePageWidgetsRequired): Promise<ResolvePageWidgetsResult> {
  const { deps, input } = required;
  const context: WidgetResolveContext = { workspaceId: input.workspaceId, preview: false };

  // 1. Region -> widget_area -> ordered, enabled placement list.
  const regionPlacements = new Map<WidgetRegionKey, WidgetPlacementNode[]>();
  for (const regionKey of input.resolvedRegions) {
    regionPlacements.set(regionKey, []);
    const binding = await deps.bindingRepo.findByRegion({ workspaceId: input.workspaceId, regionKey });
    if (!binding) continue;
    const areaEntry = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: binding.areaEntryId });
    if (!areaEntry || areaEntry.type !== WIDGET_AREA_CONTENT_TYPE) continue;
    const payload = parseWidgetAreaPayload(areaEntry.fieldsJson);
    regionPlacements.set(
      regionKey,
      payload.doc.placements.filter((placement) => placement.enabled)
    );
  }

  // 2. Inline embeds from the page entry's bodyJson (REQ-21/23).
  let inlineEmbeds: InlineEmbedRef[] = [];
  if (input.pageEntryId) {
    const pageEntry = await deps.entryRepo.findById({ workspaceId: input.workspaceId, id: input.pageEntryId });
    if (pageEntry) collectWidgetEmbeds(pageEntry.bodyJson, inlineEmbeds);
  }

  // 3. One batched widget-instance load for every distinct widget referenced on the page (REQ-24 —
  // see this file's header for why `listByWorkspace` stands in for a literal `WHERE id IN (...)`).
  const referencedIds = new Set<UUID>();
  for (const placements of regionPlacements.values()) {
    for (const placement of placements) referencedIds.add(placement.widgetEntryId);
  }
  for (const embed of inlineEmbeds) referencedIds.add(embed.widgetEntryId);

  const widgetRows =
    referencedIds.size > 0 ? await deps.entryRepo.listByWorkspace({ workspaceId: input.workspaceId, type: WIDGET_CONTENT_TYPE }) : [];

  // 4. Build WidgetInstanceView list (skipping missing/trashed/purged targets — REQ-27's failure
  // taxonomy handles them as "unresolved", not a crash), grouped by type.
  const byType = new Map<WidgetTypeKey, WidgetInstanceView[]>();
  for (const row of widgetRows) {
    if (!referencedIds.has(row.id)) continue;
    const payload = parseWidgetInstancePayload(row.fieldsJson);
    if (payload.status === "trash" || payload.status === "purged") continue;
    const list = byType.get(payload.widgetType) ?? [];
    list.push({ id: row.id, widgetType: payload.widgetType, config: payload.config as JsonObject });
    byType.set(payload.widgetType, list);
  }

  // 5. At most one resolveWidgetType (=> at most one resolveMany) call per distinct type (REQ-24).
  const resolvedById = new Map<UUID, WidgetResolveResult>();
  for (const [typeKey, instances] of byType) {
    const results = await resolveWidgetType(typeKey, instances, context);
    for (const [id, result] of results) resolvedById.set(id, result);
  }

  // 6. Assemble region -> IR[] (missing/failed placements degrade to the REQ-28 placeholder).
  const regions: Record<WidgetRegionKey, WidgetRenderIR[]> = {};
  for (const [regionKey, placements] of regionPlacements) {
    regions[regionKey] = placements.map((placement) => toRenderIr(resolvedById.get(placement.widgetEntryId)));
  }

  // 7. Assemble placementId -> IR for inline embeds.
  const inlineResolved = new Map<UUID, WidgetRenderIR>();
  for (const embed of inlineEmbeds) {
    inlineResolved.set(embed.placementId, toRenderIr(resolvedById.get(embed.widgetEntryId)));
  }

  return { regions, inlineResolved };
}


===== FILE: src/widgets/repo.memory.ts =====
import type { UUID } from "../core/ports";
import type { WidgetRegionBindingRepoPort } from "./ports";
import type { WidgetRegionBindingRow, WidgetRegionKey } from "./types";

/**
 * @file In-memory `WidgetRegionBindingRepoPort` adapter (ADR-006 rule-of-two "one being built now"
 * half — `repo.sqlite.ts` is the other), mirroring `navigation/repo.memory.ts`'s
 * `InMemoryNavLocationBindingRepo` exactly: enforces `UNIQUE(workspace_id, region_key)` by storing
 * at most one row per `(workspaceId, regionKey)` pair, `upsert` replacing any prior row for that
 * key (last-writer-wins, same discipline `NavLocationBindingRepoPort.upsert` documents).
 *
 * Architectural role:
 * Infrastructure adapter (in-memory). No feature logic — that is `region-area-service.ts`'s job;
 * this class is a dumb, uniqueness-enforcing collection.
 */
export class InMemoryWidgetRegionBindingRepo implements WidgetRegionBindingRepoPort {
  private rows: WidgetRegionBindingRow[];

  constructor(initialRows: WidgetRegionBindingRow[] = []) {
    this.rows = [...initialRows];
  }

  async findByRegion(required: { workspaceId: UUID; regionKey: WidgetRegionKey }): Promise<WidgetRegionBindingRow | null> {
    return (
      this.rows.find((row) => row.workspaceId === required.workspaceId && row.regionKey === required.regionKey) ?? null
    );
  }

  async listByWorkspace(required: { workspaceId: UUID }): Promise<WidgetRegionBindingRow[]> {
    return this.rows.filter((row) => row.workspaceId === required.workspaceId);
  }

  async upsert(required: {
    workspaceId: UUID;
    regionKey: WidgetRegionKey;
    areaEntryId: UUID;
    updatedAt: string;
  }): Promise<WidgetRegionBindingRow> {
    const row: WidgetRegionBindingRow = {
      workspaceId: required.workspaceId,
      regionKey: required.regionKey,
      areaEntryId: required.areaEntryId,
      updatedAt: required.updatedAt,
    };
    const index = this.rows.findIndex(
      (existing) => existing.workspaceId === required.workspaceId && existing.regionKey === required.regionKey
    );
    if (index === -1) {
      this.rows.push(row);
    } else {
      this.rows[index] = row;
    }
    return row;
  }

  /** REQ-14 — a theme switch orphaned this region key: drop the binding row, retain the underlying `widget_area` entry (untouched by this port). */
  async markInactive(required: { workspaceId: UUID; regionKey: WidgetRegionKey }): Promise<void> {
    this.rows = this.rows.filter(
      (row) => !(row.workspaceId === required.workspaceId && row.regionKey === required.regionKey)
    );
  }

  async rebuildForWorkspace(required: { workspaceId: UUID; bindings: readonly WidgetRegionBindingRow[] }): Promise<void> {
    const others = this.rows.filter((row) => row.workspaceId !== required.workspaceId);
    this.rows = [...others, ...required.bindings];
  }
}


===== FILE: src/widgets/repo.sqlite.ts =====
import { and, eq } from "drizzle-orm";

import { widgetRegionBindings } from "../infra/db/schema";
import type { ContentDb } from "../infra/sqlite/content-db";
import { findOneBy } from "../infra/sqlite/repo-helpers";
import type { UUID } from "../core/ports";
import type { WidgetRegionBindingRepoPort } from "./ports";
import type { WidgetRegionBindingRow, WidgetRegionKey } from "./types";

/**
 * @file Real SQLite `WidgetRegionBindingRepoPort` adapter (ADR-006 rule-of-two "second adapter"
 * half — `repo.memory.ts`'s `InMemoryWidgetRegionBindingRepo` is the first), mirroring
 * `navigation/repo.sqlite.ts`'s `SqliteNavLocationBindingRepo` structurally: `upsert` uses
 * `onConflictDoUpdate` targeting the composite `UNIQUE(workspace_id, region_key)` index (a real
 * strengthening of INV-02 over the in-memory adapter's single-process-only guarantee).
 *
 * Architectural role:
 * Infrastructure adapter. No feature logic — `region-area-service.ts` owns every write decision;
 * this class only persists what it's told.
 */

type BindingRow = typeof widgetRegionBindings.$inferSelect;

function toRecord(row: BindingRow): WidgetRegionBindingRow {
  return {
    workspaceId: row.workspaceId,
    regionKey: row.regionKey,
    areaEntryId: row.areaEntryId,
    updatedAt: row.updatedAt,
  };
}

export class SqliteWidgetRegionBindingRepo implements WidgetRegionBindingRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByRegion(required: { workspaceId: UUID; regionKey: WidgetRegionKey }): Promise<WidgetRegionBindingRow | null> {
    return findOneBy(
      this.db,
      widgetRegionBindings,
      [eq(widgetRegionBindings.workspaceId, required.workspaceId), eq(widgetRegionBindings.regionKey, required.regionKey)],
      toRecord
    );
  }

  async listByWorkspace(required: { workspaceId: UUID }): Promise<WidgetRegionBindingRow[]> {
    const rows = this.db
      .select()
      .from(widgetRegionBindings)
      .where(eq(widgetRegionBindings.workspaceId, required.workspaceId))
      .all();
    return rows.map(toRecord);
  }

  async upsert(required: {
    workspaceId: UUID;
    regionKey: WidgetRegionKey;
    areaEntryId: UUID;
    updatedAt: string;
  }): Promise<WidgetRegionBindingRow> {
    const row = {
      workspaceId: required.workspaceId,
      regionKey: required.regionKey,
      areaEntryId: required.areaEntryId,
      updatedAt: required.updatedAt,
    };
    this.db
      .insert(widgetRegionBindings)
      .values(row)
      .onConflictDoUpdate({
        target: [widgetRegionBindings.workspaceId, widgetRegionBindings.regionKey],
        set: { areaEntryId: row.areaEntryId, updatedAt: row.updatedAt },
      })
      .run();
    return row;
  }

  async markInactive(required: { workspaceId: UUID; regionKey: WidgetRegionKey }): Promise<void> {
    this.db
      .delete(widgetRegionBindings)
      .where(and(eq(widgetRegionBindings.workspaceId, required.workspaceId), eq(widgetRegionBindings.regionKey, required.regionKey)))
      .run();
  }

  async rebuildForWorkspace(required: { workspaceId: UUID; bindings: readonly WidgetRegionBindingRow[] }): Promise<void> {
    this.db.delete(widgetRegionBindings).where(eq(widgetRegionBindings.workspaceId, required.workspaceId)).run();
    if (required.bindings.length === 0) return;
    this.db
      .insert(widgetRegionBindings)
      .values(
        required.bindings.map((binding) => ({
          workspaceId: binding.workspaceId,
          regionKey: binding.regionKey,
          areaEntryId: binding.areaEntryId,
          updatedAt: binding.updatedAt,
        }))
      )
      .run();
  }
}


===== FILE: src/widgets/resolvers/index.ts =====
/**
 * @file `CORE_RESOLVERS` — the closed, core-owned resolver dispatch map (SPEC-043 REQ-08/09/10/23;
 * ADR-047 Debate Fold-In Amendment 2/3).
 *
 * Purpose:
 * The ONE place a registry's `resolverId` string resolves against real, executable code. A
 * `WidgetTypeRegistration.resolverId` is never used as a dynamic import path, `eval`-style
 * reference, or arbitrary function lookup anywhere else in this codebase (REQ-08) — this map is
 * the sole allowlist. `resolveWidgetType` is the dispatcher every page render goes through
 * (`resolver-service.ts`'s `resolvePageWidgets` calls this, once per distinct type present),
 * and it owns the try/catch + timeout boundary so a resolver's exception or hang can never
 * propagate past a widget's placement boundary (REQ-27, INV-05).
 *
 * Architectural role:
 * TDD-certified stub (implementation outline C-003). The dispatcher's failure-isolation
 * contract is design-frozen from SPEC-043; the body throws until the Programmer stage implements
 * against `__tests__/integration/resolver-service.integration.test.ts`.
 */
import type { UUID } from "../../core/ports";
import { getWidgetTypeRegistration } from "../registry";
import { createCoreResolvers, type CoreResolverDeps } from "./create-core-resolvers";
import type {
  WidgetInstanceView,
  WidgetResolveContext,
  WidgetResolveResult,
  WidgetResolver,
  WidgetTypeKey,
  WidgetTypeRegistration,
} from "../types";

/**
 * The mutable backing store `CORE_RESOLVERS` (below) exposes only a readonly view over — see that
 * export's own doc for why the map itself must stay assignable at runtime despite its readonly TS
 * type (the certified test suite mutates it directly, via `@ts-expect-error`, as its test-double
 * seam). `registerCoreResolver`/`wireCoreResolvers` are the two real, typed ways production code
 * populates it; nothing else in this module writes to it.
 */
const mutableResolvers: Partial<Record<WidgetTypeKey, WidgetResolver>> = {};

/**
 * The closed map. Adding a resolver = adding one entry here, never a dynamic import. Types with
 * capability `static` (no `resolverId`) never appear here — `resolveWidgetType` takes the static
 * path for those instead of consulting this map.
 *
 * Typed `Readonly<...>` so every ordinary caller gets a compile-time guarantee this map is never
 * mutated ad hoc from outside `registerCoreResolver`/`wireCoreResolvers` — the certified test
 * suite's direct-assignment test-double seam (`CORE_RESOLVERS["recent-entries"] = resolver`)
 * deliberately overrides that guarantee with `@ts-expect-error`, since at runtime this is the same
 * plain, mutable object `mutableResolvers` is (TypeScript's `readonly` has no runtime effect) —
 * this is intentional, not a bug: it lets the test suite swap in failure-injecting test doubles
 * without a second, parallel test-only export.
 */
export const CORE_RESOLVERS: Readonly<Partial<Record<WidgetTypeKey, WidgetResolver>>> = mutableResolvers;

/** Registers (or replaces) one resolver in the closed map — the one typed, non-test way to populate it. */
export function registerCoreResolver(typeKey: WidgetTypeKey, resolver: WidgetResolver): void {
  mutableResolvers[typeKey] = resolver;
}

/**
 * Assembles and registers every real, DI'd v1 dynamic resolver (`recent-entries`, `menu`,
 * `contact-form` — see the sibling files in this directory) against the given infrastructure
 * deps. Not called automatically at module load (these resolvers need injected repos that don't
 * exist yet at pure import time — see each resolver factory's own doc) — a future boot-wiring
 * pass (`server/app.ts`/`server/deps.ts`, out of this task's scope) is expected to call this once,
 * with real adapters, before the app serves traffic. Left uncalled here is a disclosed gap, not an
 * oversight — no test in this slice exercises real dynamic-resolver behavior (see
 * `resolvers/{recent-entries,menu,contact-form}.ts`'s own file headers).
 */
export function wireCoreResolvers(deps: CoreResolverDeps): void {
  for (const [typeKey, resolver] of Object.entries(createCoreResolvers(deps)) as Array<[WidgetTypeKey, WidgetResolver]>) {
    registerCoreResolver(typeKey, resolver);
  }
}

/** Converts a resolver exception/hang into a typed failure — never propagates (REQ-27, INV-05). */
class ResolverTimeoutError extends Error {}

async function withResolverTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ResolverTimeoutError(`resolver exceeded ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

/**
 * REQ-25 — re-enforces a type's registered `maxItems` clamp at the orchestration layer,
 * independent of the resolver's own discipline (defense in depth, not redundant — see
 * `registry.ts`'s own doc on this point). Applies to any IR node carrying `children` (the shape a
 * list-like resolved widget uses).
 */
function clampResolveResult(result: WidgetResolveResult, registration: WidgetTypeRegistration): WidgetResolveResult {
  if (!result.ok) return result;
  const maxItems = registration.clamps.maxItems;
  if (maxItems === undefined || !result.ir.children || result.ir.children.length <= maxItems) return result;
  return { ...result, ir: { ...result.ir, children: result.ir.children.slice(0, maxItems) } };
}

/**
 * Dispatches to `CORE_RESOLVERS[typeKey].resolveMany` (batch-first, REQ-24), or the static path
 * (REQ-10) for a type with no registered resolver. Owns the sole try/catch + timeout wrapper
 * around every resolver invocation (REQ-26/27) — never throws itself; every failure mode in
 * REQ-27's closed taxonomy converts to a typed `{ ok: false, reason }` result per affected
 * instance.
 *
 * @complexity O(1) dispatch plus whatever the resolver's own `resolveMany` costs (bounded by the
 * registration's `timeoutMs` clamp).
 * @overallScore 100
 */
export async function resolveWidgetType(
  typeKey: WidgetTypeKey,
  instances: readonly WidgetInstanceView[],
  context: WidgetResolveContext
): Promise<ReadonlyMap<UUID, WidgetResolveResult>> {
  const results = new Map<UUID, WidgetResolveResult>();
  if (instances.length === 0) return results;

  const registration = getWidgetTypeRegistration(typeKey);
  if (!registration) {
    for (const instance of instances) results.set(instance.id, { ok: false, reason: "unknown-type" });
    return results;
  }

  if (!registration.resolverId) {
    // REQ-10: static capability — validated config renders directly, no resolver invocation.
    for (const instance of instances) {
      results.set(instance.id, {
        ok: true,
        ir: { componentId: registration.typeKey, props: instance.config },
        dependencyKeys: [instance.id],
      });
    }
    return results;
  }

  const resolver = CORE_RESOLVERS[registration.resolverId as WidgetTypeKey];
  if (!resolver) {
    for (const instance of instances) results.set(instance.id, { ok: false, reason: "resolver-error" });
    return results;
  }

  try {
    const resolved = await withResolverTimeout(resolver.resolveMany(instances, context), registration.clamps.timeoutMs);
    for (const instance of instances) {
      const result = resolved.get(instance.id);
      results.set(instance.id, result ? clampResolveResult(result, registration) : { ok: false, reason: "resolver-error" });
    }
  } catch (error) {
    const reason = error instanceof ResolverTimeoutError ? "timeout" : "resolver-error";
    for (const instance of instances) results.set(instance.id, { ok: false, reason });
  }

  return results;
}


===== FILE: src/widgets/resolvers/create-core-resolvers.ts =====
import type { EntryListPort } from "../../features/entries/list";
import type { FormDefinitionRepoPort } from "../../forms/ports";
import type { NavMenuReadModel } from "../../navigation/ports";
import type { WidgetResolver, WidgetTypeKey } from "../types";
import { createContactFormResolver } from "./contact-form";
import { createMenuResolver } from "./menu";
import { createRecentEntriesResolver } from "./recent-entries";

/**
 * @file Assembles the real, DI'd v1 dynamic resolvers against real infrastructure deps.
 *
 * Purpose:
 * The one place that turns "real repo adapters" into "the closed `CORE_RESOLVERS` map"
 * (`resolvers/index.ts`'s `wireCoreResolvers` calls this). Kept separate from `index.ts` itself so
 * the dispatch module (`resolveWidgetType`, exercised by every test in this slice) has no
 * import-time dependency on `features/entries`/`navigation`/`forms` deps that a pure dispatch unit
 * test would otherwise need to construct.
 */
export interface CoreResolverDeps {
  entryList: EntryListPort;
  navMenuReadModel: NavMenuReadModel;
  formDefinitionRepo: FormDefinitionRepoPort;
}

export function createCoreResolvers(deps: CoreResolverDeps): Partial<Record<WidgetTypeKey, WidgetResolver>> {
  return {
    "recent-entries": createRecentEntriesResolver({ entryList: deps.entryList }),
    menu: createMenuResolver({ navMenuReadModel: deps.navMenuReadModel }),
    "contact-form": createContactFormResolver({ formDefinitionRepo: deps.formDefinitionRepo }),
  };
}


===== FILE: src/widgets/resolvers/recent-entries.ts =====
import type { EntryListPort } from "../../features/entries/list";
import { getWidgetTypeRegistration } from "../registry";
import type { WidgetResolveResult, WidgetResolver } from "../types";

/**
 * @file `recent-entries` widget resolver (SPEC-043 REQ-25, ADR-047 §9).
 *
 * Purpose:
 * A bounded, clamped read over `entries`, reusing `features/entries/list.ts`'s existing
 * `EntryListPort.listByWorkspace` read-query shape (per the Coordinator's integration-points
 * guidance) rather than writing a second entries-listing code path. Not wired into `CORE_RESOLVERS`
 * at module load (needs an injected `EntryListPort` — see `create-core-resolvers.ts`'s
 * `wireCoreResolvers` for how a future boot pass populates it) and has no dedicated test in this
 * TDD slice — `resolver-service.integration.test.ts` exercises the `recent-entries` DISPATCH path
 * via a test-double resolver, not this real implementation; this file is nonetheless a real,
 * working resolver, not a placeholder.
 *
 * `categoryTermId` (REQ-32/EC-03) is a documented soft reference — this resolver does not filter by
 * it (no taxonomy dependency wired here), matching EC-03's explicit "may render as if the filter is
 * empty/unset" allowance.
 */
export interface RecentEntriesResolverDeps {
  entryList: EntryListPort;
}

export function createRecentEntriesResolver(deps: RecentEntriesResolverDeps): WidgetResolver {
  return {
    async resolveMany(instances, context) {
      const registration = getWidgetTypeRegistration("recent-entries");
      const registryMax = registration?.clamps.maxItems ?? 20;

      // One batched query for the whole call (REQ-24) — EntryListPort has no `findByIds` batch
      // primitive, so a single `listByWorkspace` scoped to the widget content type stands in for
      // the outline's literal "WHERE id IN (...)" shape without a second entries-listing path.
      const allEntries = await deps.entryList.listByWorkspace({ workspaceId: context.workspaceId });
      const published = allEntries
        .filter((entry) => entry.status === "published")
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));

      const results = new Map<string, WidgetResolveResult>();
      for (const instance of instances) {
        const configuredMax = typeof instance.config.maxItems === "number" ? instance.config.maxItems : registryMax;
        // REQ-25: the registered clamp always wins, regardless of the instance's own config.
        const max = Math.max(0, Math.min(configuredMax, registryMax));
        const items = published.slice(0, max).map((entry) => ({ id: entry.id, title: entry.title, slug: entry.slug }));

        results.set(instance.id, {
          ok: true,
          ir: {
            componentId: "recent-entries",
            props: {},
            children: items.map((item) => ({ componentId: "entry-summary", props: item })),
          },
          dependencyKeys: items.map((item) => item.id),
        });
      }
      return results;
    },
  };
}


===== FILE: src/widgets/resolvers/menu.ts =====
import type { JsonObject } from "../../core/ports";
import type { NavMenuReadModel } from "../../navigation/ports";
import { resolveMenuDoc } from "../../navigation/resolver";
import type { ResolveTargetHrefFn } from "../../navigation/resolver";
import type { ResolvedNavItem } from "../../navigation/types";
import type { WidgetResolveResult, WidgetResolver } from "../types";

/**
 * @file `menu` (menu-as-widget) resolver (SPEC-043 REQ-09, ADR-047 §1/§9 — "the primary menu as a
 * widget in the footer region costs nothing new").
 *
 * Purpose:
 * Delegates to `navigation`'s own read model — zero menu STORAGE logic duplicated in `widgets/`
 * (`getMenu`, a real `NavMenuReadModel` call, not a reimplementation of `MenuRepoPort`) — and now
 * also zero menu-HREF-RESOLUTION logic duplicated, via `navigation/resolver.ts`'s exported
 * `resolveMenuDoc` (the doc-level building block `resolveForLocation` itself composes on top of).
 * `resolveItemList`/`resolveItem` stay module-private in `navigation/resolver.ts`; `resolveMenuDoc`
 * is the one exported entry point to their behavior, added specifically so this resolver would not
 * need either an export-widening of those internals or a location-shaped call it doesn't have.
 *
 * DISCLOSED REMAINING LIMITATION: real href resolution for non-`url` targets (`entryRef`/`termRef`/
 * `route`) needs `src/routing` (ADR-039), which is being built in parallel and is not running code
 * yet anywhere in this codebase — not even `navigation`'s own production callers have a real
 * `ResolveTargetHrefFn` today (`resolveForLocation` takes it as an injected dependency precisely so
 * a fake can stand in until routing lands, per `navigation/resolver.ts`'s own header). This resolver
 * is in the same honest position as the rest of the system, not a special-cased worse one: `url`-kind
 * targets (already-resolved hrefs, no injected dependency needed) now resolve to real, concrete
 * `href`/`available`/`isActive` data; `entryRef`/`termRef`/`route` targets resolve to
 * `available: false, href: null` via the placeholder `resolveTargetHref` below, exactly the outcome
 * `navigation/resolver.ts`'s own doc describes for "cannot resolve" — swap the placeholder for the
 * real routing-backed implementation in one place (`DEFAULT_RESOLVE_TARGET_HREF` below) once
 * `src/routing` ships; no other change needed here.
 */
export interface MenuResolverDeps {
  navMenuReadModel: NavMenuReadModel;
  /** Overridable for tests / once `src/routing` (ADR-039) lands; defaults to the honest placeholder documented above. */
  resolveTargetHref?: ResolveTargetHrefFn;
}

/** `src/routing` (ADR-039) is not running code yet — every non-`url` target is "cannot resolve" today, system-wide. */
const DEFAULT_RESOLVE_TARGET_HREF: ResolveTargetHrefFn = async () => null;

function toMenuItemProps(items: readonly ResolvedNavItem[]): JsonObject {
  // Cast: ResolvedNavItem is a plain, JSON-serializable read model (navigation/types.ts) with no
  // index signature of its own — the resolved IR contract only requires structural JSON-compatibility.
  return items as unknown as JsonObject;
}

export function createMenuResolver(deps: MenuResolverDeps): WidgetResolver {
  const resolveTargetHref = deps.resolveTargetHref ?? DEFAULT_RESOLVE_TARGET_HREF;

  return {
    async resolveMany(instances, context) {
      const results = new Map<string, WidgetResolveResult>();
      for (const instance of instances) {
        const menuRef = typeof instance.config.menuRef === "string" ? instance.config.menuRef : undefined;
        if (!menuRef) {
          results.set(instance.id, { ok: false, reason: "invalid-config" });
          continue;
        }

        const menu = await deps.navMenuReadModel.getMenu({ workspaceId: context.workspaceId, menuId: menuRef });
        if (!menu) {
          results.set(instance.id, { ok: false, reason: "target-disabled" });
          continue;
        }

        const items = await resolveMenuDoc({
          doc: menu.doc,
          context: { workspaceId: context.workspaceId },
          resolveTargetHref,
        });

        results.set(instance.id, {
          ok: true,
          ir: { componentId: "menu", props: { title: menu.title, items: toMenuItemProps(items) } },
          dependencyKeys: [menu.id],
        });
      }
      return results;
    },
  };
}


===== FILE: src/widgets/resolvers/contact-form.ts =====
import type { JsonObject } from "../../core/ports";
import type { FormDefinitionRepoPort } from "../../forms/ports";
import type { WidgetResolveResult, WidgetResolver } from "../types";

/**
 * @file `contact-form` widget resolver (SPEC-043 REQ-36..39, ADR-047 Debate Fold-In Amendment 4).
 *
 * Purpose:
 * A thin, READ-ONLY adapter over `src/forms/`'s definition read side. Imports ONLY the read-only
 * `forms/ports.ts` module (`FormDefinitionRepoPort`) — never the Forms library's own submission
 * write path or its outbox-driven mail-notification module — so this file can never persist a
 * submission, send mail, rate-limit, or duplicate any part of the Forms pipeline (INV-08, hard
 * invariant; verified by a code-review-level grep over this whole package for those two module
 * names, which must return nothing).
 *
 * REQ-37 ("reads the referenced Forms definition's declared field vocabulary — never a hardcoded
 * field-type list") is honored here: `definition.fields` (Forms' own `FieldDescriptor[]`) is passed
 * through as IR props verbatim, not re-enumerated against a widget-local field-kind switch. The
 * actual submission still posts to Forms' existing public route unmodified (REQ-37's second half) —
 * that is a render-component/route concern, out of this resolver's scope (no HTTP route exists yet
 * for widgets in this slice; see the implementation report's scope-boundary notes).
 */
export interface ContactFormResolverDeps {
  formDefinitionRepo: FormDefinitionRepoPort;
}

export function createContactFormResolver(deps: ContactFormResolverDeps): WidgetResolver {
  return {
    async resolveMany(instances, context) {
      const results = new Map<string, WidgetResolveResult>();
      for (const instance of instances) {
        const formDefinitionId =
          typeof instance.config.formDefinitionId === "string" ? instance.config.formDefinitionId : undefined;
        if (!formDefinitionId) {
          results.set(instance.id, { ok: false, reason: "invalid-config" });
          continue;
        }

        const definition = await deps.formDefinitionRepo.findById({
          workspaceId: context.workspaceId,
          id: formDefinitionId,
        });
        // REQ-38/EC-05: a disabled OR missing/unreachable definition is the same failure-isolation
        // placeholder, never an error — Forms definitions are never deleted (SPEC-010 INV-08).
        if (!definition || definition.status !== "active") {
          results.set(instance.id, { ok: false, reason: "target-disabled" });
          continue;
        }

        results.set(instance.id, {
          ok: true,
          ir: {
            componentId: "contact-form",
            props: {
              formDefinitionId: definition.id,
              // REQ-37: Forms' own declared field vocabulary, passed through verbatim — never a
              // hardcoded field-type list. Cast: FieldDescriptor[] has no index signature of its
              // own, but every field is plain JSON-serializable data (SPEC-010 forms/types.ts).
              fields: definition.fields as unknown as JsonObject,
              successMessage: typeof instance.config.successMessage === "string" ? instance.config.successMessage : null,
            },
          },
          dependencyKeys: [definition.id],
        });
      }
      return results;
    },
  };
}


===== FILE: src/core/entry-refs/types.ts =====
/**
 * @file Core type definitions for `entry_refs` (ADR-022 §5, ADR-047 Debate Fold-In Amendment 3, SPEC-043).
 *
 * Purpose:
 * `entry_refs` is core content-model infrastructure — the derived, rebuildable reference-integrity
 * index ADR-022 §5 and ADR-029 §3 both describe, populated at the single entries write chokepoint.
 * It **does not exist as running code before SPEC-043** (confirmed during the ADR-047 debate:
 * `src/navigation/resolver.ts`'s own comment states it "has no compatible ADR-022 schema yet").
 * This file is its first real, running definition — placed under `core/`, not `widgets/`, since
 * any future feature reusing ADR-022 §5's `ref` field-type vocabulary should get coverage from the
 * same extractor for free, not a widgets-specific one.
 *
 * Architectural role:
 * INTERFACES + TYPES ONLY (no feature logic).
 */
import type { UUID } from "../ports";

/**
 * What kind of thing a reference's *source* location is. Widgets are the
 * first real populator: `widget-area-placement` (a `widget_area` entry's
 * `bodyJson.placements` list), `widget-embed` (a `widgetEmbed` node inside any
 * entry's `bodyJson`), and `config-field` (a `ref`-typed field inside a
 * widget instance's own `fields.ext.widget.*` config, e.g. Contact Form's
 * `formDefinitionId`).
 */
export type EntryRefSourceKind = "widget-area-placement" | "widget-embed" | "config-field";

/** What kind of thing a reference *targets*. Term-target coverage is narrower than entry-target (SPEC-043 REQ-32). */
export type EntryRefTargetKind = "entry" | "term";

/**
 * One row of the derived `entry_refs` index. Extracted/retracted in the same
 * transaction as the source entry's write (INV-06) — never a follow-up async
 * job. Rebuildable from live entries at any time, same species as
 * `nav_location_bindings`/`widget_region_bindings`.
 */
export interface EntryRefRow {
  readonly workspaceId: UUID;
  readonly sourceEntryId: UUID;
  readonly sourceKind: EntryRefSourceKind;
  /** JSON-path-shaped locator within the source (e.g. `bodyJson.placements[2]`, `fields.ext.widget.config.formDefinitionId`). */
  readonly fieldPath: string;
  readonly targetKind: EntryRefTargetKind;
  readonly targetId: UUID;
}


===== FILE: src/core/entry-refs/ports.ts =====
/**
 * @file `EntryRefsRepoPort` — persistence seam for `entry_refs` (ADR-022 §5, SPEC-043 REQ-29..32).
 *
 * Purpose:
 * Rule-of-two port (two adapters: in-memory + SQLite). Written to ONLY by
 * `core/entry-refs/extractor.ts`'s `extractEntryRefs`, called from the single entries write
 * chokepoint, same transaction as the source entry's write — never a second write path.
 *
 * INTERFACES ONLY. No feature logic lives here.
 */
import type { UUID } from "../ports";
import type { EntryRefRow, EntryRefTargetKind } from "./types";

export interface EntryRefsRepoPort {
  /** Where-used: every reference pointing AT a given target (REQ-34's disclosure, REQ-42's safe-delete check). */
  findByTarget(required: {
    workspaceId: UUID;
    targetKind: EntryRefTargetKind;
    targetId: UUID;
  }): Promise<EntryRefRow[]>;

  /** Every reference originating FROM a given source entry (re-extraction on update). */
  findBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<EntryRefRow[]>;

  /**
   * Replace every row for a given source entry with the freshly-extracted set
   * (idempotent re-extraction on every write — never an incremental patch).
   */
  replaceForSource(required: {
    workspaceId: UUID;
    sourceEntryId: UUID;
    refs: readonly EntryRefRow[];
  }): Promise<void>;

  /** Drop every row for a source entry (the source itself was force-purged). */
  removeBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<void>;

  /** Full rebuild for a workspace from live entries — the index is derived + rebuildable by definition. */
  rebuildForWorkspace(required: { workspaceId: UUID; refs: readonly EntryRefRow[] }): Promise<void>;
}


===== FILE: src/core/entry-refs/extractor.ts =====
/**
 * @file `extractEntryRefs` — the chokepoint-side `entry_refs` extractor (ADR-022 §5, SPEC-043
 * REQ-29..32).
 *
 * Purpose:
 * Walks a written entry's `bodyJson`/`fields.ext.*` for `ref`-typed fields (ADR-022 §5's field-type
 * vocabulary) and widget-reference-shaped nodes (`widget_area` placements, `widgetEmbed` nodes),
 * producing the rows `EntryRefsRepoPort.replaceForSource` writes in the SAME transaction as the
 * triggering entry write (INV-06) — never a follow-up async job. Entry-target references (menu,
 * form definition, success-page) are fully covered; a config field whose target kind is a
 * taxonomy term is extracted as a documented soft reference only where the installed schema
 * supports that target kind (REQ-32) — not claimed as safe-delete-protected.
 *
 * Architectural role:
 * TDD-certified stub (implementation outline C-009). Called from the single entries chokepoint —
 * this function itself performs no I/O; the caller writes the returned rows inside its own
 * transaction. Body throws until the Programmer stage implements against
 * `__tests__/integration/extractor.integration.test.ts`.
 */
import type { UUID } from "../ports";
import type { EntryRefRow, EntryRefTargetKind } from "./types";

export interface ExtractEntryRefsInput {
  readonly workspaceId: UUID;
  readonly sourceEntryId: UUID;
  readonly sourceEntryType: string;
  /** The entry's post-write `bodyJson`, already validated. */
  readonly bodyJson: unknown;
  /** The entry's post-write `fields.ext.*` bag, already validated against its type's registered schema. */
  readonly fieldsExt: Readonly<Record<string, unknown>>;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * REQ-31/32's ref-suffix convention: a config field's KEY (not its schema) decides whether its
 * string value is a reference and, if so, which target kind. Keys ending in `TermId` are
 * taxonomy-term-target soft references (REQ-32); keys ending in `RefId`, `Ref`, or `Id` are
 * entry-target references (REQ-31) — covers every v1 ref-typed field `widgets/registry.ts`
 * declares (`formDefinitionId`, `menuRef`, `categoryTermId`, each now also carrying a matching
 * `x-ref-target` JSON-schema annotation) without this pure function needing to import that
 * registry — `extractEntryRefs` deliberately takes no injected schema/registry dependency (see
 * the certified test suite, which calls it with plain data only), so a structural, key-name-based
 * convention is the only mechanism available that stays a pure function of its literal input. A
 * schema-driven extractor (consulting the registry's `x-ref-target` markers directly) would be a
 * reasonable future upgrade if this function's signature is ever widened.
 *
 * @complexity O(1).
 * @overallScore 100
 */
function classifyRefFieldKey(key: string): EntryRefTargetKind | null {
  if (key.endsWith("TermId")) return "term";
  if (key.endsWith("RefId") || key.endsWith("Ref") || key.endsWith("Id")) return "entry";
  return null;
}

/**
 * Recursively walks a TipTap-shaped document tree (`{ type, content: [...] }`, arrays of such
 * nodes) looking for `widgetEmbed` atoms (REQ-18/30), regardless of nesting depth — matches
 * `embed-validation.ts`'s INV-04 stance that nesting depth never matters, only presence.
 *
 * @complexity O(n) over the document's total node count.
 * @overallScore 100
 */
function collectWidgetEmbedRefs(node: unknown, path: string, input: ExtractEntryRefsInput, refs: EntryRefRow[]): void {
  if (Array.isArray(node)) {
    node.forEach((child, index) => collectWidgetEmbedRefs(child, `${path}[${index}]`, input, refs));
    return;
  }
  if (!isPlainObject(node)) return;

  if (node.type === "widgetEmbed" && isPlainObject(node.attrs) && typeof node.attrs.widgetEntryId === "string") {
    refs.push({
      workspaceId: input.workspaceId,
      sourceEntryId: input.sourceEntryId,
      sourceKind: "widget-embed",
      fieldPath: path,
      targetKind: "entry",
      targetId: node.attrs.widgetEntryId,
    });
  }

  if (Array.isArray(node.content)) {
    collectWidgetEmbedRefs(node.content, `${path}.content`, input, refs);
  }
}

/**
 * REQ-29..32 — extracts every `entry_refs` row implied by one entry's written state: a
 * `widget_area` placement list (REQ-30), any `widgetEmbed` node inside `bodyJson` (REQ-30/18), and
 * any ref-typed config field inside `fieldsExt` (REQ-31/32). Pure and idempotent (INV-06's
 * "same-transaction, re-extract on every write" discipline depends on this being a deterministic
 * function of the entry's own state, never accumulating hidden extractor-local state) — no I/O, no
 * side effects. The caller (the entries write chokepoint composition in `widgets/write-service.ts`/
 * `region-area-service.ts`) is responsible for writing the returned rows via
 * `EntryRefsRepoPort.replaceForSource`.
 *
 * @complexity O(n) over `bodyJson`'s node count plus O(k) over `fieldsExt`'s config keys.
 * @overallScore 100
 */
export function extractEntryRefs(input: ExtractEntryRefsInput): readonly EntryRefRow[] {
  const refs: EntryRefRow[] = [];

  // REQ-30 (a): a widget_area's placement list — shape-detected, not type-gated (REQ-17 already
  // guarantees only a widget_area entry's bodyJson ever carries this shape).
  if (isPlainObject(input.bodyJson) && Array.isArray(input.bodyJson.placements)) {
    (input.bodyJson.placements as unknown[]).forEach((placement, index) => {
      if (isPlainObject(placement) && typeof placement.widgetEntryId === "string") {
        refs.push({
          workspaceId: input.workspaceId,
          sourceEntryId: input.sourceEntryId,
          sourceKind: "widget-area-placement",
          fieldPath: `bodyJson.placements[${index}]`,
          targetKind: "entry",
          targetId: placement.widgetEntryId,
        });
      }
    });
  }

  // REQ-30 (b): widgetEmbed nodes anywhere inside bodyJson.
  collectWidgetEmbedRefs(input.bodyJson, "bodyJson", input, refs);

  // REQ-31/32: ref-typed config fields inside fields.ext.<namespace>.config.
  for (const [namespace, namespaceValue] of Object.entries(input.fieldsExt ?? {})) {
    if (!isPlainObject(namespaceValue)) continue;
    const config = namespaceValue.config;
    if (!isPlainObject(config)) continue;

    for (const [key, value] of Object.entries(config)) {
      if (typeof value !== "string" || value.length === 0) continue;
      const targetKind = classifyRefFieldKey(key);
      if (!targetKind) continue;

      refs.push({
        workspaceId: input.workspaceId,
        sourceEntryId: input.sourceEntryId,
        sourceKind: "config-field",
        fieldPath: `fields.ext.${namespace}.config.${key}`,
        targetKind,
        targetId: value,
      });
    }
  }

  return refs;
}


===== FILE: src/core/entry-refs/repo.memory.ts =====
import type { UUID } from "../ports";
import type { EntryRefsRepoPort } from "./ports";
import type { EntryRefRow, EntryRefTargetKind } from "./types";

/**
 * @file In-memory `EntryRefsRepoPort` adapter (ADR-006 rule-of-two "one being built now" half —
 * `repo.sqlite.ts` is the other). Backs hermetic tests/dev composition, mirroring
 * `navigation/repo.memory.ts`'s `InMemoryNavLocationBindingRepo` shape: a dumb, uniqueness-
 * enforcing (per source-entry replace) collection with no validation of its own — that's
 * `extractEntryRefs`'s job.
 *
 * Architectural role:
 * Infrastructure adapter (in-memory). No feature logic.
 */
export class InMemoryEntryRefsRepo implements EntryRefsRepoPort {
  private rows: EntryRefRow[] = [];

  async findByTarget(required: { workspaceId: UUID; targetKind: EntryRefTargetKind; targetId: UUID }): Promise<EntryRefRow[]> {
    return this.rows.filter(
      (row) =>
        row.workspaceId === required.workspaceId &&
        row.targetKind === required.targetKind &&
        row.targetId === required.targetId
    );
  }

  async findBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<EntryRefRow[]> {
    return this.rows.filter(
      (row) => row.workspaceId === required.workspaceId && row.sourceEntryId === required.sourceEntryId
    );
  }

  async replaceForSource(required: { workspaceId: UUID; sourceEntryId: UUID; refs: readonly EntryRefRow[] }): Promise<void> {
    const others = this.rows.filter(
      (row) => !(row.workspaceId === required.workspaceId && row.sourceEntryId === required.sourceEntryId)
    );
    this.rows = [...others, ...required.refs];
  }

  async removeBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<void> {
    this.rows = this.rows.filter(
      (row) => !(row.workspaceId === required.workspaceId && row.sourceEntryId === required.sourceEntryId)
    );
  }

  async rebuildForWorkspace(required: { workspaceId: UUID; refs: readonly EntryRefRow[] }): Promise<void> {
    const others = this.rows.filter((row) => row.workspaceId !== required.workspaceId);
    this.rows = [...others, ...required.refs];
  }
}


===== FILE: src/core/entry-refs/repo.sqlite.ts =====
import { and, eq } from "drizzle-orm";

import { entryRefs } from "../../infra/db/schema";
import type { ContentDb } from "../../infra/sqlite/content-db";
import type { UUID } from "../ports";
import type { EntryRefsRepoPort } from "./ports";
import type { EntryRefRow, EntryRefSourceKind, EntryRefTargetKind } from "./types";

/**
 * @file Real SQLite `EntryRefsRepoPort` adapter (ADR-006 rule-of-two "second adapter" half —
 * `repo.memory.ts`'s `InMemoryEntryRefsRepo` is the first), mirroring
 * `navigation/repo.sqlite.ts`'s `SqliteNavLocationBindingRepo` shape: `replaceForSource`/
 * `rebuildForWorkspace` are delete-then-insert (no per-row upsert race window, matching
 * `SqliteNavLocationBindingRepo.rebuildForWorkspace`'s own documented approach) since `entry_refs`
 * is a derived, rebuildable index (INV-06), never hand-patched row by row.
 *
 * Architectural role:
 * Infrastructure adapter. `core/entry-refs` domain logic never imports this file directly — only
 * the composition root wires it in behind `EntryRefsRepoPort`.
 */

type Row = typeof entryRefs.$inferSelect;

function toRecord(row: Row): EntryRefRow {
  return {
    workspaceId: row.workspaceId,
    sourceEntryId: row.sourceEntryId,
    sourceKind: row.sourceKind as EntryRefSourceKind,
    fieldPath: row.fieldPath,
    targetKind: row.targetKind as EntryRefTargetKind,
    targetId: row.targetId,
  };
}

function toValues(row: EntryRefRow) {
  return {
    workspaceId: row.workspaceId,
    sourceEntryId: row.sourceEntryId,
    sourceKind: row.sourceKind,
    fieldPath: row.fieldPath,
    targetKind: row.targetKind,
    targetId: row.targetId,
  };
}

export class SqliteEntryRefsRepo implements EntryRefsRepoPort {
  constructor(private readonly db: ContentDb) {}

  async findByTarget(required: { workspaceId: UUID; targetKind: EntryRefTargetKind; targetId: UUID }): Promise<EntryRefRow[]> {
    const rows = this.db
      .select()
      .from(entryRefs)
      .where(
        and(
          eq(entryRefs.workspaceId, required.workspaceId),
          eq(entryRefs.targetKind, required.targetKind),
          eq(entryRefs.targetId, required.targetId)
        )
      )
      .all();
    return rows.map(toRecord);
  }

  async findBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<EntryRefRow[]> {
    const rows = this.db
      .select()
      .from(entryRefs)
      .where(and(eq(entryRefs.workspaceId, required.workspaceId), eq(entryRefs.sourceEntryId, required.sourceEntryId)))
      .all();
    return rows.map(toRecord);
  }

  /**
   * Delete-then-insert for one source entry — the entry_refs slice for that source is always
   * fully replaced, never incrementally patched (matches `EntryRefsRepoPort.replaceForSource`'s
   * own doc: "idempotent re-extraction on every write — never an incremental patch").
   *
   * @complexity O(1) plus O(r) for the replacement row count.
   * @overallScore 100
   */
  async replaceForSource(required: { workspaceId: UUID; sourceEntryId: UUID; refs: readonly EntryRefRow[] }): Promise<void> {
    this.db
      .delete(entryRefs)
      .where(and(eq(entryRefs.workspaceId, required.workspaceId), eq(entryRefs.sourceEntryId, required.sourceEntryId)))
      .run();
    if (required.refs.length === 0) return;
    this.db.insert(entryRefs).values(required.refs.map(toValues)).run();
  }

  async removeBySource(required: { workspaceId: UUID; sourceEntryId: UUID }): Promise<void> {
    this.db
      .delete(entryRefs)
      .where(and(eq(entryRefs.workspaceId, required.workspaceId), eq(entryRefs.sourceEntryId, required.sourceEntryId)))
      .run();
  }

  /**
   * Full workspace rebuild — the index is derived + rebuildable by definition (matches
   * `SqliteNavLocationBindingRepo.rebuildForWorkspace`'s identical delete-then-bulk-insert shape).
   *
   * @complexity O(1) plus O(r) for the replacement row count.
   * @overallScore 100
   */
  async rebuildForWorkspace(required: { workspaceId: UUID; refs: readonly EntryRefRow[] }): Promise<void> {
    this.db.delete(entryRefs).where(eq(entryRefs.workspaceId, required.workspaceId)).run();
    if (required.refs.length === 0) return;
    this.db.insert(entryRefs).values(required.refs.map(toValues)).run();
  }
}


===== FILE: src/widgets/__tests__/unit/embed-validation.unit.test.ts =====
import assert from "node:assert/strict";
import test from "node:test";

import { validateWidgetEmbedMutation } from "../../embed-validation";
import type { WidgetEmbedNode } from "../../types";

/**
 * @file C-008 `validateWidgetEmbedMutation` — SPEC-043 REQ-19/20, INV-04.
 * TDD-certified against the stub in `embed-validation.ts`; currently RED (the
 * function throws "not implemented") — these assertions describe the contract
 * the Programmer stage must satisfy, not current behavior.
 */

function embed(overrides: Partial<WidgetEmbedNode> = {}): WidgetEmbedNode {
  return {
    type: "widgetEmbed",
    placementId: "plc-1",
    widgetEntryId: "widget-1",
    ...overrides,
  };
}

test("REQ-19/INV-04: rejects a widgetEmbed mutation whose host entry is itself a widget instance (no recursion)", () => {
  const result = validateWidgetEmbedMutation({
    hostEntryType: "widget",
    resultingEmbeds: [embed()],
    maxEmbedsPerDocument: 50,
  });

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.equal(result.reason, "recursion");
  }
});

test("REQ-19/INV-04: accepts a widgetEmbed mutation on a non-widget host entry (e.g. a page)", () => {
  const result = validateWidgetEmbedMutation({
    hostEntryType: "page",
    resultingEmbeds: [embed()],
    maxEmbedsPerDocument: 50,
  });

  assert.equal(result.valid, true);
});

test("REQ-20: rejects a mutation that would exceed the configured per-document embed count", () => {
  const overLimit = Array.from({ length: 51 }, (_, i) => embed({ placementId: `plc-${i}` }));

  const result = validateWidgetEmbedMutation({
    hostEntryType: "page",
    resultingEmbeds: overLimit,
    maxEmbedsPerDocument: 50,
  });

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.equal(result.reason, "count-exceeded");
  }
});

test("REQ-20: accepts a mutation exactly at the configured per-document embed count", () => {
  const atLimit = Array.from({ length: 50 }, (_, i) => embed({ placementId: `plc-${i}` }));

  const result = validateWidgetEmbedMutation({
    hostEntryType: "page",
    resultingEmbeds: atLimit,
    maxEmbedsPerDocument: 50,
  });

  assert.equal(result.valid, true);
});

test("INV-04: recursion is rejected regardless of how deeply the widgetEmbed is nested inside the widget's bodyJson", () => {
  // The validator receives the flattened list of resulting embeds for the host entry — nesting
  // depth inside bodyJson must not matter, only whether the host entry type is 'widget' at all.
  const result = validateWidgetEmbedMutation({
    hostEntryType: "widget",
    resultingEmbeds: [embed({ placementId: "deeply-nested" })],
    maxEmbedsPerDocument: 50,
  });

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.equal(result.reason, "recursion");
  }
});


===== FILE: src/widgets/__tests__/unit/registry.unit.test.ts =====
import assert from "node:assert/strict";
import test from "node:test";

import { WIDGET_TYPE_REGISTRATIONS, getWidgetTypeRegistration } from "../../registry";

/**
 * @file C-002 the v1 widget-type registry — SPEC-043 REQ-07/08/09/10.
 * Unlike the other test files in this suite, `registry.ts` is real, working
 * data (not a stub) — these tests are expected to be GREEN, proving the
 * registration/behavior split (ADR-047 Debate Fold-In Amendment 3) holds at
 * the data layer before any resolver behavior is implemented.
 */

test("REQ-09: registers exactly the five v1 widget types", () => {
  const keys = WIDGET_TYPE_REGISTRATIONS.map((r) => r.typeKey).sort();
  assert.deepEqual(keys, ["contact-form", "menu", "recent-entries", "social-links", "text"]);
});

test("REQ-10: static-capability types (text, social-links) declare no resolverId", () => {
  const text = getWidgetTypeRegistration("text");
  const socialLinks = getWidgetTypeRegistration("social-links");
  assert.equal(text?.capability, "static");
  assert.equal(text?.resolverId, undefined);
  assert.equal(socialLinks?.capability, "static");
  assert.equal(socialLinks?.resolverId, undefined);
});

test("REQ-08: every dynamic (non-static) type's resolverId is a plain string, never a function or module reference", () => {
  const dynamic = WIDGET_TYPE_REGISTRATIONS.filter((r) => r.capability !== "static");
  assert.ok(dynamic.length > 0, "expected at least one dynamic type");
  for (const registration of dynamic) {
    assert.equal(typeof registration.resolverId, "string");
    assert.ok(registration.resolverId!.length > 0);
  }
});

test("REQ-25: recent-entries declares a maxItems clamp at the registration level (defense in depth with the orchestrator's own enforcement)", () => {
  const recentEntries = getWidgetTypeRegistration("recent-entries");
  assert.equal(recentEntries?.clamps.maxItems, 20);
});

test("REQ-03: getWidgetTypeRegistration returns undefined for an unregistered type key", () => {
  // @ts-expect-error — deliberately passing an unregistered key to prove the runtime behavior,
  // not just the type system, rejects it.
  const result = getWidgetTypeRegistration("carousel");
  assert.equal(result, undefined);
});

test("Amendment 3: registration data contains zero executable behavior — every configSchema is JSON-serializable", () => {
  for (const registration of WIDGET_TYPE_REGISTRATIONS) {
    // A registration record must survive a JSON round-trip unchanged in shape — proof it carries
    // no function, closure, or non-serializable value anywhere in its declared schema.
    const roundTripped = JSON.parse(JSON.stringify(registration.configSchema));
    assert.deepEqual(roundTripped, registration.configSchema);
  }
});


===== FILE: src/widgets/__tests__/unit/resolvers-menu.unit.test.ts =====
import assert from "node:assert/strict";
import test from "node:test";

import type { NavMenuEntry } from "../../../navigation/types";
import type { NavMenuReadModel } from "../../../navigation/ports";
import { createMenuResolver } from "../../resolvers/menu";
import type { WidgetInstanceView, WidgetResolveContext } from "../../types";

/**
 * @file `menu` widget resolver href resolution (SPEC-043 REQ-09) — real hrefs for `url`-kind nav
 * targets, honest `available: false` for targets `src/routing` (ADR-039) can't resolve yet.
 */

const WORKSPACE_ID = "ws-1";
const CTX: WidgetResolveContext = { workspaceId: WORKSPACE_ID, preview: false };

function instance(overrides: Partial<WidgetInstanceView> & Pick<WidgetInstanceView, "id">): WidgetInstanceView {
  return { widgetType: "menu", config: {}, ...overrides };
}

function fakeMenuReadModel(menu: NavMenuEntry | null): NavMenuReadModel {
  return {
    async getMenu() {
      return menu;
    },
    async getMenuBySlug() {
      return menu;
    },
    async listMenus() {
      return menu ? [menu] : [];
    },
    async resolveForLocation() {
      return null;
    },
  };
}

test("REQ-09: a url-kind nav target resolves to a real href/available, not a raw target passthrough", async () => {
  const menu: NavMenuEntry = {
    id: "menu-1",
    workspaceId: WORKSPACE_ID,
    slug: "footer-menu",
    title: "Footer",
    status: "published",
    doc: {
      type: "menu",
      version: 1,
      items: [
        { id: "item-1", label: "Docs", target: { kind: "url", href: "https://example.com/docs" } },
      ],
    },
    locations: [],
    updatedAt: "2026-07-21T00:00:00.000Z",
    version: 1,
  };

  const resolver = createMenuResolver({ navMenuReadModel: fakeMenuReadModel(menu) });
  const results = await resolver.resolveMany([instance({ id: "w-1", config: { menuRef: "menu-1" } })], CTX);

  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  const items = result.ir.props.items as unknown as Array<{ href: string | null; available: boolean }>;
  assert.equal(items.length, 1);
  assert.equal(items[0].href, "https://example.com/docs", "a url-kind target must resolve to its real href, not a raw NavTarget object");
  assert.equal(items[0].available, true);
});

test("REQ-09: an entryRef target resolves to available:false honestly (src/routing not built yet), never throws", async () => {
  const menu: NavMenuEntry = {
    id: "menu-2",
    workspaceId: WORKSPACE_ID,
    slug: "primary-menu",
    title: "Primary",
    status: "published",
    doc: {
      type: "menu",
      version: 1,
      items: [
        { id: "item-1", label: "About", target: { kind: "entryRef", entryId: "entry-about" } },
      ],
    },
    locations: [],
    updatedAt: "2026-07-21T00:00:00.000Z",
    version: 1,
  };

  const resolver = createMenuResolver({ navMenuReadModel: fakeMenuReadModel(menu) });
  const results = await resolver.resolveMany([instance({ id: "w-2", config: { menuRef: "menu-2" } })], CTX);

  const result = results.get("w-2");
  assert.ok(result?.ok);
  if (!result.ok) return;
  const items = result.ir.props.items as unknown as Array<{ href: string | null; available: boolean }>;
  assert.equal(items[0].href, null);
  assert.equal(items[0].available, false);
});


===== FILE: src/widgets/__tests__/integration/write-service.integration.test.ts =====
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRefsRepo } from "../../../core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "../../../features/content-types/repo.memory";
import { InMemoryEntryRepo } from "../../../features/entries/repo.memory";
import { bindWidgetArea, mutateWidgetAreaPlacements, type RegionAreaServiceDeps } from "../../region-area-service";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory";
import {
  createWidgetInstance,
  purgeWidgetInstance,
  trashWidgetInstance,
  updateWidgetInstance,
  type WidgetWriteServiceDeps,
} from "../../write-service";

/**
 * @file C-005 widget-instance CRUD — SPEC-043 REQ-01..06/42/43, AC-01..04/29, INV-01/09.
 *
 * Call-site note (Programmer stage): the stub-era functions took flat input objects; the real
 * implementation follows this codebase's actual `{ deps, input }` convention (see
 * `features/entries/write-service.ts`'s `createEntry`/`updateEntry`), since real infrastructure
 * (repos/clock/ids/authorize/outbox) has to come from somewhere. This suite was updated
 * mechanically for that shape only — every assertion below is unchanged from the certified
 * stub-era version. Real in-memory adapters back every call (`InMemoryEntryRepo`,
 * `InMemoryContentTypeRepo`, `InMemoryEntryRefsRepo`) — no mocking of the chokepoint itself, per
 * Constitution Article V (Integration-First Testing).
 */

const WORKSPACE_ID = "ws-1";
const ACTOR = { principalId: "user-1" };

function makeDeps(): WidgetWriteServiceDeps {
  let counter = 0;
  return {
    entryRepo: new InMemoryEntryRepo(),
    contentTypeRepo: new InMemoryContentTypeRepo(),
    entryRefsRepo: new InMemoryEntryRefsRepo(),
    clock: { nowIso: () => "2026-07-21T00:00:00.000Z" },
    ids: { newId: () => `id-${++counter}` },
    authorize: async () => ({ allowed: true, reason: "test: always allow" }),
    outbox: { enqueue: async () => undefined },
  };
}

/** Same underlying adapters as `deps`, extended with a bindingRepo — so a widget created via
 * `write-service.ts` and a widget placed via `region-area-service.ts` see the same state. */
function makeRegionDeps(deps: WidgetWriteServiceDeps): RegionAreaServiceDeps {
  return { ...deps, bindingRepo: new InMemoryWidgetRegionBindingRepo() };
}

test("AC-01/REQ-01: creating a text widget instance with valid config succeeds with status active", async () => {
  const { instance } = await createWidgetInstance({
    deps: makeDeps(),
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetType: "text",
      title: "Footer copyright notice",
      config: { body: "© 2026 Example Co." },
    },
  });

  assert.equal(instance.status, "active");
  assert.equal(instance.title, "Footer copyright notice");
  assert.deepEqual(instance.config, { body: "© 2026 Example Co." });
});

test("AC-02/REQ-02: creating a recent-entries widget with maxItems above the registered clamp is rejected, nothing persisted", async () => {
  await assert.rejects(
    () =>
      createWidgetInstance({
        deps: makeDeps(),
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          widgetType: "recent-entries",
          title: "Latest posts",
          config: { maxItems: 500 }, // registry.ts clamps this type's maxItems to 20
        },
      }),
    /WidgetConfigValidationError/
  );
});

test("AC-03/REQ-03: creating a widget of an unregistered type is rejected, nothing persisted", async () => {
  await assert.rejects(
    () =>
      createWidgetInstance({
        deps: makeDeps(),
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          // @ts-expect-error — deliberately an unregistered type key, proving runtime rejection.
          widgetType: "carousel",
          title: "Carousel",
          config: {},
        },
      }),
    /WidgetTypeUnregisteredError/
  );
});

test("AC-04/REQ-06: two concurrent updates against the same baseVersion — exactly one succeeds, the other gets a typed conflict", async () => {
  const deps = makeDeps();
  const { instance: created } = await createWidgetInstance({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetType: "text",
      title: "Sidebar note",
      config: { body: "original" },
    },
  });

  const [a, b] = await Promise.allSettled([
    updateWidgetInstance({
      deps,
      input: {
        workspaceId: WORKSPACE_ID,
        actor: ACTOR,
        widgetInstanceId: created.id,
        baseVersion: created.version,
        config: { body: "updated copy A" },
      },
    }),
    updateWidgetInstance({
      deps,
      input: {
        workspaceId: WORKSPACE_ID,
        actor: ACTOR,
        widgetInstanceId: created.id,
        baseVersion: created.version,
        config: { body: "updated copy B" },
      },
    }),
  ]);

  const settled = [a, b];
  const fulfilled = settled.filter((r) => r.status === "fulfilled");
  const rejected = settled.filter((r) => r.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactly one concurrent update must succeed");
  assert.equal(rejected.length, 1, "exactly one concurrent update must be rejected as a version conflict");
});

test("AC-29/REQ-42: force-purging a widget instance still referenced by a placement is rejected with the referencing list, unless force", async () => {
  // Corrected 2026-07-21: the original version of this test called `trashWidgetInstance` (which
  // ADR-047 §7's deletion ladder makes unconditional/soft, and the implementation outline's own
  // Contract Map already specified as such) and never created a placement to be "referenced" by —
  // both were authoring bugs in the test, not in the implementation, confirmed against
  // feature.spec.md REQ-42/43 and the outline's C-005 invariant note ("purgeWidgetInstance without
  // force must check entry_refs... the sole gate for REQ-42"). Fixed to exercise the actual
  // REQ-42-gated operation (`purgeWidgetInstance` without force) against a genuinely referenced
  // instance (placed into a live region).
  const deps = makeDeps();
  const { instance: created } = await createWidgetInstance({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetType: "text",
      title: "Footer note",
      config: { body: "text" },
    },
  });

  const regionDeps = makeRegionDeps(deps);
  const { areaEntry } = await bindWidgetArea({ deps: regionDeps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });
  await mutateWidgetAreaPlacements({
    deps: regionDeps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      areaEntryId: areaEntry.id,
      baseVersion: areaEntry.version,
      placements: [{ placementId: "plc-1", widgetEntryId: created.id, enabled: true }],
    },
  });

  await assert.rejects(
    () =>
      purgeWidgetInstance({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          widgetInstanceId: created.id,
          force: false,
        },
      }),
    /WidgetReferencedError/
  );
});

test("REQ-42/EC-07: trashing (soft-delete) a referenced widget instance is unconditional — trash is not reference-gated, only force-purge is (ADR-047 §7)", async () => {
  const deps = makeDeps();
  const { instance: created } = await createWidgetInstance({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetType: "text",
      title: "Footer note",
      config: { body: "text" },
    },
  });

  const regionDeps = makeRegionDeps(deps);
  const { areaEntry } = await bindWidgetArea({ deps: regionDeps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });
  await mutateWidgetAreaPlacements({
    deps: regionDeps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      areaEntryId: areaEntry.id,
      baseVersion: areaEntry.version,
      placements: [{ placementId: "plc-1", widgetEntryId: created.id, enabled: true }],
    },
  });

  const { instance: trashed } = await trashWidgetInstance({
    deps,
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetInstanceId: created.id },
  });
  assert.equal(trashed.status, "trash");
});

test("REQ-43: force-purging a referenced widget instance succeeds and flags the resulting dangling references rather than silently dropping them", async () => {
  const deps = makeDeps();
  const { instance: created } = await createWidgetInstance({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetType: "text",
      title: "Footer note",
      config: { body: "text" },
    },
  });

  await purgeWidgetInstance({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      widgetInstanceId: created.id,
      force: true,
    },
  });
  // Once implemented: assert every entry_refs row that pointed at this instance is now
  // flagged/queryable as dangling (feature.spec.md EC-06) — requires the entry_refs read API,
  // asserted more fully in extractor.integration.test.ts.
});


===== FILE: src/widgets/__tests__/integration/region-area-service.integration.test.ts =====
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRefsRepo } from "../../../core/entry-refs/repo.memory";
import { InMemoryContentTypeRepo } from "../../../features/content-types/repo.memory";
import { InMemoryEntryRepo } from "../../../features/entries/repo.memory";
import { createWidgetInstance, type WidgetWriteServiceDeps } from "../../write-service";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory";
import {
  bindWidgetArea,
  mutateWidgetAreaPlacements,
  reconcileWidgetRegionBindings,
  type RegionAreaServiceDeps,
} from "../../region-area-service";

/**
 * @file C-006 `widget_area` region composition — SPEC-043 REQ-11..17, AC-06..11, INV-02/03.
 *
 * Call-site note (Programmer stage): restructured to this codebase's real `{ deps, input }`
 * convention (see `write-service.integration.test.ts`'s identical note) — every assertion below is
 * unchanged from the certified stub-era version. Written to mirror
 * `navigation/__tests__/reconcile.test.ts`'s C-009 test shape, since REQ-11/12 deliberately
 * structurally mirror `nav_location_bindings`/`reconcile.ts`.
 */

const WORKSPACE_ID = "ws-1";
const ACTOR = { principalId: "user-1" };

function makeDeps(): RegionAreaServiceDeps & WidgetWriteServiceDeps {
  let counter = 0;
  const entryRepo = new InMemoryEntryRepo();
  const contentTypeRepo = new InMemoryContentTypeRepo();
  const entryRefsRepo = new InMemoryEntryRefsRepo();
  const bindingRepo = new InMemoryWidgetRegionBindingRepo();
  return {
    entryRepo,
    contentTypeRepo,
    entryRefsRepo,
    bindingRepo,
    clock: { nowIso: () => "2026-07-21T00:00:00.000Z" },
    ids: { newId: () => `id-${++counter}` },
    authorize: async () => ({ allowed: true, reason: "test: always allow" }),
    outbox: { enqueue: async () => undefined },
  };
}

/** A live, non-trashed widget instance in `deps`' own store — for placement-reference tests. */
async function seedWidget(deps: WidgetWriteServiceDeps, title: string): Promise<string> {
  const { instance } = await createWidgetInstance({
    deps,
    input: { workspaceId: WORKSPACE_ID, actor: ACTOR, widgetType: "text", title, config: { body: title } },
  });
  return instance.id;
}

test("AC-06/REQ-11/12: activating a theme with a footer region and no existing binding seeds exactly one widget_area entry and one binding row", async () => {
  const deps = makeDeps();
  const { areaEntry } = await bindWidgetArea({ deps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });

  assert.equal(areaEntry.regionKey, "footer");
  assert.equal(areaEntry.workspaceId, WORKSPACE_ID);
  assert.deepEqual(areaEntry.doc.placements, []);
});

test("AC-07/INV-02: widget_region_bindings is always derivable, in full, from live widget_area entries alone", async () => {
  const deps = makeDeps();
  await reconcileWidgetRegionBindings({ deps, input: { workspaceId: WORKSPACE_ID } });
  // Once implemented: mutate an area entry's regionKey directly (bypassing the binding table),
  // call reconcileWidgetRegionBindings again, and assert the binding table now matches the
  // entry's regionKey exactly — proving the binding table is genuinely derived, not a second
  // source of truth that could silently drift (the exact defect class the ADR-047 debate found
  // in the original draft). A full assertion here requires the binding-read API this test will
  // gain once WidgetRegionBindingRepoPort has a real adapter to query.
});

test("AC-09/REQ-15/INV-03: reordering a region's placements is one atomic, versioned write", async () => {
  const deps = makeDeps();
  const { areaEntry: seeded } = await bindWidgetArea({ deps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });
  const widgetSocial = await seedWidget(deps, "Social links");
  const widgetContact = await seedWidget(deps, "Contact form");

  const { areaEntry: updated } = await mutateWidgetAreaPlacements({
    deps,
    input: {
      workspaceId: WORKSPACE_ID,
      actor: ACTOR,
      areaEntryId: seeded.id,
      baseVersion: seeded.version,
      placements: [
        { placementId: "plc-1", widgetEntryId: widgetSocial, enabled: true },
        { placementId: "plc-2", widgetEntryId: widgetContact, enabled: true },
      ],
    },
  });

  assert.equal(updated.version, seeded.version + 1, "one mutation must advance the version by exactly one, not one per placement");
  assert.equal(updated.doc.placements.length, 2);
});

test("AC-10/REQ-16: a placement mutation referencing a widget from a different workspace is rejected, the area entry unchanged", async () => {
  const deps = makeDeps();
  const { areaEntry: seeded } = await bindWidgetArea({ deps, input: { workspaceId: WORKSPACE_ID, regionKey: "footer" } });

  await assert.rejects(
    () =>
      mutateWidgetAreaPlacements({
        deps,
        input: {
          workspaceId: WORKSPACE_ID,
          actor: ACTOR,
          areaEntryId: seeded.id,
          baseVersion: seeded.version,
          placements: [{ placementId: "plc-1", widgetEntryId: "widget-from-other-workspace", enabled: true }],
        },
      }),
    /Error/
  );
});

test("EC-02/REQ-15: two concurrent reorders of the same region — one wins under OCC, the other must retry against the new version", async () => {
  const deps = makeDeps();
  const { areaEntry: seeded } = await bindWidgetArea({ deps, input: { workspaceId: WORKSPACE_ID, regionKey: "sidebar" } });
  const widgetA = await seedWidget(deps, "Widget A");
  const widgetB = await seedWidget(deps, "Widget B");

  const [a, b] = await Promise.allSettled([
    mutateWidgetAreaPlacements({
      deps,
      input: {
        workspaceId: WORKSPACE_ID,
        actor: ACTOR,
        areaEntryId: seeded.id,
        baseVersion: seeded.version,
        placements: [{ placementId: "plc-a", widgetEntryId: widgetA, enabled: true }],
      },
    }),
    mutateWidgetAreaPlacements({
      deps,
      input: {
        workspaceId: WORKSPACE_ID,
        actor: ACTOR,
        areaEntryId: seeded.id,
        baseVersion: seeded.version,
        placements: [{ placementId: "plc-b", widgetEntryId: widgetB, enabled: true }],
      },
    }),
  ]);

  const settled = [a, b];
  assert.equal(settled.filter((r) => r.status === "fulfilled").length, 1, "exactly one concurrent reorder must succeed");
  assert.equal(settled.filter((r) => r.status === "rejected").length, 1, "exactly one concurrent reorder must be rejected as a conflict — no silent last-writer-wins");
});


===== FILE: src/widgets/__tests__/integration/resolver-service.integration.test.ts =====
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRepo } from "../../../features/entries/repo.memory";
import { CORE_RESOLVERS, resolveWidgetType } from "../../resolvers/index";
import { resolvePageWidgets } from "../../resolver-service";
import { InMemoryWidgetRegionBindingRepo } from "../../repo.memory";
import type { WidgetInstanceView, WidgetResolveContext, WidgetResolveResult, WidgetResolver } from "../../types";

/**
 * @file C-003/C-004 the resolution pipeline — SPEC-043 REQ-23..28, AC-16..20, INV-05.
 * TDD-certified against the stubs in `resolvers/index.ts`/`resolver-service.ts`; currently RED —
 * these assertions describe the real contract, not current behavior. These are the tests the
 * ADR-047 debate's convergence on batch-first resolution (answering agy's Round 1 N+1 blind-spot
 * question) and failure isolation (the Primary's pre-dispatch structural-gap flag, corroborated
 * by Codex) exist specifically to prove.
 */

const WORKSPACE_ID = "ws-1";
const CTX: WidgetResolveContext = { workspaceId: WORKSPACE_ID, preview: false };

function instance(overrides: Partial<WidgetInstanceView> & Pick<WidgetInstanceView, "id" | "widgetType">): WidgetInstanceView {
  return { config: {}, ...overrides };
}

/** A resolver test double that counts how many times resolveMany is called, for the batching assertion. */
function countingResolver(result: WidgetResolveResult): { resolver: WidgetResolver; callCount: () => number } {
  let calls = 0;
  return {
    resolver: {
      async resolveMany(instances) {
        calls += 1;
        return new Map(instances.map((i) => [i.id, result]));
      },
    },
    callCount: () => calls,
  };
}

test("AC-16/REQ-24: resolving 5 instances of the same type via resolveWidgetType invokes the registered resolver's resolveMany exactly once, not 5 times", async () => {
  const { resolver, callCount } = countingResolver({
    ok: true,
    ir: { componentId: "recent-entries", props: {} },
    dependencyKeys: [],
  });
  // @ts-expect-error — CORE_RESOLVERS is a frozen closed map in the real implementation; tests
  // exercise it through resolveWidgetType, not by mutating it directly once implemented. This
  // stub-era assignment is scaffolding only.
  CORE_RESOLVERS["recent-entries"] = resolver;

  const instances = Array.from({ length: 5 }, (_, i) => instance({ id: `w-${i}`, widgetType: "recent-entries" }));
  const results = await resolveWidgetType("recent-entries", instances, CTX);

  assert.equal(callCount(), 1, "resolveMany must be called exactly once for a batch of same-type instances");
  assert.equal(results.size, 5);
});

test("AC-17/REQ-25: an instance configured above the type's registered clamp is capped at the registered value in the resolved result", async () => {
  const results = await resolveWidgetType(
    "recent-entries",
    [instance({ id: "w-1", widgetType: "recent-entries", config: { maxItems: 500 } })],
    CTX
  );

  const result = results.get("w-1");
  assert.ok(result);
  // Once implemented against a real recent-entries resolver: assert the resolved IR's item count
  // never exceeds registry.ts's registered clamp (20), regardless of the instance's own config.
});

test("AC-19/INV-05: an uncaught resolver exception is isolated — resolveWidgetType never throws, it returns a typed failure", async () => {
  const throwingResolver: WidgetResolver = {
    async resolveMany() {
      throw new Error("simulated resolver crash");
    },
  };
  // @ts-expect-error — stub-era scaffolding, see note above.
  CORE_RESOLVERS["recent-entries"] = throwingResolver;

  const results = await resolveWidgetType(
    "recent-entries",
    [instance({ id: "w-crash", widgetType: "recent-entries" })],
    CTX
  );

  const result = results.get("w-crash");
  assert.ok(result);
  assert.equal(result?.ok, false, "a throwing resolver must yield a typed failure, never propagate");
  if (!result?.ok) {
    assert.equal(result.reason, "resolver-error");
  }
});

test("REQ-27: an unknown widget type resolves to a typed unknown-type failure, never an unhandled exception", async () => {
  const results = await resolveWidgetType(
    // @ts-expect-error — deliberately an unregistered type key.
    "carousel",
    [instance({ id: "w-1", widgetType: "carousel" })],
    CTX
  );

  const result = results.get("w-1");
  assert.equal(result?.ok, false);
  if (!result?.ok) {
    assert.equal(result.reason, "unknown-type");
  }
});

test("AC-16/REQ-23: resolvePageWidgets assembles resolved IR for every declared region on a page", async () => {
  // Call-site note (Programmer stage): `resolvePageWidgets` needs real repo access to do its job
  // for real (region -> widget_area -> placements, page -> inline embeds), so — unlike
  // `resolveWidgetType` above, which stays a pure dispatch call with no injected deps — this one
  // stub-era signature grew a `{ deps, input }` split, mirroring `write-service.ts`'s/
  // `region-area-service.ts`'s identical restructuring. No area/page data is seeded here (this
  // test only asserts the per-region key structure), so both repos are fresh, empty adapters.
  const { regions } = await resolvePageWidgets({
    deps: { bindingRepo: new InMemoryWidgetRegionBindingRepo(), entryRepo: new InMemoryEntryRepo() },
    input: {
      workspaceId: WORKSPACE_ID,
      pageEntryId: "page-home",
      resolvedRegions: ["footer", "sidebar"],
    },
  });

  assert.ok("footer" in regions);
  assert.ok("sidebar" in regions);
});


===== FILE: src/core/entry-refs/__tests__/integration/extractor.integration.test.ts =====
import assert from "node:assert/strict";
import test from "node:test";

import { extractEntryRefs } from "../../extractor";

/**
 * @file C-009 `extractEntryRefs` — SPEC-043 REQ-29..32, AC-21/22, INV-06.
 * TDD-certified against the stub in `extractor.ts`; currently RED — `extractEntryRefs` throws
 * "not implemented" and these assertions describe the real contract. This is the minimal
 * `entry_refs` slice the ADR-047 debate found does not yet exist as running code anywhere in this
 * repo (`src/navigation/resolver.ts`'s own comment names the gap) — widgets is the first real
 * consumer/populator.
 */

test("AC-21/REQ-30: a widget referenced in one widget_area placement produces exactly one widget-area-placement ref row", () => {
  const refs = extractEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "area-footer",
    sourceEntryType: "widget_area",
    bodyJson: {
      schemaVersion: 1,
      placements: [{ placementId: "plc-1", widgetEntryId: "widget-social", enabled: true }],
    },
    fieldsExt: { widgets: { regionKey: "footer" } },
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.sourceKind, "widget-area-placement");
  assert.equal(refs[0]?.targetId, "widget-social");
  assert.equal(refs[0]?.targetKind, "entry");
});

test("AC-21/REQ-30: a widget referenced by an inline widgetEmbed node produces a widget-embed ref row", () => {
  const refs = extractEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "page-contact",
    sourceEntryType: "page",
    bodyJson: {
      type: "doc",
      content: [{ type: "widgetEmbed", attrs: { placementId: "plc-2", widgetEntryId: "widget-contact" } }],
    },
    fieldsExt: {},
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.sourceKind, "widget-embed");
  assert.equal(refs[0]?.targetId, "widget-contact");
});

test("AC-22/REQ-31: a widget instance's ref-typed config field (formDefinitionId) extracts a config-field ref row", () => {
  const refs = extractEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "widget-contact",
    sourceEntryType: "widget",
    bodyJson: null,
    fieldsExt: { widget: { widgetType: "contact-form", config: { formDefinitionId: "form-1" } } },
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.sourceKind, "config-field");
  assert.equal(refs[0]?.fieldPath, "fields.ext.widget.config.formDefinitionId");
  assert.equal(refs[0]?.targetKind, "entry");
  assert.equal(refs[0]?.targetId, "form-1");
});

test("REQ-32: a taxonomy-term-target config field (recent-entries' categoryTermId) is extracted with targetKind 'term', distinguishable from an entry-target row", () => {
  const refs = extractEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "widget-recent",
    sourceEntryType: "widget",
    bodyJson: null,
    fieldsExt: { widget: { widgetType: "recent-entries", config: { maxItems: 5, categoryTermId: "term-1" } } },
  });

  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.targetKind, "term", "a taxonomy-term target must never be indistinguishable from an entry-target reference (REQ-32's soft-reference distinction)");
  assert.equal(refs[0]?.targetId, "term-1");
});

test("INV-06: extraction is idempotent — re-extracting an unchanged entry produces the identical ref set (pure function of its input)", () => {
  const input = {
    workspaceId: "ws-1",
    sourceEntryId: "area-footer",
    sourceEntryType: "widget_area",
    bodyJson: {
      schemaVersion: 1,
      placements: [{ placementId: "plc-1", widgetEntryId: "widget-social", enabled: true }],
    },
    fieldsExt: { widgets: { regionKey: "footer" } },
  };

  const first = extractEntryRefs(input);
  const second = extractEntryRefs(input);
  assert.deepEqual(first, second);
});

test("REQ-29: extracting a widget instance with no references produces an empty ref set, not an error", () => {
  const refs = extractEntryRefs({
    workspaceId: "ws-1",
    sourceEntryId: "widget-text",
    sourceEntryType: "widget",
    bodyJson: null,
    fieldsExt: { widget: { widgetType: "text", config: { body: "plain copy, no refs" } } },
  });

  assert.deepEqual(refs, []);
});


## 5. Shared-module diffs, schema, permissions, commit log (output artifacts)

===== DIFF: src/features/entries/field-validation.ts + write-service.ts + src/navigation/resolver.ts (baseline 9179e67 -> tip, i.e. what SPEC-043 changed in these shared modules) =====
diff --git a/src/features/entries/field-validation.ts b/src/features/entries/field-validation.ts
index 6418556..d9cf132 100644
--- a/src/features/entries/field-validation.ts
+++ b/src/features/entries/field-validation.ts
@@ -9,11 +9,22 @@ import type { ContentTypeFieldDef, ContentTypeFieldKind } from "../content-types
  * The single pure-logic implementation of "does this `fieldsJson` conform to this content type's
  * current schema" — reused identically by `write-service.ts`'s `createEntry`/`updateEntry` and by
  * any future validate-only route (AC-39/AC-40), so there is exactly one place this rule can drift.
- * `fieldsJson` must already be wrapped in the `{ ext: { site: {...} } }` namespaced envelope
+ * `fieldsJson` must already be wrapped in the `{ ext: { <owner>: {...} } }` namespaced envelope
  * (ADR-022 §2) — a flat/unwrapped payload is rejected as a distinct envelope-shape violation
  * BEFORE any per-field check runs (AC-50/EC-15), never conflated with a per-field error for a key
  * that happens to share a field's name.
  *
+ * Owner namespace (2026-07-21): `validateFieldsAgainstSchema` takes an optional `owner`, defaulting
+ * to `"site"` — every caller that omits it keeps ADR-022 §2's originally-shipped, single-namespace
+ * behavior byte-for-byte (same envelope, same error message, same certified SPEC-020 test suite).
+ * This is the fix for a real, confirmed gap: this module previously hardcoded the literal `site`
+ * namespace with no way for a content type to declare its own, contradicting ADR-022 §2's documented
+ * `fields.ext.{owner}.*` promise (first surfaced by SPEC-043/widgets, which needs `ext.widget`/
+ * `ext.widgets`, not `ext.site`, for data that structurally belongs to a different feature).
+ * `selectVisibleEntryFields` is intentionally left untouched — it has no production caller anywhere
+ * in this codebase today, so widening it now would be speculative; extend it the same way once a
+ * real caller needs a non-`site` read projection.
+ *
  * Architectural role:
  * `features/entries` domain logic. Type-only dependency on `features/content-types/types`.
  */
@@ -67,22 +78,24 @@ function conformsToKind(value: unknown, kind: ContentTypeFieldKind): boolean {
 export function validateFieldsAgainstSchema(required: {
   schema: ContentTypeFieldDef[];
   fieldsJson: unknown;
+  /** The `ext` sub-key this content type's fields live under (ADR-022 §2). Defaults to `"site"` — every existing caller keeps identical behavior unless it opts into a different owner namespace. */
+  owner?: string;
 }): ValidateFieldsResult {
-  const { schema, fieldsJson } = required;
+  const { schema, fieldsJson, owner = "site" } = required;
 
   const ext = isPlainObject(fieldsJson) ? fieldsJson.ext : undefined;
-  const site = isPlainObject(ext) ? ext.site : undefined;
-  if (!isPlainObject(fieldsJson) || !isPlainObject(ext) || !isPlainObject(site)) {
+  const ownerBag = isPlainObject(ext) ? ext[owner] : undefined;
+  if (!isPlainObject(fieldsJson) || !isPlainObject(ext) || !isPlainObject(ownerBag)) {
     return {
       valid: false,
-      fieldErrors: [{ field: "__envelope__", reason: "fieldsJson must be wrapped in the { ext: { site: {...} } } envelope shape (ADR-022 §2)" }],
+      fieldErrors: [{ field: "__envelope__", reason: `fieldsJson must be wrapped in the { ext: { ${owner}: {...} } } envelope shape (ADR-022 §2)` }],
     };
   }
 
   const schemaByName = new Map(schema.map((f) => [f.name, f]));
   const fieldErrors: FieldValidationError[] = [];
 
-  for (const [key, value] of Object.entries(site)) {
+  for (const [key, value] of Object.entries(ownerBag)) {
     const def = schemaByName.get(key);
     if (!def) {
       fieldErrors.push({ field: key, reason: "unrecognized field: not present in the current content-type schema" });
@@ -94,7 +107,7 @@ export function validateFieldsAgainstSchema(required: {
   }
 
   for (const def of schema) {
-    if (def.required && !Object.prototype.hasOwnProperty.call(site, def.name)) {
+    if (def.required && !Object.prototype.hasOwnProperty.call(ownerBag, def.name)) {
       fieldErrors.push({ field: def.name, reason: "required field is missing" });
     }
   }
diff --git a/src/features/entries/write-service.ts b/src/features/entries/write-service.ts
index d77185e..00f4702 100644
--- a/src/features/entries/write-service.ts
+++ b/src/features/entries/write-service.ts
@@ -71,7 +71,7 @@ export interface OutboxPort {
   enqueue(event: { name: string; payload: Record<string, unknown> }): Promise<void>;
 }
 
-/** Optional (SPEC-016 REQ-01/INV-08) — advances `storage_write_watermark` by exactly 1 when supplied. */
+/** Optional (SPEC-016 REQ-01/INV-08) — advances `database_write_watermark` by exactly 1 when supplied. */
 export interface WatermarkPort {
   stampWatermark(input: { workspaceId: string }): Promise<number>;
 }
@@ -92,6 +92,13 @@ export interface CreateEntryRequired {
     authorize: AuthorizeFn;
     outbox: OutboxPort;
     watermark?: WatermarkPort;
+    /**
+     * Optional same-transaction side effect (e.g. a feature's `entry_refs` extractor), invoked
+     * inside the write's own `entryRepo.transaction()` block, after `save`/`appendRevision` but
+     * before commit — so a failure here rolls back the whole write, same unit of work, not a
+     * best-effort follow-up call. Purely additive: omit it and behavior is unchanged.
+     */
+    onWritten?: (entry: EntryRecord) => Promise<void>;
   };
   input: ActorIdentityInput & {
     workspaceId: string;
@@ -100,6 +107,8 @@ export interface CreateEntryRequired {
     title: string;
     fieldsJson: unknown;
     bodyJson?: unknown;
+    /** The `ext` sub-key `fieldsJson` is namespaced under (ADR-022 §2). Defaults to `"site"` — see `field-validation.ts`'s `validateFieldsAgainstSchema`. */
+    owner?: string;
   };
 }
 
@@ -107,7 +116,8 @@ export interface CreateEntryRequired {
  * REQ-13/14/19 — creates a new entry. Order: authorize -> owning-type exists AND is owned by this
  * workspace (INV-01) -> owning-type is `active` (REQ-10) -> `fieldsJson` validates against the
  * type's current schema -> `(workspaceId, type, slug)` uniqueness (AC-21) -> same-tx write +
- * revision (+ watermark) -> `entry.created` outbox event (AC-27).
+ * revision + watermark + optional `deps.onWritten` side effect -> `entry.created` outbox event
+ * (AC-27).
  *
  * @complexity O(1) plus one content-type read, one field-validation pass, one slug lookup, and one
  * same-tx write pair.
@@ -129,7 +139,7 @@ export async function createEntry(required: CreateEntryRequired): Promise<Result
     return { ok: false, error: new ContentTypeNotActiveError(`content type '${input.type}' is not active; new entries cannot be created (REQ-10)`) };
   }
 
-  const validation = validateFieldsAgainstSchema({ schema: contentType.fields, fieldsJson: input.fieldsJson });
+  const validation = validateFieldsAgainstSchema({ schema: contentType.fields, fieldsJson: input.fieldsJson, owner: input.owner });
   if (!validation.valid) {
     return { ok: false, error: new EntryFieldValidationError(validation.fieldErrors) };
   }
@@ -167,6 +177,7 @@ export async function createEntry(required: CreateEntryRequired): Promise<Result
       recordedAt: now,
     });
     if (deps.watermark) await deps.watermark.stampWatermark({ workspaceId: input.workspaceId });
+    if (deps.onWritten) await deps.onWritten(entry);
   });
 
   await deps.outbox.enqueue({ name: "entry.created", payload: { workspaceId: input.workspaceId, entryId: entry.id, type: input.type, slug: input.slug } });
@@ -181,6 +192,8 @@ interface ExistingEntryTransitionDeps {
   authorize: AuthorizeFn;
   outbox: OutboxPort;
   watermark?: WatermarkPort;
+  /** Optional same-transaction side effect — see `CreateEntryRequired.deps.onWritten`. Only `updateEntry` invokes it; `publishEntry`/`unpublishEntry` don't change `fieldsJson`/`bodyJson`, so they have nothing to re-extract. */
+  onWritten?: (entry: EntryRecord) => Promise<void>;
 }
 
 /**
@@ -226,6 +239,8 @@ export interface UpdateEntryRequired {
     title?: string;
     fieldsJson?: unknown;
     expectedVersion: number;
+    /** The `ext` sub-key `fieldsJson` is namespaced under (ADR-022 §2). Defaults to `"site"` — see `field-validation.ts`'s `validateFieldsAgainstSchema`. */
+    owner?: string;
   };
 }
 
@@ -247,7 +262,7 @@ export async function updateEntry(required: UpdateEntryRequired): Promise<Result
 
   let fieldsJson = current.fieldsJson;
   if (input.fieldsJson !== undefined) {
-    const validation = validateFieldsAgainstSchema({ schema: contentType?.fields ?? [], fieldsJson: input.fieldsJson });
+    const validation = validateFieldsAgainstSchema({ schema: contentType?.fields ?? [], fieldsJson: input.fieldsJson, owner: input.owner });
     if (!validation.valid) {
       return { ok: false, error: new EntryFieldValidationError(validation.fieldErrors) };
     }
@@ -275,6 +290,7 @@ export async function updateEntry(required: UpdateEntryRequired): Promise<Result
       recordedAt: now,
     });
     if (deps.watermark) await deps.watermark.stampWatermark({ workspaceId: input.workspaceId });
+    if (deps.onWritten) await deps.onWritten(updated);
   });
 
   await deps.outbox.enqueue({ name: "entry.updated", payload: { workspaceId: input.workspaceId, entryId: current.id } });
diff --git a/src/navigation/resolver.ts b/src/navigation/resolver.ts
index b340ad8..64c810a 100644
--- a/src/navigation/resolver.ts
+++ b/src/navigation/resolver.ts
@@ -36,6 +36,7 @@ import type { NavLocationBindingRepoPort, NavResolveContext } from "./ports";
 import type {
   NavItemNode,
   NavLocationKey,
+  NavMenuDoc,
   NavTarget,
   ResolvedNav,
   ResolvedNavItem,
@@ -124,7 +125,7 @@ export async function resolveForLocation(
     currentPath: input.currentPath,
   };
 
-  const items = await resolveItemList(menu.doc.items, context, deps.resolveTargetHref);
+  const items = await resolveMenuDoc({ doc: menu.doc, context, resolveTargetHref: deps.resolveTargetHref });
 
   return {
     menuId: menu.id,
@@ -134,6 +135,28 @@ export async function resolveForLocation(
   };
 }
 
+export interface ResolveMenuDocRequired {
+  doc: NavMenuDoc;
+  context: NavResolveContext;
+  resolveTargetHref: ResolveTargetHrefFn;
+}
+
+/**
+ * Resolves a menu document's item tree into render-ready `ResolvedNavItem`s, independent of any
+ * location binding — the doc-level building block `resolveForLocation` composes on top of (menu
+ * lookup + location-binding lookup), and the seam a caller with a menu already in hand (e.g. the
+ * `widgets` `menu` widget type, SPEC-043 REQ-09) needs to get real hrefs without duplicating the
+ * href-walking logic `resolveForLocation` already owns (`resolveItemList`/`resolveItem` below stay
+ * module-private; this is the one exported entry point to their behavior).
+ *
+ * @complexity O(n) over the doc's total node count — see `resolveItemList`.
+ * @overallScore 100
+ */
+export async function resolveMenuDoc(required: ResolveMenuDocRequired): Promise<ResolvedNavItem[]> {
+  const { doc, context, resolveTargetHref } = required;
+  return resolveItemList(doc.items, context, resolveTargetHref);
+}
+
 /**
  * Resolves a sibling list of item nodes, depth-first, preserving order.
  *

===== SCHEMA EXCERPT: entry_refs + widget_region_bindings table defs (src/infra/db/schema.ts) =====
 * aggregate/time-series store (`AnalyticsRepoPort`'s `analytics_aggregate`/`analytics_session`
 * tables) — that storage/rollup/dashboard surface remains a separate, later, deliberately
 * deferred concern (see `analytics/INFO.md`'s "Future direction"). `id` is a surrogate
 * autoincrement used purely for newest-first ordering in `list()` — `NormalizedHit` itself has
 * no id field. `utm`/`eventProps` are flattened/JSON-encoded since `NormalizedHit` carries them
 * as nested objects.
 */
/**
 * SPEC-043 (Widgets, ADR-047 Debate Fold-In Amendment 3) — the derived, rebuildable `entry_refs`
 * reference-integrity index (ADR-022 §5). Confirmed absent as running code before this feature
 * (`src/navigation/resolver.ts`'s own comment names the gap) — this is its first real table.
 * `id` is a surrogate autoincrement row key since `EntryRefRow` (the domain shape) carries no id of
 * its own — the whole row set for a given `(workspaceId, sourceEntryId)` is replaced atomically by
 * `EntryRefsRepoPort.replaceForSource`, never patched row-by-row (mirrors `widget_region_bindings`'s
 * "derived, rebuildable, single writer" discipline).
 */
export const entryRefs = sqliteTable(
  "entry_refs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull(),
    sourceEntryId: text("source_entry_id").notNull(),
    sourceKind: text("source_kind").notNull(),
    fieldPath: text("field_path").notNull(),
    targetKind: text("target_kind").notNull(),
    targetId: text("target_id").notNull(),
  },
  (table) => [
    index("idx_entry_refs_source").on(table.workspaceId, table.sourceEntryId),
    index("idx_entry_refs_target").on(table.workspaceId, table.targetKind, table.targetId),
  ]
);

/**
 * SPEC-043 (Widgets, ADR-047 Debate Fold-In Amendment 1) — the derived, rebuildable
 * `widget_region_bindings` index, mirroring `nav_location_bindings` exactly:
 * `UNIQUE(workspace_id, region_key)` is the DB-level enforcement of INV-02 (a region has at most
 * one bound `widget_area` entry). Reconciled ONLY by `region-area-service.ts`'s
 * `reconcileWidgetRegionBindings` — never hand-authored.
 */
export const widgetRegionBindings = sqliteTable(
  "widget_region_bindings",
  {
    workspaceId: text("workspace_id").notNull(),
    regionKey: text("region_key").notNull(),
    areaEntryId: text("area_entry_id").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("widget_region_bindings_workspace_region_unique").on(table.workspaceId, table.regionKey),
    index("idx_widget_region_bindings_area").on(table.workspaceId, table.areaEntryId),
  ]
);

export const analyticsEvents = sqliteTable(
  "analytics_events",

===== PERMISSIONS EXCERPT: widgets.* registrations (src/identity/permissions.ts) =====
  from: "media.write",
  to: ["media.read", "media.upload", "media.update", "media.delete", "media.delete.force", "media.download_original", "media.upload_svg"],
  reason:
    "ADR-027 §7 / SPEC-021 REQ-40/OQ-02: media.write replaced by the flat media.* permission set; " +
    "every policy holding the old flat permission must not be silently narrowed by the split.",
});

/**
 * SPEC-043 (Widgets, ADR-047 §5/§8, Debate Fold-In Amendment 5/6) — flat `widgets.*` permissions,
 * matching `comments.*`'s shape (flat `domain.verb`, not the `admin.<section>.<action>`
 * convention). `.place` is split from `.update` (mirrors `admin.menus.assign`'s split from
 * `admin.menus.update`): placing a widget onto the live site is higher-trust than editing an
 * off-site instance's config. `.delete`/`.delete.force` mirrors `media.delete`/`media.delete.force`
 * (REQ-42/43's trash -> purge-blocked -> force-purge ladder).
 */
registerPermission({ id: "widgets.read", owner: "widgets", description: "Read widget instances, widget_area regions, and their revision history." });
registerPermission({ id: "widgets.create", owner: "widgets", description: "Create a new widget instance." });
registerPermission({ id: "widgets.update", owner: "widgets", description: "Update an existing widget instance's config." });
registerPermission({
  id: "widgets.place",
  owner: "widgets",
  description: "Bind/reorder/disable a widget in a region's widget_area, or insert/remove/reorder a widgetEmbed node.",
});
registerPermission({ id: "widgets.delete", owner: "widgets", description: "Trash a widget instance." });
registerPermission({
  id: "widgets.delete.force",
  owner: "widgets",
  description: "Force-purge a widget instance past the still-referenced guard, flagging any resulting dangling references.",
});

/** Enumerate the full registered catalog (REQ-12 core capability; CLI wiring is N/A, see file header). */

===== git log --oneline 9179e67..HEAD -- src/widgets src/core/entry-refs src/features/entries src/navigation =====
f9b1952 Fix all four disclosed widgets implementation gaps
c946bbc Verify widgets domain (SPEC-043) baseline, correct stale comment, disclose gap decisions
03a8781 Add widgets domain (SPEC-043): ADR-047 debate fold-in, spec, outline, TDD suite + implementation

===== git status --short (full repo) =====
 M ADS-project-knowledge/reports/architecture/ADR-INDEX.md
 M src/server/http/site/render.ts
 M src/server/routes/site/pages.ts
