# Proposal: Resolving the Two-Catalog Split (`COMPONENTS` vs. Widget IR)

- **Date:** 2026-08-20
- **Author:** Software Architect agent (dispatched, `general-work` branch)
- **Trigger:** `ADS-memory/reports/swarm-consensus/runs/2026-08-20-tovu-extension-surface/SYNTHESIS.md`,
  Result 2 blocking sub-finding — "extend the widget seam" is ambiguous between two closed
  component vocabularies that do not share dispatch.
- **Scope:** Establish both catalogs in full, why they were separated, what each can/cannot
  express, the real coupling cost, and which is the better plugin-extension foundation. Recommend
  unify or ratify.
- **Constraint honored:** propose only — no file under `src/` was modified.

## Recommendation (one sentence)

**Ratify the split as intentional**, but narrow "extend the widget seam" to mean specifically the
widget-type-registry path (`registry.ts` + `CORE_RESOLVERS` + `WIDGET_IR_RENDERERS`) — not
`COMPONENTS` — as the plugin extension point, and fix one stale comment that currently points a
future reader the wrong way.

---

## 1. Both catalogs in full

### 1a. `COMPONENTS` — `src/server/http/site/render.ts:1362-1375`

```ts
type Component = (ctx: SiteRenderContext, props: JsonObject) => string;   // :1066

export const COMPONENTS: Record<string, Component> = {
  "tovu/site-header": siteHeader,
  "tovu/entry-list": entryList,
  "tovu/entry-content": entryContent,
  "tovu/site-footer": siteFooter,
  "tovu/hero": hero,
  "tovu/section": section,
  "tovu/feature-grid": featureGrid,
  "tovu/media-placeholder": (_ctx, props) => mediaPlaceholder(props),
  "tovu/announcement": announcement,
  "tovu/nav": siteNav,
  "tovu/cta": ctaBand,
  "tovu/footer": siteFooterRich,
};
```

12 members, all namespaced `tovu/…`. Shape: `(ctx, props) => string` — **flat**, no `children`.
Each function hand-extracts its own props with local `str()/obj()/arr()` helpers; **no schema
exists anywhere for any `COMPONENTS` entry** — validation is whatever each function's ad-hoc
extraction happens to enforce (confirmed by reading `section()` at `:1333` and `featureGrid()` at
`:1347`; neither declares nor checks a shape before use).

**Dispatched from two sibling call sites, both theme-authored, both synchronous:**
- `renderComponentBlock` (`:1883-1888`) — a `{"type":"component","id":…,"props":…}` node in the
  declarative block tree.
- `renderBlockSeam` (`:1849-1860`) — the Liquid `render_block component: "…"` tag, when
  `props.component` (not `props.region`) is set.

Both are pure lookups into `COMPONENTS[id]`; an unknown id degrades to an HTML comment (`:1858`,
`:1886`), never a throw.

### 1b. Widget IR — `src/widgets/types.ts:223-227` (shape) + `src/server/http/site/render.ts:1693-1702` (dispatch)

```ts
export interface WidgetRenderIR {          // types.ts:223
  readonly componentId: string;
  readonly props: JsonObject;
  readonly children?: readonly WidgetRenderIR[];
}

const WIDGET_IR_RENDERERS: Record<string, (ir: WidgetRenderIR) => string> = {   // render.ts:1693
  text: ...,
  "social-links": ...,
  "recent-entries": ...,
  "entry-summary": ...,
  menu: ...,
  "contact-form": ...,
  "media-image": ...,
  "post-content": ...,
};
export function renderWidgetIr(ir: WidgetRenderIR): string {                    // render.ts:1715
  const renderer = WIDGET_IR_RENDERERS[ir.componentId];
  return renderer ? renderer(ir) : renderWidgetPlaceholder();
}
```

**Correction to the SYNTHESIS's count:** this table has **8 entries, not 5.** `WidgetTypeKey`
(`src/widgets/types.ts:63`) is a closed union of exactly 5: `text | social-links | recent-entries |
menu | contact-form`. Three `WIDGET_IR_RENDERERS` keys — `entry-summary`, `media-image`,
`post-content` — are **not** members of `WidgetTypeKey` and never flow through
`WIDGET_TYPE_REGISTRATIONS`/`CORE_RESOLVERS` at all:

- `entry-summary` is emitted as a **child** IR by `recent-entries`'s own resolver
  (`src/widgets/resolvers/recent-entries.ts:68`: `children: items.map(item => ({ componentId:
  "entry-summary", props: item }))`) — it has no registration of its own; it only ever appears
  nested inside a `recent-entries` IR's `children`.
- `media-image` and `post-content` are built directly by `resolver-service.ts`
  (`:437`, `:606`, `:692`, `:725`) for **Page `data-embed-type` embeds** (SPEC-047 Slice 2, per the
  doc comment at `render.ts:1710-1713`) — a completely separate producer from widget-instance
  resolution. `renderHtmlPageBody` reuses `renderWidgetIr` so an `"html"`-format Page's embed
  target and a resolved widget instance render through **one** function, but the IR reaching it
  comes from two different, unrelated resolution paths.

So "Widget IR" is not one catalog with one producer — it is one **consumer table**
(`WIDGET_IR_RENDERERS`, keyed by `componentId`) fed by **two independent producers**: the
widget-instance pipeline (`resolveWidgetType` → `CORE_RESOLVERS`, 5 types) and the Page-embed
pipeline (`resolver-service.ts`'s embed builders, 2 more ids, plus the nested `entry-summary`
child id). This matters for Section 4 below.

**Dispatched from:**
- `renderWidgetRegion` (`:1730-1737`) — a theme-declared region's resolved widget list.
- `renderWidgetIr` directly, from `renderHtmlPageBody` (Page embeds).
- Reached via `renderRegionBlock` → `BLOCK_TYPE_HANDLERS["region"]` (`:1900`, `:1916`) in the
  declarative tree, and via `renderBlockSeam`'s `props.region` branch (`:1850-1851`) in Liquid.

---

## 2. Why they were separated — principled, not incidental

The full comment at `render.ts:1377-1391` (verified in full, not excerpted):

> Widget IR rendering (SPEC-043/ADR-047 W-004) — renders `resolvePageWidgets`'s output
> (`WidgetRenderIR {componentId, props, children?}`), NOT theme-authored `TemplateNode` data.
> Deliberately a separate switch, not folded into `COMPONENTS`: `COMPONENTS`/`Component` resolve
> theme-authored `{type:"component", id, props}` nodes and have no concept of an IR's `children`
> array; widget IR is core-produced, closed-vocabulary data...

`SPEC-043`, `ADR-047`, `ADR-020`, `ADR-024`, `ADR-029` all exist and are real
(`ADS-memory/reports/architecture/ADR-047-widgets-region-and-embed-placement.md`, etc. — verified
present). ADR-047's own Context section (read in full) states the actual product reason a second
system exists at all: a **stateless block placed once in one template** (what `COMPONENTS` serves)
does not answer the motivating case — *"build one Contact Form … then place that same configured
instance on the Landing Page and, separately, on the Contact Page — edit it once, both placements
update."* That needs an entry with identity, referenced by placement, resolved server-side. A
`Component` function has no such identity: it is called synchronously, in-render, with whatever
props the theme JSON happened to supply that call.

**The deeper, verified distinction is not shape (flat vs. `children`) — it's *when and by whom
data is produced*:**

| | `COMPONENTS` | Widget IR |
|---|---|---|
| Data source | Theme-authored JSON, inline in the template/block | A seeded content entry (`type='widget'`, ADR-022), resolved separately |
| Resolution | Synchronous, in the render call itself | Async, batched, pre-resolved by `resolvePageWidgets` **before** the block walk starts |
| Identity / reuse | None — a literal value each place it's written | Real identity — same instance placeable on N pages, edited once (ADR-047's whole reason to exist) |
| Validation | None (ad-hoc per function) | `configSchema` (JSON-Schema-shaped, `registry.ts:87`), enforced on every write |
| Failure isolation | None needed — pure sync string function, can't hang or throw past its caller | `resolveWidgetType`'s try/catch + timeout wrapper (`resolvers/index.ts:134-179`), REQ-27/INV-05 — because a resolver *can* hang, throw, or exceed a cost clamp |
| Why `children` matters | Nesting is already handled by the surrounding `TemplateNode` tree (`doc`/content-doc vocabulary) — a `Component` never needs to carry its own children | An IR crosses an async boundary and must be a fully self-contained, serializable snapshot (list-shaped resolvers like `recent-entries` must ship their list *as data*, since nothing renders again after resolution) |

This is a coherent boundary, not drift. The comment is correct that `COMPONENTS` "have no concept
of an IR's `children` array" — but that's a consequence of the boundary above, not an arbitrary
gap: `COMPONENTS` doesn't need `children` because it lives inside a tree that already provides
nesting; Widget IR needs `children` because it's data that has left the tree.

**Verdict: the separation is principled.** I could not find evidence of drift (no duplicated
logic, no dead overlap, no accidental second implementation of the same concept) — only two
different producers or resolution timing, which the comment's stated reason accurately describes.

---

## 3. What each can and cannot express — the "testimonial" gap, verified real

Grepped both catalogs and every `Component` function body. Neither has an entry, nor fields on any
existing entry, that expresses an author/quote/avatar testimonial:

- `section()` (`:1333-1344`): `eyebrow/title/lead/body[]/bullets[]/actions[]/media` — no `quote`,
  `author`, `avatar`, or `rating` field, and no styling hook (`.section--media-left/-right` only).
- `featureGrid()` (`:1347-1359`): `items[]` of `{tag, title, body}` — no avatar/byline shape.
- No `WidgetTypeKey` member is presentational-quote-shaped either (the 5 are `text`,
  `social-links`, `recent-entries`, `menu`, `contact-form`).

"Testimonial" markup **does exist** in the repo — but only as literal, hand-authored HTML/CSS
inside individual **static-tier** theme exports (`src/themes/static/fuel/render/pages/index.html:169-174`,
`.testimonial-card`/`.testimonial-quote`/`.testimonial-byline` in `fuel/css/theme.css:274-289`,
similar in `tailark-quartz-*`). Static-tier themes are plain HTML/CSS files (ADR-020 Tier-1's
"trivial subset" note) — they never touch either closed vocabulary at all. That confirms rather
than refutes the gap: the only place "testimonial" exists today is *outside* both catalogs,
hand-baked per static theme, which is exactly what a closed vocabulary is supposed to make
unnecessary for the declarative/templated tiers. **The gap is real and first-party** — it exists
today, independent of any plugin question.

---

## 4. The real coupling cost

Checked `WidgetTypeKey`, `WIDGET_TYPE_REGISTRATIONS`, `CORE_RESOLVERS`, `WIDGET_IR_RENDERERS`, and
`COMPONENTS` for overlapping members, consumers, or shared types:

- **Members:** zero overlap. `COMPONENTS` keys are all `tovu/`-namespaced; `WIDGET_IR_RENDERERS`
  keys are bare strings (`text`, `menu`, …). Even as raw strings the two keyspaces are disjoint by
  construction, not just by convention.
- **Shared type:** none. `Component = (ctx, props) => string` vs. `(ir: WidgetRenderIR) => string`
  — different arity, different input shape. No common interface.
- **Shared producer:** none — confirmed in Section 1b, Widget IR itself has *two* internal
  producers that don't share code either (`CORE_RESOLVERS` vs. `resolver-service.ts`'s embed
  builders).
- **Shared consumer — yes, one level up.** `BLOCK_TYPE_HANDLERS` (`render.ts:1913-1918`) dispatches
  `"component"` → `renderComponentBlock` (→ `COMPONENTS`) and `"region"` → `renderRegionBlock` (→
  `renderWidgetRegion` → `WIDGET_IR_RENDERERS`) as **sibling branches of the same node-kind
  dispatch table**. Likewise `renderBlockSeam` (`:1849-1860`, the single Liquid `render_block` tag)
  branches on `props.region` vs. `props.component` to reach the same two systems. So the two
  catalogs are already unified **at the block-authoring layer** — a theme author (or Liquid
  template) picks "component" or "region" as one decision, and both paths are already reachable
  from one seam. The catalogs are separate only at the *leaf* dispatch table, exactly where the
  comment says they should be.

**Cost of the split, honestly stated:** a plugin (or a future first-party author) wanting to
contribute something *purely presentational* — no state, no server-side resolution, exactly what a
"testimonial" card is — has no lightweight home. Adding it to `COMPONENTS` is free (it's core-only
today, so this only applies to a first-party fix, not a plugin path — see Section 5). Adding it as
a widget type means authoring a full `WidgetTypeRegistration` (`configSchema`, `capability:
"static"`, `placementContexts`, `clamps`) plus a content-entry row and admin UI, for something that
needs none of the entry/reuse/resolution machinery ADR-047 built. That's real overhead, not free —
see the counter-argument in the Recommendation section below.

---

## 5. Which is the better plugin-extension foundation

`src/widgets/registry.ts:11` (verified, full sentence): *"type registration is data (Tier-1-safe,
this file); type behavior is core-owned code in v1, ADR-024 Tier-2/3-gated for any future
plugin-contributed dynamic type (`resolvers/`)."* This is an existing, explicit forward reference
to plugin extension — and it already ships the infrastructure a plugin surface needs:
`configSchema` validation, a `capability` class, per-type cost `clamps`, a closed `resolverId`
indirection (`CORE_RESOLVERS`, never a dynamic import/eval — REQ-08), and a mandatory try/catch +
timeout isolation boundary (`resolveWidgetType`, REQ-27/INV-05) that already treats "this code
might hang or throw" as a first-class case.

`COMPONENTS` has **none of that today** — no schema, no capability classing, no clamp, no
isolation boundary; each `Component` is trusted core code called synchronously with zero guard
rail. There's a comment at `render.ts:1063` ("A theme can arrange these by id; it cannot define
new ones (that is a plugin)") that reads as pointing plugin extension at `COMPONENTS` — but that
predates ADR-047 and the debate's Result 2, and taking it literally would mean invoking untrusted
plugin render functions **synchronously, in the render path, with no timeout and no schema check**
— exactly the isolation gap `CORE_RESOLVERS` was built to close. Result 2's unanimous
`{componentId, props, children?}` contribution shape is *already* `WidgetRenderIR` verbatim, and
its Tier-2/3 language ("register new ids via a reviewed resolver inside its isolation boundary")
is a description of `CORE_RESOLVERS`, not of anything `COMPONENTS` has.

**The widget-type-registry path is the better foundation, decisively — not close.**

---

## Recommendation, in full

**Ratify the split**, with this rule, so "extend the widget seam" stops being ambiguous:

1. **A component id belongs in `COMPONENTS`** when it is purely presentational, synchronous,
   theme-authored, and core-owned only — no independent identity, no reuse-by-reference across
   pages, no server-side resolution. It stays closed to plugins in v1 (unchanged from today).
2. **A component id belongs in the widget-type registry** (`WidgetTypeKey` +
   `WIDGET_TYPE_REGISTRATIONS` + `CORE_RESOLVERS` + `WIDGET_IR_RENDERERS`) when it is a placeable,
   referenceable, centrally-editable unit — even a `capability: "static"` one with no resolver —
   because that is the seam with schema validation, tier gating, and isolation already built.
3. **The plugin extension seam (Tier-1/2/3, per Result 2) attaches only to (2), generalized with
   `origin`/`tier`/`capability` per the SYNTHESIS's Result 1 provenance model — never to
   `COMPONENTS` directly.** Do not build a plugin path into `COMPONENTS`; it would mean
   re-inventing `CORE_RESOLVERS`'s isolation guarantees a second time, for a weaker result.
4. **Fix `render.ts:1063`'s comment** ("that is a plugin") — it currently points a future reader at
   the wrong catalog. Repoint it at the widget-registry seam, or delete the "(that is a plugin)"
   clause, so this exact ambiguity can't recur from the code's own comments.
5. **Close the testimonial gap as a first-party fix**, independent of plugins: add
   `tovu/testimonial` to `COMPONENTS` (matches Rule 1 — no state, no reuse-by-reference need was
   reported) unless product wants a "recent reviews" dynamic variant later, which would be a
   `WidgetTypeKey` addition instead.
6. Document `WIDGET_IR_RENDERERS`'s two-producer shape (Section 1b) somewhere near its definition —
   `entry-summary`/`media-image`/`post-content` existing outside `WidgetTypeKey` is fine, but
   undocumented today, and the SYNTHESIS itself mis-stated it as "exactly five."

**Migration/breakage if this is adopted:** none — this ratifies present behavior and fixes one
comment plus adds one documentation note and one new `COMPONENTS` entry. Zero test impact beyond a
new unit test for `tovu/testimonial` if Item 5 is picked up.

### Strongest argument against this recommendation

Unifying would give **one** place to bolt on `origin`/`tier`/`capability` provenance instead of
two, and it would remove the real asymmetry in Section 4: today a plugin (or even a first-party
author) wanting something *stateless and presentational* has no lightweight path — only the full
widget-instance machinery (content entry, `configSchema`, admin UI, placement/region semantics)
even when nothing about it needs to be stateful. That is close to the exact mistake ADR-047's own
Context section warns against in reverse: forcing a genuinely stateless thing through a stateful
entity model, the same shape of error the original "shortcodes → superseded, blocks replace them"
call made once already (per ADR-047's Context section, verified above) and then had to be
partially reversed. If product's real appetite is heavily toward plugin-contributed *presentational*
components (cards, banners, testimonials) rather than data-backed ones, that argues for a **third,
lighter registration lane** — not a merge of the two existing catalogs, but a new `capability:
"static"`-only fast path that skips the content-entry requirement while still gaining schema +
isolation. That's a real option this proposal does not fully cost out; it would need its own
mini-ADR if the testimonial gap turns out to be one of many, not one.

### What would change my answer

If a second or third concrete "purely presentational, plugin-wanted, no state" gap shows up
alongside "testimonial" (i.e., this isn't a one-off), that tips the balance toward building the
lighter static-only lane described above rather than just adding one-off `COMPONENTS` entries
forever. One data point isn't enough to justify that lane's cost yet.
