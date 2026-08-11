# Implementation report — Post editor: Edit/Preview tabs, merged toolbar, header rule, gap fix

Agent: Sonnet 5 subagent (`programmer` persona, `AI-Dev-Shop/agents/programmer/skills.md` v1.7.1),
dispatched 2026-08-11 on branch `general-work`, screen `http://localhost:5173/admin/posts/theme-authoring`.

Four changes, dispatched together. Files touched: `apps/admin/src/features/posts/PostEditor.tsx`,
`apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts`,
`apps/admin/src/features/posts/__tests__/PostEditor.unit.test.tsx`, `apps/admin/src/styles.css`,
`apps/admin/src/styles/editor.css`.

---

## 1. Edit / Preview tabs

Named "Edit" and "Preview" — product-facing, not "Tiptap" (the owner's own words described the
mechanism, not the label a person should read). Tab state (`PostEditorView = "edit" | "preview"`)
lives in `use-post-editor.hooks.ts` (`view`/`setView`), not as component-local state, matching this
codebase's own split ("state lives in the hook, `PostEditor.tsx` is markup only" — this file's own
header) and `features/pages/hooks/use-page-editor.hooks.ts`'s identical `PageEditorView` precedent.
Defaults to `"edit"`: opening a post shows exactly what every post editor has always shown, not a
behavior change riding along with the new tab.

## 2. Template chooser moves onto the tab row, matching Pages' shape exactly

Read `PageEditor.tsx` first, as instructed, and matched its structure: `.page-editor-toolbar` (tabs
left via `.segmented[role=tablist]`, `.page-editor-toolbar-end` right) — reused directly from
`styles/pages.css` rather than duplicated, since those two classes already have a second consumer
beyond Pages (`ThemeExplore.tsx`'s own toolbar); this is a third, not a fork. Only the template
picker's MARKUP moved (out of the old `.editor-slug-row`, into `.page-editor-toolbar-end`) — its
`availableTemplates`/`templateChoice` wiring is untouched, per the concurrency warning that
`UnifiedContent` owns that data source. Rendered unconditionally of `view`, same as Pages: a
publish-time setting, not tab-specific content. `.editor-slug-row` is now empty and was deleted —
both its JSX usage and its CSS rule (base + the `max-width: 640px` stacking rule) — rather than left
as a dead wrapper; confirmed via grep it had exactly one consumer before removing it.

## 3. Preview tab renders the post the way a visitor sees it

Reused the pattern `7421b80` built for `PageEditor.tsx`'s `PagePreview`
(`ADS-memory/reports/implementation/2026-08-11-html-view-and-preview.md`), not reinvented: a
**published, un-dirtied** post iframes its **real public URL** (`siteUrl`, the same helper the
"view ↗" link already uses) — zero drift from what a visitor gets, because it's the actual server
render pipeline (`renderDocNode`, `src/server/http/site/render.ts`), not a second copy of it built
in the admin. Reimplementing that pipeline here was explicitly avoided (and that file is out of this
dispatch's scope besides).

**One real difference from Pages, and it's structural, not a choice**: a Page's body already IS raw
HTML; a Post's body is TipTap `bodyJson`. So the fallback branch (draft, or published-with-unsaved-
edits) can't just `srcDoc` the stored body the way Pages does — there is no stored HTML to show.
Instead it renders `editor.getHTML()` (TipTap's own client-side serializer, read fresh every render,
same idiom the hook already uses for `editor.getJSON()` in its dirty comparison) into the same
`SrcDocSandbox` Pages' fallback uses. This is disclosed as a rough shape/content check, not parity —
no widget resolution, no media-transform URLs, no theme wrapper — for the same reason the live-site
branch exists at all: a second `renderDocNode` here would be exactly the duplication this whole
approach avoids.

**No device-width scaling.** Pages' `PagePreview` scales a fixed-width box to simulate Desktop/
Tablet/Mobile — nothing in this dispatch asked for that on Posts, so `PostPreview` just fills its
`.editor-shell` at natural width, matching how the Tiptap editor above it has always sized. Judgment
call: adding unused machinery to "look more like Pages" would be scope creep in the other direction.

**`dirty` newly exposed from the hook.** `usePostEditor` already computed `isDirty` via
`useDirtyGuard` internally (only `confirmLeave` was returned before) — added `dirty: isDirty` to
`PostEditorController` so the Preview tab can make the same eligibility decision Pages makes.

## 4. Two smaller fixes

**Title-row rule now spans the full row.** `.editor-title`'s own `border-bottom` (used bare and
full-width in `MenuEditor.tsx`/`CollectionEntryEditor.tsx`/`WidgetInstanceEditor.tsx`) stopped dead
at 50% once the title was capped to half the row — confirmed live, it read as a broken separator, not
Chose **span it — not drop it**: moved the line off `.editor-title-row .editor-title` (now
`border-bottom: none`, scoped to that row only, every other `.editor-title` consumer unaffected) and
onto `.editor-title-row` itself, so one continuous rule spans both the title and slug halves as a
single page-header separator. Measured live: `.editor-title-row`'s computed `border-bottom-width` is
now `1px`, visually continuous across the full row width in the screenshot below.

**Toolbar-to-pane gap.** Measured first, per instructions, rather than guessing: temporarily removed
the fix class live via `element.classList.remove(...)` and re-measured
(`getBoundingClientRect().top`/`.bottom`) rather than reasoning from CSS alone —
**36px → 12px**, confirmed both numbers empirically in the running app, exactly matching `b9a2206`'s
identical fix on the Pages side. Root cause: `.page`'s own `display: flex; flex-direction: column;
gap: var(--space-6)` (24px) lands between `.page-editor-toolbar` and the pane below it, stacking with
the toolbar's own `0.75rem` (12px) bottom margin → 36px. Fix: a new `.post-editor-pane` class
(`styles/editor.css`, applied to both the Tiptap-shell wrapper and `PostPreview`'s frame) cancels
exactly `--space-6`, leaving only the toolbar's own margin. **Not** `.page > .editor-shell` (Pages'
own selector shape) — `.editor-shell` has another direct-child-of-`.page` consumer with no toolbar
above it at all (`CollectionEntryEditor.tsx`), so that selector would have pulled its pane up too,
against nothing. A dedicated class avoided that collateral hit; confirmed via grep every
`.editor-shell` call site before choosing the selector.

---

## Verification (live, not inferred)

All checks run against the "Theme Authoring" post (published, real content, `blog-sidebar-template.html`
template) at `http://localhost:5173/admin/posts/theme-authoring`, in a **separate Playwright tab**
(index 1) opened specifically for this work — the default shared tab (index 0) was mid-use by other
concurrent agents (`ThemeExplore`) for the entire session; screenshots taken against the shared tab
came back showing their page, not this one, until a dedicated tab was opened. Closed at the end,
leaving the shared tab exactly as found.

- **Toolbar layout**, `getBoundingClientRect()`: `.page-editor-toolbar` and `.post-editor-pane` share
  `left: 272` / `right: 1426` — the tabs+template row and the pane below both span the full available
  width, no dead space.
- **Gap fix**: `36 → 12` (see above), measured with the fix live-toggled on the same DOM node.
- **Title-row border**: `.editor-title-row` computed `border-bottom-width: 1px`; screenshot shows one
  continuous line under both the title and slug halves.
- **Tab switching**: screenshotted both Edit (Tiptap toolbar + body, unchanged content) and Preview
  (themed site render — nav, sidebar TOC, article) states.
- **Live-site branch**: `document.querySelector('[title="Post preview"]')` — `src:
  "http://localhost:3000/theme-authoring"`, no `srcdoc`, no `sandbox` attribute (unsandboxed, matching
  a real visitor's load).
- **Fallback branch**: typed into the title field to dirty a published post, confirmed the preview
  iframe lost its `src` (had no `src` attribute at all — the `SrcDocSandbox` `srcDoc` branch) and the
  notice "This is a rough render of the editor buffer only — save your changes to preview them with
  the theme's real template and CSS." appeared. **Caught the same trap the Pages report flagged**:
  the field edit was made with a raw DOM value-setter to restore the exact original title afterward,
  confirmed via a fresh page reload that the server-stored title round-tripped byte-for-byte
  ("Theme Authoring") — Save was never clicked, so nothing was ever persisted from this probe.
  `beforeunload`'s dirty guard actually blocked one navigation attempt mid-probe (`net::ERR_ABORTED`)
  before the title was restored — direct live confirmation the dirty guard itself still works.
- Draft-status fallback (the other half of `canShowLiveSite`'s branch) verified via the new unit
  tests below rather than live-toggled against this real post's status, to avoid actually unpublishing
  a live demo record mid-verification — same tradeoff `PageEditor`'s own predecessor report made for
  its equivalent branch.
- Screenshots (repo root, untracked, not gitignored — consistent with every other screenshot already
  left there this session): `post-editor-edit-view-2.png`, `post-editor-preview-view.png`,
  `post-editor-preview-dirty.png`.

## Function-quality table

| unit | disposition | findings | complexity |
|---|---|---|---|
| `PostPreview` (PostEditor.tsx, new) | NO_RECORDED_FINDINGS | — | O(1); one boolean branch (`canShowLiveSite`), no loops, no I/O beyond the iframe/sandbox the browser itself owns |
| `usePostEditor`'s `view`/`dirty` additions (use-post-editor.hooks.ts) | NO_RECORDED_FINDINGS | — | O(1) state additions; `dirty` is a straight re-export of `useDirtyGuard`'s existing `isDirty`, no new computation |
| Tab-button `onClick={() => setView(entry.key)}` (PostEditor.tsx, inline) | NO_RECORDED_FINDINGS | — | O(1); trivial closure, matches `PageEditor.tsx`'s own tab-button precedent verbatim |

**Zero-findings skepticism pass**: the one genuinely new piece of branching logic is
`canShowLiveSite = status === "published" && !dirty` — traced by hand against all four
status×dirty combinations, then confirmed three of the four live (published+clean → live iframe;
published+dirty → fallback+notice; draft+clean → fallback+notice, via unit test) and the fourth
(draft+dirty) is the same fallback branch as draft+clean with an identical `status !== "published"`
condition, so it was not separately unit-tested — recorded here rather than silently assumed.
Variable-name audit: `dirty` on `PostEditorController` is a direct rename-free re-export of
`useDirtyGuard`'s own `isDirty` (checked the hook's return statement directly), not a new or
differently-scoped value; `bodyHtml` passed into `PostPreview` is genuinely TipTap's own
`getHTML()` output, never confused with the server's `renderDocNode` output the live-site branch
uses instead.

## Architecture Audit

**Status: PASS.**

- `PostPreview` and the `view`/`setView`/`dirty` additions stay inside `features/posts/` — no new
  imports beyond `SrcDocSandbox` (`@jini-ai/ui/renderers`), already an approved cross-package import
  via `PageEditor.tsx`'s identical usage.
- Did not touch `src/features/theme/`, `src/server/`, `src/core/embeds/`, `src/widgets/`,
  `apps/admin/src/features/themes/`, or `src/themes/static/basic/` — confirmed via `git show --stat`
  on the commit (only the five files listed at the top appear).
- Template-picker data source (`availableTemplates`, `templateChoice`, their setters) left completely
  untouched per the concurrency warning — only its JSX location moved.
- `check:admin-complexity-drift` run after all changes: reports 3 new violations, none in
  `PostEditor.tsx` or `use-post-editor.hooks.ts` (they're `PageEditor.tsx`, `prettify-html.ts`,
  `Themes.tsx` — other concurrent agents' files, not this dispatch's).
- No ADR ambiguity encountered.

## Pre-Completion Checklist

- Requirements re-verified against all four numbered tasks in the dispatch, above.
- Fresh evidence, re-run in this session after all changes:
  `cd apps/admin && npx tsc --noEmit` → 35 errors, unchanged baseline, none in touched files;
  `npx vitest run src/features/posts` → 4 files, **90 tests, all green** (81 pre-existing + 9 new).
- No certified test was deleted or weakened — 9 new tests added to `PostEditor.unit.test.tsx`
  (`describe("Edit/Preview toolbar", ...)`), zero existing tests modified, zero existing tests
  skipped.
- Scope: exactly the five files listed at the top — the post/page editor screen, its hook, its test
  file, and the two CSS files already established as this screen's own (`styles.css`'s existing
  title/slug/template-picker block, `styles/editor.css`'s companion-rules file). No file in the "stay
  out of" list touched.
- Open items: none for this dispatch's four tasks. The draft+dirty quadrant of `canShowLiveSite` is
  logically identical to the tested draft+clean quadrant (same `status !== "published"` guard) and
  was traced, not independently tested — noted above rather than silently assumed equivalent.

## Self-Validation

**PASS.** Runtime-changing, UI-facing behavior — required and run, in a dedicated Playwright tab (see
Verification's concurrency note). Critical path checked live: Edit/Preview tab switch, template
picker relocated onto the shared toolbar row, live-site iframe branch (real `:3000` render, correct
`src`, no sandbox), toolbar-to-pane gap measured before/after on the actual DOM. Negative/edge path
checked: the fallback branch (dirty post) renders the rough TipTap-serialized buffer with the correct
notice copy and no `src` attribute; the accidental full-value `.fill()` overwrite during that probe
(same trap the Pages report flagged) was caught before any Save, confirmed not persisted via a fresh
reload showing the original server-stored title. No bounded diagnosis pass was needed; the one
transient issue (the shared browser tab showing another agent's page) was resolved directly by
opening a second tab, not carried forward as an open question.

## Risks and tech debt

- The Preview tab's fallback render (`editor.getHTML()`) is deliberately shallower than the real
  site render — no widgets, no media transforms, no theme CSS — same disclosed tradeoff as Pages'
  own fallback, and unavoidable without duplicating `renderDocNode` in the admin.
- Draft+dirty is untested directly (traced only) — see Pre-Completion Checklist's Open items.
- `.editor-title-row .editor-title { border-bottom: none }` leaves `.editor-title:focus`'s
  `border-bottom-color` rule (`styles/editor.css`) a harmless no-op specifically inside this row
  (it still functions normally everywhere else `.editor-title` is used bare) — disclosed rather than
  silently left for someone else to puzzle over later.

## Files changed

`apps/admin/src/features/posts/PostEditor.tsx` (Edit/Preview tabs, merged toolbar row, `PostPreview`),
`apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts` (`PostEditorView`, `view`/`setView`,
`dirty`), `apps/admin/src/features/posts/__tests__/PostEditor.unit.test.tsx` (+9 tests),
`apps/admin/src/styles.css` (title-row border-bottom fix, `.editor-slug-row` removed),
`apps/admin/src/styles/editor.css` (`.post-editor-pane`, `.editor-preview-iframe`,
`.editor-preview-notice`).
