# Swarm Consensus Context Packet

**Date:** 2026-07-21
**Slug:** widgets-adr047
**Project Type:** brownfield
**Question:** How should Tovu's "widgets" system (placeable, reusable components like a contact form, recent-posts list, text block, or social links) be structured — placement model, data model, styling ownership, and AI-editability? A draft answer exists (ADR-047, embedded below) but has NOT been debated or audited. Evaluate it adversarially: is it the right design, and where does it fail?
**Intended Consumers:** Primary model + peer CLIs (agy/Gemini 3.1 Pro, Codex GPT-5.6-sol)

## Goal

Decide whether ADR-047's design is sound before it proceeds to external audit, spec, and implementation. Tovu has no widget/placeable-component system today — only navigation menus (ADR-029) exist. The owner wants this built, and wants AI to be able to place, remove, diagnose, and adjust widgets, not just a human clicking through an admin screen.

## Scope

**In scope:** the widget data model, the placement mechanism(s), default-styling ownership (widget vs. theme), and how AI tooling interacts with widgets. **Out of scope:** re-litigating already-accepted ADRs this design extends (022 content model, 002 rendering/component-registry, 020 theme tiers, 029 menus, 016 agentic document editing) — treat those as fixed constraints, not open questions, unless a peer finds a genuine incompatibility.

## Architecture Summary

Tovu is a self-hosted, agent-native CMS (modular monolith, SQLite-first with a Postgres path). Relevant accepted decisions, summarized (full ADR text available on request, but these summaries are authoritative for this debate):

- **ADR-022 (content model):** all content is a generic `entries` table + a content-types-as-data registry (types are rows, not code). Universal columns (`id` ULID, `workspaceId`, `type`, `slug`, `status`, `bodyJson`, `version`, ...) + namespaced JSON `fields.ext.{owner}.*` for type-specific fields, validated on write. Every mutation goes through **one write chokepoint** that records a revision in the same transaction (never-brick guarantee). Entry-to-entry references are tracked via a derived, rebuildable `entry_refs` index (where-used, safe-delete signaling).
- **ADR-002 (rendering):** theme/admin contracts are pure data — manifest, template IDs, template-hierarchy, **slots/regions**, design tokens. One **component registry** shared between site rendering and admin preview. Components consume design tokens (`var(--...)`) only, never a skin id directly.
- **ADR-020 (theme tiers):** three theme capability tiers — Declarative (JSON block tree, no code, safe from anyone), Templated (LiquidJS, sandboxed logic, no JS), Code (full trust). The Liquid renderer sits **on top of** the same component registry (a `render_block`/island tag resolves a component by id — same mechanism as the declarative JSON's `{type:"component", id:...}` node). Content (`bodyJson`) is rendered server-side through one fixed node→component mapping and injected via a single seam, `{{ content | render_rich_text }}`. Hard rule: **the theme renderer never resolves references or reads storage — core resolves everything first, theme only renders already-resolved data.** The internal render IR — `(registered component id, validated props, children)` — is the canonical artifact both the JSON editor and Liquid templates serialize to.
- **ADR-029 (menus/navigation, the direct precedent):** a menu is a seeded `entry` (`type='menu'`), not a new table. Item tree lives in `bodyJson`. A separate **location-binding table** (`nav_location_bindings`, one real port with in-memory + SQLite adapters) maps a theme-declared location key (e.g. `header`, `footer`) to exactly one menu, `UNIQUE(workspace_id, location_key)`, updated in the same transaction as the menu mutation. Link targets are a discriminated union (`entryRef`/`termRef`/`url`/`route`) tracked via `entry_refs`. Deletion follows a ladder: trash → purge-blocked-while-referenced (shows the referencing list) → force-purge behind a separate permission. AI tools are thin clients of the same gateway used by humans, mutations go through a change-set review layer, never a back door. Theme switches **preserve** location assignments (a deliberate fix for a well-known WordPress papercut where switching themes silently drops widget/menu placements).
- **ADR-016 (agentic document editing):** AI-driven content edits execute as CopilotKit **frontend actions** bound to the live TipTap/ProseMirror editor instance (not MCP — the editor lives in the browser). Every AI edit is a reviewable change-set: propose → review → accept/reject → revert. RBAC-gated server-side so an agent can never exceed the calling user's permissions.
- **ADR-024 (plugin/declarative trust model):** any declarative, zero-code surface (which a widget-config schema would be) must be **total and bounded-cost** — no unbounded loops/recursion, no side effects — so it stays safe to expose to untrusted/AI-driven input.

## Relevant Files And Artifacts

| Path | Why it matters |
|---|---|
| `ADS-project-knowledge/reports/architecture/ADR-047-widgets-region-and-embed-placement.md` | The full draft design under debate — embedded in full below. |
| `ADS-project-knowledge/reports/architecture/ADR-029-menus-navigation.md` | The nearest sibling/precedent this design generalizes from. |
| `ADS-project-knowledge/reports/architecture/ADR-002-blessed-rendering-target.md`, `ADR-020-theme-capability-tiers.md` | Rendering/component-registry/theme-tier constraints. |
| `ADS-project-knowledge/reports/architecture/ADR-022-content-model-entries-registry-expression-indexes.md` | Content-model substrate the widget entity reuses. |
| `tovu-v2-design.md` (Tier-3 table) | Original planning note this ADR partially revisits (`widgets (sidebars half): superseded`). |

## Constraints

- **Never-brick guarantee**: Tovu runs as a live end-user SQLite file on a non-expert's machine. No widget feature may risk bricking a site or require a risky migration.
- **Non-expert audience**: the primary theme tier (Declarative) is aimed at non-developers with zero code. Any widget-styling default must look acceptable out of the box without the operator writing CSS.
- **AI-editability is a hard requirement**, not a nice-to-have: the owner explicitly wants AI to place, remove, diagnose, and adjust widgets.
- **Reuse over invention**: this project has a strong, repeatedly-reinforced norm of generalizing existing accepted patterns (ADR-027→029's "hybrid-reuse pattern") rather than building parallel new subsystems for structurally similar problems.

## Known Unknowns

The ADR itself names 5 open decision points (full text below, Open §1–5): (1) region-binding scope — site-wide only or per-page override; (2) freeform inline embed vs. a structured blocks-array field; (3) shared-instance vs. duplicate-on-place default when placing an existing widget type; (4) exact core v1 widget-type list; (5) region-binding concurrency model.

## Source-of-Truth Inputs

| Source | Notes |
|---|---|
| `ADR-047-widgets-region-and-embed-placement.md` (embedded in full below) | The design under debate |
| Competitor survey (WordPress, Drupal, Payload, Ghost, Strapi, Directus) | Verified via live documentation search during drafting, cited in the ADR's Context section — not assumed from training data |

---

## FULL TEXT — ADR-047 (the design under debate)

<embedded-adr-047>

# ADR-047: Widgets — Entry-Native Instances, Dual Placement (Region Binding + Inline Embed), Token-Styled Defaults

- Status: PROPOSED 2026-07-20 (single-agent design draft). Owes a swarm `/debate` + external `/audit-work` pass before ACCEPTED.
- Extends: ADR-022, ADR-002, ADR-020, ADR-029. Relates: ADR-016, ADR-021, ADR-024, ADR-008/009, ADR-006, ADR-007, ADR-027.

## Context

Tovu's admin already has menus/navigation (ADR-029) but nothing for the other half of what every theme-based CMS calls "widgets": placeable, individually-configured components like a contact form, a recent-posts list, a text block, or social links — placed into a header/footer/sidebar region, or dropped into the middle of a specific page's content.

**This was explicitly considered once already and marked out of scope.** `tovu-v2-design.md`'s Tier-3 table lists `widgets (sidebars half) | superseded | Slots/regions + blocks replace widget instances` — the original plan was that ADR-002's slots/regions plus the existing declarative block/component tree would be enough, with no separate "widget" concept needed, the same way `shortcodes` was dropped in favor of dynamic block nodes on the same table row above it.

That works for a *stateless* block placed once in one template. It does not work for the case that motivated this ADR: **build one Contact Form (a specific recipient email, a specific field set, a specific success message), then place that same configured instance on the Landing Page and, separately, on the Contact Page** — edit it once, both placements update. A raw inline block has no identity to reference twice, no central place to edit it, and no way to answer "where is this used?" before deleting it. That reusable, centrally-editable, where-used-trackable quality is exactly why WordPress widgets and Drupal custom blocks are *stateful entities placed by reference*, not literal inline markup — and it is what the owner's worked example needs. **This ADR partially supersedes the v2-design "superseded" call**: slots/regions remain exactly right as the *placement* mechanism (§1a), but the *thing being placed* needs first-class identity, which brings back a real "widget" concept — built the ADR-029 way (an entry, not a new subsystem), not the WordPress way (a `postmeta`-shaped bolt-on).

**Competitor survey (verified, not assumed).** WordPress's classic widgets ship with no default styling and famously lose sidebar assignments on a theme switch — the exact two sins ADR-029 already structurally fixed for menus. Drupal's Blocks/Regions is the closest real analog (regions declared by the theme, blocks placed into them via an admin UI) and is the strongest precedent to learn from. The current generation of API-first CMSs deliberately dropped this pattern rather than refine it: Ghost has no widget/sidebar concept at all (themes are raw Handlebars, DIY); Strapi and Directus are headless with no rendering layer, so there is nothing to place content *into* — their own "widgets" are unrelated admin-dashboard React components; Payload's closest feature, the Blocks field, is per-document flexible composition (an editor assembles one page from typed blocks), not a global region a site-wide widget is bound to. None of the four give us a placement-by-reference model to copy directly — Drupal and WordPress are the only real prior art, and both have known failure modes ADR-029's pattern already avoids for menus.

**The requirement that settled the design direction:** the owner wants AI to be able to **place, remove, diagnose, and adjust** widgets, not just a human clicking in an admin screen. That rules out any mechanism that isn't already wired into Tovu's change-set review and reference-integrity substrate — a bespoke "widget editor" with its own ad hoc mutation path would be a second, weaker version of machinery ADR-016 and ADR-029 already built correctly once.

## Decision

### 1. A widget instance is a seeded content-type entry — same substrate as a menu

`type='widget'` ships as a registry row, exactly like `post`/`page`/`menu`. It reuses, unchanged: the universal columns (`id` ULID, `workspaceId`, `slug`, `title`, `status`, `updatedAt`, `version`), the single write chokepoint, and whole-instance revisions + revert.

A **widget-type registry** (data, not code) declares, per type (`text`, `contact-form`, `recent-entries`, `social-links`, `menu`, …): a config schema for `fields.ext.widget.*` (validated on write), a default-props shape, and any capability requirements. A widget **instance** is a configured occurrence of a type — this is what makes "two differently-configured Contact Forms" and "one Contact Form reused in two places" both expressible: the former is two instances, the latter is one instance referenced twice.

Note one of the core v1 widget types is `menu` itself — ADR-029's already-resolved nav model is just another render-IR node, so "place the primary menu as a widget in the footer region" costs nothing new.

### 2. Placement — two independent mechanisms over the one shared instance concept

**(a) Region binding — global, theme-declared.** Direct generalization of ADR-029 §4's location-binding, with the one structural difference the plural case demands: a nav location holds exactly one menu; a widget region holds an **ordered list**. `widget_region_bindings(workspace_id, region_key, widget_instance_id, position, bound_at)`, `UNIQUE(workspace_id, region_key, widget_instance_id)`, ordered by `position`. Themes declare region keys the same way they already declare template slots/regions; the Tier-2 Liquid renderer's existing `render_block`/island-tag seam is the render hook as-is — a region is a `render_block` call over a resolved, ordered widget list instead of a single component. **No new Liquid capability is required.**

**(b) Inline embed — page-scoped, editor-placed.** A new TipTap node type, `widgetEmbed`, carrying a widget-instance ULID, insertable anywhere in any entry's `bodyJson`. At render time, the existing content-resolution step that turns `bodyJson` into the theme's `{{ content | render_rich_text }}` seam resolves each `widgetEmbed` node into the widget's rendered IR node — inline, exactly where the editor put it, **before** the resolved content ever reaches the Liquid template. **Both placement paths terminate in something Liquid already knows how to render — this ADR adds no new theme-facing surface.**

**Placement UI governs reuse, not the data model.** Whether "place the Contact Form here" creates a reference to the existing instance or a fresh duplicate instance is a UI choice (offer both: "use existing" vs. "duplicate"); the underlying model supports either because both are just an instance-id reference, region-bound or embedded.

### 3. Reference integrity — extend `entry_refs` with a `widgetRef` kind

Both placement paths register into the same derived `entry_refs` index ADR-029 established for menu targets: a region binding is a `widgetRef` from `(workspace, region-binding row)` → widget instance; an inline embed is a `widgetRef` from the hosting entry → widget instance. This buys, for free: **where-used**, **safe-delete signaling** (dangling refs flagged `available:false`), and the AI's "diagnose" primitive — a broken widget reference is already a queryable, first-class state.

### 4. Default styling — widgets consume the theme's design-token contract, never hardcoded CSS

Each widget type ships a minimal default appearance built entirely from the theme's tokens (`var(--...)`). This is deliberately neither WordPress's "unstyled, looks broken by default" nor "themes must hand-style every widget type from scratch." Overrides compose at two levels: **token overrides** (a theme redefines the tokens a widget consumes) or **component overrides** (a theme/plugin registers its own component for a given widget-type id in the existing component registry). **Widgets carry zero layout opinion** — layout/positioning belongs entirely to the region or embed point.

### 5. AI place / remove / diagnose / adjust — reuse ADR-016's change-set review layer, no new substrate

Place/remove/adjust are ordinary edits routed through the mechanism each placement type already uses (gateway mutation for region bindings, a CopilotKit frontend tool + reviewable change-set for inline embeds). `widgets.place`/`widgets.remove`/`widgets.configure` are thin gateway/tool clients. Diagnose = query the `entry_refs` dangling-reference state plus config-schema validation errors. RBAC-gated via flat `widgets.*` permission strings, enforced server-side.

### 6. Ports — rule-of-two

`WidgetRegionBindingRepoPort` is a real port (two adapters). Widgets add no new persistence port for the instance itself (rides the existing entries repo). The widget-type registry is data-only, no port. Resolution stays a one-evaluator typed call, not a port, unless a second real resolver appears.

### 7. Never-brick, chokepoint, deletion ladder

Every widget mutation runs through the existing gateway/chokepoint. Deletion follows the established ladder: trash → purge-blocked-with-referencing-list → force-purge behind a separate permission. Widget config validation is total and bounded-cost.

### 8. Surfaces, events, hooks

Flat `widgets.*` permissions. Outbox events (`widgets.instance.*`, `widgets.region.*`, `widgets.embed.*`). Sync hooks (`widgets.instance.resolve`, `widgets.region.filter`, `widgets.types.register`).

### 9. v1 scope

**IN:** widget-type registry; starter type set (Text, Contact Form, Recent Entries, Social Links, Menu-as-widget); region binding; inline TipTap embed; token-based default styling + two override levels; `entry_refs`/`widgetRef` integrity; AI tools via existing change-set layer; flat permissions; bounded/total config validation.

**DEFERRED:** per-widget visibility/role-gating DSL; a structured "blocks array" field as an alternative to freeform embeds; widget marketplace/plugin-contributed types; per-page region overrides.

## Open (unresolved — the debate/audit agenda)

1. **Region binding scope: site-wide only, or per-page override?** Current design binds a region site-wide. The "put it on the Landing Page, not the Contact Page" case is answered by inline embed (§2b) instead — is that sufficient, or is a page-scoped *region* override also needed?
2. **Freeform inline embed vs. a structured blocks-array field.** Is unconstrained TipTap-node embedding right for non-expert editors, or does it need more guardrails?
3. **Shared-instance vs. duplicate-on-place default.** Placing an existing widget type — default to reuse, default to duplicate, or always ask explicitly?
4. **Core v1 widget-type list and each type's capability requirements.**
5. **Region-binding concurrency.** A region binding is a multi-row ordered list (unlike a menu's single JSON body) — what's the conflict rule for concurrent reorders?

</embedded-adr-047>

## Shared Prompt Payload

<the exact Round 1 prompt is a separate file — see the peer dispatch instructions accompanying this packet>
