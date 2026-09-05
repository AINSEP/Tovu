# Structured-or-HTML Authoring Paradigm + Arbitrary Custom Attributes

**Loaded `AI-Dev-Shop/agents/system-design/skills.md` before starting.** Confirmed present and read (both
this pass and the original).

Design only. No code written, no commits made, no tracked files modified. All claims carry `file:line`
evidence from the live `Tovu` repo (branch `restructure/apps-website-phased`) unless marked `unverified`.
Builds on `ADS-memory/reports/2026-09-03-raw-html-authoring-scope.md` (read in full) — corrections to that
report are called out inline where found, not silently fixed.

---

## REVISION PASS (2026-09-03, later same day) — owner has now answered the three open questions

The original pass (everything below this banner, unless marked `[REVISED]`) ended by asking the owner three
things (old §6). He has answered all three; this pass folds the answers in as a **targeted revision**, not a
rewrite. Sections touched are marked `[REVISED]` inline so a reader who saw the first version can find what
changed; everything else is unchanged and still stands.

**The three decisions:**
1. **Header Nav (Menus) is slice 1, not the widget `custom-html` type.** The owner was shown the
   structural-cost tradeoff explicitly and chose Menus anyway — it's the surface he actually wants to use.
   Not re-litigated. §5 is re-sequenced and Menus' slice is re-sized by call sites now that it's first.
2. **Wider attribute allowlist**: `role`, `title`, `tabindex`, `lang`, `dir`, `id` join `data-*`/`aria-*`.
   Still no event handlers, no `style`, no URL-bearing attributes. `id` and `tabindex` get real validation,
   not a blanket accept — §2.4 revised.
3. **Static-tier coverage is required for v1, both render paths.** This pass first mis-verified a related
   claim by reading the wrong copy of a theme file (template vs. the site's own deployed copy — themes are
   **copied per site, not inherited**, so the two can and do diverge), then had that corrected by a teammate
   and re-verified independently (`curl localhost:3000/`, plus reading both copies directly). The corrected
   finding: the owner's own live site copy of `basic` **does** already serve `variant:"tree"` on its header
   nav, so the five shipped `NavItemAttrs` fields are visible to him today — but the **template** copy that
   any new site or theme upgrade is built from is still flat, undocumented drift between the two. See the
   revised §0 entry below for the full correction with both copies' `file:line`s; §4.1/§5 keep the same
   recommendation (extend the flat renderer too) but for the corrected reason: fragility, not a live gap.

Also folded in: the menu-attrs work (five named `NavItemAttrs` fields exposed in the admin editor, both
widget-IR and static-tier tree renderer now honoring them) **shipped since the original pass**, in commits
`92494e7c` and `80e51b32`. Verified against HEAD, not trusted from the dispatch summary — see the new §0 entry.

---

## 0. Corrections to the prior report

- **The Liquid-tier question is now resolved, not merely narrowed.** The Liquid tier does **not** add a
  third menu-rendering implementation. `render.ts`'s file-level comment on `COMPONENTS` states plainly:
  "Exported for `liquid-worker.ts`: the `render_block` Liquid tag ... resolves against this same registry,
  so a Liquid theme and a declarative theme render identical output for the same component id"
  (`render.ts:1535`). `liquid-worker.ts`'s `render_block` tag literally calls `renderBlockSeam(siteCtx,
  props)` (`liquid-worker.ts:77-94`), the exact function declarative templates and the Handlebars tier's own
  `render_block` helper call (`render.ts:2076-2099`, doc: "Exported so the Liquid tag and the Handlebars
  helper are the same code rather than two implementations"). `renderBlockSeam` dispatches either to
  `COMPONENTS[id]` or, for a `region:` prop, to `renderWidgetRegion` → `renderWidgetIr` →
  `WIDGET_IR_RENDERERS` (`render.ts:1969-1990`). **The real Menu-entity-backed nav render path (the `menu`
  widget type, `renderWidgetMenu`, `render.ts:1630-1634`) is reached identically by declarative, Liquid, and
  Handlebars tiers through this one shared seam.** So the branch count for HTML-mode menus is confirmed at
  exactly **two** render-path implementations (the shared widget-IR function, and the static tier's own
  `injectMenuEmbeds`), not three — the prior report's estimate was already right; this closes the "unverified"
  flag rather than changing the number.

- **`tovu/nav` (`siteNav`, `render.ts:1432-1460`) is a different thing than the Menu entity and is a red
  herring for this design.** It's registered in `COMPONENTS` as `"tovu/nav"` (`render.ts:1546`, current line
  1546 in this session's read — file is being edited concurrently by other agents, treat exact line numbers
  as approximate/moving), and its `items` come verbatim from whatever `props` a theme template passes —
  confirmed by `content/themes/declarative/basic-declarative/render/pages/home.json:5-18`, where `items` is a
  **literal array hand-typed into the theme file**, not a resolved Menu entry. `tovu/nav` never calls
  `resolveMenuDoc`/`createMenuResolver`. It's a theme-authored, static nav block — architecturally unrelated
  to `MenuEditor.tsx`/`NavMenuDoc`/ADR-029. Do not design against it; Header Nav means the `menu` widget type.

- **`[REVISED]` The menu-attrs gap this section flagged has SHIPPED — verified against HEAD, not assumed.**
  Commit `92494e7c` (`feat(admin,website): expose menu item attrs... in the Menu editor`) added
  `MenuItemAttrsFields` — a per-item "Advanced" `<details>` disclosure (`MenuEditor.tsx:156-171`, rendered at
  `MenuEditor.tsx:305`) exposing all five `NavItemAttrs` fields (`cssClass`/`icon`/`description`/`rel`/
  `openInNewTab`). It also fixed the exact gap this report's next bullet originally flagged:
  `renderWidgetMenuItems` (`render.ts:1649-1665`) now reads `o.attrs` and honors all five via three small
  helpers (`widgetMenuItemClassAttr`/`widgetMenuItemLinkAttrs`/`widgetMenuItemDecoratedLabel`,
  `render.ts:1610-1639`) — matching what the static-tier tree renderer (`menuItemBody`/`menuItemClasses`,
  `static-render.ts:214-244`) already did for `cssClass`/`icon`/`description`, and newly does for `rel`/
  `openInNewTab` too. Commit `80e51b32` adds an end-to-end Liquid-tier test proving the shared-seam claim
  below concretely (`render_block` → `renderBlockSeam` → `renderWidgetRegion` → `renderWidgetIr`), not just a
  `renderWidgetIr` unit test. The write path needed no fix: `validateAndCloneTree`
  (`/Users/la/Programming/Jini/packages/cms/src/navigation/menu-service.ts:132-165`) already clones `attrs`
  untouched — it validates `id`/depth/count/`target` only, never touches `attrs` at all (confirmed by
  reading the full function body this pass). The only real gap was the missing `AdminMenuItem.attrs` TS field
  and the missing UI, both closed by `92494e7c`.

  **The `rel` doc-comment's "validated against an allowlist" claim is still false, now confirmed twice.**
  `NavItemAttrs.rel`'s own doc (`/Users/la/Programming/Jini/packages/cms/src/navigation/types.ts:106`) says
  `rel` is "validated against an allowlist." Rereading `validateAndCloneTree` in full this pass: it validates
  `id`, `seenIds`, depth, item count, and `target.kind`/URL scheme — **nothing touches `attrs` at all**, so
  `rel` (and every other `NavItemAttrs` field) passes through completely unvalidated. `static-render.ts:203-206`
  already flags this as a known false comment ("flagged, not fixed, here; fixing it is a Jini `menu-service.ts`
  change, out of this pass's scope"). This design's §2.4 (below) closes it for real — the new shared allowlist
  validator becomes the thing `rel`'s comment should have described all along, applied at the same write
  chokepoint. Until that ships, the doc comment remains false and should not be trusted by anyone reading it.

- ~~New finding, not in the prior report: the widget-IR menu renderer already drops `attrs` entirely
  today...~~ **`[REVISED] SUPERSEDED — fixed by `92494e7c`, see the entry above.** Left struck through rather
  than deleted so the history is legible: this was a real, correctly-identified gap when this report was
  written; it no longer describes HEAD.

- **`[REVISED TWICE — read this entry, not the git history of this section] Template vs. site copy: the real
  divergence, and the mistake made and corrected while finding it.** This pass first checked the flat/tree
  claim against `content/themes/static/basic/render/partials/nav.html:7` (no `variant` key → flat), concluded
  the owner's header nav was flat and the shipped attrs work invisible on his live site, and wrote that into
  this doc. **That conclusion was wrong**, caught by a teammate and independently re-verified here, because it
  read the wrong copy of the file. Themes in this repo are **copied per site, not inherited** (project
  memory), so `content/themes/` (the template/source tree) and a given site's own copy under
  `sites/<site>/themes/` can and do diverge independently after the copy is made. The two copies for `basic`'s
  header-nav marker, verified directly:
  - **Template** — `content/themes/static/basic/render/partials/nav.html:7`:
    `data-embed-config='{"type":"menu","id":"menu-header-nav"}'` — no `variant` key → flat
    (`renderMenuLinks`, per `injectMenuEmbeds`'s dispatch at `static-render.ts:284`).
  - **Site copy actually served** — `sites/tovu-com/themes/static/basic/render/partials/nav.html:13`:
    `data-embed-config='{"type":"menu","id":"menu-header-nav","variant":"tree"}'` — **has** `variant:"tree"` →
    the tree renderer (`renderMenuTree`/`menuItemBody`/`menuItemClasses`).
  - Confirmed live, not just by file read: `curl http://localhost:3000/` returns
    `<nav class="main-nav" data-embed-config='{"type":"menu","id":"menu-header-nav","variant":"tree"}'>`
    followed by `<ul class="menu-list depth-0"><li class="menu-item depth-0">...` — the tree renderer's own
    output shape (`static-render.ts:254-260`), matching the site copy, not the template.
  - `sites/tovu-com/content.db`'s `presentation_settings` row (`workspace-local | basic | ...`) plus
    `content/themes/static/basic/theme.json:3-6` (`"id": "basic"`, `"tier": "static"`, no collision with the
    unrelated, unwired `basic-declarative`) still correctly identify which theme is active — that part of the
    original check was fine; the mistake was reading the template copy of that theme instead of the site's own.
  - **The other four static themes checked do NOT show this drift** — their site copies match their templates,
    both still flat: `sites/tovu-com/themes/static/basic-2/render/partials/nav.html:7`,
    `.../tailark-quartz-libre/render/partials/nav.html:8`, `.../tailark-quartz-dark/render/partials/nav.html:7`,
    `.../tailark-dusk/render/partials/nav.html:7` all still read `{"type":"menu","id":"menu-header-nav"}` with
    no `variant` key, identical to their own templates. The drift is isolated to `basic`'s header-nav marker
    specifically, not a repo-wide pattern.

  **Corrected net finding: the five shipped `NavItemAttrs` fields DO reach the owner's actual header nav
  today** (via the site copy's `variant:"tree"`) — the earlier "invisible on his own site" claim in this doc
  was false and is retracted here rather than left standing. **But the divergence itself is a real, separate
  finding worth recording**: someone added `variant:"tree"` to `basic`'s site copy at some point and never
  propagated the same change to the template it was copied from (`file:line`s above) — an undocumented,
  unexplained drift between the two, independent of this feature. Anything in this doc (or written by whoever
  implements it) that reasons about "the theme" must say **which copy** it means — the template under
  `content/themes/`, or a specific site's copy under `sites/<site>/themes/` — since the two are not guaranteed
  to agree, as this entry itself demonstrates. §4.1/§5's recommendation to extend `renderMenuLinks` (the flat
  renderer) survives this correction unchanged, but for a different reason than originally stated — see
  §4.1/§5 below, both revised to match.

---

## 1. The paradigm contract (A)

### 1.1 The core rule

**Do not add a universal "mode flag" field. Instead: find the closed-set field or registry key that already
selects a surface's shape, and add `"html"` as one more value of that same discriminant.** This is the one
seam-per-coupling rule applied to this problem. Two worked instances, both already in this codebase's own
shape:

- **A document-shaped thing that has ONE body** (a menu entry, a page, a post) already has (or should have,
  mirroring Pages) a `bodyFormat: "items" | "html"`-style field inside its own stored doc. Adding the HTML
  alternative there is one field.
- **A slot-shaped thing chosen from a closed registry of types** (a widget instance, keyed by `typeKey` into
  `WIDGET_TYPE_REGISTRATIONS`/`WIDGET_IR_RENDERERS`) *already has* its shape-discriminant: `typeKey` itself.
  Adding an HTML alternative there means registering ONE new type value (`custom-html`), not inventing a
  second, nested mode flag inside every existing type. A second implementer's first question for any new
  surface must be: *"what field or registry key already picks this surface's shape?"* — not "where do I put
  a mode flag."

This matters because it changes what "switching modes" even means per surface (§1.3), and it's why Widgets
turn out structurally cheaper than Menus (§4).

### 1.2 Storage shape (document-shaped surfaces — Menus is the instance)

```
NavMenuDoc {
  type: "menu"
  version: number
  bodyFormat?: "items" | "html"   // NEW, mirrors Pages' own field name; absent == "items", zero migration
  items: NavItemNode[]            // unchanged shape; retained even while bodyFormat === "html"
  html?: string                   // NEW sibling; sanitized at write time (§3); retained even while
                                   // bodyFormat === "items"
}
```

Both fields live in the SAME envelope, always. Nothing is ever deleted implicitly.

### 1.3 The switch rule — strictly better than Pages' precedent, per instruction

Pages' `ensureHtmlFormat` (`html-document-store.sqlite.ts:207-259`) drops `body_json` on a **read-side**
conversion, before any HTML is typed (`update-html.ts:88-93`, the route's own doc: "The conversion drops
`body_json`"). Do not repeat this. The rule for the new paradigm:

1. **Clicking the mode tab in the admin UI is purely client-side state.** It never calls the write API. The
   HTML tab, when first opened, seeds its editor from `doc.html ?? ""`; the Structured tab always shows
   `doc.items` untouched. No network round-trip, no version bump, from a tab click alone.
2. **Only an actual Save mutates storage**, and it mutates **only the field for the tab that was active**,
   via a **read-modify-write**, not a blind overwrite of the whole doc: saving in HTML mode sends `{
   bodyFormat: "html", html: <edited text> }`; the server sanitizes `html`, sets `bodyFormat`, and leaves the
   stored `items` untouched. Saving in Structured mode is symmetric. Both still go through the existing
   `expectedVersion` OCC check (`update-tree.ts:32-48,98-108`) against the WHOLE doc's version, so the two
   write routes can't lost-update each other.
3. **The only way a representation is actually lost is deleting it explicitly** (a distinct, clearly-labeled
   action — not a tab click, not a save in the other mode).

### 1.4 What's disclosed as lost, stated once, generally

The general rule (not a per-surface enumeration): **whatever a surface's write-time chokepoint does to the
structured shape specifically — ref extraction into `entry_refs`, uniqueness-index maintenance, any
`x-ref-target`-tagged field tracking — is items/structured-only by construction.** HTML mode is inert data as
far as those derived indexes are concerned, for exactly the reason the prior report gave for menus
specifically (a `NavItemNode` id/nesting/ref graph can't be reverse-engineered from markup, ADR-029 §3/§6). Concretely for Menus:

- `entry_refs` extraction, where-used, and safe-delete signaling (ADR-029 §3) track the **last-saved
  `items` tree**, not what's currently live if `bodyFormat === "html"`. A where-used query against an
  HTML-active menu must be labeled "reflects the last-saved structured version, which may not be what's
  currently rendered" — never silently presented as current.
- `nav_location_bindings` (ADR-029 §4) is **unaffected** — location assignment is a separate entry field,
  orthogonal to body format. Correcting an implicit assumption: HTML-mode menus can still be assigned to a
  theme location and still participate in the uniqueness constraint.
- For Widgets, the equivalent loss is per-widget-type: any `x-ref-target`-tagged config field (e.g. `menu`'s
  own `menuRef`, `registry.ts:112`) stops being tracked the moment that instance's slot holds a `custom-html`
  type instead — not because HTML mode "loses" something inside the menu type, but because it's a different
  type occupying the slot (§4.2 explains why this is simpler, not a special case of loss).

---

## 2. Custom-attribute design (B)

### 2.1 A working precedent already exists in this codebase — reuse its shape, don't reinvent

Contact-form field "extra attributes" is functionally identical to what's being asked for here, already
shipped: `ATTRIBUTE_NAME_PATTERN` (`apps/website/src/features/forms/forms.ts:48-49`) —
```
/^(aria-[a-z0-9-]+|data-[a-z0-9-]+|placeholder|autocomplete|inputmode|pattern|title|min|max|step|minlength|spellcheck|readonly)$/
```
— is a hand-written **name allowlist**, enforced at write time (`forms.ts` field validation) and re-checked
defensively at render time by `renderExtraFieldAttrs` (`render.ts:1636-1657`), whose own doc states why:
*"an attribute NAME is not something `escapeHtml` can make safe the way it can a value."* Values are
required to be strings and escaped via `escapeHtml`; caps exist (`MAX_CLASS_NAME_LENGTH = 300`,
`MAX_ATTRIBUTES_PER_FIELD = 12`, `forms.ts:33-34`). **This is the template to generalize, not a new
mechanism.**

### 2.2 The shared type and where it lives

One new shared type, placed at a neutral core location so neither `navigation` nor `widgets` has to import
from the other (the "modular, one seam" constraint) — e.g. `packages/cms/src/core/attrs.ts` in Jini:
```ts
export type CustomAttrs = Readonly<Record<string, string>>;
```

### 2.3 Coexistence with named fields

- `NavItemAttrs` gets **one new optional field**: `custom?: CustomAttrs` (`navigation/types.ts:104-115`),
  additive, the 5 existing named fields untouched.
- A key inside `custom` that collides with a named field's own reserved name/concept (`cssClass`, `class`,
  `rel`, `style`, `onclick`, …) is **rejected at write time** with a validation error pointing at the correct
  named field, or stating outright disallowed — this removes any "which one wins" ambiguity rather than
  leaving it to render-time last-write-wins.
- Widget instance config: add `attrs?: CustomAttrs` as one new optional `configSchema` property, per widget
  type that opts in (`registry.ts`'s per-type `configSchema`s are independent — this is N one-line schema
  edits, N = number of existing types that want it, not a shared-base-type change; `menu`'s current schema
  has `additionalProperties: false` and only `menuRef` required (`registry.ts:107-115`), so this is
  additive and does not touch `required`).

### 2.4 Enforcement — mirrors §2.1 exactly, one shared implementation

**`[REVISED]` Allowlist widened per the owner's explicit second decision.** Not just `data-*`/`aria-*` — add
the common safe named attributes he asked for: `role`, `title`, `tabindex`, `lang`, `dir`, `id`. Still no
event handlers (`on*`), no `style`, no URL-bearing attributes (`href`/`src`/`action`/etc. stay identity-owned
by named fields or structurally dangerous — see §3). This is the same hand-curated-allowlist discipline
`forms.ts`'s `ATTRIBUTE_NAME_PATTERN` already established (§2.1) — widened, not opened categorically; a
future ask for another name still goes through the same explicit-edit process, never a wildcard.

Four of the ten names (`data-*`, `aria-*`, `role`, `lang`, `dir`, `title`) are plain opaque strings — no
value-level check beyond the existing length/count caps, because there is no unsafe *value* for them, only an
unsafe *name* (already gated by the allowlist itself, per `renderExtraFieldAttrs`'s own reasoning, §2.1). Two
need real value-level validation, per the owner's explicit ask:

- **`id` — collision.** Two different collision risks exist and they get different answers because only one
  is actually preventable:
  - **Within the same menu tree** (two items in one save both authoring `attrs.custom.id="foo"`): this is a
    same-tree, same-request problem the server already has full visibility into.  **Reject at write time**,
    same shape as the existing `seenIds` duplicate-id check `validateAndCloneTree` already runs for the
    node's own stable ULID `id` (`menu-service.ts:138,153-156`) — a second, parallel `Set` for authored
    `attrs.custom.id` values, checked in the same tree walk, thrown as a `MenuValidationError` naming the
    colliding item. Cheap (one more `Set.has`/`Set.add` per node, no new pass) and unambiguous.
  - **Against theme-authored markup** (a static theme's own HTML already has `id="pricing"` somewhere on the
    page, and an admin later authors the same `id` on a menu item): **not preventable at write time, and not
    attempted.** The write chokepoint validates one menu's tree; it has no visibility into an arbitrary
    theme's arbitrary HTML, which is data, not a fixed schema (`content/themes/*` — themes are copied, not
    inherited, per project memory, so there is no single "the theme" to check against even in principle).
    **Allow, and document the hazard explicitly** in the admin UI's `id` field (a one-line caption: "must be
    unique on the rendered page; the editor cannot check this against the active theme's own markup") — the
    same posture already accepted for `cssClass` (no collision guarantee with theme CSS classes either,
    §2.1's precedent). Attempting to solve this server-side would mean parsing a live theme's HTML at every
    menu save, which is unbounded and out of scope; a same-tree reject is the honest, cheap half of the
    problem, not a partial implementation of a full one.
- **`tabindex` — value, not just name.** A bare name-allowlist is not enough here because the well-known
  accessibility footgun is a *value*, not the attribute's presence: a **positive** `tabindex` creates an
  explicit tab order that overrides natural DOM order (the exact anti-pattern `eslint-plugin-jsx-a11y`'s
  `no-positive-tabindex`/axe's own rule exist to catch) and is near-impossible to keep coherent once more than
  one item on a page sets one. `0` (join the natural tab order) and `-1` (remove from tab order, still
  script-focusable) are the two values with a real, common use and no ordering hazard. **Validate**: parse as
  an integer; accept only `{-1, 0}`; reject everything else (positive integers, non-integers, anything below
  `-1`) with a `MenuValidationError` naming the offending value. This is a value-predicate check layered on
  top of the name-allowlist, the same shape `validateTarget`'s own URL-scheme denylist already is for `url`
  targets (`menu-service.ts:167-185`) — a second kind of check, not a special case bolted onto the generic
  string-passthrough path.
- **Values** (all ten names): string-only, length-capped, count-capped per item — same shape as
  `MAX_CLASS_NAME_LENGTH`/`MAX_ATTRIBUTES_PER_FIELD`, consistent with ADR-029's own bounded/total
  tree-validation posture (ADR-024, referenced at `ADR-029-menus-navigation.md:6`).
- **Enforced at write time** (the chokepoint validator, alongside `MenuValidationError`) **and re-checked at
  render time**, same two-gate posture as forms, same reason. The `id`/`tabindex` value checks live at the
  same chokepoint, not a separate pass — one validator, ten names, two of which carry an extra predicate.
- **One new shared render helper**, e.g. `renderCustomAttrs(bag: CustomAttrs): string` — literally
  `renderExtraFieldAttrs`'s attribute loop (`render.ts:1645-1657`) factored out of `forms`-specific code into
  a shared location both `forms` and the new nav/widget consumers call, instead of a third copy-paste of the
  same loop.

---

## 3. Sanitization recommendation — decided, not a menu of options

### 3.1 Threat model, stated plainly

**Not** protecting the owner from himself. This is a single-admin desktop/gated app; the owner already owns
the install and its authorize() gates are for delegation, not self-defense. Do not design a confirmation
dialog, a preview-before-save gate, or any ceremony that makes the owner justify his own HTML to the
software.

**What the sanitizer is actually for**, two real threats:
1. **Site visitors**, not the admin, are harmed by executable markup reaching the public page — a stored
   XSS payload runs in a random visitor's browser regardless of who typed it or how carefully. That harm
   lands on a third party, which is why it's worth gating even in a single-owner app.
2. **A delegated agent principal** (ADR-021 already treats agents as principals acting on the owner's
   behalf) can be prompt-injected via content it was asked to process and write something the owner never
   reviewed. Sanitization is the last backstop for exactly that case — not paternalism toward the owner, a
   backstop against a compromised or manipulated writer using the owner's own authority.

**Where this deliberately does NOT gate**: no extra permission prompt for authoring "aggressive" but
non-executable markup (arbitrary classes, arbitrary `data-*`/`aria-*`, unusual structure) — the ONE new gate
is the standing `admin.menus.edit_html`-style **permission check**, identical in kind to every other admin
write, not a per-save interstitial.

### 3.2 The recommendation

**Allowlist sanitization, at WRITE time only, via a new dependency: `sanitize-html`.**

- **Why write time, not render time, and not both**: this repo has (per §0) exactly two render-path
  implementations for menus (widget-IR, static-tier) plus however many a future surface has. Sanitizing at
  render time means importing the sanitizer into every one of those, and re-running it on every page view.
  Sanitizing once at write time means **one call site** (the new write route/write-service), the stored
  markup is already clean, and every render path does the same "splice this string verbatim" it already had
  to do mechanically for HTML mode — no new dependency reaches `render.ts`/`static-render.ts`/
  `liquid-worker.ts` at all. This exactly matches how Pages already treats `bodyHtml` at render time
  (`renderPostBody`, `render.ts:1361-1369`: "never HTML-escaped here... the stored markup carries the same
  trust level the theme layer already has") — the only change from Pages' posture is that Menus' write path
  actually cleans the input first, instead of trusting it unsanitized as Pages explicitly, disclosedly does
  not (`update-html.ts:122-125`).
- **Why a new dependency, contradicting this repo's own stated default**: `config-validation.ts`'s own file
  header explains the repo's normal instinct — *"No JSON-Schema library is a dependency of this repo... this
  is a small, purpose-built validator... rather than a new third-party dependency for one feature."* That
  reasoning holds for a **bounded, already-parsed-JSON** validation problem. It does not hold for **parsing
  untrusted HTML** — mutation XSS, tag-soup edge cases, and encoding smuggling are exactly the class of bug a
  maintained sanitizer library exists to close, and hand-rolling an HTML parser here would be negligent, not
  minimal. `sanitize-html` is pure-JS (`htmlparser2`-based), runs server-side in plain Node with **no DOM/
  jsdom dependency** — ruling out `isomorphic-dompurify`, which pulls in `jsdom` (heavier, larger attack
  surface, and DOMPurify's default config is browser-oriented, not server-authoring-oriented). This repo's
  Liquid tier already runs inside a `worker_threads` sandbox (`liquid-worker.ts`) with no filesystem access —
  sanitization does not need to run there at all under this design (it runs once, at write time, on the main
  admin-API process), so it never has to cross that sandbox boundary.
  **`[REVISED]` API surface now confirmed via `context7` (`/apostrophecms/sanitize-html`, source reputation
  High), closing the earlier "unverified" flag**: the call shape is `sanitizeHtml(dirty, options)`;
  `allowedTags: string[]`; `allowedAttributes` takes a per-tag map **plus a `'*'` wildcard key** for
  attributes allowed on every tag — exactly the shape this design needs to apply §2.4's one shared allowlist
  uniformly regardless of which elements end up allowed — and the docs' own example shows **glob-pattern**
  `data-*` support in that same map (`allowedAttributes: { a: ['data-*'] } }`), not a manual per-attribute
  enumeration. `allowedSchemes`/`allowedSchemesByTag` gate `href`/`src` and already default-deny
  `javascript:` (shown in the docs' own example output) — this design still layers the app's own `safeHref`
  on top rather than relying on that default alone, for the "one source of truth for which URLs are safe"
  reason stated below, but `sanitize-html`'s own scheme default is a second, independent line of defense at
  the parse stage, not the only one.
  **Not yet done**: an actual `npm install sanitize-html` + a smoke test in this repo's own ESM runtime
  (`"type": "module"`, `package.json:6`) — the docs' own examples are all CJS `require(...)`; `sanitize-html`
  ships a single CJS default export, which Node's ESM/CJS interop handles as `import sanitizeHtml from
  "sanitize-html"` in the overwhelmingly common case, but that interop is exactly the kind of claim this
  repo's own discipline says to verify by running it, not by reading about it — flagged for whoever picks up
  slice 1, a five-minute check, not an open design risk.
  **What breaks if this dependency is ever removed**: every write-time `bodyFormat: "html"` menu save and
  every `custom-html` widget-config save would have nothing standing between admin-authored markup and the
  public page — silently reopening the exact stored-XSS-via-delegated-agent threat model §3.1 names. Because
  the call site is the one shared module described here, an accidental removal is a small, greppable diff
  (`grep -r "sanitize-html"`) but has zero type-level enforcement stopping it — worth a one-line comment at
  the call site saying so, not worth a runtime guard.
- **Elements**: allow common structural/formatting/link/media tags — `a, span, div, ul, ol, li, nav, img,
  svg, use, path, br` (adjust per what the owner actually authors). Explicitly deny `script, style, iframe,
  object, embed, form, link, meta, base` — script execution, CSS-based exfil/clickjacking, arbitrary
  cross-origin embeds, form-action hijack, remote-stylesheet injection, and base-href hijack of every
  relative link on the page, respectively.
- **Attributes**: `data-*`/`aria-*` (§2's own allowlist, reused verbatim — one policy, not two) plus
  `href`/`src`/`class`/`title`/`target`/`rel`. Route `href`/`src` through the **existing** `safeHref`
  scheme-allowlist (`render.ts`'s `safeHref`, already blocks `javascript:`, already restricted to `http(s)`/
  `mailto`/site-relative) rather than re-declaring a second URL policy inside the sanitizer's own config —
  one source of truth for "which URLs are safe," reused, not duplicated. Strip all `on*` handlers and `style`
  outright (no attempt at a CSS-value sub-sanitizer — that's its own minefield, and `style`-based exfil via
  `background:url()` plus clickjacking via `position`/`opacity` are real enough to just deny the attribute).
- **`html-embeds.ts` is a separate, unrelated concern**: Pages' `data-embed-type` marker substitution runs at
  RENDER time and explicitly does not re-validate attributes for injection safety (`html-embeds.ts:49-56`,
  by its own doc). Whether Menus' HTML mode gets embed-marker support is an independent, still-open decision
  (prior report §3) — it is not subsumed by, and does not subsume, the sanitizer described here.

---

## 4. Per-surface application

### 4.1 Header Nav (Menus) — concrete first target `[REVISED throughout — now slice 1, resized below]`

- **Schema**: `NavMenuDoc` gains `bodyFormat?: "items" | "html"` + `html?: string` (§1.2,
  `navigation/types.ts:140-145`) — **unchanged from the original pass**, still unbuilt (confirmed this pass by
  rereading `types.ts:140-145` — no `bodyFormat`/`html` field exists yet).
- **Write**: new route mirroring `update-html.ts`'s shape — cannot reuse `update-tree.ts`, hard-typed to
  `items: NavItemNode[]` (`update-tree.ts:14-30`, confirmed by prior report). Runs `sanitizeHtml` (§3) before
  persisting; read-modify-writes so the inactive representation survives (§1.3); reuses the existing
  `expectedVersion` OCC check. **`[REVISED]` No new repo-port method needed**: `MenuRepoPort.save(record:
  NavMenuEntry)` (`/Users/la/Programming/Jini/packages/cms/src/navigation/repo.memory.ts:54`) already
  persists the **whole** `NavMenuEntry`, `doc` included — a new Jini service function (mirroring
  `updateMenuTree`'s OCC-check shape, `menu-service.ts:333-383`, but writing `doc: {...existing.doc, bodyFormat:
  "html", html: sanitized}` instead of `items`) calls the same `deps.repo.save` unchanged. This is smaller than
  it first looked: 1 new service function, not a port-interface change.
- **Permission**: new `admin.menus.edit_html`. **`[REVISED]` Sized precisely this pass, not estimated**: the
  existing `admin.menus.*` catalog is **two** files, not one — the catalog entry itself
  (`/Users/la/Programming/Jini/packages/cms/src/identity/permissions.ts:237-264`) and the role-grant migration
  clause that hands the workspace's default role the literal strings
  (`/Users/la/Programming/Jini/packages/cms/src/identity/seed.ts:64-77`) — plus the route's own `authorize()`
  check. **3 call sites**, not 1-2. Menus have no legacy blocker forcing an interim gate the way Pages did
  (`update-html.ts:99-114`'s disclosed gap), so there's no reason to repeat that gap here.
- **Render — `[REVISED]` FOUR call sites, not three, and the static-tier one is no longer optional.** Two
  distinct render concerns, not one:
  1. **Whole-menu `bodyFormat: "html"` splice** (this section's own feature): `renderWidgetMenu`
     (`render.ts:1667-1671`, shared by declarative+Liquid+Handlebars per §0's confirmed shared-seam finding)
     gets an early `bodyFormat === "html"` → emit `props.html` verbatim branch. **Variant-agnostic by
     construction** — bypasses `StaticMenuItem[]`-based rendering entirely, so it does not care whether a
     marker says `variant:"tree"` or omits it.
  2. Static-tier's `injectMenuEmbeds` (`static-render.ts:276-287`) gets the equivalent branch — check
     `bodyFormat` **before** the `marker.config.variant === "tree" ? renderMenuTree(...) : renderMenuLinks(...)`
     dispatch at `static-render.ts:284`, splice `doc.html` verbatim regardless of variant. **`[REVISED — the
     justification changed, the conclusion didn't]` This is a slice-1 requirement, not a deferrable
     nice-to-have, for a simpler reason than an earlier draft of this entry gave**: the owner's active site
     (`presentation_settings`, §0) runs a **static**-tier theme, full stop — that fact doesn't depend on which
     variant its header-nav marker happens to use. If this splice-verbatim branch ships only for
     declarative/Liquid/Handlebars (bullet 1) and not static-tier's `injectMenuEmbeds`, `bodyFormat: "html"`
     menus are simply unusable on the one tier the owner's own site is built on, regardless of flat vs. tree.
     (An earlier draft of this bullet additionally claimed the owner's flat header-nav marker made the
     *existing* attrs work invisible today — that specific claim was wrong, per the corrected §0 entry above;
     it is removed here rather than left standing, but does not change this bullet's own conclusion.)
  3. `renderWidgetMenuItems` already honors `attrs` (shipped, §0) — **no further change needed for the
     whole-menu-HTML case**, since HTML mode bypasses per-item rendering entirely. Listed here only to avoid
     the reader assuming it still needs the fix the original pass flagged; it doesn't.
  This leaves the item-level custom-attrs bag's own static-tier work (the `renderMenuLinks` flat-renderer gap
  §0 found — real regardless of the template/site-copy correction, since `basic-2`/`tailark-quartz-libre`/
  `tailark-quartz-dark`/`tailark-dusk`'s site copies are all still genuinely flat, and even `basic`'s own
  *template* is flat, so a new site built from `basic` starts flat too) as a **separate, still-open** render
  call site, sized in §5's revised third slice below — it is not part of *this* slice's four, because it
  belongs to decision 2 (the attrs bag), not decision 1 (the whole-menu mode switch).
- **Admin UI**: `MenuEditor.tsx` gains a two-way tab/segmented control ("Structured" / "HTML"); tab switches
  are client-side only (§1.3); Save always ships the active tab's content. No existing UI precedent to copy
  — Pages has **no mode toggle at all** in `PageEditor.tsx` (confirmed: it only reads/displays `bodyFormat`;
  the `"doc"`→`"html"` conversion happens as an implicit side effect of which API route gets called,
  `ensureHtmlFormat`, never a user-facing control) — so this is genuinely new UI, not a port.
- **Item-attrs UI — `[REVISED]` the named-field half of this is DONE, not proposed.** The original pass's plan
  ("adding inputs for the 3 currently-unexposed named fields... plus a repeatable key/value row for
  `attrs.custom`") is now half-shipped: `92494e7c` added `MenuItemAttrsFields`
  (`MenuEditor.tsx:156-171,305`) exposing all five named fields via `use-menu-editor.hooks.ts`'s existing
  `changeAt`/`mapAtPath` machinery, exactly as this report predicted. **Still open**: the repeatable
  key/value-row UI for `attrs.custom` (§2's new bag) plus the `id`/`tabindex` value-validation surfaced in the
  UI (§2.4) — same hook plumbing, no new mechanism, sized in §5's third slice.

### 4.2 Widgets — `[REVISED]` now slice 2, per the owner's first decision (still structurally cheaper, not first)

- **New widget type**, one additive entry in `WIDGET_TYPE_REGISTRATIONS` (`registry.ts`) — `custom-html`:
  `configSchema: { type: "object", properties: { html: { type: "string" } }, required: ["html"],
  additionalProperties: false }`.
- **New render entry**, one additive key in `WIDGET_IR_RENDERERS` (currently 8 keys: `text`, `social-links`,
  `recent-entries`, `entry-summary`, `menu`, `contact-form`, `media-image`, `post-content` —
  `render.ts:1969-1978`) — reads the already-sanitized `props.html` verbatim.
- **Permission**: none new — the existing `widgets.*`/`requireWidgetPermission` model
  (`authorize-helper.ts:30-44`) already covers a config write for any type; this is a smaller lift than
  Menus, which needed a net-new permission.
- **"Mode switch" needs no new mechanic at all** — this is where §1.1's contract genuinely simplifies for a
  different surface shape. A widget instance's `typeKey` is already the shape-discriminant; swapping a
  slot's structured widget (`menu`, `social-links`, …) for `custom-html` (or back) is an ordinary
  remove-then-add through the region's existing widget management (insert/remove/reorder already supported)
  — not a mode-toggle-with-preserved-sibling-representation problem the way Menus' single-document body is.
- **Attrs bag** (§2.3): one additive `attrs` property per existing type's `configSchema` that opts in — N
  independent one-line schema edits, N = number of types.

### 4.3 Beyond Menus/Widgets

Apply §1.1's rule: locate the surface's existing closed-set shape-discriminant; add `"html"` there; name
what write-time chokepoint machinery (ref extraction, uniqueness index) is structured-only per §1.4's general
rule (don't re-derive it per surface); reuse the SAME shared `sanitizeHtml` (§3) and `CustomAttrs`/
`renderCustomAttrs` (§2) primitives rather than building new ones. For a surface where no such
discriminant/target exists — Categories/Tags/Collections, per the prior report's verdict — this paradigm
simply does not apply, consistent with that report's finding; it is not this design's job to invent a target
where none exists.

---

## 5. Build plan, sized by call sites `[REVISED — resequenced per the owner's decision 1, slices resized]`

The original pass put the widget `custom-html` type first because it was structurally cheaper. The owner was
shown that tradeoff explicitly, chose Menus anyway, and that choice is not revisited here. Menus is now slice
1; the sanitizer gets built there instead of in Widgets, and Widgets (slice 2) inherits it verbatim — the
ordering changes which slice pays for the sanitizer's first build, not its shape (see the surface-agnosticism
note at the end of slice 1).

### Slice 1: Menus' `bodyFormat` — now first, resized as the harder surface

Call sites, using the corrected counts from §4.1 above (not the original pass's estimates):

1. **Schema** — `NavMenuDoc` gains `bodyFormat?: "items" | "html"` + `html?: string`
   (`/Users/la/Programming/Jini/packages/cms/src/navigation/types.ts:140-145`). 1 type edit.
2. **Sanitizer module** — 1 new shared file (e.g. `apps/website/src/shared/html-sanitize.ts`), Tovu-side (not
   Jini): both this slice's write route and slice 2's `write-service.ts` live under `apps/website/src/`, so a
   Tovu-side module reaches both without crossing into Jini at all. Wraps `sanitize-html` with §3's
   element/attribute allowlist, reusing §2.4's ten-name attribute allowlist verbatim inside `sanitize-html`'s
   own `allowedAttributes: { '*': [...] }` wildcard (confirmed shape, §3.2). **Built once, here — its
   surface-agnosticism is the point of building it in the harder slice first**: its signature is `(html:
   string) => string`, nothing more. It takes no `bodyFormat`, no `typeKey`, no menu-tree shape, no widget
   registry — it does not know its caller is a menu. Slice 2 imports the same function unchanged; if slice 2
   ever needed a different call shape, that would be a sign this module absorbed something menu-specific, and
   it deliberately doesn't.
3. **Jini service function** — 1 new export in `menu-service.ts` (mirrors `updateMenuTree`'s OCC-check shape,
   `menu-service.ts:333-383`), calling the existing `deps.repo.save` unchanged (§4.1 — no port-interface
   change needed).
4. **Tovu admin route** — 1 new file mirroring `update-html.ts`'s shape (cannot reuse `update-tree.ts`, hard
   body-typed to `items`). Calls the sanitizer (step 2) before calling the Jini service function (step 3).
5. **Permission** — 3 call sites, precisely counted this pass (§4.1): `permissions.ts` catalog entry,
   `seed.ts` role-grant clause, and the route's own `authorize()` check.
6. **Render, 2 call sites for the whole-menu-HTML case** (§4.1's revised count): `renderWidgetMenu`
   (`render.ts:1667-1671`, shared declarative+Liquid+Handlebars) and static-tier's `injectMenuEmbeds`
   (`static-render.ts:276-287`) each get a `bodyFormat === "html"` → splice-`props.html`-verbatim branch,
   checked **before** the flat/tree variant dispatch so it applies regardless of marker variant. Both are
   mandatory in this slice, not sequenced later — §4.1 explains why the static one specifically cannot be
   deferred (the owner's own live theme is static-tier).
7. **Admin UI** — `MenuEditor.tsx` mode-toggle tab (Structured/HTML), client-side-only tab switch,
   read-modify-write save semantics threaded through `use-menu-editor.hooks.ts` per §1.3's switch rule. No
   existing UI precedent to copy (Pages has no mode toggle at all, §4.1) — genuinely new UI, roughly 2 files.

**~10 call sites** (vs. the original pass's ~6 for Widgets-first) — genuinely bigger, as instructed, for three
concrete reasons: it's the harder surface structurally; the sanitizer is built fresh here rather than reused;
and decision 3 pulls the static-tier render branch into this slice as mandatory rather than a follow-on.
**Defers**: the custom-attrs bag (`attrs.custom`, `id`/`tabindex` validation) and its own static-tier
(`renderMenuLinks`) fix — those belong to decision 2, not decision 1, and are sequenced as slice 3 below,
independently of whether this slice has shipped.

### Slice 2: Widgets' `custom-html` type — now second, genuinely cheaper because the sanitizer already exists

Unchanged in shape from the original pass's slice 1, minus the sanitizer-module line item (built in slice 1
now):
1. `registry.ts` — 1 new `WIDGET_TYPE_REGISTRATIONS` entry (`custom-html`).
2. A new trivial resolver (no ref/entry resolution needed, unlike `menu`'s) — 1 new file or function.
3. `render.ts` — 1 new `WIDGET_IR_RENDERERS["custom-html"]` entry.
4. `write-service.ts` (widgets) — 1 call to slice 1's shared sanitizer module, unchanged, gated on the
   existing `widgets.write` permission (no new permission — smaller than Menus, which needed one).
5. Admin UI — 1 new per-type editor form. **Not yet located this session** — flag for whoever picks up
   implementation to find before starting.

**~5 call sites** — one fewer than the original pass's estimate for the same slice, because the sanitizer
module (previously counted here) now already exists from slice 1. This is the concrete payoff of building the
sanitizer surface-agnostically in the harder slice first: slice 2 pays nothing for it.

### Slice 3 (parallelizable with either, sequenced after slice 1 for the render pieces): the custom-attrs bag (B)

**`[REVISED]` Resized — the static-tier fix is now a counted, mandatory call site, not a deferred aside.** The
original pass's §5 listed this slice without the `renderMenuLinks` flat-renderer fix, then separately noted in
§4.1 that reaching the flat renderer was "one more call site, not counted in §5 above." Decision 3 (static-tier
coverage required for v1) closes that gap explicitly — it must be counted:

1. Shared `CustomAttrs`/`renderCustomAttrs` (factored out of `renderExtraFieldAttrs`,
   `render.ts:1645-1657`) — 1 new shared render helper.
2. `NavItemAttrs.custom?: CustomAttrs` field (`navigation/types.ts:104-115`) — 1 type edit.
3. Write-time validator extension — the §2.4 ten-name allowlist plus the `id`-duplicate-within-tree check and
   the `tabindex ∈ {-1, 0}` value check, added to the same chokepoint `validateAndCloneTree` already runs at
   (`menu-service.ts:132-165`) — 1 function extended, not a new pass.
4. `renderWidgetMenuItems`'s existing attrs handling (`render.ts:1610-1639`, shipped by `92494e7c`) extended to
   also emit the `custom` bag via helper (1) — 1 call site.
5. **`renderMenuLinks` (`static-render.ts:177-185`) extended to emit the `custom` bag on the flat `<a>` tag** —
   **this is the new, mandatory call site.** It does not require switching the flat renderer to a `<ul>`/`<li>`
   tree (that structural question is orthogonal — flat stays flat, CSS compatibility is preserved); it only
   needs the same attribute-loop helper (1) applied to the existing `<a href=...>` output, conditionally, so a
   marker with no authored `custom` attrs still renders byte-identically (the existing pinning test's
   assumption survives; add a second case to the same test file proving attrs-present output, not a change to
   the existing byte-identical assertion).
6. `menuItemBody`/`menuItemClasses` (`static-render.ts:214-244`, tree variant) extended the same way — 1 call
   site, smaller since the named-field version already exists there.
7. Admin UI key/value rows for `attrs.custom`, plus the `id`/`tabindex` inputs' hazard captions (§2.4) — same
   `use-menu-editor.hooks.ts` plumbing already used for the five named fields, no new mechanism.

**~7 call sites**, up from the original pass's implicit ~4 (which undercounted the static-tier flat-renderer
fix as "not counted"). This is the direct, load-bearing consequence of decision 3, stated precisely per the
§0 correction above: an attribute that reaches widget-IR and the tree variant but not the flat variant would
silently vanish on **every current static theme's header nav except `basic`'s own live site copy**
(`basic-2`, `tailark-quartz-libre`, `tailark-quartz-dark`, `tailark-dusk` are all genuinely flat there, per
§0) — and would vanish on `basic` too the moment a new site is cloned from its (flat) template, or its site
copy's `variant:"tree"` drift is ever "corrected" back to match the template. Not a hypothetical the owner is
already safe from; a real gap for most themes today and a latent one for `basic` itself.

---

## 6. Open questions for the owner `[REVISED — two of three original questions are now answered/closed]`

The original pass's three questions are resolved: Q1 (slice order) is decision 1; Q2 (allowlist width) is
decision 2; Q3 (does the attrs bag need static-tier) is decision 3, and the corrected §0 finding shows it's
still a real, load-bearing need — just not for the reason ("invisible on the owner's own site today") this
doc briefly and wrongly claimed mid-revision; see §0/§4.1/§5's corrected framing. Nothing from that list still
needs the owner. Three things surfaced by this pass, none blocking either slice from starting:

1. **Elements allowlist for the raw-HTML body (§3.2)** was set once in the original pass (`a, span, div, ul,
   ol, li, nav, img, svg, use, path, br`) and not revisited by this round of decisions — worth a quick
   confirm before slice 1 ships that this still matches what the owner actually wants to author in a menu
   body specifically (a menu's HTML body is a narrower authoring surface than a widget's, so the same list may
   be more permissive than a menu ever needs — not a blocker, just worth a one-line confirmation).
2. **`sanitize-html`'s ESM interop** (§3.2) is flagged as a five-minute implementation-time check, not a
   design question — does not need the owner, only whoever picks up slice 1.
3. **`[NEW]` The `basic` template/site-copy drift on `menu-header-nav`'s `variant` (§0) is an independent bug,
   not part of this feature.** Someone added `variant:"tree"` to `sites/tovu-com/themes/static/basic/render/
   partials/nav.html:13` and never propagated it back to `content/themes/static/basic/render/partials/
   nav.html:7`. Whether to reconcile them (and which direction — promote tree to the template, since it's
   evidently the intended/better-looking state, or leave the template flat and treat the site copy as a
   deliberate one-off customization) is a real product decision, but it's orthogonal to shipping this design
   and doesn't need to block it — flagging so it doesn't get silently forgotten now that it's been noticed.
