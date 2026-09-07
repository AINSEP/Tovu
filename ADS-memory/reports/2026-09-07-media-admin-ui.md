# Media admin UI — bigger cards, eye-icon edit modal, mobile fix

Agent F. Branch `restructure/apps-website-phased`. Scope: `apps/admin/src/features/media/**` +
`apps/admin/src/styles/media.css`.

## Summary

| # | Ask | Status |
|---|-----|--------|
| 1 | Roughly double the media card size | DONE |
| 2 | Eye icon on the card opens the edit form as a modal | DONE |
| 3 | Check/fix mobile sizing after doubling | DONE |
| 4 | Add "HTML attributes" field under "CSS class (optional)" | **NOT IMPLEMENTED — dropped by coordinator decision** (2026-09-07, after I flagged the cross-package gap). Being folded into a separate slug+HTML-attributes pipe one agent will own end to end. See "Touchpoints for the follow-up agent" below. |

Commits, in order: `bf41e81c` (items 1-3 + a first pass at item 4), `7664a7aa` (report v1),
`a7cce060` (**reverted item 4** — see "Item 4 was built, then reverted" below). The tree as it
stands now contains items 1-3 only.

## 1 & 3 — Card size + mobile

`apps/admin/src/styles/media.css`'s `.media-grid`:

```css
grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr));
```

Doubled the minimum card width 180px -> 360px. A bare `minmax(360px, 1fr)` overflows a viewport
narrower than ~360px + padding — `auto-fill` still lays out a full 360px track even for a single
column. Wrapping the minimum in `min(360px, 100%)` caps it at the container's own width, so a
narrow viewport shrinks the single column instead of forcing horizontal overflow.

Verified live (not just reasoned about):
- Desktop 1280px: 2 columns, each card visibly larger, video thumbnails much more legible —
  `ADS-memory/reports/assets/2026-09-07-media-admin-ui/media-desktop-after.png`.
- Mobile 375px: single column, card shrinks to 351px (measured via
  `document.querySelector(".media-card").getBoundingClientRect().width`), `document.documentElement
  .scrollWidth === clientWidth === 375` — **no horizontal overflow** —
  `.../media-mobile-375.png`.
- Video card specifically (the stated pain point) —
  `.../media-videos-tab.png`: the eye icon (top-left) and expand icon (top-right) both sit clear of
  the native `<video controls>` bar at the bottom of the frame.

No "before" screenshot was captured — this is a shared git working tree with several other agents
live in it, and stashing/checking out a prior revision to screenshot it was judged not worth the
risk (see the repo's own "never bare stash/pop in a shared repo" rule). The prior grid rule
(`minmax(180px, 1fr)`, no mobile guard) is visible directly in the commit diff (`bf41e81c`).

## 2 — Eye icon -> modal

- `Media.tsx`: added `EyeIcon`, an `onEdit`/`agentEditHandle` pair on `MediaPreview` (same shape as
  the existing `onExpand`/`agentExpandHandle`), and a new `.media-card-edit` corner button
  (top-left; `.media-card-expand`'s existing lightbox trigger stays top-right so the two never
  collide). It calls the SAME `toggleEditing(item)` the row menu's "Edit metadata" already called —
  one edit UI, two doors into it, not a second divergent form.
- `EditMediaPanel` (the actual form) is unchanged in substance — same fields, same
  `useEditMediaPanelHook`, same `key={item.id}` remount-on-switch behavior that fixes the
  2026-08-12 stale-draft bug. It now renders inside a new `EditMediaModal`, a single shared
  `<dialog>` (`media.css`'s `.media-edit-dialog`) instead of a `.card` sitting inline above the
  grid. Lifecycle hook: `apps/admin/src/features/media/hooks/use-edit-media-modal.hooks.ts`, copied
  from `ThemePageDetailsModal.hooks.tsx`'s `useThemePageDetailsModal` (same native-`<dialog>`
  open/close/Escape/backdrop mechanics, same "single shared instance" convention as
  `MediaLightbox`/`ConfirmDialog`) — this repo's own precedent already documents why that lifecycle
  hook gets copied per-modal rather than shared.
- Verified live: clicking the eye icon opens the same "Editing …" form, pre-filled, inside a
  `<dialog>` — `.../media-edit-modal-open.png`. Mobile 375px modal —
  `.../media-mobile-modal-375.png` (stacks to one column per row, scrolls internally via
  `max-height: 90vh; overflow-y: auto`, no horizontal overflow).
- Tests in `Media.unit.test.tsx` (`describe("EditMediaModal — eye-icon trigger")`): the eye icon
  opens the same form the row menu opens, inside a real `<dialog>`; exactly one shared
  `<dialog class="media-edit-dialog">` exists (not one per card).

## Item 4 was built, then reverted

I built the HTML attributes field, its admin-side allowlist validator, and its tests in commit
`bf41e81c`, having flagged the cross-package gap to the coordinator (`main`) beforehand and gotten
no objection to shipping it as validated-but-not-yet-persisted. The coordinator then reviewed and
pulled it: **a field that renders, validates, and then silently doesn't persist is worse than no
field** — a "not yet saved" hint is still a control surface that looks functional in a screenshot
or a demo, and this shape is exactly what gets mistaken for working later. It was also identified
as the same underlying job as a media-slug feature Leona separately asked for, which needs the
identical three-file pipe crossed — the two should be built together by one agent that owns the
whole thing, not stitched across three agents.

Commit `a7cce060` removes `MediaHtmlAttributesField`, `rules.ts`'s
`parseMediaHtmlAttributes`/`isAllowedMediaHtmlAttributeName`/`describeMediaHtmlAttributeError` and
supporting types, the `htmlAttributesText`/`htmlAttributesError` state in
`use-edit-media-panel.hooks.ts`, and their tests. Re-verified live afterward (screenshot below) that
the modal goes straight from "CSS class (optional)" to "File URL" again, with items 1-3 fully
intact. `npx tsc --noEmit`: 0 errors. `npx eslint`: 0 errors, same 2 pre-existing warnings as
before (see Verification below). Full `apps/admin/src/features/media/` suite: 105/105 passing.

## Touchpoints for the follow-up agent (item 4 + the media-slug feature)

Both features need the same three-file pipe crossed. Exact locations, confirmed by reading the
code (not inferred):

**1. `@jini-ai/cms` — a SEPARATE REPO, not this one** (`/Users/la/Programming/Jini`, symlinked into
`node_modules/@jini-ai/cms`; NOT the `@jini-ai/admin` package, which is a real published npm
dependency with no local source in this checkout).
- `packages/cms/src/media/types.ts` — `MediaRecord` (lines ~44-69): a bespoke struct with
  individually-typed fields (`title`, `alt`, `caption`, `credit`, `source`, `status`, `createdAt`,
  `updatedAt`, `version`, `width`, `height`, `cssClass`). **No generic metadata/JSON bucket exists**
  — a new persisted field (a slug, or an HTML-attributes map) needs a new named field added here,
  not a write into an existing column.
- `packages/cms/src/media/media-service.ts` — `UpdateMediaMetadataInput` (lines ~343-364) and
  `updateMediaMetadata` (lines ~393-418). `cssClass`'s own handling (input line 363, service line
  412: `input.cssClass !== undefined ? (input.cssClass === null ? null : input.cssClass.trim() ||
  null) : existing.cssClass`) is the **working reference implementation** for a nullable-string,
  undefined-means-unchanged field — copy this shape for whatever new field(s) get added, don't
  invent a new contract.

**2. `apps/website/src/server/inbound/admin-http/routes/media/update.ts`** — same repo, but a
different app than `apps/admin`.
- `parseMediaMetadataPatch`, **lines 33-44**. Reads exactly **7 fixed keys** off the untyped request
  body: `title`, `alt`, `caption`, `credit`, `width`, `height`, `cssClass` — confirmed
  `cssClass` IS one of the 7 (line 42: `cssClass: parseOptionalNullableField(body.cssClass,
  String)`), so it's the same reference shape to copy here too.
- **The trap, confirmed directly, not assumed:** this function silently drops any key not in that
  list. There is no `.strict()`/schema rejection — sending an unrecognized field (e.g.
  `htmlAttributes`) returns a normal `200` with every OTHER field's change applied, and the unknown
  field simply never reaches `updateMediaMetadata`. An agent testing end-to-end by checking for a
  200 response would conclude the field saved. It did not. A new field needs an explicit new line
  added here (`parseOptionalNullableField(body.<field>, ...)` or equivalent) — it will not
  "just work" by being present in the client's PATCH body.

**3. Render/embed emission point — established read-only, not modified.**
`apps/website/src/server/inbound/public-http/http/site/render.ts`:
- `renderImageTag` (lines 605-620) and `renderVideoTag` (lines 634-647) are where the actual
  `<img>`/`<video>` tag strings get built, one attribute at a time, each omitted entirely when
  `null`:
  ```ts
  const classAttr = props.cssClass ? ` class="${escapeHtml(props.cssClass)}"` : "";
  ```
  (`render.ts:618` for images, `:644` for video — identical shape in both). Whatever new
  attribute(s) get added to `MediaRecord` would extend `props` here and append another
  `escapeHtml`-guarded ` attr="value"` fragment the same way `width`/`height`/`cssClass` already do.
  Both functions are called from two places per their own doc comment (`render.ts:590-596`): the
  TipTap `image` ref-node case and `resolver-service.ts`'s `resolveHtmlPageEmbeds` (SPEC-047 media
  embeds) — a new attribute needs to flow through both call sites, which both already thread
  `width`/`height`/`cssClass` end to end, so tracing those three names forward from
  `apps/website/src/features/widgets/resolver-service.ts:587,630,754` and
  `.../routes/site/pages.ts:931` shows the full existing wiring to extend.
- I did not modify anything in this file or its callers — read-only confirmation only.

## Recommendation carried forward from the reverted work: the HTML-attributes allowlist

Not implemented, but worth starting from rather than redesigning. This is a stored-XSS boundary:
media metadata is authored in admin, rendered on the public site via the emission point above.

- **Allowlist, not a blocklist.** Permit exactly: the `data-*` and `aria-*` prefix families
  (open-ended, no fixed suffix list), plus an exact list — `loading`, `decoding`, `playsinline`,
  `muted`, `loop`, `autoplay`, `poster`. Reject everything else outright; do not sanitize a
  disallowed name into something safe.
- **Never allow `on*` handlers or a `javascript:` value**, checked BEFORE plain allowlist
  membership so a rejected `onerror="..."` reports as "event handler" (the specific, actionable
  reason), not the generic "not allowed" — an allowed name (e.g. `poster`) can still carry a
  dangerous `javascript:` value, so the value needs its own check independent of the name check.
- **Enforce server-side, not only in the form** — a client-side-only check is not a control, since
  the API accepts whatever a caller sends. Both the write path (`updateMediaMetadata`) and the
  render path (`renderImageTag`/`renderVideoTag`) need the same check; never trust that the admin
  client actually ran it.
- **Errors must name the exact rejected attribute or fragment** — "invalid input" is not
  actionable; "'onerror' is not an allowed HTML attribute" is.
- A working pure-function parser (tokenizer + allowlist check + specific rejection reasons, plus 24
  unit tests covering adversarial cases — mixed valid+invalid tokens, case variation, an allowed
  name carrying a dangerous value, quote-style variation, boolean attributes, malformed fragments)
  existed in `rules.ts` before the revert and is fully recoverable from commit `bf41e81c` if the
  follow-up agent wants a starting point rather than a blank page — it has no React/DOM dependency,
  so the same logic can run again at the write path and again at render time.

## Verification

- `apps/admin`: `npx tsc --noEmit` — 0 errors (repo baseline is 0; introduced none) both with item 4
  present and after the revert.
- `apps/admin`: `npx eslint` on all 4 changed files — 0 errors. 2 pre-existing
  `sonarjs/no-nested-conditional` warnings remain in `MediaPreview` (same shape as the file's
  pre-existing `expandButton` pattern; not introduced by this change, not blocking).
- Tests: `env -u TOVU_ADMIN_PASSWORD npx vitest run` on the full `apps/admin/src/features/media/`
  directory plus `request-volume.measurement.test.tsx` — **105 passed, 0 failed** after the revert
  (includes the pre-existing 2026-08-12 stale-draft regression pin, unaffected by the modal
  wrapper).
- Visual: live in the running dev admin (`https://localhost:5173`, already up, not restarted) via
  Playwright MCP — desktop 1280px, mobile 375px, the modal at both widths, the video tab, and
  (post-revert) confirmation the HTML-attributes field is gone. Screenshots under
  `ADS-memory/reports/assets/2026-09-07-media-admin-ui/`. One pre-existing, unrelated console error
  (`favicon.ico` 404) — not caused by this change.
