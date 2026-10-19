# Tovu node tests refused by the test-home isolation guard (add the isolated catalog home)

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state
(no stash/checkout/reset). Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:`.
REUSE before you write. Smallest change. Move "why" comments with code, never delete them. Do NOT
edit non-test files under apps/website/src/assistant/** or apps/website/src/server/runtime/composition/**
(another agent owns them tonight). Edit test files only, unless a file below needs more than the import
(then explain under NOT DONE).

## Cause
Commit fec2a6a9f (10-15) added `assertTestHomeIsolation` (apps/website/src/platform/site-dir/sites-home.ts):
under node:test any sites-workspace I/O against the real home throws
"Test home isolation required: refusing the real user home for Tovu sites or site keys. Use
isolated-catalog-home or a temporary HOME and desktop profile."
The files below fail with that error (or, for "whole file failed", with a child test that hits it).
The established fix, used by their siblings, is a FIRST side-effect import of
`apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts`, e.g.
`apps/website/src/assistant/__tests__/external-mcp-store.test.ts:1`:
`import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";`
(Read the helper header: it must load before any module that reads HOME/env at import time.)

## Do
For each file: add the import as the very first import with the correct relative path and `.js`
suffix, matching sibling style (the `#src/...` alias is fine if siblings in that folder use it). If a
file sets its own temporary HOME/desktop profile on purpose, keep that and make sure it covers every
path the guard checks instead of adding the import. If several listed files import one shared TEST
helper that is always imported first, you may put the import there instead, but only if every other
importer of that helper also wants isolation; say so in the report. For a "whole file failed" file,
read the file to confirm the guard is the cause; if it is something else, describe it under NOT DONE.

## Files (failing tests per file, first error)
- apps/website/src/server/__tests__/routes/publish-credentials-route.test.ts (20 failing: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a te)
- apps/website/src/server/__tests__/routes/publish-trust-revocation-gate.test.ts (1 failing: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a te)
- apps/website/src/server/__tests__/routes/publish-zero-setup-end-to-end.test.ts (5 failing: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a te)
- apps/website/src/server/__tests__/routes/readiness-routes.test.ts (7 failing: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a te)
- apps/website/src/server/__tests__/routes/recovery-restore-routes.test.ts (8 failing: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a te)
- apps/website/src/server/__tests__/routes/recovery-routes.test.ts (18 failing: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a te)
- apps/website/src/server/__tests__/routes/redirects-auth.test.ts (6 failing: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a te)
- apps/website/src/server/__tests__/routes/redirects-create.test.ts (10 failing: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a te)
- apps/website/src/server/__tests__/routes/render-depth-bound-site-serving.test.ts (2 failing: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a te)
- apps/website/src/server/__tests__/routes/request-cost-cacheability.measurement.test.ts (18 failing: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a te)
