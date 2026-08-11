# Implementation report — Pages editor: HTML tab formatting + themed Preview

Agent: Sonnet 5 subagent (`programmer` persona, `AI-Dev-Shop/agents/programmer/skills.md` v1.7.1),
dispatched 2026-08-11 on branch `general-work`, screen `http://localhost:5173/admin/pages/faq`.

Two problems, dispatched together, fixed together. Commits: `7421b80` (both fixes),
`935a6cf` (added preview-branching test coverage after landing the fix).

---

## Problem 1 — HTML tab showed unformatted HTML

**Regression claim verified, and rejected**: it never existed. `git log --all -S"format" --
apps/admin/src/features/pages apps/admin/src/features/posts` and a repo-wide grep of both Tovu and
Jini (`prettier|js-beautify|html-format|prettify|CodeMirror`) turn up nothing — the only formatter
anywhere in either codebase is `packages/ui/src/features/html-editor/css.ts`'s `prettifyCss`
(Jini), which formats the CSS half of GrapesJS's export, never HTML. Confirmed via a dedicated
Explore subagent as well (same conclusion, independently). This is case (c) from the brief: the
owner is remembering a different surface. Built the formatter anyway, since the request stands
regardless of whether "regressed" was the right word for it.

**Root cause of the wall-of-text symptom, confirmed not assumed**: `development/scripts/
convert-legacy-doc-pages-to-html.ts` converted these Pages from Tiptap `doc` JSON to raw HTML
earlier the same session; the renderer that produced that HTML emits zero inter-element whitespace.
Verified live: the FAQ page's stored `bodyHtml` (fetched via the admin API from inside an
authenticated Playwright session) starts `<h2 id="frequently-asked-questions">Frequently asked
questions</h2><h2 id="what-is-tovu">What is Tovu?</h2><p>Tovu is a content platform…` — exactly the
shape in the owner's screenshot.

**Built**: `prettifyHtml` (`apps/admin/src/features/pages/lib/prettify-html.ts`), a small
tokenizer, no new dependency. Checked `package.json` in both `apps/admin` and the repo root first —
neither has `prettier`, `js-beautify`, or any HTML formatting library; adding one (even prettier's
standalone browser build + its HTML plugin, the smallest real option) would be new bundle weight for
a single textarea in one editor screen, and the repo already has a working precedent for a
hand-rolled formatter (`prettifyCss` above) solving the equivalent CSS problem — the same argument
applies here.

**Safety design (the actual hard problem)**: this is a live, editable textarea, not a read-only
viewer — the brief was explicit that the fix must not let a display concern silently rewrite the
user's stored HTML. `prettifyHtml` is deliberately narrow: it inserts a newline+indent ONLY at a
boundary between two tags that were textually adjacent (zero existing characters) AND are both
ordinary block-level tags (`div`, `p`, `h1`–`h6`, `li`, …). A whitespace-only text node between two
block-level elements is not rendered by any browser layout mode (block, flex, or grid all discard
it), so this specific class of insertion is provably render-invisible. It never touches a text run,
an inline element's boundary, or the inside of `<pre>`/`<script>`/`<style>`/`<textarea>` (copied
byte for byte) — existing hand-authored whitespace between tags is also left completely alone (only
a literal zero-gap fires the rule), so the function is a no-op on any already-readable page body.
Disclosed, not fixed: a stylesheet that overrides a structural tag to `display: inline` could in
principle make an inserted newline visible — judged an acceptable, disclosed residual risk for
standard semantic CMS content, mirroring `prettifyCss`'s own risk-acceptance framing.

**Decision: format-on-tab-entry, single editable view, not a separate read-only viewer.** The brief
said "this is an editor, not a viewer," ruling out a read-only formatted pane as the default. Wired
via a component-local `draftHtml` (`PageEditor.tsx`) seeded from `prettifyHtml(html)` and
re-seeded only on an actual tab-entry transition (tracked with `prevViewRef`, not on every
keystroke — reformatting mid-typing would fight the cursor). Critically, **merely switching to the
HTML tab never calls `setHtml`** — only local `draftHtml` state changes, so the hook's `dirty`
comparison (`html !== savedHtml`) is untouched by viewing alone. Typing writes straight through to
both `draftHtml` and the real `setHtml`, unchanged from how the textarea always worked. Live-verified
end to end (see Self-Validation): opened the HTML tab, textarea showed properly line-broken markup,
Save button still read plain "Save" (not "Save •") — confirmed via the admin API that the
server-stored `bodyHtml` was still the original zero-whitespace bytes, byte-for-byte, after viewing.

## Problem 2 — Preview tab did not show theme CSS

**Diagnosed, not assumed a regression**: `PagePreview` fed the raw stored body HTML directly into
`SrcDocSandbox` (a sandboxed `srcdoc` iframe) — no template wrapper, no nav/footer, no theme
stylesheet, regardless of the page's `templateChoice`. Read the function before touching it: there
was never a call into `renderPageViaTemplate`/`renderStaticPage` anywhere in this file. Independent
confirmation: the predecessor session that shipped `page-shell.html`
(`ADS-memory/reports/implementation/2026-08-11-basic-page-template.md`'s own "Risks" section)
already flagged this exact gap after building the public-side feature and checking the admin
preview against it. This is a gap, not a regression — the preview never went through the real
render path.

**Fix chosen, and why**: rather than reimplement the server-side render pipeline
(`renderPageViaTemplate`, widget/embed resolution, static-menu wiring, etc.) a second time inside
the admin — which would be a second source of truth that could drift from
`src/server/routes/site/pages.ts`'s real one, a file this dispatch was explicitly told to stay out
of — a **published, un-dirtied page now iframes the real public URL directly** (`siteUrl(
`/${slug}`)`, the same helper already used for the existing "view ↗" link), instead of `srcdoc`ing
the raw body. This gets exact parity with what a visitor sees for zero duplication risk, at the
cost of being explicitly a preview of the **saved** page, not the live editor buffer — chosen
deliberately: `getPublishedPostBySlug` 404s on anything not `status: "published"`, so a draft has
nothing at that URL yet, and unsaved edits are, by definition, not there until Save runs. Both those
cases (`status !== "published"`, or `dirty`) fall back to the previous raw-body-in-sandbox view,
now with a notice explaining why the theme isn't applied — turning a previously-silent gap into an
explained one, rather than leaving the draft/unsaved case with no working preview at all.

**Cross-origin, checked as instructed**: the admin (`:5173`) and site (`:3000`) are different
origins in dev. `<iframe src>` embedding does not require CORS (only script-driven cross-origin
reads do), and this codebase sets no `X-Frame-Options`/CSP `frame-ancestors` anywhere (checked
`src/server/app.ts`) that would block it — confirmed live, the iframe loads
`http://localhost:3000/faq` successfully (200, real network request observed). Nothing in this
component (old or new) reaches into `contentDocument`, so the resulting opaque-origin restriction
costs nothing here. The live-site branch deliberately does not get `SrcDocSandbox`'s
`sandbox="allow-scripts allow-popups…"` restriction — it's the same unsandboxed load any real
visitor already gets, and sandboxing it would only break the theme's own nav-toggle/reveal scripts
for no security gain (the raw-body fallback keeps the existing sandbox, since that path still
renders arbitrary, potentially-unsaved content).

**Scaling preserved**: both branches render inside the exact same fixed-width,
`ResizeObserver`-scaled wrapper `3ac885e` built (`.page-preview-iframe` sets `width/height: 100%` on
whichever element is inside) — confirmed live by switching to Mobile (390px) and Desktop (1280px):
frame width and scale both track correctly with the live iframe now inside it, same as before.

---

## Verification (live, not inferred)

All checks run against the FAQ page (`published`, real content) in the shared dev session at
`http://localhost:5173/admin/pages/faq`, logged in as `admin`.

**HTML tab — before/after, textual not just visual:**
- Server-stored `bodyHtml` (fetched via authenticated `fetch()` from the browser console, the same
  content Save would currently persist): `<h2 id="frequently-asked-questions">Frequently asked
  questions</h2><h2 id="what-is-tovu">What is Tovu?</h2><p>Tovu is a content platform…` — zero
  whitespace, unchanged, 1274 characters.
- Textarea content after opening the HTML tab (`document.querySelector('.page-html-source').value`):
  each `<h2>`/`<p>` on its own line, e.g. `...</h2>\n<h2 id="what-is-tovu">What is Tovu?</h2>\n<p>Tovu
  is a content platform…`.
- Save button read plain `"Save"` (not `"Save •"`) after viewing the tab — `dirty` untouched by
  viewing alone, confirmed via the same DOM query.
- Typed a character into the textarea; Save button immediately read `"Save •"` — dirty tracking
  still fires correctly on a real edit. Reloaded without saving (never clicked Save); re-fetched
  `bodyHtml` afterward and confirmed it was still the original 1274-byte, zero-whitespace content —
  no accidental corruption reached the server.
- Screenshot: `faq-html-tab-formatted.png` (repo root, gitignored path — not committed, referenced
  here for anyone re-running this verification).

**Preview tab:**
- Screenshot `faq-preview-after-live-iframe.png`: dark themed `basic` render — real nav ("Tovu Demo
  Site / Home / Admin"), article layout, footer — a full transformation from the raw-body-in-a-box
  the predecessor's report described.
- Network requests confirmed a real `GET http://localhost:3000/faq` (200) from inside the admin
  iframe, plus the theme's own `site-chat` assets loading (304s, cached) — this is the real
  rendered page, not a re-hosted copy.
- `curl http://localhost:3000/faq` independently confirms the same content server-side: `post-detail`
  class present (the `page-shell.html` template's own wrapper), `site-header`/`nav-row` theme CSS
  classes present, a `<footer>` present, zero unresolved embed markers.
- Screenshot `faq-preview-mobile-scale.png`: clicked Mobile, frame narrowed to the 390px viewport
  scale, content re-rendered — `3ac885e`'s scaling mechanism unaffected by the branch swap.

**Unrelated observation, not a regression from this work**: the template picker currently shows
"No templates for this theme" (disabled) for the FAQ page, where the predecessor's report described
it as correctly listing/selecting `page-shell.html`. This is very likely the concurrent
`UnifiedContent` agent's in-flight `postTemplate`/`pageTemplate` → `templates` collapse, which the
dispatch brief explicitly warned would touch this file's template-picker wiring. Not investigated or
touched — outside this dispatch's scope, and the live page content itself (confirmed via direct
`curl`) still renders correctly through the template regardless of what the admin picker currently
displays.

---

## Function-quality table

| unit | disposition | findings | complexity |
|---|---|---|---|
| `prettifyHtml` (prettify-html.ts) | NO_RECORDED_FINDINGS | — | O(n) two linear passes (tokenize, print); no backtracking or recursion |
| `tokenizeHtml` (prettify-html.ts, private) | NO_RECORDED_FINDINGS | — | O(n) single pass; each branch advances `i` by ≥1, no infinite-loop path even on malformed input (verified by a dedicated test) |
| `canShowLiveSite` (PageEditor.tsx, inline) | NO_RECORDED_FINDINGS | — | O(1) boolean; covered by 3 new RTL tests |
| `PagePreview`'s tab-entry effect (PageEditor.tsx) | NO_RECORDED_FINDINGS | — | O(1) per render; guarded by `prevViewRef` so it cannot re-fire on every keystroke |

**Zero-findings skepticism pass**: `prettifyHtml`/`tokenizeHtml` are the one real piece of new logic
in this change and got the most scrutiny — 12 unit tests including 2 adversarial cases (malformed
close tag with no matching open; a quoted `>` inside an attribute value) specifically because a
naive regex-based tag matcher is a classic source of the exact corruption this fix has to avoid.
Negatively verified by hand-tracing the FAQ's real nested-and-flat structure against the algorithm
before trusting the tests, then confirming the traced output against the live browser result
byte-for-byte. Variable-name audit: `draftHtml` is genuinely the DISPLAY/editable copy (never the
value compared for `dirty`); `html`/`setHtml` stay exactly what they always were (the real working
copy read by `save()`) — no renaming of the underlying contract, only an added display layer beside
it, checked against `use-page-editor.hooks.ts`'s `dirty` computation directly rather than assumed.

## Architecture Audit

**Status: PASS.**

- `prettify-html.ts` is a new leaf module under `apps/admin/src/features/pages/lib/` — no imports
  beyond none (pure string function), no dependency direction concern.
- `PagePreview` gained three new props (`slug`, `status`, `dirty`) sourced from data the parent
  `PageEditor` already destructures from `usePageEditorHook` — no new state, no new fetch, no new
  dependency on `@jini-ai/*` packages.
- Did not touch `src/features/theme/`, `src/server/routes/site/pages.ts`,
  `src/widgets/resolver-service.ts`, `src/core/embeds/marker.ts`, or
  `apps/admin/src/features/themes/` — confirmed via `git show --stat` on both commits (only
  `PageEditor.tsx`, the new `lib/prettify-html.ts`, its test, `PageEditor.unit.test.tsx`, and
  `styles/pages.css` appear).
- Did not write `src/themes/static/basic/` (checked `git status` before and after — untouched).
- No new dependency added to `apps/admin/package.json` — checked it stayed unmodified.
- No ADR ambiguity encountered.

## Pre-Completion Checklist

- Requirements re-verified against both problems in the dispatch, above.
- Fresh evidence commands, re-run in this same session after all changes:
  `cd apps/admin && npx tsc --noEmit` → 35 errors (unchanged baseline, none in touched files);
  `npx vitest run src/features/pages/__tests__/PageEditor.unit.test.tsx
  src/features/pages/__tests__/prettify-html.unit.test.ts
  src/features/pages/__tests__/use-page-editor.unit.test.ts` → 3 files, 71 tests, all green.
- No certified test was deleted or weakened — 12 new tests for `prettifyHtml`, 3 new tests added to
  `PageEditor.unit.test.tsx`, zero existing tests modified.
- Scope: `apps/admin/src/features/pages/PageEditor.tsx`,
  `apps/admin/src/features/pages/lib/prettify-html.ts` (new),
  `apps/admin/src/features/pages/__tests__/prettify-html.unit.test.ts` (new),
  `apps/admin/src/features/pages/__tests__/PageEditor.unit.test.tsx`,
  `apps/admin/src/styles/pages.css` — exactly the HTML view and preview pane, as scoped. No file in
  the "stay out of" list touched.
- Open items: the template-picker "No templates for this theme" state observed live (see
  Verification's last note) is not this dispatch's territory and was left alone.

## Self-Validation

**PASS.** Runtime-changing, UI-facing behavior — required and run. Critical path checked: HTML tab
shows correctly line-broken markup for the FAQ page's real machine-generated body (the exact
regression shape reported), Preview tab shows the real themed `page-shell.html` render including
nav/footer/CSS, confirmed against the same ground truth (`curl :3000/faq`) an independent predecessor
session used. Negative/edge path checked: viewing the HTML tab does not dirty the page or touch the
server-stored bytes (confirmed via the admin API before/after); typing does still dirty it correctly;
an accidental test edit (a Playwright `.fill(' ')` that replaced the textarea content) was caught
before Save was ever clicked, confirmed not persisted, and discarded by reloading rather than saving
over it. Draft/dirty preview fallback verified via unit tests (not live-clicked against the real FAQ
page, to avoid actually changing its published status or unsaved buffer during verification —
judged the safer evidence source for that specific branch on a real content page). No bounded
diagnosis pass was needed — the one false alarm during verification (the Preview iframe's
accessibility-tree snapshot showing "Tovu Demo Site" text, initially misread as "still the generic
untemplated shell") was resolved within the same pass by cross-checking `curl` and the `post-detail`
class marker, not carried forward as an open question.

## Risks and tech debt

- The `display: inline` CSS-override edge case for `prettifyHtml`'s insertion rule (disclosed above,
  not fixed) — judged acceptable for standard semantic CMS content; would need a real stylesheet-aware
  check to close entirely.
- The Preview tab's live-site branch shows the SAVED page, not the live editor buffer — an operator
  editing HTML and expecting the Preview tab to reflect an unsaved edit will see the fallback raw
  view with a notice instead, until they Save. This is a deliberate, disclosed tradeoff (see
  "Fix chosen, and why" above), not an oversight.
- Template picker showing "No templates for this theme" for FAQ live in this session — flagged, not
  investigated (concurrent-agent territory, `UnifiedContent`).

## Files changed

`apps/admin/src/features/pages/PageEditor.tsx` (draftHtml/prevViewRef wiring; `PagePreview`'s
`canShowLiveSite` branch + notice), `apps/admin/src/features/pages/lib/prettify-html.ts` (new),
`apps/admin/src/features/pages/__tests__/prettify-html.unit.test.ts` (new, 12 tests),
`apps/admin/src/features/pages/__tests__/PageEditor.unit.test.tsx` (+3 tests),
`apps/admin/src/styles/pages.css` (`.page-preview-notice`).
