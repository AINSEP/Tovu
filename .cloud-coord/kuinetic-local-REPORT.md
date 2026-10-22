# kUInetic local-only load — REPORT (2026-10-22, branch cloud/kuinetic-local-2026-10-22)

**Files per theme** (live `content/themes/static/<id>` + Reset copy `content/themes/__original-themes__/static/<id>`, identical edits):
- tovu-starter: 6 pages `render/pages/*.html` (removed CDN comment, jsDelivr `@0` tag, `document.write` fallback); `render/partials/footer.html`, `footer-minimal.html` (+1 tag); `NOTICE.md`.
- tovu-theme: 13 pages (same 3 lines, plus the per-page CDN `<link rel=preload>`; cloak comment reworded); both footer partials; `NOTICE.md`.
- Only these two stock themes shipped the snippet (grep). Desktop renderer already loads a local copy. No Jini change needed.

**Where the single tag lives:** last line of `render/partials/footer.html` and `footer-minimal.html` (signin/signup use the minimal variant; every one of the 19 pages includes one footer):
`<script src="/theme-assets/<id>/scripts/vendor/kuinetic.all.js"></script>`.
- Absolute `/theme-assets/<id>/` form: partials expand AFTER the page's `../scripts/` rewrite (static-render.ts), same form the partial's logo uses; `theme_duplicate` rewrites the id.
- Execution order: kept a plain synchronous tag (no defer). While the page parses, kUInetic defers its own boot to DOMContentLoaded, so it still arms after `main.js`/`docs-toc.js`; `window.kuinetic` is still defined before `lightbox.js` (pages-default). No page script calls `window.kuinetic` inline.

**Min vs non-min:** non-min `kuinetic.all.js` (991 KB). No minified build exists in the repo (kuinetic is not an npm dependency; only the vendored unminified file). LICENSE (`kuinetic-LICENSE.md`) already beside it.

**Guidance:** tovu-theme plugin `SKILL.md` step 6 + `references/theme-v2-contract.md`: load vendored kUInetic once from the shared partial via `/theme-assets/<id>/scripts/vendor/…`; never CDN tag/preload, `@0`, `document.write`, or per-page tags; ship LICENSE. NOTICEs get a 2026-10-22 "supersedes" section; `development/todos.md` 09-27 rule marked superseded.

**Tests:** `kuinetic-major-range.canary.test.ts` (enforced the old CDN rule) replaced by `kuinetic-local-vendor.test.ts`: no jsDelivr kUInetic in any theme HTML; no stock page has `cdn.jsdelivr.net/npm/kuinetic`, `document.write(` or its own kuinetic tag; each footer partial has exactly one local tag + vendored file + LICENSE; every rendered stock page has exactly one kuinetic script = local path. Fails 4/4 on the old tree, passes 4/4 now. `static-theme-migrated-asset-paths.test.ts` now counts partial-carried scripts (expected list from `expandPartials(source)`); 7/7 pass.
Ran theme + publish-content + agent-plugin + every test naming tovu-starter/tovu-theme (node:test, concurrency 1): base 111 fail / branch 111 fail, **identical list**. All are environmental import errors (lock-pinned `@jini-ai/capability-providers@0.4.1`/`integrations` lack `./comments`/`./api-connections` exports; `@jini-ai/search` unpublished), not this change.
Not changed: CSP `script-src … https://cdn.jsdelivr.net` (still used by other assets; out of scope).

**LOCAL VISUAL CHECK** (no browser in cloud): for tovu-starter and tovu-theme, open home, a post, docs (posts-sidebar), pages-default (lightbox), 404, signin/signup:
1. Entrance animations/fade-ups play as before; no flash of hidden content (tovu-theme cloak lifts promptly).
2. Toggle light/dark: animations and styles unaffected.
3. DevTools Network: one `kuinetic.all.js` from `/theme-assets/<id>/scripts/vendor/`, zero jsdelivr requests; console clean.
4. Offline (DevTools offline / desktop app without network): same animations.
5. Duplicate a stock theme: copy's footer points at `/theme-assets/<new-id>/…` and animates.
