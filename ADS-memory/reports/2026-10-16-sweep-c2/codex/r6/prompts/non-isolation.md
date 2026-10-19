# Three Tovu website test files fail for reasons other than (or besides) the home-isolation guard

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
- apps/website/src/server/runtime/boot/__tests__/site-key-boot-notice.unit.test.ts (1)
- apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts (7: 5 isolation guard + 2 below). This TEST file may be edited even though it sits under server/runtime/composition.
- apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts (4)

Failure output (TAP, from the 10-16 sweep, machine load < 10):
### apps/website/src/server/runtime/boot/__tests__/site-key-boot-notice.unit.test.ts › with no injected probe, the REAL inspectSiteKeyMaterial is what decides
```
not ok 141 - with no injected probe, the REAL inspectSiteKeyMaterial is what decides
  ---
  location: 'apps/website/src/server/runtime/boot/__tests__/site-key-boot-notice.unit.test.ts:1:8764'
  error: |-
    a real, usable key must silence this â a false alarm trains it away
    + actual - expected
    
    + [
    +   '[site-key] could not determine whether this server has usable site key material.'
    + ]
    - []
    
```
### apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts › an unknown TOVU_MEDIA_BLOB_STORE refuses to boot, naming the accepted backends
```
not ok 212 - an unknown TOVU_MEDIA_BLOB_STORE refuses to boot, naming the accepted backends
  ---
  location: 'apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts:1:4130'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      Comparison {
    +   message: 'Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.'
    -   message: "Unknown TOVU_MEDIA_BLOB_STORE 'gcs' â expected 'local' or 's3'."
      }
    
```
### apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts › TOVU_MEDIA_BLOB_STORE=s3 with missing variables refuses to boot, naming every required one and exactly t
```
not ok 213 - TOVU_MEDIA_BLOB_STORE=s3 with missing variables refuses to boot, naming every required one and exactly the missing ones
  ---
  location: 'apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts:1:4446'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      Comparison {
    +   message: 'Test home isolation required: refusing the real user home for Tovu sites or site keys. Use isolated-catalog-home or a temporary HOME and desktop profile.'
    -   message: 'TOVU_MEDIA_BLOB_STORE=s3 requires TOVU_S3_BUCKET, TOVU_S3_REGION, TOVU_S3_ACCESS_KEY_ID, TOVU_S3_SECRET_ACCESS_KEY â missing: TOVU_S3_REGION, TOVU_S3_SECRET_ACCESS_KEY.'
      }
    
```
### apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts › owner: SIGTERM closes content, chat and ops journal before exit
```
not ok 617 - owner: SIGTERM closes content, chat and ops journal before exit
  ---
  location: 'apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts:1:337'
  error: |-
    Expected values to be strictly equal:
    
    1 !== 'ready'
    
  name: 'AssertionError'
  expected: 'ready'
  actual: 1
```
### apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts › owner: SIGINT closes content, chat and ops journal before exit
```
not ok 618 - owner: SIGINT closes content, chat and ops journal before exit
  ---
  location: 'apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts:1:337'
  error: |-
    Expected values to be strictly equal:
    
    1 !== 'ready'
    
  name: 'AssertionError'
  expected: 'ready'
  actual: 1
```
### apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts › workspace-client: SIGTERM closes content, chat and ops journal before exit
```
not ok 619 - workspace-client: SIGTERM closes content, chat and ops journal before exit
  ---
  location: 'apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts:1:337'
  error: |-
    Expected values to be strictly equal:
    
    1 !== 'ready'
    
  name: 'AssertionError'
  expected: 'ready'
  actual: 1
```
### apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts › workspace-client: SIGINT closes content, chat and ops journal before exit
```
not ok 620 - workspace-client: SIGINT closes content, chat and ops journal before exit
  ---
  location: 'apps/website/src/server/runtime/lifecycle/__tests__/sqlite-shutdown.integration.test.ts:1:337'
  error: |-
    Expected values to be strictly equal:
    
    1 !== 'ready'
    
  name: 'AssertionError'
  expected: 'ready'
  actual: 1
```
