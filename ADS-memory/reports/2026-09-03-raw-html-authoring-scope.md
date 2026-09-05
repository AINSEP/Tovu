# Scoping: Raw-HTML Authoring Mode for Menus (and generalization)

**Loaded `AI-Dev-Shop/agents/system-design/skills.md` before starting, as instructed.** Confirmed present and read.

Scoping only. No code written, no commits made. All claims below carry `file:line` evidence from the live
`Tovu` repo (branch `restructure/apps-website-phased`) unless marked `unverified`.

---

## 0. Headline finding: the owner's stated motivation may already be solved

The brief's stated reason for wanting raw HTML is "being able to attach things the builder cannot express,
e.g. his own CSS classes." That is **already a first-class field in the write schema that the admin UI
simply never exposed**:

- `NavItemAttrs.cssClass` exists in the shared type today —
  `/Users/la/Programming/Jini/packages/cms/src/navigation/types.ts:109` (also `description`, `icon`,
  `openInNewTab`, `rel` on the same interface, `types.ts:104-115`).
- The **read/render side already consumes it**: the static-tier renderer puts `item.attrs?.cssClass ?? ""`
  directly into the `<li>` class list —
  `apps/website/src/features/theme/static-render.ts:206`.
- The **admin UI exposes none of it**. `MenuEditor.tsx` has zero references to `attrs`, `cssClass`,
  `description`, `icon`, `rel`, or `openInNewTab` anywhere in the file (`grep` returned no hits against
  `apps/admin/src/features/menus/MenuEditor.tsx`). Today's item row is label + target-kind select
  (URL/Route/Entry/Term) + kind-specific value field only (`MenuEditor.tsx:46-177`).

**Implication:** a one-field addition ("CSS class" text input per item row, wired to
`item.attrs.cssClass`) delivers the owner's literal example with no new data model, no new render path, no
new source-of-truth question, and no new security surface. This is worth doing regardless of what happens
with raw HTML, and should be surfaced to the owner before scoping the bigger feature further — it may
change what he actually wants.

---

## 1. How menus work today, end to end

**Data model (ADR-029, ACCEPTED 2026-07-10):** a menu is a seeded `menu` content-type entry, not a
separate table. The ordered/nested tree lives in the entry's `bodyJson` as
`{ type: 'menu', version, items: NavItemNode[] }`
(`ADS-memory/reports/architecture/ADR-029-menus-navigation.md:63-68`). Each `NavItemNode` has a stable ULID
id, `label`, a **discriminated `target`** (`url | route | entryRef | termRef`), optional `attrs`, and
`children`. There is no HTML field anywhere in this shape.

**Write path:** `PUT /api/admin/v1/workspaces/:workspaceId/menus/:menuId` →
`registerAdminMenuUpdateTreeRoute` (`apps/website/src/server/inbound/admin-http/routes/menus/update-tree.ts:65-115`).
The body is hard-typed as `{ items: NavItemNode[], expectedVersion, title?, slug? }`
(`update-tree.ts:14-30`) — `items` **must be an array**; there is no raw-string escape hatch. It runs
`updateMenuTree` which does bounded/total tree validation (`MenuValidationError`) and OCC on
`expectedVersion` (`update-tree.ts:32-48, 98-108`). **Authorization is real and granular**: `admin.menus.update`
checked via `deps.authorize()` before the write (`update-tree.ts:82-96`); sibling routes check
`admin.menus.read` (`get-by-id.ts:21`, `list.ts:27`), `admin.menus.assign` (`assign-location.ts:40-49`), and
`admin.menus.delete` / `admin.menus.delete.force` (`delete.ts:22-31,74-83`). This is materially **better**
authorization coverage than Pages' HTML route has (see §4) — menus already have per-action permissions, not
one blanket gate.

**Admin UI:** `MenuEditor.tsx` (`apps/admin/src/features/menus/MenuEditor.tsx:247-347`) + its hook
`use-menu-editor.hooks.ts` (`apps/admin/src/features/menus/hooks/use-menu-editor.hooks.ts`) implement the
structured tree editor: path-addressed helpers `mapAtPath`/`removeAtPath`/`moveAtPath`/`getChildrenAtPath`/
`setChildrenAtPath` (`use-menu-editor.hooks.ts:60-120`) back `addRootItem`/`addChildAt`/`moveAt`/`removeAt`/
`changeAt` (`use-menu-editor.hooks.ts:226-240`). The target-kind `<select>` already offers all four kinds —
URL, Route, Entry, Term (`MenuEditor.tsx:174-177`) — not only "URL" as the brief described; worth a quick
correction with the owner.

**Render paths — THREE separate implementations, confirmed by direct trace, not the "three paths" memory
about Pages (which is about live/preview/GrapesJS canvas — a different divergence for a different feature):**

1. **Widget-IR renderer** (declarative/code-tier themes, and any `"menu"` widget instance placed in a
   region). Dispatch table `WIDGET_IR_RENDERERS` — `render.ts:1932-1941` — `menu: (ir) =>
   renderWidgetMenu(ir.props)`. `renderWidgetMenu` → `renderWidgetMenuItems` (`render.ts:1510-1525`), which
   escapes every label/href via `escapeHtml`/`safeHref` (`render.ts` callees, confirmed via
   `trace_path(renderWidgetMenuItems)`). Feeds off `createMenuResolver`
   (`apps/website/src/features/widgets/resolvers/menu.ts:47-81`), which calls `resolveMenuDoc` — a pure
   data transform, zero HTML awareness.
2. **Static-tier's own bespoke string-templating renderer** — `apps/website/src/features/theme/static-render.ts`.
   This is a **second, independent implementation** with its own `escapeHtml` (`static-render.ts:150-157`,
   textually duplicated from `render.ts`'s), its own flat-vs-tree variant switch
   (`renderMenuLinks`/`renderMenuTree`, `static-render.ts:168-244`), its own availability rules ("differs
   from the flat renderer's on purpose" — leaf omitted, branch kept as inert text, `static-render.ts:193-196`),
   and its own marker convention (`{"type":"menu"}` embeds resolved via `injectMenuEmbeds`,
   `static-render.ts:259-270`, consuming a locally-defined `StaticMenuItem` shape, `static-render.ts:138-148`).
   **Static-tier themes have no widget-region support at all** — `grep` of `static-render.ts` for marker
   types found only `MENU_MARKER_TYPE` and `PARTIAL_MARKER_TYPE`, no widget marker (see §5, this matters for
   Widgets' generalization verdict).
3. **Static export** (`apps/website/src/platform/export/site-exporter.ts`) is **not** a third render
   implementation — `writeContentRoute`/`exportFetch` (`site-exporter.ts:511-535`) crawl the **live running
   server** over real HTTP and save the response bytes. So static export reuses paths #1/#2 verbatim; it
   adds no new render logic to reason about, only a "does this survive being served from static files"
   question (answer: yes, since it's just captured bytes).

Liquid/templated-tier menu rendering was not fully traced in this pass (found `siteNav`/`buildTemplateRenderData`
in `render.ts` but did not confirm whether it shares the resolved-`ResolvedNav` model with path #1 or has its
own logic) — **unverified**, flagged for whoever picks this up next, but ADR-029 §7 states intent that
"the theme sees only the resolved, sanitized `ResolvedNav` model... templated (Liquid) tier via a `nav` drop
over the same model" (`ADR-029-menus-navigation.md:173-174`), i.e. it is *designed* to share model #1, not add
a fourth implementation.

**Net:** a raw-HTML representation of a menu is not a one-place change. At minimum, paths #1 and #2 (two
independently-maintained functions with independently-maintained escaping) need a real branch each to handle
"this menu has no item tree, splice this markup instead" — and neither was written with that case in mind.

---

## 2. Source of truth: replace or round-trip?

**Recommendation: mode flag, one representation authoritative at a time — not round-trippable.** This repo
already has the exact precedent, and it is instructive both for what to copy and what NOT to copy:

Pages' `bodyFormat` is a **destructive one-way mode flag**, not a projection. `ensureHtmlFormat`
(`html-document-store.sqlite.ts:207-259`, called from `update-html.ts:154`) converts a still-`"doc"` page to
`"html"` — and **the conversion drops `body_json`** (`update-html.ts:88-93`, the route's own doc comment:
"The conversion drops `body_json`"). There is no HTML→structured parser anywhere in this codebase, and
nothing attempts one.

**Why HTML→structured parsing is a trap for menus specifically, not just "hard":** a `NavItemNode` isn't
markup-with-styling, it's a **typed, integrity-tracked graph** — `entryRef`/`termRef` targets are extracted
into the `entry_refs` index at write time for where-used/safe-delete (ADR-029 §3,
`ADR-029-menus-navigation.md:82-100`), nesting depth is bounded/validated (§6), and ids must be stable across
edits (§6, "an update may not renumber surviving items"). Reverse-engineering that from `<a href="/blog/foo">
Blog</a>` markup would require guessing which anchors are `entryRef` vs `url`, inventing new stable ids for
every parsed node (breaking the "never renumber" invariant on the very first parse), and reconstructing
nesting from arbitrary author-written DOM structure. This is not merely unimplemented, it's **structurally
ambiguous** — the same class of one-way conversion Pages already accepted losing.

**Recommended shape:** add a `bodyFormat: "items" | "html"` flag on the menu entry (mirrors Pages' own field
name for immediate internal consistency), a raw-HTML sibling to `items` in `bodyJson`, and:
- Switching `items → html` is a **display-only view swap**, not a delete — keep the last-known `items` tree
  untouched in storage so switching back is lossless, UNLESS the operator then edits and saves in HTML mode,
  at which point the `items` tree is stale and should be dropped explicitly (matching Pages' precedent,
  but only losing data on an actual write, not on a tab click). This is strictly better than Pages' own
  behavior, which loses `body_json` on the read-side conversion call, before any HTML is even typed.
- The location-binding index (`nav_location_bindings`, ADR-029 §4) and `entry_refs` extraction are entirely
  **items-mode-only** — an HTML-mode menu can't be a `where-used` target and can't participate in safe-delete
  signaling. This must be stated as an explicit, disclosed limitation (same posture as `update-html.ts`'s own
  header disclosing its gaps), not silently accepted.

**A cheaper alternative that avoids this whole question — worth raising with the owner before committing to
the bigger feature:** ADR-029 §9 already reserves `target.kind='content'` as a **deferred seam** for
"mega-menu / rich-content items" (`ADR-029-menus-navigation.md:215`). That is a **per-item** rich-content
slot inside the existing tree — ordering/nesting/children stay real and structured, only one item's payload
becomes rich content — rather than a whole-menu mode switch. It has no source-of-truth ambiguity (the tree is
still the tree), no lossy conversion, and was anticipated by the accepted architecture already. If what the
owner actually wants is "let one menu item render something the four target kinds can't," this is very
likely the righter-sized answer than a second whole-menu authoring mode.

---

## 3. Hidden problems

- **Nesting/ordering loss on mode switch.** Covered above — recoverable if `items` is retained until an
  actual HTML-mode save; not recoverable (matching Pages) once one happens.
- **Embed-marker interaction.** Menus don't participate in the Page/widget embed-marker system
  (`apps/website/src/features/widgets/html-embeds.ts`) at all today — that system is Pages-`body_html`-only.
  A raw-HTML menu would need its own decision: does it get embed markers (so an author can drop a
  `{"type":"widget",...}` marker inside menu HTML)? If yes, it's a **third** consumer of
  `core/embeds/marker.ts` alongside Pages' whole-element-replace convention and static-tier's
  wrapper-preserving `injectMenuEmbeds` convention (`html-embeds.ts:39-47` vs `static-render.ts:252-253`
  document that these two already use *different* splice semantics for the same marker grammar) — a menu
  HTML mode would have to pick one, and picking wrong reproduces exactly the "four regexes had already
  drifted" problem the 2026-08-10 unification fixed (`html-embeds.ts:16-21`).
- **Theme/CSS interaction.** The static-tier renderer emits structural hook classes themes' CSS depends on —
  `menu-item`, `depth-N`, `has-children`, `is-current`, `is-active` (`static-render.ts:199-210`) — purely
  from resolved structured data. Raw HTML bypasses this entirely: an author-typed `<nav>` gets none of these
  hooks, so any theme CSS keyed to them (active-state highlighting, submenu chrome) silently stops working
  the moment a menu switches to HTML mode. Since themes are **copied, not inherited**, and an upgrade
  destroys themes (per project memory), there's no single place to fix this for "all themes" later — it's a
  per-theme authoring burden the owner would take on with every HTML-mode menu.
- **Caching/invalidation.** Not a new problem: outbox events `navigation.menu.updated` (ADR-029 §8) fire on
  any menu mutation regardless of body format, so existing invalidation is unaffected. Genuinely low risk
  here — flagging only because it was asked for.
- **SSR/static-export.** Confirmed no new handling needed for export itself (§1, point 3) — but static-tier
  rendering (§1, point 2) needs a real code branch: `injectMenuEmbeds` currently only knows how to turn
  `StaticMenuItem[]` into `<ul>`/`<a>` strings; it has no path for "here's a markup string, splice it
  verbatim." That's a required, not optional, change to ship HTML-mode menus on any static-tier theme.
- **Anonymous render cost / cacheability (ADR-029 §Open item 6).** Unaffected by HTML mode specifically —
  raw HTML is still principal-independent unless the owner starts writing per-user Liquid/logic into it,
  which the design should explicitly forbid (raw HTML, not raw template code) to avoid reopening that
  ADR-029 open question.

---

## 4. Security — first-class, per the owner's ask

**This is a net-new stored-XSS surface for menus, not a variant of an existing safe one.** Menus today carry
**zero** unescaped-content risk: every renderable field is either a validated discriminated `target` or a
`label`/`attrs.description` that both render paths run through `escapeHtml` (`render.ts` `escapeHtml`/
`safeHref`; `static-render.ts:150-157,218-226`). Raw HTML mode removes that guarantee by definition — the
whole point is author-typed markup reaching the public site unescaped.

**The closest precedent in this repo is Pages' HTML body, and it is explicitly an unresolved trust hole, not
a proven-safe pattern to copy:**
- `registerAdminPageUpdateHtmlRoute`'s own doc states **"No HTML sanitization. The stored markup is rendered
  into the public site... the published page is not sandboxed... it needs a real decision before Pages ships
  to anyone but the site's own admins."** (`update-html.ts:122-125`).
- Until 2026-08-10 this same route checked **no per-action permission at all** (`update-html.ts:99-101`) — it
  now checks `content.write` only, which the same doc admits is **not** the intended `pages.edit_html`
  distinction (blocked on a missing permission-catalog seed row, `update-html.ts:103-114`).
- `scanHtmlEmbeds`/`substituteHtmlEmbeds` (`html-embeds.ts`) explicitly do **not** re-validate attribute
  values for injection safety — by their own doc, "nothing this file does widens that trust boundary"
  because the boundary was already crossed by `update-html.ts` (`html-embeds.ts:49-56`).

So "reuse Pages' HTML handling" is not a safe reuse — it's importing a known, disclosed, deliberately-deferred
gap. If Menus get a raw-HTML mode, it should **not** silently inherit Pages' no-sanitization posture; that
decision needs to be made explicitly for Menus (allowlist sanitizer at write time, e.g. DOMPurify-on-server,
vs. accept the same disclosed risk Pages carries) rather than copied by default.

**No sanitization library found in this repo today.** The `search_graph` sweep for
sanitize/DOMPurify/dangerouslySetInnerHTML surfaced only `sanitizeCommentBody` (comments feature, a
different, narrower concern — link-counting/moderation, `apps/website/src/features/comments/sanitize.ts:13-19`)
and unrelated `sanitizeGoogleSchema*` (LLM tool-schema sanitization, unrelated domain). **There is no existing
HTML-sanitization precedent to reuse in this codebase at all.** Building one is real, uncounted work this
feature would need to add, not something "Pages already solved."

**Who can author menus, verified current state:** the admin-side RBAC is real (blanket
`requireAdminSession` gate + granular per-action `authorize()`, confirmed in §1 above) — this is **not** the
decorative member-gating path. `MemberAccessResolver.decide()` (public/member visitor gating) has zero
production call sites (`project_tovu_authz_real_members_decorative` memory, independently plausible given
menus have no member-facing write path at all) — **irrelevant here**, since nothing about menu authoring
touches the member system. Menus already have stronger native authorization granularity than Pages'
HTML route does (`admin.menus.update` etc. vs. Pages' single `content.write`), so a new
`admin.menus.edit_html` permission is a smaller, more natural lift here than the equivalent
`pages.edit_html` gap Pages has been carrying unresolved.

**Pages and Posts are confirmed NOT symmetric, do not assume otherwise:** Posts have **no** HTML write route
at all — `posts/update.ts` only accepts `title`/`slug`/`bodyJson`/`status`/`templateChoice`/
`overridesThemePage`, no `bodyHtml`, and `PostEditor.tsx` has no HTML tab (per project memory, plausible and
consistent with the render-side-only support documented there). Do not reason from "Pages already has raw
HTML" to "so does Posts" or "so Menus reusing that pattern is proven" — it is proven to exist, not proven
safe.

---

## 5. Generalization verdict, per surface

| Surface | Verdict | Why |
|---|---|---|
| **Menus** | Build, smallest first slice | Structured tree already exists; source-of-truth question is answerable (mode flag); but touches 2 independent render implementations + needs a first-ever sanitization decision. Medium risk, real owner-stated value — though §0's cssClass fix may cover the actual ask cheaper. |
| **Widgets** | **Better candidate than Menus, structurally** | A "custom HTML" widget type is a **6th entry in an existing data-driven registry** (`WIDGET_IR_RENDERERS`, `render.ts:1932-1941`) — additive, one lookup entry, reuses existing widget instance/config/region/permission machinery (`requireWidgetPermission`, `authorize-helper.ts:30-44`) wholesale. **Crucially, static-tier themes have no widget-region support at all** (confirmed: no widget marker type in `static-render.ts`) — so unlike Menus, a raw-HTML widget type sidesteps the whole "second render implementation" problem. Same sanitization decision still applies, and is arguably *more* dangerous here since `WIDGET_IR_RENDERERS`' `renderWidgetIr` is shared infrastructure invoked from region rendering, TipTap `widgetEmbed`, and Pages' `data-embed-type` resolution alike (`render.ts:1949-1952`) — one bad entry reaches three call sites, not one. |
| **Categories / Tags** | **Does not generalize — no target exists** | Confirmed via `content-types` routes: Collections/taxonomy are **schema definitions** (field registration, `content-types/register.ts`, `content-types/update-fields.ts`), not documents with a rendered body. A category/tag has name/slug/description, not a page body a "raw HTML tab" would be an alternative representation of. If the owner means "an intro/description blurb on a term's archive page," that's a **different, unscoped feature** (a new field, likely small), not an extension of this design. Do not build this as stated. |
| **Collections** | **Does not generalize, same reason as Tags** | Same finding — a Collection is a content-type definition, not an entry. Individual **collection entries** (rows within a collection) already ride the same ADR-022 universal-columns/`bodyFormat` substrate Pages uses, so an entry could in principle get the identical Pages-style HTML path — but that is "give collection entries an HTML mode," a materially different ask than "collections get raw HTML," and should be scoped separately if that's what's actually wanted. |
| **Forms** | **Do not build — different problem, correctly flagged by the owner** | A Form is not a display surface, it's a submission pipeline: field schema, validation, storage, and a POST target. Raw `<form><input name="...">` HTML has no schema behind arbitrary `name` attributes, so it cannot honor validation/storage without a second, unbuilt "map raw field names to the form schema" mechanism — a bigger, separate project, not a variant of the Menus design. Lowest value/risk ratio of the five; the owner's own instinct that Forms is different is correct. |

**Ranked by value ÷ risk:** Widgets ≥ Menus (own cssClass fix covers much of the stated want more cheaply)
≫ Collections/Categories/Tags (no real target — different, smaller, unscoped asks if anything) ≫ Forms
(wrong shape of problem entirely).

---

## 6. Build recommendation

**Do not build a whole-menu raw-HTML mode as the first move.** Ship, in order:

1. **`attrs.cssClass` (and `description`/`icon`) input on the existing item row.** Zero new call sites in
   the render pipeline (data already flows through), one new UI field + one hook wire-up in
   `use-menu-editor.hooks.ts`. Directly answers the owner's own example. Trivial size by call sites (one
   `<input>`, one `onChange` threading through the existing `changeAt`/`mapAtPath` machinery already in
   `use-menu-editor.hooks.ts:60-120,226-240`).
2. **If, after seeing that, the owner still wants free-form markup:** scope `target.kind='content'` (the
   already-reserved per-item seam, ADR-029 §9) before scoping a whole-menu mode switch. Smaller blast
   radius, no source-of-truth question, no lossy conversion, one item at a time.
3. **Only if the owner explicitly wants whole-menu authoring freedom (not just one rich item):** the
   `bodyFormat` mode-flag design in §2, sized by call sites:
   - 1 schema field (`bodyFormat`) + 1 new bodyJson shape variant.
   - 1 new admin route (mirror `pages/update-html.ts`) — cannot reuse `update-tree.ts`, its body shape is
     hard-typed to `items: NavItemNode[]` (`update-tree.ts:14-30`).
   - 2 render-path branches: `renderWidgetMenu` (`render.ts`) and `injectMenuEmbeds`
     (`static-render.ts:259-270`) each need an "HTML mode, splice verbatim" case.
   - 1 new admin permission (`admin.menus.edit_html`, following the granular convention this route family
     already uses) — smaller lift than Pages' equivalent gap since the permission-scheme convention already
     exists here.
   - 1 sanitization decision + (if allowlist-sanitize is chosen) 1 new dependency — **this repo has no
     existing HTML sanitizer to reuse**, so this is real, uncounted work, not a reuse of Pages'
     (unsanitized) precedent.
   - Roughly 6-8 call sites total. This is a contained, additive slice — no port/architecture changes, no
     touching `NavLocationBindingRepoPort` or `entry_refs` (both stay items-mode-only, explicitly disclosed
     as a limitation).

**Before extending past Menus:** confirm the Liquid-tier menu rendering question left `unverified` in §1 (does
it share `ResolvedNav` or is it a fourth implementation) — that changes the branch count in step 3 above by
one if it turns out to be independent. For Widgets specifically, the "custom HTML" widget type is genuinely
the cheaper, more modular build (reuses more, touches fewer render implementations) and could reasonably be
sequenced *before* Menus' whole-mode-switch version if the owner is comfortable prioritizing by architecture
cost rather than the order he mentioned them in.
