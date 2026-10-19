# Four failing Tovu website tests: test hygiene and one stale expectation

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY for you.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state
(no stash/checkout/reset). Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:`
+ for item 4 a `DECISION:` line. REUSE before you write (search for an existing mechanism first).
Smallest change. Move "why" comments with code, never delete them. Do NOT edit non-test files under
apps/website/src/assistant/** or apps/website/src/server/runtime/composition/** (another agent owns
them tonight); if a fix needs them, describe the exact patch under NOT DONE instead.

## 1. apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts (4 tests fail)
It is missing the isolated catalog home that its siblings load first, e.g.
`apps/website/src/assistant/__tests__/external-mcp-store.test.ts:1`:
`import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";`
Read the helper (apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts) to
confirm why it must be the FIRST import, then add it the same way. Check whether anything else in the
file reads the real home (~/Documents/Tovu, ~/Library/Application Support/Tovu, ~/.tovu) and route it
through the same helper.

## 2. apps/website/src/platform/site-dir/__tests__/integration/path-containment.integration.test.ts (3/3 fail)
Same cause as 1 (no isolated catalog home import). Same fix with the right relative path.

## 3. apps/website/src/server/__tests__/integration/composition-served-site-dir.integration.test.ts
Its `after()` hook fails with ENOTEMPTY from `rmSync` (2/2 runs) while the tests pass: the `after`
calls `settleBoot(deps)` then deletes the site dir, but something still writes into the dir, and the
env restore placed after the `rmSync` never runs. Find what still writes (a timer, a watcher, an
un-closed DB/handle, a background writer) and close/await it in the test teardown with the existing
close/dispose API (search for one; do not invent a new one). Put the env restore in a `finally` so a
failed removal can never leak env into later files. Test-file change only.

## 4. apps/website/src/features/seo/__tests__/cover-image-head.test.ts › "external body URLs qualify for OG only"
The test expects an external body image URL to produce `og:image` but NOT `twitter:image`. Since Jini
commit 391560e8 (X→OG fallback; read it: `git -C /Users/la/Programming/Jini show 391560e8 --stat` and
its message/diff), `twitter:image` falls back to the OG image. Decide which is intended:
- if 391560e8 deliberately makes X cards fall back to the OG image (including external URLs), update
  the test to assert the new behaviour, rename it to match, and cite 391560e8 in a comment;
- if 391560e8 only meant to fall back for same-site/library images and external URLs leaking into
  twitter:image is a regression, do NOT edit Jini: describe the Jini fix under NOT DONE and leave the test.
Report the choice and one-line reason as `DECISION:`.
