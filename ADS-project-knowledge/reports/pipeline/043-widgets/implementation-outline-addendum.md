# Implementation Outline Addendum: widgets — routes/UI/AI-tools slice

- Spec: SPEC-043 v1.0.0; UI Contract: `ui.spec.md` (produced this dispatch, see companion report)
- ADR: ADR-047 (widgets-region-and-embed-placement), debate-cleared 2026-07-21, audit still owed
- Base outline: `implementation-outline.md` (PRODUCED 2026-07-21, Software Architect stage, domain layer)
- Status: PRODUCED (addendum — does not replace the base outline; extends it for the slice the base
  outline's own "Not started" / "Downstream Handoff Notes" sections explicitly deferred)
- Date: 2026-07-21
- Author: Coordinator (Claude Sonnet 5), dispatched sub-agent, direct

> Scope of this addendum: the three things the Coordinator's dispatch prompt asked this sub-agent to
> *locate* before any code is written — the TipTap `widgetEmbed` extension registration point, the
> site-render pipeline injection point for `resolvePageWidgets` (W-004), and the admin-route file map
> for widget CRUD/region mutation/AI tools. Per the dispatch's explicit instruction, **no
> implementation code was written** — this is a File Map + findings document only, produced alongside
> `ui.spec.md`, both awaiting the same human spec-approval checkpoint before TDD/Programmer proceed.

---

## 1. Render-pipeline injection point (resolves the base outline's W-004 "TBD")

**Located.** The live site-render call chain is exactly one path, confirmed by exhaustive grep (no
other caller of `renderSite` exists anywhere in `src/`):

```
src/server/routes/site/pages.ts
  → GET "/"        (home route)
  → GET "/:slug"    (post route, catch-all registered last)
  both call:
src/server/http/site/render.ts :: renderSite({ theme, route, siteTitle, posts, post })
  → returns the final HTML string (declarative-tier block walk, or the LiquidJS sandboxed
    "templated"-tier path via renderLiquidInSandbox)
```

`resolvePageWidgets` (`src/widgets/resolver-service.ts`, already implemented, C-004) should be called
from inside `renderSite()`, before either the declarative `renderBlock()` walk or the
`renderLiquidInSandbox()` call, and its `{ regions, inlineResolved }` result threaded into
`SiteRenderContext` (or a new sibling context object) so:
- the declarative tier's `renderBlock()` can resolve a future `{"type":"region","key":"footer"}`
  template-node kind against `regions[key]` (a **new** template-node kind — none exists today, see
  Finding 1a below), and
- the Liquid tier's existing `{% render_block %}` tag (`liquid-worker.ts`) can be extended to accept
  region-shaped input the same way, and
- both tiers' content-doc walk (`renderDocNode`) can resolve a `widgetEmbed` doc node against
  `inlineResolved` (a **new** doc-node case in `renderDocNode`, alongside `paragraph`/`heading`/etc. —
  REQ-21).

**Finding 1a — a real, disclosed gap beyond what the base outline anticipated: theme-declared regions
do not exist as data anywhere in the live codebase.** `ThemeManifest`
(`src/features/theme/theme.ts`) has no `regions` field — only `templates`/`liquidTemplates`/`tokens`/
`fonts`/`tier`. Grepping `\bregion\b` across `src/features/theme` and `src/server/http/site` (excluding
the widgets package itself) returns zero matches. This means REQ-13's "seed a `widget_area` entry for
every region a theme declares, on theme activation" has no live trigger to hang off of — there is no
"theme activation" event that enumerates region keys today, because nothing declares them.

This is **not** something this addendum resolves — it is a real product/architecture decision (does a
region key list live in `theme.json` as new manifest data, mirroring how `templates/` already works?
or is v1's region set a small, core-hardcoded constant like `["header","footer"]` regardless of theme,
since `COMPONENTS` already ships fixed `tovu/site-header`/`tovu/site-footer` components?) that touches
`src/features/theme/theme.ts`, a file outside this feature's domain-layer scope and outside a UI-spec
sub-agent's authority to decide unilaterally. **Flagged for the Coordinator to route to a Software
Architect pass (or an explicit owner call) before the Programmer stage wires W-004** — `ui.spec.md`
§9 works around it for the *admin UI* (a free-text region-key bind, mirroring `Menus.tsx`'s location
assignment) without needing this resolved first, but the *public render* side (W-004 itself) does need
it resolved, since `resolvePageWidgets`'s `resolvedRegions` input has to come from somewhere real.

**Finding 1b — `renderSite()` only serves two routes (`home`, `post`) today.** There is no generic
"serve any entry type" site route yet (`src/server/routes/site/` has no `pages`-as-in-Pages-content-
type route, no collection-entry public route) — despite `apps/admin/src/sections/Pages.tsx` and
`Collections.tsx` existing in the admin app. REQ-18's "insertable anywhere within any entry's
`bodyJson`" is an authoring-time claim (true today — any entry type can carry a `widgetEmbed` node in
its TipTap body) but REQ-21's "resolve every `widgetEmbed` node... before that entry's content reaches
the theme" can only actually fire today for entries reachable through `renderSite`'s `home`/`post`
paths, since those are the only two live render call sites. Any future generic entry-serving route
must independently call `resolvePageWidgets` the same way — this is not a widgets-feature gap, it's an
existing site-render-pipeline scope limit (`render.ts`'s own file header still calls itself a "SPEC-004
spike slice") that widgets inherits, disclosed here rather than silently assumed away.

---

## 2. TipTap `widgetEmbed` extension registration point (resolves the base outline's "exact file TBD")

**Located — two separate call sites, no shared module today:**

| File | Current `extensions` array | Line |
|---|---|---|
| `apps/admin/src/sections/PostEditor.tsx` | `[StarterKit, Image]` | `useEditor({...})`, ~line 124 |
| `apps/admin/src/sections/CollectionEntryEditor.tsx` | `[StarterKit]` | `useEditor({...})`, ~line 176 |

`CollectionEntryEditor.tsx`'s own file header already discloses it duplicates a trimmed subset of
`PostEditor.tsx`'s TipTap wiring rather than sharing a module, for an unrelated prior scope-boundary
reason (that dispatch's touch-file list didn't include `PostEditor.tsx`). This addendum does **not**
propose extracting the two editors into one shared `RichTextEditor.tsx` (out of this feature's scope,
same as that prior disclosure) — but a new node type is different from reusing an existing one: adding
the same hand-written `WidgetEmbed` Node definition twice, independently, in two files would be a real
maintenance hazard (REQ-19/20's guardrail *UX* affordances would drift between the two editors even
though the real enforcement is server-side).

**Recommended file map (Programmer decision to confirm, not a spec change):**

| File | Creates | Notes |
|---|---|---|
| `apps/admin/src/lib/widget-embed-extension.ts` | The shared TipTap `Node.create({ name: "widgetEmbed", group: "block", atom: true, ... })` definition + its `addNodeView()` React node view (renders `WidgetEmbedNode`'s node-view contract, `ui.spec.md` §3.10/§4.9) | One definition, imported into both editors — avoids the exact two-copies-drift risk named above |
| `apps/admin/src/sections/PostEditor.tsx` | changes | `extensions: [StarterKit, Image, WidgetEmbed]`; toolbar gains an "Insert widget" button (`ui.spec.md` §4.9 `onInsertRequest`) |
| `apps/admin/src/sections/CollectionEntryEditor.tsx` | changes | `extensions: [StarterKit, WidgetEmbed]`; same toolbar addition — this file currently has no `Toolbar` component at all (`PostEditor.tsx`'s `Toolbar` is not imported here), so "Insert widget" needs its own minimal trigger control in this file, not a shared `Toolbar` import (consistent with this file's existing disclosed scope boundary) |

---

## 3. Admin routes file map (mirrors `routes/admin/menus/` + the now-current server-module convention)

**Correction to the base outline's File Map:** the base outline's `src/server/app.ts` row ("Imports +
registers the widget route registrars") was written the same session the ADR-046 Phase 3 server-module
migration was completing elsewhere in the codebase (see this repo's git history: "Merge
feat-042-server-module-sixth-slice: ADR-046 Phase 3 complete (SPEC-038–042)", landed same day). By the
time of this addendum, **every** admin section registers through a `src/server/modules/<name>.ts`
factory returning a `ServerModuleHandle` (`registerRoutes(app)` + optional `start()`/`bootModule`),
called once from `app.ts` as `create<Name>Module(deps).registerRoutes?.(app)` — see
`src/server/modules/menus.ts` and its call site in `app.ts`. Widgets should follow this **current**
convention, not the raw-registrar-list-in-`app.ts` pattern the base outline described before that
migration completed.

| File | Creates | Mirrors | Notes |
|---|---|---|---|
| `src/server/http/admin/widgets.ts` | DTOs (`toAdminWidgetResponse`, `toAdminWidgetAreaResponse`) + `WidgetRouteDeps` type (`extends RouteDeps`, adding `widgetBindingRepo: WidgetRegionBindingRepoPort`, `entryRefsRepo: EntryRefsRepoPort`) + `WidgetRouteRegistrar` type | `src/server/http/admin/menus.ts` | Serialization + wiring-seam declarations only, no domain logic — same split `menus.ts` already establishes |
| `src/server/routes/admin/widgets/list.ts` | `registerAdminWidgetListRoute` | `routes/admin/menus/list.ts` | GET, `widgets.read` |
| `src/server/routes/admin/widgets/get-by-id.ts` | `registerAdminWidgetGetRoute` | `routes/admin/menus/get-by-id.ts` | GET, `widgets.read`, includes revision history (REQ-04) and where-used count (REQ-34) |
| `src/server/routes/admin/widgets/create.ts` | `registerAdminWidgetCreateRoute` | `routes/admin/menus/create.ts` | POST, `widgets.create` → `createWidgetInstance` |
| `src/server/routes/admin/widgets/update.ts` | `registerAdminWidgetUpdateRoute` | `routes/admin/menus/update-tree.ts` (OCC pattern) | PATCH/PUT, `widgets.update` → `updateWidgetInstance`, `baseVersion` required |
| `src/server/routes/admin/widgets/trash.ts` | `registerAdminWidgetTrashRoute` | `routes/admin/menus/delete.ts` (non-force branch) | POST, `widgets.delete` → `trashWidgetInstance` |
| `src/server/routes/admin/widgets/purge.ts` | `registerAdminWidgetPurgeRoute` | `routes/admin/menus/delete.ts` (force branch) | POST, `widgets.delete` or `widgets.delete.force` → `purgeWidgetInstance`; maps `WidgetReferencedError` to `409` with the referencing list (`ui.spec.md` §8) |
| `src/server/routes/admin/widgets/regions-list.ts` | `registerAdminWidgetRegionsListRoute` | `routes/admin/menus/list.ts` | GET all `widget_region_bindings` rows for the workspace (`ui.spec.md` §3.6) |
| `src/server/routes/admin/widgets/region-bind.ts` | `registerAdminWidgetRegionBindRoute` | new (no menu-side analog — menus have no "seed a location" admin action, locations are assign-only) | POST, `widgets.place` → `bindWidgetArea`; backs `ui.spec.md` §4.5's `onBindRegion` free-text control |
| `src/server/routes/admin/widgets/region-get.ts` | `registerAdminWidgetRegionGetRoute` | `routes/admin/menus/get-by-id.ts` | GET one region's area entry + resolved placement list (`ui.spec.md` §3.7) |
| `src/server/routes/admin/widgets/region-mutate-placements.ts` | `registerAdminWidgetRegionMutatePlacementsRoute` | `routes/admin/menus/update-tree.ts` | PUT, `widgets.place` → `mutateWidgetAreaPlacements`, whole-list OCC (REQ-15) |
| `src/server/routes/admin/widgets/embed-insert.ts`, `embed-remove.ts`, `embed-reorder.ts` | server-side document-mutation routes (REQ-44) | new (ADR-016/Amendment 6 has no direct menus-side analog) | POST each, `widgets.place`, delegate to `embed-service.ts` C-007, same `validateWidgetEmbedMutation` C-008 guardrail as the live-editor path |
| `src/server/routes/admin/widgets/agent-tools.ts` | AI tool registrations: `widgets.place`, `widgets.create`, `widgets.remove`, `widgets.diagnose` (REQ-35/REQ-44) | `implementation-outline.md`'s own C-017 spec (unchanged from the base outline — restated here only to keep this addendum's file map complete) | Thin gateway clients, 1:1 to the C-005/C-006/C-007 functions + a read-only `diagnose` over `entry_refs` dangling state; same `authorize()` gate as human routes (INV-07) |
| `src/server/modules/widgets.ts` | `createWidgetsModule(deps: WidgetRouteDeps): ServerModuleHandle` | `src/server/modules/menus.ts` | Composes all registrars above via `registerRoutes(app)`; also a natural `bootModule` home for "register the widget-type registry at boot" if that needs an explicit boot-lifecycle participant rather than static import-time registration (registry.ts is currently static data with no boot step — likely no `bootModule` needed, confirm at Programmer time) |
| `src/server/app.ts` | changes | — | One line: `createWidgetsModule(routeDeps).registerRoutes?.(app);`, positioned near `createMenusModule(routeDeps)`'s call site — **not** a list of individual registrar calls, correcting the base outline's pre-migration description |

---

## 4. Summary of File Map deltas vs. the base outline

- **Superseded:** base outline's `src/server/app.ts` row ("Imports + registers the widget route
  registrars") → replaced by `src/server/modules/widgets.ts` (new) + a one-line `app.ts` change, per
  the now-complete ADR-046 Phase 3 server-module convention (Section 3 above).
- **Resolved:** base outline's "exact file TBD" for the TipTap extension → located both existing
  `useEditor` call sites; recommended one new shared extension file rather than two independent copies
  (Section 2).
- **Resolved:** base outline's "site-render pipeline file/function... not named here" for W-004 →
  located the single call chain (`pages.ts` → `render.ts::renderSite`); **partially** resolved — the
  injection *point* is found, but a real upstream data-availability gap (no theme-declared-regions
  source) is newly disclosed and still open (Section 1, Finding 1a). This is a **decision**, not a
  location problem, so it is escalated rather than guessed at, consistent with this project's "route
  the issue back to the owning stage" rule.
- **New, not in the base outline at all:** the full admin-route file map (Section 3) — the base outline
  named `src/server/routes/admin/widgets/*.ts` as a single generic row; this addendum expands it to the
  concrete per-endpoint file list, grounded in `ui.spec.md`'s component/event contracts so every admin
  UI action in that document has a named backing route.

---

## 5. Downstream Handoff Notes (addendum-specific)

- **Blocking for W-004 wiring specifically (not for TDD/Programmer starting the routes/UI slice in
  general):** Finding 1a (theme-declared regions) needs a Coordinator-routed decision — either a small
  Software Architect pass extending `ThemeManifest` with a `regions` field, or an explicit owner call
  to hardcode a v1 region-key constant — before the *public render* half of this slice (wiring
  `resolvePageWidgets` into `render.ts`) can be implemented correctly. The *admin* half (routes,
  library/editor/region-manager screens, TipTap embed authoring) has no such blocker and can proceed
  once `ui.spec.md` is approved.
- **TDD focus for this slice, once approved:** certify the admin route layer against the real HTTP
  routes + SQLite adapters (matches the base outline's stated integration-test bias), then the TipTap
  extension's pure guardrail-adjacent logic (client-side insertion rules are UX only, per `ui.spec.md`
  §5 — the authoritative guardrail test surface is still C-008, already certified per the base outline).
  No new test expectations are introduced for `resolvePageWidgets` itself (already certified) — only
  for its *caller* once Finding 1a is resolved and the actual `render.ts` wiring exists.
- **Open risks carried forward unchanged from the base outline:** OQ-01 (resolver timeout value),
  OQ-04 (Drizzle migration naming) — untouched by this addendum, still owed.
