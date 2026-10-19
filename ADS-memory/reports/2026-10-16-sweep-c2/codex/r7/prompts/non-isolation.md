# Seven Tovu website test files fail for reasons other than (or besides) the home-isolation guard

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
- apps/website/src/server/__tests__/assistant-chat-recovery-bounds.unit.test.ts (1)
- apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts (4: 3 isolation guard + 1 below)
- apps/website/src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts (8: 6 isolation guard + 2 below)
- apps/website/src/assistant/__tests__/site-capabilities-search-discoverability.test.ts (1)
- apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts (16: 14 isolation guard + 2 below)
- apps/website/src/assistant/durable-runs/__tests__/recover.unit.test.ts (2)
- apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-busy.test.ts (whole file, guard at module scope)

Extra rule for the four apps/website/src/assistant/** files: another agent (crosssite-c2) is editing
assistant source right now. Before deciding "stale" or "real bug", run `git diff -- <source file>` and
`git log -3 --format='%h %ad %s' -- <source file>`; if the failure comes from an UNCOMMITTED change by
that agent, do not touch anything and say so under NOT DONE ("in-flight change by another lane").
Test-file edits there are allowed; source edits there are not.

Failure output (TAP, from the 10-16 sweep):
### apps/website/src/server/__tests__/assistant-chat-recovery-bounds.unit.test.ts › a quiet stream without live proof waits five minutes, finalizes once and keeps its saved text
```
not ok 457 - a quiet stream without live proof waits five minutes, finalizes once and keeps its saved text
  ---
  location: 'apps/website/src/server/__tests__/assistant-chat-recovery-bounds.unit.test.ts:1:1602'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      [
        {
          kind: 'text',
          text: 'Partial answer'
        },
        {
```
### apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts › workspaceIdOverride names a workspace that does not exist: throws loudly rather than silently falling back to
```
not ok 623 - workspaceIdOverride names a workspace that does not exist: throws loudly rather than silently falling back to the default â the exact failure mode this fix exists to prevent
  ---
  location: 'apps/website/src/server/__tests__/integration/create-sqlite-route-deps-for-workspace.integration.test.ts:1:2704'
  error: 'a bad TOVU_WORKSPACE value must crash daemon boot with a clear message, never silently default'
  name: 'AssertionError'
  expected:
  actual:
  error: 'Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.'
  stack: |-
    assertTestHomeIsolation (apps/website/src/platform/site-dir/sites-home.ts:52:11)
    createSitesWorkspace (apps/website/src/platform/site-dir/sites-home.ts:16:3)
    resolveSiteDirForDatabase (apps/website/src/platform/site-dir/site-databases.ts:52:17)
```
### apps/website/src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts › overrides.db supplied without overrides.workspaceId -> throws (must be supplied together or not at all)
```
not ok 629 - overrides.db supplied without overrides.workspaceId -> throws (must be supplied together or not at all)
  ---
  location: 'apps/website/src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts:1:4843'
  error: 'Contract Map C-010: overrides.db and overrides.workspaceId must be supplied together or not at all'
  name: 'AssertionError'
  expected:
  actual:
  error: 'Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.'
  stack: |-
    assertTestHomeIsolation (apps/website/src/platform/site-dir/sites-home.ts:52:11)
    createSitesWorkspace (apps/website/src/platform/site-dir/sites-home.ts:16:3)
    resolveSiteRoot (apps/website/src/platform/site-dir/site-root.ts:78:21)
```
### apps/website/src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts › overrides.workspaceId supplied without overrides.db -> throws (must be supplied together or not at all)
```
not ok 630 - overrides.workspaceId supplied without overrides.db -> throws (must be supplied together or not at all)
  ---
  location: 'apps/website/src/server/__tests__/integration/create-sqlite-route-deps-overrides.integration.test.ts:1:5174'
  error: 'Contract Map C-010: overrides.db and overrides.workspaceId must be supplied together or not at all'
  name: 'AssertionError'
  expected:
  actual:
  error: 'Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.'
  stack: |-
    assertTestHomeIsolation (apps/website/src/platform/site-dir/sites-home.ts:52:11)
    createSitesWorkspace (apps/website/src/platform/site-dir/sites-home.ts:16:3)
    resolveSiteRoot (apps/website/src/platform/site-dir/site-root.ts:78:21)
```
### apps/website/src/assistant/__tests__/site-capabilities-search-discoverability.test.ts › 'what can this site do' ranks site_describe_capabilities in the top 3
```
not ok 94 - 'what can this site do' ranks site_describe_capabilities in the top 3
  ---
  location: 'apps/website/src/assistant/__tests__/site-capabilities-search-discoverability.test.ts:1:799'
  error: 'expected it in the top 3; got backup_get_capabilities, content_read.backup_restore_point, settings_get_effective'
  name: 'AssertionError'
  expected: true
  actual: false
  stack: |-
    TestContext.<anonymous> (apps/website/src/assistant/__tests__/site-capabilities-search-discoverability.test.ts:26:10)
```
### apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts › plugins_set_enabled: refuses to enable a plugin whose discovery status is 'invalid'
```
not ok 803 - plugins_set_enabled: refuses to enable a plugin whose discovery status is 'invalid'
  ---
  location: 'apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts:1:10403'
  error: |-
    The input did not match the regular expression /failed validation/. Input:
    
    'Error: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.'
    
  name: 'AssertionError'
  expected:
  actual:
  error: 'Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.'
```
### apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts › plugins_set_enabled: refuses to enable an unknown plugin id
```
not ok 804 - plugins_set_enabled: refuses to enable an unknown plugin id
  ---
  location: 'apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts:1:10679'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      Comparison {
    +   message: 'Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.',
    +   name: 'Error'
    -   message: "plugin 'does-not-exist' was not found in the current discovery snapshot",
    -   name: 'ToolInputError'
      }
```
### apps/website/src/assistant/durable-runs/__tests__/recover.unit.test.ts › three attempts, five active recovery minutes, and thirty-minute staleness each finalize once
```
not ok 1222 - three attempts, five active recovery minutes, and thirty-minute staleness each finalize once
  ---
  location: 'apps/website/src/assistant/durable-runs/__tests__/recover.unit.test.ts:1:8471'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   detail: 'Tried 3 times',
        kind: 'status',
        label: 'The assistant could not continue this answer. Saved work is above.'
      }
    
```
### apps/website/src/assistant/durable-runs/__tests__/recover.unit.test.ts › three failed continuation dispatches exhaust once without losing saved text
```
not ok 1225 - three failed continuation dispatches exhaust once without losing saved text
  ---
  location: 'apps/website/src/assistant/durable-runs/__tests__/recover.unit.test.ts:1:10671'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   detail: 'Tried 3 times',
        kind: 'status',
        label: 'The assistant could not continue this answer. Saved work is above.'
      }
    
```
### whole file failed: assistant/__tests__/tool-registrations.plugins-set-enabled-busy.test.ts (stderr before it)
```

Error: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.
    at assertTestHomeIsolation (apps/website/src/platform/site-dir/sites-home.ts:52:11)
    at createSitesWorkspace (apps/website/src/platform/site-dir/sites-home.ts:16:3)
    at resolveSiteRoot (apps/website/src/platform/site-dir/site-root.ts:78:21)
    at resolveAgentPluginLayout (apps/website/src/features/agent-plugins/layout.ts:69:71)
    at Object.get root (apps/website/src/__tests__/fixtures/site-layout-context.ts:62:23)
    at ownerLayout (apps/website/src/features/agent-plugins/lifecycle.ts:58:25)
    at createTovuAgentPluginLifecycle (apps/website/src/features/agent-plugins/lifecycle.ts:106:13)
    at <anonymous> (apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-busy.test.ts:43:19)

Node.js v24.2.0
✖ apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-busy.test.ts (3249.511525ms)
```
