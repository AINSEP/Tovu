# Queue for ExploreFileOps — ThemeExplore.tsx work

Written by the Coordinator 2026-08-11 while the agent was mid-flight. **Mid-flight `SendMessage` does
not reach a heads-down subagent in this setup** (owner stated it twice today), so this file is the
record and any message is only a nudge. If you are the agent and an instruction below is not in your
transcript, you never received it — act on the file.

Also serves as restart-safety: if the Coordinator's context is lost, this is the remaining work.

---

## Sent in Msg 5 (consolidated, after the agent surfaced)

1. **BLOCKING — function-quality/complexity self-check** (`programmer` persona step 187) was never
   run. `npm run check:admin-complexity-drift` **exits 1**; `ThemeExplore.tsx` and `Themes.tsx` are
   NEW violations absent from the debt file. Trap: the owner's drift tool aggregates closures into
   the enclosing hook, ESLint does not — **only TOP-LEVEL extraction lowers both.** No complexity
   numbers in source comments; `@complexity` docs yes, metrics go in the report.
2. **⋮ wraps onto its own line** — every row is two rows tall. Likely the flexbox `min-width: 0`
   gotcha. Row `display:flex; align-items:center`; label `flex:1; min-width:0` + ellipsis; ⋮
   `flex:none`. **No character cap** (sidebar is resizable). **CSS only — no tooltip machinery**;
   `title` = full relative path is a plain attribute and is the whole implementation. ⋮ on
   `:hover`/`:focus-within` + always on the selected row; reserve its width so rows don't reflow.
3. **Sidebar becomes one full-height column** — top-aligned with the top of the toolbar row above
   the preview, bottom-aligned with the bottom of the preview/HTML pane. Commit `6161855`'s fixed
   max-height cap must become "fill available height, scroll inside".
4. **Share one `isGenerated` definition.** `marketplace.ts`'s `isGeneratedPreviewPath` duplicates
   `explore.ts`'s `GENERATED_DIRS`/`isGenerated`. `marketplace.ts` is now free (that agent finished).
   Preserve the tested edge case: a sibling like `preview-notes/` must NOT match.
5. **Judgment calls:** Reset staying reachable for read-only files — KEEP, document why (reset can
   only write the *original* bytes, so read-only means "can't author", not "can't restore").
   Script rename — reconsider blocking rename for `script`/`other` groups entirely, since JS is
   read-only precisely so nobody breaks the page, yet rename can break a `<script src>` the operator
   then cannot open to fix. Agent's call, but deliberate and recorded.
6. **Answer:** is the `headcountss` edit in `basic/pages/pricing.html` yours? Live on the owner's
   public pricing page. Revert that one line if yours; touch nothing if not. Never `git checkout` the
   directory — `index.html` carries an owner edit that must survive.

---

## NOT YET SENT — owner-approved 2026-08-11, deliver at the agent's next surfacing

### 7. Toolbar restructure on the Explore screen (owner approved: "Do it")

Match the Pages editor's toolbar shape. Pages currently reads:
`[← Pages]  [Published ▾]  [Save]  [Delete]` — outline back-button, filled Save, red-outline Delete.

On Explore:

- **`← All themes` becomes a button, not a bare link** — styled exactly like Pages' `← Pages`
  (outline/secondary, same size, same arrow treatment). It is currently a plain blue text link.
- **Move Save and Reset up into that same top row**, beside `← All themes`.
- **Save is GREEN background with WHITE text** (owner explicit — *not* the brown/rust filled style
  Pages uses for its Save). Reuse the token that backs the green `Active` pill on the Themes page;
  do **not** hardcode a hex. If no such token exists, add one — the admin is getting skinnable
  surfaces, and a hardcoded color is invisible to a skin.
- **Reset takes the red-outline treatment**, mirroring Pages' `Delete`, since it is the destructive
  action.

**The one non-obvious requirement — bind the buttons to the FILE, not the theme.** On Pages, Save
saves *the page*, so a page-level toolbar is honest. On Explore, Save saves *the currently selected
file* and Reset resets *that file*. Placed in a page-level toolbar they read as acting on the whole
theme — an operator with edits in `about.html` could hit the top-bar Save and reasonably believe
everything saved. Fix by labelling with the filename (**"Save about.html"**) or by visually binding
the pair to the editor pane rather than the page header. Pick one and say which.

Keep the ⌘S binding and the existing ⌘S hint working after the move.

**This interlocks with item 3** — the sidebar must top-align with this toolbar row, and this task
changes that row's contents and height. Do them together, in one commit, or the alignment will be
measured against a row that is about to change.

### 8. The rename-refusal error presentation (owner raised, screenshot)

Attempting to rename `theme.json` currently produces a full-width pink inline banner with a red left
bar: *"theme.json can't be renamed — every theme requires this exact file to load at all."* The
owner's suggestion: make it a centered toast.

**Make it a toast. Do NOT disable the Rename affordance.**

The Coordinator proposed disabling `Rename` in the ⋮ menu for the un-renameable files so the error
became unreachable. **The owner considered that and rejected it, deliberately:** *"I like the fact
that we got the error, because then they're gonna wonder why it's not working. That's fine. It's
just — it should be a toast."*

The reasoning is sound and worth preserving: a greyed-out menu item is easy to miss and explains
nothing, while an explicit refusal teaches the operator *why* `theme.json` is special. The error is
the feature. Keep rename attemptable on every file; only the presentation changes.

So: `theme.json`, `tokens.json`, `tokens.light.json`, and `pages/index.html` stay right-clickable and
double-clickable into rename, and the refusal surfaces as a toast — same as a name collision, a
containment rejection, or a write failure. One presentation for all of them.

**Toast requirements:**
- **Reuse the admin's existing toast/notification component.** Check for one before building
  anything — this admin already has notification surfaces, and a second parallel system is exactly
  the kind of duplication that was just flagged in `isGenerated`. If none exists, say so and keep the
  inline banner rather than inventing a toast framework as a side quest.
- Centered horizontally, near the TOP rather than the middle of the viewport — a mid-screen overlay
  covers the file list and the editor, which is where the operator is looking.
- `role="alert"` (or `role="status"` for non-error toasts) so it is announced to screen readers. An
  error that only exists visually is not an error message.
- **Errors must not auto-dismiss on a timer alone**, or must be dismissible and persist long enough
  to read — an operator who looked away has no way to recover the text. Transient success toasts
  ("Copied to about-1.html") auto-dismissing is fine.
- Keep focus management sane: the toast must not steal focus from the rename input.

Note the message text itself is good — it says what happened AND why. Preserve that wording.

### 9. Pages editor — dead vertical space above the preview (owner, screenshot)

**Different screen: `http://localhost:5173/admin/pages/<slug>`, not Explore.** Likely
`apps/admin/src/features/pages/PageEditor.tsx` plus `apps/admin/src/styles.css`.

The tab row (`HTML` / `Interactive` / `Preview` on the left, `Desktop` / `Tablet` / `Mobile` /
`1280px` on the right) sits too far above the top of the preview pane. Close the gap.

Owner's framing: *"It's a minor thing, but I just wanna go on."* Treat it as a small, low-risk
spacing fix — do not turn it into a layout refactor.

- Find the actual source of the gap before changing anything: it may be the tab row's bottom margin,
  the preview container's top padding, a wrapper's `gap`, or two of those stacking. Measure with
  `getBoundingClientRect` — the distance between the tab row's `bottom` and the preview pane's `top`
  — rather than guessing which rule owns it. Report the before and after numbers.
- Use the existing spacing tokens/scale; do not introduce an arbitrary pixel value.
- **This is why it is assigned here and not to a parallel agent:** it touches
  `apps/admin/src/styles.css`, which items 2-5 also touch. A second agent in that file would collide.
- Watch for the adjacent trap already recorded for this screen: commit `3ac885e` fixed PageEditor's
  preview scale to track the real pane width via ResizeObserver. Do not regress that — verify the
  preview still scales correctly at Desktop/Tablet/Mobile after the spacing change.

### 10. Themes page — tier tab order (owner)

`apps/admin/src/features/themes/Themes.tsx`. The tier tabs currently render:

    Declarative 1 | Templated 0 | Static 7 | Code 0 | Marketplace

The owner wants:

    Declarative | Static | Templated | Code | Marketplace

So `Static` moves ahead of `Templated`; `Code` stays fourth and `Marketplace` stays last. Almost
certainly a single array reorder.

- **Marketplace must remain last.** It is not a tier — it is a different surface (remote catalog vs.
  installed themes), so it belongs at the end regardless of how the tiers are ordered.
- Check whether the tier order is defined once or duplicated. `ThemeTier` is declared at
  `src/features/theme/theme.ts:33` as `"declarative" | "templated" | "handlebars" | "static" |
  "code"`. If the admin derives its tab order from that union or from a shared constant, reorder the
  single source rather than hand-sorting in the component — and check nothing else depends on the
  existing order (a default-tier pick, a fallback, a test asserting the sequence).
- Note the union includes `handlebars`, which the owner's list does not mention and the current tab
  strip does not show. Do not add a Handlebars tab — just don't be surprised it exists in the type.
- `Themes.tsx` is free: the agent that restyled its Explore button (commit `27a8ca0`) has been
  stopped.

### 11. Explore button — border too faint (owner, follow-up to commit `27a8ca0`)

Same file as item 10, `apps/admin/src/features/themes/Themes.tsx` (plus whatever rule in
`apps/admin/src/styles.css` backs it).

The Explore button was just restyled to white surface / near-black text, reusing `.btn-secondary`'s
pairing — `--surface` background, `--fg` text, `--border-strong` border. **The border is the
problem:** `--border-strong` resolves to `oklch(0.86 0.01 255)` in light mode, which is a light gray
and nearly disappears against the equally-white card. Owner: *"have it have a black outline … it's
like the light gray right now. I just wanna see it actually."*

Make the border match the text — near-black in light mode.

**Recommended mechanism: `border-color: currentColor`.** The button's text is already `--fg`, so
`currentColor` gives a near-black border in light mode and the light `--fg` in dark mode
automatically, with no second token and no `@media` branch. That matters here because a literal black
border would vanish against the dark-mode card surface (`--surface` is `oklch(0.185 …)` in dark), so
a hardcoded dark value would fix light mode and break dark. If `currentColor` doesn't fit the
existing button-class structure, use `--fg` explicitly and verify BOTH modes.

- **Do not hardcode a hex.** Standing constraint — the admin is getting skinnable surfaces.
- Scope this to the Explore button, not to `.btn-secondary` globally, unless every other consumer of
  that class should also get a heavier border. Check the other consumers before deciding; widening
  the blast radius silently is worse than a slightly more specific rule.
- Keep the hover (`--surface-2`) and the focus ring (`--accent-text`, 2px solid, 2px offset) working
  and still visible against the new border.
- **Verify both light and dark** with `getComputedStyle` readbacks, as the previous pass did — the
  predecessor toggled `data-theme` and reset it afterward, which is the pattern to copy since this
  admin has no live dark-mode toggle.

### 12. Dark-mode toggle in the admin (owner, new feature)

Owner: *"was an agent playing with dark mode earlier? It looked actually good. Like, really good. I
want the sun and moon button at the top right where I can switch between them to see."*

**No agent built dark mode.** What the owner saw is subagents flipping `data-theme` on
`documentElement` via `page.evaluate` to verify their token work rendered correctly in both modes.
That is good news: the token system already produces a correct dark rendering, so this is wiring, not
a restyle.

**Current state (verified 2026-08-03, re-confirmed by two agents today):** there is **no live
dark-mode toggle in this admin.** `AppearanceTab` is the only component that writes `data-theme` onto
`documentElement`, and it is mounted once, inside the Settings dialog, with `livePreview={false}`.
Dark mode is otherwise reachable only via `page.evaluate`.

**Build:** a sun/moon toggle in the admin's top-right chrome that flips `data-theme` on
`documentElement`.

- **Find the single existing writer of `data-theme` first and reuse it.** `AppearanceTab` already
  does this. A second, independent place that sets the same attribute is precisely the duplication
  pattern flagged twice today (`isGenerated`, the two marker scanners). Extract the shared mechanism
  rather than adding a parallel one, and make sure the toggle and `AppearanceTab` cannot disagree
  about the current mode.
- **Persist the choice** — a toggle that resets on every navigation is worse than none. Check how
  `AppearanceTab` persists its selection and follow that; do not invent a second storage key.
- **Respect `prefers-color-scheme` as the initial value** when the user has made no explicit choice,
  and let an explicit choice win thereafter.
- **Avoid the first-paint flash**: if the attribute is applied after React mounts, a dark-mode user
  gets a white flash on every load. Check whether the existing mechanism already handles this; if it
  does not, note it rather than silently shipping the flash.
- Accessibility: it is a control, so it needs an accessible name that states what it *does*
  (`aria-label="Switch to dark mode"` / `"Switch to light mode"`), and `aria-pressed` or equivalent.
  An unlabelled sun glyph is not a button to a screen reader.
- Icons: check for an existing icon set in the admin before adding new SVGs.

**Verify BOTH modes with `getComputedStyle` readbacks**, and verify the toggle actually persists
across a reload. Screenshots alone are not evidence here.

**Placement caution:** the admin top-right chrome may live in `apps/admin/src/panels.tsx`, which is
**currently modified with someone else's uncommitted work**. Do not commit their hunks — explicit-path
`git add`, and inspect the diff before staging. If the toggle's natural home is inside their
in-flight changes, report that rather than entangling the two.

---

## Standing constraints (all agents, this session)

- `:3000` and `:5173` are the owner's running servers — never kill or restart.
- `src/themes/static/basic/` is the ACTIVE live theme and carries uncommitted owner edits in
  `pages/index.html`. Never write it, never `git checkout` it.
- ~~`apps/admin/src/features/themes/Themes.tsx` is owned by the **ThemeCleanup** agent.~~
  **CORRECTED 2026-08-11 — `Themes.tsx` is FREE.** ThemeCleanup landed its Explore-button restyle in
  commit `27a8ca0` and was stopped long ago. This stale line contradicted items 10 and 11, which
  assign `Themes.tsx` work, and an agent correctly refused to guess which one governed rather than
  picking one silently. That was the right call and the contradiction was the Coordinator's error.
  **Items 10 and 11 are authorized; `Themes.tsx` has no other owner.**
- Commit incrementally — a stopped agent's uncommitted work is discarded. Explicit-path `git add`
  only; the tree has many untracked files belonging to other workstreams.
- Visual claims need `getComputedStyle` / `getBoundingClientRect` numbers. Screenshots alone are not
  evidence here — that has produced a false "no defects" report before.
- Playwright plugin tools are safe (separate headless Chromium). `chrome-devtools-mcp` is NOT — it
  attaches to the owner's real browser. `waitUntil: "networkidle"` never resolves (open SSE) and
  fails silently; use `domcontentloaded` + ~600ms + ~1200ms.
- Never write an instruction that requires a mid-flight reply to proceed. Make judgment calls and
  record the reasoning as OUTPUT.
