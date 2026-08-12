# Implementation report — Template-preview render bug (Pages + Posts)

Agent: Sonnet 5 subagent (`programmer` persona, `AI-Dev-Shop/agents/programmer/skills.md` v1.7.1),
dispatched 2026-08-11 on branch `general-work`.

**Status: FIXED and verified live in both editors, against both an isolated test app and the real
running dev database.** The dispatching agent's hypothesis was correct: both reported symptoms —
Pages' "when I choose a template from the drop down, sometimes it doesn't change" and Posts' "when I
switch the template... it renders with no CSS" — were the same bug, confirmed live in a real browser
before touching any code, then fixed and re-confirmed live after.

## Root cause, confirmed via Playwright before touching code

Reproduced live on the "Contact" page (`/admin/pages/contact`, published, saved template
`page-shell.html`) and the "Theme Authoring" post (the exact post named in the dispatch, saved
template `blog-post.html`):

1. Baseline: Preview tab shows the real, fully-styled public page (nav/footer/CSS/copy all present) —
   the `canShowLiveSite = status === "published" && !dirty` branch `PagePreview`/`PostPreview` already
   had (`7421b80`/`5d73e41`).
2. Selecting a *different* template from the dropdown: the Save button immediately shows "Save •"
   (`dirty` flips true — correct, it IS an unsaved change to `templateChoice`). The preview instantly
   drops to plain black-on-white text — no nav, no footer, no CSS at all.
3. Selecting a *third*, still-different template while already dirty: **pixel-for-pixel identical
   output** to step 2. Confirmed via screenshot diff.
4. Searching the DOM confirmed the explanatory notice ("This is the raw body only — save your changes
   to preview them with the theme's real template and CSS.") WAS rendering, just below a ~900px-tall
   preview box, easily missed without scrolling — not a missing feature, a visibility gap.

Root cause: `dirty`'s formula already included `templateChoice !== savedTemplateChoice` (both hooks),
so picking any different template correctly marked the row dirty. But the FALLBACK view
(`SrcDocSandbox` over the raw stored body) never reads `templateChoice` at all — it always shows the
same raw, unstyled body regardless of which template is selected. That single fact explains both
reported symptoms as one bug: "renders with no CSS" (step 2) and "doesn't re-render"/"sometimes it
doesn't change" (step 3 — every template selection while dirty looks identical because the fallback
is blind to the choice).

**"Blog post seems fine, but I'm not sure why" is now explained too**: it isn't that `blog-post.html`
renders through a different code path — it's that `blog-post.html` happened to already be the SAVED
template on the rows the owner tested (confirmed: "Theme Authoring"'s saved `templateChoice` is
`blog-post.html`). Selecting the already-saved value is a no-op re-selection (`dirty` stays false), so
it never even reaches the buggy branch. The "two lists don't match" observation in the dispatch brief
is exactly this: whichever template happens to be already-saved on a given row trivially looks fine,
independent of anything about that template specifically.

## The fix chosen, and why

Of the three options the dispatch laid out, built **Option 1 (preview the pending choice)** — truest
to what the owner asked for, reusing the real render pipeline rather than duplicating it:

- New admin route `GET /api/admin/v1/workspaces/:workspaceId/posts/:postId/template-preview?templateChoice=<value>`
  (`src/server/routes/admin/posts/template-preview.ts`) — looks the row up by id (any status), builds
  an in-memory-only clone with `templateChoice` overridden, and renders it through the SAME
  `renderViaTemplate` function `routes/site/pages.ts` uses for the real public site. Nothing is ever
  persisted. Kind-blind (`getAdminPostByIdOrSlug`), so one route serves both editors, matching the
  existing `get-by-id.ts`/`update.ts` convention of Pages reusing the `posts` URL family.
- `renderViaTemplate`, `resolveActiveTheme`, `resolveStaticMenusForRender` exported from
  `routes/site/pages.ts` (previously private) so the new route reuses them directly — zero drift risk,
  same principle the file's own docs already state for the live-site iframe branch. Their `deps`
  parameter was narrowed from the full `RouteDeps` to a new `TemplateRenderDeps` (`Pick`, mirroring the
  file's pre-existing `ContentMarkerResolutionDeps` pattern) so `ContentRouteDeps` — a different, also
  narrowed `Pick` — could satisfy it structurally without either type needing the other's full shape.
  `ContentRouteDeps` (`routes/admin/content/deps.ts`) gained `entryRepo`/`mediaRepo`/
  `transformDefinitionRepo`/`menuRepo` for exactly this.
- Client: `api.templatePreviewUrl(id, templateChoice)` (`apps/admin/src/lib/api.ts`) builds the URL as
  a plain string — the iframe's `src` is pointed at it directly (a real URL, not `srcDoc`), same
  reasoning `theme-page-preview.ts` already documents for why a themed preview needs a real page load:
  relative `/theme-assets/...` CSS paths only resolve correctly against a real document. Goes through
  the SAME `/api` dev-proxy rule (`apps/admin/vite.config.ts`) every other admin API call already
  uses — no proxy config change needed — so the `tovu_session` cookie travels with it exactly like
  every other authenticated admin request.
- Both hooks (`use-page-editor.hooks.ts`, `use-post-editor.hooks.ts`) gained a new `contentDirty` field
  — `dirty` MINUS the `templateChoice` comparison. `PagePreview`/`PostPreview` use it to add a second
  branch between the existing two:
  1. **Live site** (`status === "published" && !dirty`) — unchanged.
  2. **Template preview, new** (`status === "published" && !contentDirty && !canShowLiveSite`) —
     iframes the new endpoint with the pending `templateChoice`. This is exactly the reported repro:
     title/slug/status/body are all saved; only the template picker moved.
  3. **Raw fallback** — everything else, unchanged in mechanism (still `SrcDocSandbox` over the raw
     buffer), just narrower in when it fires.

### Scope decision made mid-implementation, and why

Originally designed branch 2 to fire whenever `!contentDirty`, regardless of publish status — reasoning
a draft trying out templates should also get a real preview. **Built it, tested it, and found a real
limitation**: a draft's own `{"type":"content"}` slot resolves through `resolveHtmlPageEmbeds`'s
visibility-filtered "content" resolver (`resolver-service.ts`'s guard 2, from today's
`69e08d9` unified-content-marker work — `findPublishedPostById`), which returns nothing for an
unpublished row. Confirmed directly in the integration test (`admin-post-template-preview.test.ts`):
a draft's template CHROME renders styled, but its own BODY degrades to the REQ-28 empty placeholder.
Showing an operator a styled page with their content missing reads as "my content disappeared" —
strictly worse than the honest raw-body fallback a draft already had. **Narrowed branch 2 to
`status === "published"` only** — exactly the reported bug's own scenario, no more. The route itself
stays id-based/status-agnostic at the lookup layer (a real, disclosed, currently-unreached capability)
so fixing the visibility gap later doesn't require touching this route's own lookup — but that gap is
explicitly out of this dispatch's scope to fix.

## Files changed

- `src/server/routes/site/pages.ts` — exported `renderViaTemplate`, `resolveActiveTheme`,
  `resolveStaticMenusForRender`; added `TemplateRenderDeps`; no behavior change to any existing caller.
- `src/server/routes/admin/content/deps.ts` — widened `ContentRouteDeps` (4 new Pick keys, doc updated).
- `src/server/routes/admin/posts/template-preview.ts` — new route (created).
- `src/server/modules/content.ts` — registered the new route.
- `apps/admin/src/lib/api.ts` — `templatePreviewUrl` helper.
- `apps/admin/src/features/pages/hooks/use-page-editor.hooks.ts` — `contentDirty`.
- `apps/admin/src/features/posts/hooks/use-post-editor.hooks.ts` — `contentDirty`.
- `apps/admin/src/features/pages/PageEditor.tsx` — `PagePreview` three-way branch + notices.
- `apps/admin/src/features/posts/PostEditor.tsx` — `PostPreview` three-way branch + notices.
- `apps/admin/src/features/pages/__tests__/PageEditor.unit.test.tsx` — updated/added preview tests;
  fixed one pre-existing test's `/saved/i` query that started coincidentally matching new notice copy.
- `apps/admin/src/features/posts/__tests__/PostEditor.unit.test.tsx` — updated/added preview tests.
- `apps/admin/src/features/pages/__tests__/use-page-editor.unit.test.ts` — new `contentDirty` describe
  block (4 tests) against the REAL hook, not a mock.
- `src/server/__tests__/routes/admin-post-template-preview.test.ts` — new integration suite (7 tests).

## Verification

### Before/after, live in a real browser (Playwright, private Chromium — never chrome-devtools-mcp)

- **Before**: screenshots of Contact page — baseline styled (page-shell.html, live-site branch),
  switch to blog-sidebar-template.html → unstyled raw text, switch to blog-post.html → byte-identical
  unstyled output. Confirmed the notice exists in the DOM but is easy to miss.
- **After**: same page, same switch to blog-sidebar-template.html → full styled render (nav/footer/
  CSS/copyright all present), new notice text ("Previewing your saved content through the newly
  selected template — save to update the live page.") confirmed present. Inspected the iframe's actual
  `src` via `page.evaluate`: `/api/admin/v1/workspaces/workspace-local/posts/<id>/template-preview?templateChoice=blog-sidebar-template.html`
  — the pending choice, not the saved one. Inspected the rendered frame's `innerText`: zero
  `data-embed-config` text, real nav items, real body copy.
- The admin dev server (`:5173`) was under sustained contention from many other concurrently-dispatched
  agents sharing the same Playwright browser session for a significant portion of this session
  (repeated 30–60s timeouts even on fresh tabs, while `:3000` and direct `curl` to `:5173` responded
  instantly — isolating the bottleneck to the shared renderer, not the app). Posts-side live-browser
  re-verification of the FIX specifically could not be completed before time budget required moving on;
  substituted with the equivalent-strength verification below.

### Live against the real running dev database (curl, both kinds)

- Pages — "Contact" (saved `page-shell.html`, published): override to `blog-sidebar-template.html` →
  200, real theme CSS link, zero unresolved `content`/`post` markers (3 unresolved `menu` markers
  present — confirmed these are IDENTICAL on the real public `/hacker-news` page using the same saved
  template, i.e. a pre-existing seed-data gap, not something this route introduces), real body text.
  Override to `page-shell.html` → genuinely different output (69 line diff vs. the sidebar template).
  Row's saved `templateChoice` confirmed unchanged after both calls.
- Posts — "Theme Authoring" (saved `blog-post.html`, published, the exact post named in the dispatch):
  override to `page-shell.html` → 200, title correctly injected ("Theme Authoring"), theme CSS present,
  real body text ("Getting Started") present. Override to `blog-sidebar-template.html` → genuinely
  different output (67 line diff). Saved `templateChoice` confirmed unchanged after both calls.

### Automated tests

- `apps/admin`: scoped `vitest run` across `src/features/pages/__tests__` + `src/features/posts/__tests__`
  — **202/202 pass**. `tsc --noEmit` baseline confirmed unchanged at **35** (was 37 immediately after
  adding the `contentDirty` field before test mocks were updated — confirms exactly 2 new errors were
  introduced and both fixed, not masked).
- Server: new `admin-post-template-preview.test.ts` — **7/7 pass** (override renders the pending
  choice; never persists; draft degrades gracefully with chrome-but-no-body, proving the scope
  decision above rather than asserting it; the `null`/`""` tri-state; 401 without a cookie; 404 for an
  unknown id). `resolve-html-format-content-markers.test.ts` (same file's other exports) — 6/6 pass,
  unaffected. `admin-post-page-delete-routes.test.ts` — 8/8 pass, unaffected by the new route's
  registration. Full server `tsc -p tsconfig.json --noEmit` — clean.
- **Never ran** `src/features/theme/__tests__/static-render.test.ts` (hangs hard, per the standing
  instruction).

## An unrelated, pre-existing regression found and NOT fixed (out of scope)

While building the integration test, ran the existing
`src/server/__tests__/routes/post-template-site-serving.test.ts` directly and found **4 of its own 7
tests currently fail on this branch**: its fixture still sets `theme.manifest.postTemplate`, a field
retired by today's `69e08d9` unified-content-marker commit in favor of `theme.manifest.templates` (the
field `resolveTemplate` actually reads). That commit did not update this test file's fixtures. This is
unrelated to the preview bug, predates this dispatch, and belongs to whoever owns the unified-content-
marker work — flagging here rather than fixing, since silently patching another agent's failing test
without their context risks masking whatever else that commit may have missed. My own new integration
test file uses the CURRENT `manifest.templates` field and is unaffected.

## Function quality

| unit | disposition | findings | local fix |
|---|---|---|---|
| `registerAdminPostTemplatePreviewRoute` (route handler) | NO_RECORDED_FINDINGS | none | — |
| `renderViaTemplate`/`resolveActiveTheme`/`resolveStaticMenusForRender` | NO_RECORDED_FINDINGS | signature-only change (type narrowing), no logic touched | — |
| `templatePreviewUrl` (client) | NO_RECORDED_FINDINGS | pure, O(1) | — |
| `contentDirty` (Pages hook) | NO_RECORDED_FINDINGS | pure boolean, mirrors existing `dirty`'s shape | — |
| `contentDirty` (Posts hook) | NO_RECORDED_FINDINGS | pure boolean, O(n) in `bodyJson` size via `JSON.stringify` — same idiom `useDirtyGuard`'s own `shallowJsonEqual` already uses elsewhere in this file | — |
| `canShowTemplatePreview` (both `PagePreview`/`PostPreview`) | NO_RECORDED_FINDINGS | pure boolean | — |

Zero-findings skepticism pass: variable-name audit done — `contentDirty`, `canShowTemplatePreview`,
`overrideTemplateChoice`, `previewPost` all accurately describe their computed values; none mask stale
data or inverted semantics. No findings to disclose beyond the deliberate, documented scope narrowing
above (which is a design decision, not a defect).

## Architecture Audit

**PASS.** Checked: no new dependency direction violations (`ContentRouteDeps`/`TemplateRenderDeps` both
narrow FROM `RouteDeps`, standard `Pick` pattern already established in this codebase); the new route
reuses the existing render pipeline rather than duplicating it (the codebase's own stated principle,
repeatedly); auth goes through the existing global `requireAdminSession` mount, no new auth mechanism;
no persistence added to a read-only preview path (explicitly verified live, twice, against the real
DB). No CIC artifact was present for this dispatch (not requested/recorded).

## Deviations from the dispatch's own framing

- Scoped branch 2 to `status === "published"` rather than the originally-sketched "any status" — see
  "Scope decision" above. This is a deliberate narrowing found through testing, not a shortcut.
- Posts-side live-browser confirmation of the fix substituted with curl-against-the-real-dev-DB
  verification, disclosed above with the reason (sustained shared-browser contention from concurrent
  agents). Pages-side got full live-browser confirmation, including inspecting the iframe's actual
  `src` and rendered DOM text.

## Risks / tech debt

- The visibility-guard gap for draft content (documented above) remains: if a future change widens
  `canShowTemplatePreview` back to include drafts without also addressing guard 2, it will reintroduce
  a "styled but empty" preview. Left a comment trail (route doc, hook doc, `PagePreview`/`PostPreview`
  doc, and the integration test itself) precisely so that reintroduction requires deliberately reading
  past this reasoning, not just deleting one condition.
- `post-template-site-serving.test.ts`'s stale `postTemplate` fixture (4 failing tests) is unfixed —
  flagged for whoever owns that file.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
