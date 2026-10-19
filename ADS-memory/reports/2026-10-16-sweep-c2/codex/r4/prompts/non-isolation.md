# Five Tovu website test files fail for reasons other than (or besides) the home-isolation guard

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
- apps/website/src/features/webhooks/__tests__/site-key-ensure.unit.test.ts (13 fail: 10 isolation guard + the 3 below)
- apps/website/src/features/webhooks/__tests__/integration/site-key-ensure-race.integration.test.ts (1)
- apps/website/src/features/skills/__tests__/unit/tool-registrations.unit.test.ts (19 fail: 17 isolation guard + 2 below)
- apps/website/src/features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts (1)
- apps/website/src/features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts (1)

Failure output (TAP, from the 10-16 sweep, machine load 10-30):
### apps/website/src/features/webhooks/__tests__/integration/site-key-ensure-race.integration.test.ts › 2 concurrent processes minting the same siteKeyId under the same home converge on exactly 1 file, same fingerprint i
```
not ok 811 - 2 concurrent processes minting the same siteKeyId under the same home converge on exactly 1 file, same fingerprint in both
  ---
  location: 'apps/website/src/features/webhooks/__tests__/integration/site-key-ensure-race.integration.test.ts:1:1134'
  error: 'both children must observe absence and reach the barrier'
  name: 'AssertionError'
  expected: true
  actual: false
  stack: |-
    TestContext.<anonymous> (apps/website/src/features/webhooks/__tests__/integration/site-key-ensure-race.integration.test.ts:68:16)
  ...
# Subtest: readers refuse missing files, reuse an explicit key and never mint
```
```
not ok 885 - the CLI exits successfully and prints OK when the real repository has no seal violations
  ---
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + Error: spawnSync /usr/local/Cellar/node/24.2.0/bin/node ETIMEDOUT
    +     at spawnSync (node:child_process:878:24)
    +     at Test.runInAsyncScope (node:async_hooks:214:14)
```
### apps/website/src/features/webhooks/__tests__/site-key-ensure.unit.test.ts › ensureSiteKeyForBoot: siteDir has no .site-meta.json, LOCAL mode → mints a minimal one and mints the per-site key file — no silent gap
```
not ok 949 - ensureSiteKeyForBoot: siteDir has no .site-meta.json, LOCAL mode â mints a minimal one and mints the per-site key file â no silent gap
  ---
  location: 'apps/website/src/features/webhooks/__tests__/site-key-ensure.unit.test.ts:1:10738'
  error: 'a site with no meta file must still end up with a usable key in local mode'
  name: 'AssertionError'
  expected: true
  stack: |-
    TestContext.<anonymous> (apps/website/src/features/webhooks/__tests__/site-key-ensure.unit.test.ts:279:10)
  ...
# Subtest: ensureSiteKeyForBoot: siteDir has no .site-meta.json, PRODUCTION mode â still undefined, nothing written anywhere â production never mints
ok 950 - ensureSiteKeyForBoot: siteDir has no .site-meta.json, PRODUCTION mode â still undefined, nothing written anywhere â production never mints
```
### apps/website/src/features/webhooks/__tests__/site-key-ensure.unit.test.ts › ensureSiteKeyForBoot: a .site-meta.json that already exists with real fields is preserved verbatim — only a genuinely ABSENT file is ever mi
```
not ok 952 - ensureSiteKeyForBoot: a .site-meta.json that already exists with real fields is preserved verbatim â only a genuinely ABSENT file is ever minted
  ---
  location: 'apps/website/src/features/webhooks/__tests__/site-key-ensure.unit.test.ts:1:12453'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + undefined
    - 'mint'
    
  name: 'AssertionError'
  expected: 'mint'
  stack: |-
```
### apps/website/src/features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts › an unknown widgetEntryId against a valid post host still rejects with the existing WidgetInstanceNotFoundError, po
```
not ok 1071 - an unknown widgetEntryId against a valid post host still rejects with the existing WidgetInstanceNotFoundError, post unchanged
  ---
  location: 'apps/website/src/features/widgets/__tests__/integration/embed-service.post-host.integration.test.ts:1:15712'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + "embed references widget 'does-not-exist', which does not exist in workspace 'ws-1'"
    - "embed references widget 'does-not-exist', which does not exist in workspace 'ws-1' (REQ-16/17)"
    
  name: 'AssertionError'
  expected: "embed references widget 'does-not-exist', which does not exist in workspace 'ws-1' (REQ-16/17)"
  actual: "embed references widget 'does-not-exist', which does not exist in workspace 'ws-1'"
```
### apps/website/src/features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts › widgets_insert_embed with an unknown widgetEntryId against a valid post host is BAD_REQUEST with the instanc
```
not ok 1178 - widgets_insert_embed with an unknown widgetEntryId against a valid post host is BAD_REQUEST with the instance-not-found message
  ---
  location: 'apps/website/src/features/widgets/__tests__/integration/tool-registrations.delegated-error-status.test.ts:1:9812'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      {
    +   message: "WIDGETS_INSTANCE_NOT_FOUND: embed references widget 'nope', which does not exist in workspace 'ws-1'"
    -   message: "WIDGETS_INSTANCE_NOT_FOUND: embed references widget 'nope', which does not exist in workspace 'ws-1' (REQ-16/17)"
      }
    
  name: 'AssertionError'
```
### apps/website/src/features/skills/__tests__/unit/tool-registrations.unit.test.ts › two installed skill folders declaring the same frontmatter name refuse loudly instead of silently colliding
```
not ok 628 - two installed skill folders declaring the same frontmatter name refuse loudly instead of silently colliding
  ---
  location: 'apps/website/src/features/skills/__tests__/unit/tool-registrations.unit.test.ts:22:2237'
  error: |-
    The input did not match the regular expression /'code-review' is declared by more than one installed skill folder \('folder-one' and 'folder-two'\)/. Input:
    
    'Error: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.'
    
  name: 'AssertionError'
  expected:
  actual:
  error: 'Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.'
  stack: |-
    assertTestHomeIsolation (apps/website/src/platform/site-dir/sites-home.ts:52:11)
```
### apps/website/src/features/skills/__tests__/unit/tool-registrations.unit.test.ts › different skill names that sanitize to the same tool id refuse loudly
```
not ok 639 - different skill names that sanitize to the same tool id refuse loudly
  ---
  location: 'apps/website/src/features/skills/__tests__/unit/tool-registrations.unit.test.ts:29:366'
  error: |-
    The input did not match the regular expression /folder-a.*folder-b.*same tool id 'skill_a_b'/. Input:
    
    'Error: Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.'
    
  name: 'AssertionError'
  expected:
  actual:
  error: 'Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.'
  stack: |-
    assertTestHomeIsolation (apps/website/src/platform/site-dir/sites-home.ts:52:11)
```
