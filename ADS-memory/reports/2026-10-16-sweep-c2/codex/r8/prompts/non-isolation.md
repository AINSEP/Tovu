# Six Tovu website test files still fail (CLI, boot-site-dir, two composition fixtures)

Repos: Tovu (/Users/la/Programming/Tovu, cwd). Jini (/Users/la/Programming/Jini) is READ-ONLY.

RULES: do NOT run tests, typecheck, builds or any package scripts. Do NOT commit or touch git state
(no stash/checkout/reset). Edit code only, then report `CHANGED FILES:` (absolute paths) + `NOT DONE:`
+ per file a `VERDICT:` line (stale test since <commit> / real bug in <file:line> / env-or-load flake).
REUSE before you write. Smallest change. Move "why" comments with code, never delete them. Do NOT edit
non-test files under apps/website/src/assistant/** or apps/website/src/server/runtime/composition/**
(another agent owns them tonight; give the patch under NOT DONE instead).

Context: since fec2a6a9f (10-15) node:test refuses sites/site-key I/O against the real home ("Test home
isolation required ..."). The fix for that part is a FIRST side-effect import of
apps/website/src/platform/site-dir/__tests__/helpers/isolated-catalog-home.ts (see
apps/website/src/assistant/__tests__/external-mcp-store.test.ts:1). Several failures below may be the
same guard seen indirectly (a child process, a swallowed throw turning into `undefined`/`false`); check
that first. Tests spawning child processes must pass the isolated env (`isolatedCatalogEnv` from the
helper) to the children.
For anything else: decide whether the test is stale (find the commit that changed the behaviour on
purpose with `git log -S`/`git log -p` on the source; then update the test and cite it) or the code is
wrong (fix the code; the existing failing test is the RED test). Never weaken an assertion just to pass.

Files:
- apps/website/src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts
- apps/website/src/server/__tests__/integration/publish-content-export-no-leak.integration.test.ts
  Both already import isolated-catalog-home (previous round). Now they fail like this:
```
✖ new overrides path: a pre-opened db + explicit workspaceId is honored verbatim, and the EXACT SAME db handle is reused (not a second db opened)
  TypeError [Error]: Cannot open database because the directory does not exist
      at new Database (node_modules/better-sqlite3/lib/database.js:54:10)
      at openNativeSqlite (apps/website/src/platform/db/kernel/drivers/sqlite.ts:46:93)
      at openChatConnection (apps/website/src/platform/db/sqlite/chat-db.ts:33:18)
      at openSiteChatDb (apps/website/src/platform/db/sqlite/chat-db.ts:50:18)
      at openSiteStore (apps/website/src/server/runtime/composition/open-site-store.ts:115:20)
      at openCompositionStore (apps/website/src/server/runtime/composition/deps.ts:885:37)
      at createSiteRouteDeps (apps/website/src/server/runtime/composition/deps.ts:1030:24)
      at TestContext.<anonymous> (apps/website/src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts:95:22)
✖ GET .../publish-content/export never leaks a row from any sensitive table, even for the most-privileged (wildcard) caller
  TypeError [Error]: Cannot open database because the directory does not exist
      (same stack) at TestContext.<anonymous> (.../publish-content-export-no-leak.integration.test.ts:278:22)
```
  With a pre-opened content db, the composition derives the chat db path from a site dir that does not
  exist under the isolated home. Give each fixture an explicit temporary site dir / db path (mkdtemp,
  the way sibling tests in server/__tests__/integration do it) and remove it in teardown. Do not change
  composition source.
- apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts (11: 5 isolation guard + rest below)
- apps/website/src/cli/__tests__/unit/export-command-boot-work.unit.test.ts (2: 1 isolation guard + 1 below)
- apps/website/src/cli/__tests__/unit/plugin-command.unit.test.ts (3: 2 isolation guard + 1 below)
- apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts (1)

Failure output for the last four (TAP, 10-16 sweep):
### apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts › B1: bootSiteDir({ dir }, { workspaceId }) throws ValidationError when the id matches no workspace row
```
not ok 553 - B1: bootSiteDir({ dir }, { workspaceId }) throws ValidationError when the id matches no workspace row
  ---
  location: 'apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:1:3283'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'Error'
    - 'ValidationError'
    
  name: 'AssertionError'
  expected: 'ValidationError'
  actual: 'Error'
  stack: |-
    Object.<anonymous> (apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:112:16)
```
### apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts › AC-09/REQ-06: zero workspace rows -> SiteCorruptError
```
not ok 554 - AC-09/REQ-06: zero workspace rows -> SiteCorruptError
  ---
  location: 'apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:1:3656'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'Error'
    - 'SiteCorruptError'
    
  name: 'AssertionError'
  expected: 'SiteCorruptError'
  actual: 'Error'
  stack: |-
    Object.<anonymous> (apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:128:16)
```
### apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts › AC-06: site schemaVersion greater than the runtime's -> SiteNewerThanRuntimeError, content.db is not written
```
not ok 555 - AC-06: site schemaVersion greater than the runtime's -> SiteNewerThanRuntimeError, content.db is not written
  ---
  location: 'apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:1:3969'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'Error'
    - 'SiteNewerThanRuntimeError'
    
  name: 'AssertionError'
  expected: 'SiteNewerThanRuntimeError'
  actual: 'Error'
  stack: |-
    Object.<anonymous> (apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:147:16)
```
### apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts › RT-005/U-002-B1: equal schemaVersion index but a DIVERGENT schemaTag -> SiteNewerThanRuntimeError (not treated as compatible)
```
not ok 556 - RT-005/U-002-B1: equal schemaVersion index but a DIVERGENT schemaTag -> SiteNewerThanRuntimeError (not treated as compatible)
  ---
  location: 'apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:1:4727'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'Error'
    - 'SiteNewerThanRuntimeError'
    
  name: 'AssertionError'
  expected: 'SiteNewerThanRuntimeError'
  actual: 'Error'
  stack: |-
    Object.<anonymous> (apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:167:16)
```
### apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts › EC-05: content.db locked by another process -> SiteCorruptError-class failure naming the lock cause
```
not ok 559 - EC-05: content.db locked by another process -> SiteCorruptError-class failure naming the lock cause
  ---
  location: 'apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:1:8688'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 'Error'
    - 'SiteCorruptError'
    
  name: 'AssertionError'
  expected: 'SiteCorruptError'
  actual: 'Error'
  stack: |-
    Object.<anonymous> (apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:273:16)
```
### apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts › U-002-B2/U-002-ORD1: a failed metadata temp-file write after migration preserves the OLD stamp byte-for-byte, and a retry bumps both fields tog
```
not ok 560 - U-002-B2/U-002-ORD1: a failed metadata temp-file write after migration preserves the OLD stamp byte-for-byte, and a retry bumps both fields together
  ---
  location: 'apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:1:9384'
  error: |-
    The validation function is expected to return "true". Received false
    
    Caught error:
    
    Error: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.
  name: 'AssertionError'
  stack: |-
    async TestContext.<anonymous> (apps/website/src/platform/site-dir/__tests__/integration/boot-site-dir.integration.test.ts:312:3)
  ...
# Subtest: bootSiteDir on a postgres site opens the store (migrated, workspace resolved) without a content.db
```
### apps/website/src/cli/__tests__/unit/export-command-boot-work.unit.test.ts › export: a failed export closes the store only after the legacy tail and createSiteApp's BYOK pass settle
```
not ok 122 - export: a failed export closes the store only after the legacy tail and createSiteApp's BYOK pass settle
  ---
  location: 'apps/website/src/cli/__tests__/unit/export-command-boot-work.unit.test.ts:1:450'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + undefined
    - {
    -   fixture: 'composed'
    - }
    
  name: 'AssertionError'
  expected:
    fixture: 'composed'
```
### apps/website/src/cli/__tests__/unit/plugin-command.unit.test.ts › CLI install changed: real disk, no import, closes store
```
not ok 134 - CLI install changed: real disk, no import, closes store
  ---
  location: 'apps/website/src/cli/__tests__/unit/plugin-command.unit.test.ts:1:1413'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
    + Comparison {}
    - Comparison {
    -   code: 'PLUGIN_CHANGED_SINCE_PREVIEW'
    - }
    
  name: 'AssertionError'
  expected:
  actual:
```
### apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts › runServeCommand pins the site before boot, forwards the resolved bind host, and awaits storage closure before exiting
```
not ok 146 - runServeCommand pins the site before boot, forwards the resolved bind host, and awaits storage closure before exiting
  ---
  location: 'apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts:1:4914'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + undefined
    - {
    -   fixture: 'composed'
    - }
    
  name: 'AssertionError'
  expected:
    fixture: 'composed'
```
