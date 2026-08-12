# Self-Validation — Post editor: Img-by-URL removal, YouTube raw-preview placeholder, mention-link preview fix

- Service: Tovu admin (Posts editor) + Tovu server (public site, unchanged)
- Owner: Programmer (dispatched directly by team-lead, three owner-reported bugs)
- Run date: 2026-08-12T09:58-0700
- Outcome: PASS for all three fixes; one pre-existing, unrelated failure observed and left untouched

## Environment preflight

- `cd apps/admin && npx tsc --noEmit`: PASS for every file this dispatch touched (`PostEditor.tsx`,
  `rules.ts`, `media-image-extension.tsx`, `lib/api.ts`). The full run also surfaces a pre-existing,
  repo-wide `Mock<Procedure | Constructable>` typing error across ~35 unrelated test files (confirmed
  via `git status`/`git diff` to be untouched by this dispatch) — not fixed, out of scope.
- Hermetic boot: `TOVU_DB=memory`, own ports (7851 API / 7852 admin / 7853 daemon), matching
  `development/playwright.post-editor.config.ts` exactly — both manually for live probing and via the
  Playwright config itself for the committed regression suites. No shared `:3000`/`:5173` instance was
  touched.

## Runtime harness

- Harness: real headless Chromium (Playwright's own launcher, not Playwright MCP), driven both via
  ad hoc probe scripts (diagnosis) and the three committed `*.spec.ts` suites (regression proof).

### Bug 1 — "Img by URL"
- Critical path: toolbar no longer offers "Insert image by URL"; Media picker and drag/paste (both
  pre-existing/adjacent) still insert a real `{assetId, transformName}` ref.
- Result: PASS (`post-editor-toolbar.spec.ts`, `post-editor-image-sizing.spec.ts` — legacy `src`-only
  content, now reachable only via a pre-existing post, still renders correctly-sized in the editor).

### Bug 2 — YouTube embed
- Critical path: insert a YouTube video into a NEW/draft post, open Preview (raw `SrcDocSandbox`
  fallback) — live screenshot before the fix showed a solid black box; two console errors inside that
  frame (`caches`/`allow-same-origin` SecurityError, `writeEmbed is not defined`) confirmed the sandbox
  breaks the embed player. Post-fix screenshot shows a labelled placeholder with real dimensions.
- Negative/edge path: the SAME embed, once published, still renders as a real playable iframe on the
  public page (not sandboxed at all) — proves the degrade is scoped to the one broken branch only.
- Result: PASS (`post-editor-youtube-preview.spec.ts`, 2 tests).

### Bug 3 — mention link
- Critical path: dirty a published post's content, open Preview (pending-content branch, a REAL
  navigated iframe) — live-captured the frame's own URL was `http://localhost:7852/...` (admin origin)
  pre-fix; clicking the mention link navigated the iframe to `http://localhost:7852/{slug}`, matching
  the owner's exact reported Vite 404 mechanism. Post-fix, the frame's own URL is
  `http://localhost:7851/...` (site origin) and the click lands on the real published target post.
- Negative/edge path: theme CSS (`/theme-assets/...`, the one thing that already worked pre-fix) still
  resolves — asserted via computed-style background-color parity against a fresh live-site frame.
- Result: PASS (`post-editor-mention-preview-link.spec.ts`, 1 test).

### Negative verification (one spot check, per dispatch cadence)
- Reverse-applied the Bug 3 diff (`git diff` -> `git apply -R`, never `git stash`/`reset`) and reran
  the mention test: RED, with the exact same admin-origin URL the owner reported. Reapplied the patch
  (`git apply`) and reran: GREEN. No shared git index or working-tree state was touched by this step.

## Evidence

- Focused e2e (final pass, all three fixes together): `npx playwright test --config=development/
  playwright.post-editor.config.ts` — 17 passed, 1 failed (pre-existing, unrelated), 2 skipped
  (pre-existing, unrelated).
- Focused unit: `apps/admin` vitest over `src/features/posts` + `src/lib/__tests__/{media-image-
  extension,site-url,api-describe-error,api-request-unreachable}.unit.test.tsx` — 170 passed, 0 failed.
- Bounded diagnosis pass: used once, for Bug 2 — three candidate root causes were named up front
  (sandbox, missing CSS, URL-pattern rejection); missing-CSS was ruled out by reading the theme's own
  stylesheet, URL-pattern was ruled out by a clean isolated repro, sandbox was confirmed by two live
  console errors plus a before/after screenshot.

## Pre-existing failure observed, not fixed (disclosed, out of scope)

- `post-editor-image-sizing.spec.ts` — "the Replace and Remove buttons have a visible gap, not flush
  edges" fails (expects `<=3px`, measures `6px`). Confirmed via `git diff`/`git status` that neither the
  test nor the CSS rule (`apps/admin/src/styles.css`'s `.media-image-node__actions { gap: 6px; }`, whose
  own comment states the owner asked to double 3px to 6px) was touched by this dispatch. This is a
  stale-assertion-vs-updated-CSS mismatch in another agent's active area, not one of the three assigned
  bugs — flagged for that owner, not fixed here.

## Remaining risks

- A separate, adjacent interaction bug was found (not fixed, not one of the three assigned bugs):
  inserting a mention immediately after inserting an atom node (e.g. YouTube) that is still
  node-selected appears to silently replace the atom via ProseMirror's default `insertContent`
  behavior on an active NodeSelection. Reproduced once via an ad hoc probe (not saved as a committed
  test); needs its own isolated repro and fix before it can be trusted as a real, reachable bug rather
  than an artifact of that probe's exact click sequence.
- Bug 1's rejected "fetch a URL server-side" alternative would need the core `http` library (ADR-038)
  extended to support binary/streamed responses before it could be safely attempted — flagged as a
  possible follow-up, not started.
