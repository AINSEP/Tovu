# Implementation Plan: generic `data-embed-type` contract

Status: **DRAFT — awaiting owner review before Programmer dispatch.**
Author: Coordinator (Claude Sonnet 5), written directly rather than through a formal
Spec/TDD pipeline pass — see "Why no formal pipeline artifact exists yet" at the bottom.

## Goal

Replace the bespoke `data-widget-embed`/`data-form-embed` attributes in Pages'
`body_html` with the owner-decided generic contract (`project-tovu-generic-embed-contract`
memory, decided 2026-08-05):

```html
<div data-embed-type="widget" data-embed-id="{instanceId}"></div>
<div data-embed-type="form"   data-embed-id="{formId}"></div>
<div data-embed-type="media"  data-embed-id="{assetId}" data-embed-variant="thumb"></div>
```

Adding a fourth type later must require **zero changes** to the scanner or renderer —
only a new resolver registration. That promise is the actual point of this migration
(the settled-rules memory's stated reason for the churn), so it's the design constraint
every piece below is checked against.

No real HTML parser is being introduced. The div stays empty/self-closing, so a
regex bounded to that shape remains sufficient — this was previously justified in
`html-embeds.ts`'s header as "this codebase has no HTML-parsing dependency," phrased
as if it were a settled constraint. It isn't one; it's just still true that nothing
here needs a parser, so the existing approach is kept on its own merits, not on that
comment's authority.

## Current state (verified against `HEAD`, not the old comments)

- `src/widgets/html-embeds.ts` — regex `<div\b[^>]*?\bdata-(widget|form)-embed\s*=\s*"([^"]*)"[^>]*?>\s*<\/div>`, hardcoded two-way alternation. `PageHtmlEmbedKind = "widget" | "form"`.
- `src/core/entry-refs/extractor.ts:170` — deliberately-duplicated copy of the same pattern, feeding `entry_refs` for safe-delete/where-used checks. Kept in sync today only by `__tests__/integration/html-entry-refs-consistency.integration.test.ts`.
- `src/widgets/resolver-service.ts:239-320` — `resolveHtmlPageEmbeds` returns a **fixed two-field shape**, `{ widgetResolved: Map<UUID, WidgetRenderIR>, formResolved: Map<UUID, WidgetRenderIR> }`. Both are resolved through the same `resolveWidgetInstances`/`resolveWidgetType` machinery — the form path is sugar over a synthetic `contact-form` widget instance (lines 305-317).
- `src/server/http/site/render.ts:372-378` — `renderHtmlPageBody` branches on `ref.kind === "widget"` to pick which of the two maps to read.
- `src/server/http/site/render.ts:261-308` — the `image` TipTap-node case already does real media resolution: `assetId`/`transformName` → `mediaTransformVersions` (sourced from `transform_registry`, now populated at boot per `c92ed60`) → `/m/{assetId}/{transformName}.v{version}/...`. This is the logic a new `media` HTML-embed resolver should reuse, not reinvent.
- `EntryRefTargetKind` (`src/core/entry-refs/types.ts:35`) is only `"entry" | "term"` — no kind exists yet for a media-asset reference.
- One live row carries the old attributes: `posts.slug = 'glassmorphic-landing'`.
- ADR-041 (the migration infra the settled-rules memory says this needs) is confirmed to exist: `ADS-memory/reports/architecture/ADR-041-storage-timeline.md`, Accepted 2026-07-14.

## Proposed changes

### 1. Scanner — `html-embeds.ts` and `extractor.ts`'s duplicate

Replace the two-way alternation with a **type-agnostic capture**:

```
<div\b[^>]*?\bdata-embed-type\s*=\s*"([a-z][a-z0-9-]*)"[^>]*?>\s*<\/div>
```

then, from the matched tag text only (still no nesting, still one regex pass, still
no parser), pull `data-embed-id`, `data-embed-name`, `data-embed-variant` as separate
optional attribute lookups. `PageHtmlEmbedRef` becomes:

```ts
interface PageHtmlEmbedRef {
  readonly type: string;        // NOT a closed union — see below
  readonly id: string | null;
  readonly name: string | null;
  readonly variant: string | null;
}
```

`type` is deliberately `string`, not `"widget" | "form" | "media"`. A closed union
would mean the scanner's own type signature has to change every time a type is
added — exactly the coupling the generic contract exists to remove. Unknown types
flow through untouched; resolution (below) is where "known vs. unknown" is decided.

`MAX_HTML_EMBEDS_PER_PAGE` / `MAX_EMBED_ID_LENGTH` bounds carry over unchanged.

Name-to-id resolution ("exactly one match resolves; zero or >1 degrades to
placeholder, never a guess," per the settled rules) stays a resolver-side concern,
not scanner-side — the scanner only reports what's literally written in the markup.

### 2. Resolution — `resolver-service.ts`

This is the piece that actually has to change shape, not just pattern. Today's two
named fields (`widgetResolved`/`formResolved`) can't scale to N types without a new
field (and a new render.ts branch) per type — the exact anti-pattern the contract is
meant to kill.

Proposed: a **registry keyed by embed type**, each entry a resolver function with a
uniform signature, and a **result keyed by type** instead of by name:

```ts
type HtmlEmbedResolver = (
  refs: readonly PageHtmlEmbedRef[],
  deps: WidgetInstanceResolutionDeps,
  context: WidgetResolveContext
) => Promise<ReadonlyMap<string, WidgetRenderIR>>;   // keyed by resolved id

const HTML_EMBED_RESOLVERS: Readonly<Record<string, HtmlEmbedResolver>> = {
  widget: resolveWidgetTypeEmbeds,   // today's widgetResolved logic, unchanged behavior
  form: resolveFormTypeEmbeds,       // today's synthetic contact-form logic, unchanged behavior
  media: resolveMediaTypeEmbeds,     // NEW — see below
};

// result: ReadonlyMap<string /* embed type */, ReadonlyMap<string /* id */, WidgetRenderIR>>
```

Adding a fifth type is registering one more entry in `HTML_EMBED_RESOLVERS` — no
other file in this list changes.

**DECIDED (2026-08-07):** an unknown `data-embed-type` and a known-type-but-failed
resolution render the **identical** placeholder — matches the REQ-28 pattern already
used everywhere else in this codebase (every widget-resolution failure looks the same
externally, regardless of why). Internally, keep the two distinguishable for
logging/debugging: the registry design above already produces this split for free —
`type` absent from `HTML_EMBED_RESOLVERS` is one code path (log "unknown embed type"),
`type` present but the resolver couldn't find the id/name is a different one inside
that resolver (log "unresolved `<type>` reference"). Do not deliberately collapse
these into one log line — an author's markup typo and an author's stale reference are
different problems needing different fixes.

**`media` resolver — new logic, not adapted from `resolveWidgetType`.** It needs to:
1. Look up the asset by `data-embed-id` (an `assetId`).
2. Determine mime (image/audio/video are one `media` type, dispatched by stored
   mime per the settled rules — not chosen by the author).
3. Resolve `data-embed-variant` as the transform name (default likely `"public"`,
   matching the now-boot-registered row — needs confirming against what
   `ensureCoreMediaTransform` actually registers, `src/media/bootstrap.ts:53-73`).
4. Build the same `/m/{assetId}/{transformName}.v{version}/...` URL `render.ts`'s
   `image` node case already builds (`render.ts:296-306`) — reuse, don't reimplement.
5. Degrade to placeholder on any failure (missing asset, unregistered transform,
   unresolved version) — same REQ-28 discipline every other resolver here follows.

This resolver's *output* shape needs to fit into the same `WidgetRenderIR`
(`{componentId, props}`) the `image`/`widgetEmbed` paths already emit, OR `render.ts`'s
existing "core component registry" (referenced at `render.ts:326-328`, not yet fully
read as part of this pass) already has a slot for this — worth Programmer checking
before inventing a new render mechanism.

### 3. Renderer — `render.ts`

`renderHtmlPageBody` (currently `render.ts:372-378`) collapses to:

```ts
resolved?.get(ref.type)?.get(ref.id ?? /* normalized-name lookup */) ?? placeholder
```

No type branching. This is the payoff of restructuring #2 — the renderer genuinely
never changes again when a type is added, which is the settled rule being honored in
practice, not just in the contract's prose.

### 4. `entry_refs` — `extractor.ts`

Same generic-capture pattern change as #1. **DECIDED (2026-08-07):** add a third
`EntryRefTargetKind`, `"asset"`, rather than reusing `"entry"`. Reusing `"entry"` was
tempting since the codebase already stretches that label past literal
`entries`-table membership (menus, forms) — but a media asset lives in a genuinely
different storage domain (files/transforms, not the generic entries graph), and more
media/data types are coming. A future safe-delete or where-used consumer that
branches on `targetKind` to decide *how* to resolve/display a target needs an honest
answer here, not an overload. `EntryRefTargetKind` becomes `"entry" | "term" | "asset"`.
Programmer: find every exhaustive switch/match over this type (safe-delete check,
where-used UI, anywhere `EntryRefTargetKind` is narrowed) and add the `"asset"` arm —
do not assume there's only one.

### 5. Migration — the one live row

**CORRECTED (2026-08-07) — ADR-041 was the wrong vehicle, this section was wrong.**
Original text below the line was based on an unread assumption ("ADR-041 = the
migration system, so use it") that Programmer correctly disproved by actually reading
the ADR before writing anything. ADR-041 governs schema/DDL ceremony (`migrate-forward`,
restore points, `__drizzle_migrations` drift checking) — its own text explicitly says
the design **rejected** a raw-row-edit console as "a category error against the write
chokepoint... model this codebase already commits to." Rewriting one Page's `body_html`
string is a content edit, not a schema change — there is no table/column shape change
and nothing for `__drizzle_migrations` to track. Running it through
`executeMigrateForward` would itself be the category error ADR-041 warns against.

**Correct vehicle: `src/features/pages/html-document-store.ts`'s
`PagesHtmlDocumentStore.write()`** — the real chokepoint for Pages' `body_html` (optimistic
concurrency via `baseVersion`, `entry_refs` re-indexing already wired through
`extractHtmlEntryRefs`). This is the same path a real `pages_write_html` agent-tool call
or an admin edit already goes through. No backward-compat alias (owner's ruling stands)
— `data-form-embed="{id}"` → `data-embed-type="form" data-embed-id="{id}"` for the one
live row (`posts.slug = 'glassmorphic-landing'`, confirmed to carry exactly one embed,
a form embed, no widget embeds).

~~ADR-041 infra is confirmed to exist and should be the vehicle; Programmer should read
it before writing the migration, not reinvent migration mechanics.~~ (superseded above)

### 6. Tests

`__tests__/integration/html-entry-refs-consistency.integration.test.ts` needs new
fixtures: a `media` embed, and at least one unregistered/future type token, asserting
both scanners agree AND that the unknown type degrades to the placeholder without
either file needing a code change to pass.

## Sequencing

1. Scanner change (#1) + its consistency test — smallest independently-testable slice.
2. Resolver registry restructuring (#2) for `widget`/`form` only — behavior-preserving,
   provable against existing tests before `media` is added.
3. `media` resolver (#2 cont'd) + render.ts wiring (#3) — new behavior, needs its own
   tests including the transform-registry-empty-for-this-asset degrade path.
4. `extractor.ts` (#4) — needs the `targetKind` decision first.
5. Migration (#5) — last, since it depends on the new attribute shape being correct
   and tested, not the other way around.

## Why no formal pipeline artifact exists yet

The Programmer and Refactor agent personas both require inputs this task doesn't have
in the standard place — a certified test suite / spec hash for Programmer, a Code
Review finding for Refactor. The design is real and owner-approved (captured in the
`project-tovu-generic-embed-contract` memory from 2026-08-05), but it was never run
through Spec → Red-Team → Architect → TDD. Running the full formal pipeline for a
change this scoped seemed disproportionate; this document is meant to serve as the
review checkpoint in its place. If you'd rather this go through the full pipeline for
rigor (ADR + certified tests before code), say so and Coordinator will route it that
way instead.
