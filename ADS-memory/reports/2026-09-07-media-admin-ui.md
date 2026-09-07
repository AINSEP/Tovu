# Media admin UI — bigger cards, eye-icon edit modal, mobile fix, HTML attributes field

Agent F. Branch `restructure/apps-website-phased`. Scope: `apps/admin/src/features/media/**` +
`apps/admin/src/styles/media.css`.

## Summary

| # | Ask | Status |
|---|-----|--------|
| 1 | Roughly double the media card size | DONE |
| 2 | Eye icon on the card opens the edit form as a modal | DONE |
| 3 | Check/fix mobile sizing after doubling | DONE |
| 4 | Add "HTML attributes" field under "CSS class (optional)" | UI + admin-side allowlist DONE; server persistence is an **open cross-package gap**, not closed — see below |

Commit: `bf41e81c` on `restructure/apps-website-phased`.

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
(`minmax(180px, 1fr)`, no mobile guard) is visible directly in the commit diff.

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
- New tests in `Media.unit.test.tsx` (`describe("EditMediaModal — eye-icon trigger and HTML
  attributes field")`): eye icon opens the same form the row menu opens, inside a real `<dialog>`;
  exactly one shared `<dialog class="media-edit-dialog">` exists (not one per card); Save blocks
  live once the HTML-attributes field is invalid and re-enables once fixed; a valid
  `htmlAttributes` draft never reaches the PATCH body.

## 4 — HTML attributes field, and where the security control actually lives

**Where enforcement lives today: `apps/admin/src/features/media/rules.ts`, admin-side only.**

- `isAllowedMediaHtmlAttributeName` — allowlist: `data-*`/`aria-*` prefix families, plus an exact
  list (`loading`, `decoding`, `playsinline`, `muted`, `loop`, `autoplay`, `poster`).
- `parseMediaHtmlAttributes` — tokenizes the field's free text and rejects, with a specific reason
  naming the offending attribute: any `on*` handler (checked ahead of allowlist membership, so
  `onerror` always reports as "event handler", not the generic "not allowed"), any `javascript:`
  value (case/whitespace-insensitive), anything else not on the allowlist, or an unparsable
  fragment. First rejection wins, scanning left to right — never a partial accept.
- `describeMediaHtmlAttributeError` formats the specific, visible message shown inline.
- `use-edit-media-panel.hooks.ts` validates the field live and **blocks `save()`** while it's
  invalid (both via a disabled Save button and a defense-in-depth check inside `save()` itself).
- 24 unit tests in `media-html-attributes.unit.test.tsx` cover the allowlist and parser, including
  adversarial cases: mixed valid+invalid tokens (first offender wins, nothing partially accepted),
  case variation, an allowed name (`poster`) carrying a dangerous `javascript:` value, quote-style
  variation, boolean attributes, malformed fragments.
- Verified live: typing `onerror="alert(1)"` shows *"Event handler attributes like 'onerror' are
  not allowed."* in red and disables Save immediately —
  `.../media-html-attr-error.png`.

**Where enforcement does NOT live — the open gap.** `htmlAttributesText` is intentionally **never
included in `save()`'s patch** and is never sent to the server. `AdminMedia`/`MediaRecord` has no
field for it at all:

- `@jini-ai/cms/src/media/types.ts`'s `MediaRecord` and `media-service.ts`'s
  `UpdateMediaMetadataInput`/`updateMediaMetadata` — a different repo (`/Users/la/Programming/Jini`),
  not this one.
- `apps/website/src/server/inbound/admin-http/routes/media/update.ts`'s
  `parseMediaMetadataPatch` — reads exactly 7 fixed keys off the request body and silently drops
  anything else (confirmed: no strict-schema rejection, so it's a safe no-op, not a 400).
- The render/embed path that would actually emit the attribute onto the public `<img>`/`<video>`
  tag — outside this scope entirely (Agent G's territory per my dispatch brief).

I flagged this to `main` before doing any work outside `apps/admin` and got no objection to the
UI-only plan, so the field ships with a permanent, honest hint under it: *"Not saved to the server
yet — publishing support is coming."* Nothing here creates a false sense that the value is
persisted or rendered — only that a *typed* value is validated against the allowlist before it
would ever be allowed to leave the browser.

**For whoever picks up persistence next:** the allowlist logic in `rules.ts` is written to be
reused as-is server-side (pure functions, no React/DOM dependency) — the same
`parseMediaHtmlAttributes` should run again at the write path (never trust that the client actually
ran it) and again at render time before the value touches the public HTML.

## Verification

- `apps/admin`: `npx tsc --noEmit` — 0 errors (repo baseline is 0; introduced none).
- `apps/admin`: `npx eslint` on all 6 changed/added files — 0 errors. 2 pre-existing
  `sonarjs/no-nested-conditional` warnings remain in `MediaPreview` (same shape as the file's
  pre-existing `expandButton` pattern; not introduced by this change, not blocking).
  `EditMediaPanel`'s complexity briefly hit 10/11 (ceiling 9) while adding the new field's error
  ternary and the Save-disabled `||`; fixed by extracting `MediaHtmlAttributesField` and
  `EditMediaActions` as their own components (same "independent branches scored in their own scope"
  pattern this file already uses for `MediaToolbar`/`MediaPurgeDialog`/`MediaGridOrEmpty`).
- Tests: `env -u TOVU_ADMIN_PASSWORD npx vitest run` on the full `apps/admin/src/features/media/`
  directory — **106 passed, 0 failed** (includes the pre-existing 2026-08-12 stale-draft regression
  pin, unaffected by the modal wrapper) — plus the `request-volume.measurement.test.tsx` file that
  exercises the edit panel's open/close/reopen cost, also green.
- Visual: live in the running dev admin (`https://localhost:5173`, already up, not restarted) via
  Playwright MCP — desktop 1280px, mobile 375px, the modal at both widths, the video tab, and the
  live allowlist rejection. Screenshots under
  `ADS-memory/reports/assets/2026-09-07-media-admin-ui/`. One pre-existing, unrelated console error
  (`favicon.ico` 404) — not caused by this change.

## Needs Leona's ruling

- The HTML-attributes field is fully built and validated but **cannot do anything yet** — it has no
  server field to write to. Worth deciding who picks up the `@jini-ai/cms` + `apps/website` route +
  render-path work (and in what order relative to Agent E/G's current work in those same areas)
  before this is presented as "done" to her.
