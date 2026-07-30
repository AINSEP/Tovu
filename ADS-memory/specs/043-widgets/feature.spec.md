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

- [x] spec_id assigned and unique (`043-widgets` unused in `ADS-memory/specs/` and
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
