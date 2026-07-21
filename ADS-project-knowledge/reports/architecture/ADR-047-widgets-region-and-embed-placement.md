# ADR-047: Widgets — Entry-Native Instances, Dual Placement (Region Binding + Inline Embed), Token-Styled Defaults

- Status: PROPOSED 2026-07-20 (single-agent design draft, Claude Sonnet 5 / Leon Aburime, Coordinator
  Review Mode — synthesized directly from an owner design conversation, not an autonomous sweep). Owes
  a swarm `/debate` + external `/audit-work` pass before ACCEPTED, matching this project's standing
  process (see ADR-029's own precedent — a design-only draft that later cleared debate + a 3-round audit).
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

## Record

- **Type of work:** single-agent design draft (Claude Sonnet 5), synthesized from a direct owner design
  conversation (not an autonomous sweep) — competitor survey (WordPress, Drupal, Payload, Ghost, Strapi,
  Directus, verified via live documentation search, not assumed from training data), a worked example
  (reusable Contact Form on two pages), and an explicit AI-editability requirement drove the shape.
- **Grounding:** accepted ADRs 002/006/007/008/009/016/020/021/022/024/027/029 and `tovu-v2-design.md`'s
  Tier-3 table (explicitly revisited, see Context). No accepted ADR is reopened; the one informal
  planning-doc note this ADR partially supersedes is called out directly, not silently overridden.
- **Verification owed:** unlike ADR-029, this draft's types/ports have **not yet** been written as real
  repo files or typechecked against the live tree — that is the first task once this ADR clears debate,
  not before.
- **Next steps:** per this project's standing process, this ADR owes a swarm `/debate` + external
  `/audit-work` pass before ACCEPTED. Spec, tasks, implementation outline, and code should not begin
  before that gate clears (see Open #1–#5 as the debate/audit seed agenda).
