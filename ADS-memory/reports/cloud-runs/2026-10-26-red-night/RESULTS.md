# RESULTS — RED run 2026-10-26 night (Sonnet 5.5, report only)

Tovu b3b73ba5d2c1 / Jini f38e54695dfb. Node 24.22.0. All 57 files executed in ~12 min (2 at a time).

## 1. Summary
| metric | count |
|---|---|
| files in inventory | 57 |
| files run | 57 (0 MISSING) |
| files LOAD-FAIL | 0 (but 2 files aborted mid-run, see below) |
| RED names confirmed failing (RED-as-predicted) | 70 matched by exact name + 3 more (see note) = 73 of 81 |
| GREEN-unexpected (RED name passed) | 8 |
| other failures | 0 touched-test failures; 22 failing sub-tests / file-aborts listed below, almost all leaf subtests inside a failing RED group (so part of the RED), 2 file-level aborts |
| NOT RUN | 0 |
| fully green files | 2 (project-keys/tools.unit, provider-settings-route.unit) |

Note: 73 + 8 = 81 RED names. The 3 "not found" RED names: T3 (App.render.test.ts) — the file process died after 6 passing tests at ~99.5s, T3 never reported (UNSURE: probably the RED test hanging/crashing; treat as RED-as-predicted-by-abort); T38 (duplicate-pglite-store.integration.test.ts) — process died after 14s with no per-test output, UNSURE (could be ENV: pglite/Postgres; cannot distinguish); a templated name `${count} body items report truncation only when another gated item exists` — it ran and failed under its expanded name "200 body items report truncation…" → RED-as-predicted.

Classification of the 22 "or sub-test of a RED group" rows below: each is a leaf subtest printed under a failing parent test; the parent is the RED name. I did not individually map every leaf to a parent. Two are file-level aborts (App.render.test.ts, duplicate-pglite-store). Verdict UNSURE for those two; the rest are part of RED groups (not ENV, not obviously regressions). Touched-existing tests: none failed.

Environment: argon2/better-sqlite3 loaded fine; no Postgres/browser needed by the tests that ran except possibly the pglite file.

## 2. Per file
### `apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts` [website]
Executed tests=13 pass=10 fail=3

| result | name | class |
|---|---|---|
| ✖ | a site label collision is refused before it hides the renamed project key | other-failure (or sub-test of a RED group) |
| ✖ | an unattached project label collision is translated to the domain duplicate error | other-failure (or sub-test of a RED group) |
| ✖ | T6: project key renames refuse site-owned and unattached project labels | RED-as-predicted |

+ 10 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts:1:5894
✖ a site label collision is refused before it hides the renamed project key (5.882602ms)
  AssertionError [ERR_ASSERTION]: Missing expected rejection (CustomCredentialDuplicateLabelError).
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts:120:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts:119:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    operator: 'rejects',
test at apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts:1:6461
✖ an unattached project label collision is translated to the domain duplicate error (1.832251ms)
  AssertionError [ERR_ASSERTION]: The error is expected to be an instance of "CustomCredentialDuplicateLabelError". Received "VaultError"
  
  Error message:
  
  Secrets vault: conflict
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts:130:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/custom-credentials/__tests__/project-scope.unit.test.ts:129:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
```
</details>

### `apps/desktop/src/renderer/App.render.test.ts` [desktop-renderer]
Executed tests=7 pass=6 fail=1

| result | name | class |
|---|---|---|
| ✖ | src/renderer/App.render.test.ts | other-failure (or sub-test of a RED group) |

+ 6 other passing tests (not listed).

RED names not found in output: T3: navigating away from Websites and back preserves the open admin webview

<details><summary>failure details</summary>

```
test at src/renderer/App.render.test.ts:1:1
✖ src/renderer/App.render.test.ts (99521.448044ms)
  'test failed'

```
</details>

### `apps/desktop/src/tovu-server-failures.test.ts` [desktop]
Executed tests=4 pass=3 fail=1

| result | name | class |
|---|---|---|
| ✖ | T5: a boot failure after long startup logs reports the final CLI error | RED-as-predicted |

+ 3 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at src/tovu-server-failures.test.ts:46:1
✖ T5: a boot failure after long startup logs reports the final CLI error (17.15697ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    Comparison {
  +   message: 'tovu serve exited (code 4) before reporting a port.\n' +
  +     'Startup diagnostics\n' +
  +     'Startup diagnostics\n' +
  +     'Startup diagnostics\n' +
  +     'Startup diagnostics\n' +
  +     'Startup diagnostics',
```
</details>

### `apps/desktop/src/renderer/App.hooks.render.test.ts` [desktop-renderer]
Executed tests=47 pass=46 fail=1

| result | name | class |
|---|---|---|
| ✖ | T18: a poll started before creation cannot erase the new site and its token notice | RED-as-predicted |

+ 46 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at src/renderer/App.hooks.render.test.ts:1:11765
✖ T18: a poll started before creation cannot erase the new site and its token notice (11.820039ms)
  AssertionError [ERR_ASSERTION]: an older inventory snapshot must preserve the newly created site and its one-time token notice
  + actual - expected
  
    {
      ids: [
        'a',
  -     'new'
      ],
  +   notice: null
  -   notice: {
```
</details>

### `apps/website/src/features/agent-plugins/admin-surfaces/__tests__/unit/delivery-bindings.unit.test.ts` [website]
Executed tests=22 pass=21 fail=1

| result | name | class |
|---|---|---|
| ✖ | T7: re-saving a binding preserves its temporarily hidden trashed form ids | RED-as-predicted |

+ 21 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/agent-plugins/admin-surfaces/__tests__/unit/delivery-bindings.unit.test.ts:1:3384
✖ T7: re-saving a binding preserves its temporarily hidden trashed form ids (33.624498ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
      'form-1',
  -   'form-trashed'
    ]
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/agent-plugins/admin-surfaces/__tests__/unit/delivery-bindings.unit.test.ts:93:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
```
</details>

### `apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-save.test.ts` [website]
Executed tests=5 pass=4 fail=1

| result | name | class |
|---|---|---|
| ✖ | T8: a retired embed remains savable when its old props no longer match the current schema | RED-as-predicted |

+ 4 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-save.test.ts:1:2478
✖ T8: a retired embed remains savable when its old props no longer match the current schema (4.349497ms)
  AssertionError [ERR_ASSERTION]: Got unwanted rejection: retired contracts must produce a non-blocking version warning, not a props error
  Actual message: "Plugin component props are invalid: $ has an undeclared property "label". Nothing was written."
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-save.test.ts:48:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: PluginEmbedValidationError: Plugin component props are invalid: $ has an undeclared property "label". Nothing was written.
        at validateHtml (/home/user/Tovu/apps/website/src/features/agent-plugins/exports/runtime.ts:100:66)
        at async <anonymous> (/home/user/Tovu/apps/website/src/features/agent-plugins/__tests__/unit/plugin-embed-save.test.ts:49:22)
```
</details>

### `apps/website/src/features/agent-plugins/executable-tools/__tests__/unit/host-capabilities.unit.test.ts` [website]
Executed tests=18 pass=16 fail=2

| result | name | class |
|---|---|---|
| ✔ | tokens: a confirmed call asks for the account frozen against its own signal | pass (touched) |
| ✖ | T13: a confirmed call refuses a token for a connection absent from its frozen approval | RED-as-predicted |
| ✖ | T23: aborting a tool propagates to its in-flight HTTP request even with a plugin signal | RED-as-predicted |

+ 15 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/agent-plugins/executable-tools/__tests__/unit/host-capabilities.unit.test.ts:1:6531
✖ T13: a confirmed call refuses a token for a connection absent from its frozen approval (3.386957ms)
  AssertionError [ERR_ASSERTION]: Missing expected rejection (Error).
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/agent-plugins/executable-tools/__tests__/unit/host-capabilities.unit.test.ts:157:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    operator: 'rejects',
    diff: 'simple'
  }
test at apps/website/src/features/agent-plugins/executable-tools/__tests__/unit/host-capabilities.unit.test.ts:1:6998
✖ T23: aborting a tool propagates to its in-flight HTTP request even with a plugin signal (1.255724ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/agent-plugins/executable-tools/__tests__/unit/host-capabilities.unit.test.ts:176:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
```
</details>

### `apps/website/src/features/agent-plugins/executable-tools/__tests__/unit/register.unit.test.ts` [website]
Executed tests=9 pass=8 fail=1

| result | name | class |
|---|---|---|
| ✔ | dispose removes every plugin tool from the registry | pass (touched) |
| ✖ | T14: an older refresh cannot restore tools withdrawn by a newer refresh | RED-as-predicted |

+ 7 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/agent-plugins/executable-tools/__tests__/unit/register.unit.test.ts:1:6040
✖ T14: an older refresh cannot restore tools withdrawn by a newer refresh (30.193212ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  true !== false
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/agent-plugins/executable-tools/__tests__/unit/register.unit.test.ts:137:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: true,
```
</details>

### `apps/website/src/features/agent-plugins/__tests__/unit/federate-mcp.unit.test.ts` [website]
Executed tests=34 pass=33 fail=1

| result | name | class |
|---|---|---|
| ✖ | T15: re-enabling preserves an operator-edited disabled connection and its OAuth tokens | RED-as-predicted |

+ 33 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/agent-plugins/__tests__/unit/federate-mcp.unit.test.ts:1:13176
✖ T15: re-enabling preserves an operator-edited disabled connection and its OAuth tokens (10.028677ms)
  AssertionError [ERR_ASSERTION]: enabling must preserve the operator's URL, auth settings and sealed credentials
  + actual - expected
  
    {
      aadVersion: 1,
      allowedToolNames: '[]',
      args: '[]',
  +   authMode: 'none',
  -   authMode: 'oauth',
      command: null,
```
</details>

### `apps/website/src/features/agent-plugins/__tests__/unit/apply-connect-defaults.unit.test.ts` [website]
Executed tests=8 pass=7 fail=1

| result | name | class |
|---|---|---|
| ✖ | T21: OAuth sign-in respects an operator's explicit plugin-off decision | RED-as-predicted |

+ 7 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/agent-plugins/__tests__/unit/apply-connect-defaults.unit.test.ts:1:5044
✖ T21: OAuth sign-in respects an operator's explicit plugin-off decision (46.787672ms)
  AssertionError [ERR_ASSERTION]: sign-in must not activate a connection whose plugin the operator turned off
  
  true !== false
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/agent-plugins/__tests__/unit/apply-connect-defaults.unit.test.ts:166:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
```
</details>

### `apps/website/src/features/forms/__tests__/import-remote-submissions.test.ts` [website]
Executed tests=11 pass=9 fail=2

| result | name | class |
|---|---|---|
| ✖ | valid rows become submissions with one received event each, keeping the host's time and IP | other-failure (or sub-test of a RED group) |
| ✖ | T9: remote imports report the live submit path's default text-length violations | RED-as-predicted |

+ 9 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/forms/__tests__/import-remote-submissions.test.ts:1:2029
✖ valid rows become submissions with one received event each, keeping the host's time and IP (11.169832ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
      {
        aggregateId: 'id-1',
        id: 'id-2',
        name: 'form.submission.received',
        occurredAt: '2026-10-19T12:00:00.000Z',
        payload: {
test at apps/website/src/features/forms/__tests__/import-remote-submissions.test.ts:1:4585
✖ T9: remote imports report the live submit path's default text-length violations (1.930888ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + []
  - [
  -   {
  -     fieldErrors: [
  -       {
  -         field: 'name',
  -         reason: 'too_long'
```
</details>

### `apps/website/src/features/forms/__tests__/form-destination-manifest.test.ts` [website]
Executed tests=6 pass=5 fail=1

| result | name | class |
|---|---|---|
| ✖ | T9: the static-host manifest includes default text caps and preserves authored limits | RED-as-predicted |

+ 5 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/forms/__tests__/form-destination-manifest.test.ts:1:1377
✖ T9: the static-host manifest includes default text caps and preserves authored limits (3.251589ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  ... Skipped lines
  
    [
      {
        fields: [
          {
  -         maxLength: 100,
            name: 'name',
```
</details>

### `apps/website/src/features/media/__tests__/content-duplicate.media.test.ts` [website]
Executed tests=16 pass=15 fail=1

| result | name | class |
|---|---|---|
| ✖ | T10: a colliding slug override leaves no half-made media copy | RED-as-predicted |

+ 15 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/media/__tests__/content-duplicate.media.test.ts:1:8479
✖ T10: a colliding slug override leaves no half-made media copy (5.347452ms)
  AssertionError [ERR_ASSERTION]: a rejected duplicate must leave the library unchanged
  + actual - expected
  ... Skipped lines
  
    [
      {
        alt: 'A hero banner',
        caption: 'Shot on location',
        createdAt: '2026-09-08T00:00:00.000Z',
  ...
```
</details>

### `apps/website/src/features/media/__tests__/publish-content.write.test.ts` [website]
Executed tests=18 pass=17 fail=1

| result | name | class |
|---|---|---|
| ✖ | T12: malformed bundle hashes are refused before any filesystem blob probe or read | RED-as-predicted |

+ 17 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/media/__tests__/publish-content.write.test.ts:1:5949
✖ T12: malformed bundle hashes are refused before any filesystem blob probe or read (32.068236ms)
  AssertionError [ERR_ASSERTION]: malformed hashes must be rejected before blobStore.exists/get
  + actual - expected
  
  + [
  +   {
  +     operation: 'exists',
  +     storageKey: 'ws/11111111-1111-1111-1111-111111111111/blobs/../../../outside'
  +   },
  +   {
  +     operation: 'exists',
```
</details>

### `apps/website/src/features/media/__tests__/provider-credential-store.test.ts` [website]
Executed tests=57 pass=56 fail=1

| result | name | class |
|---|---|---|
| ✖ | T17: a legacy keyless provider does not block another provider's metadata edit | RED-as-predicted |

+ 56 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/media/__tests__/provider-credential-store.test.ts:1:4005
✖ T17: a legacy keyless provider does not block another provider's metadata edit (15.254381ms)
  AssertionError [ERR_ASSERTION]: Got unwanted rejection: re-sending an existing keyless provider must not require a new token
  Actual message: "Enter a token. Spaces alone are not a token."
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/media/__tests__/provider-credential-store.test.ts:147:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error: Enter a token. Spaces alone are not a token.
        at buildProviderUpsertRow (/home/user/Tovu/apps/website/src/features/media/provider-credential-store.ts:316:34)
        at <anonymous> (/home/user/Tovu/apps/website/src/features/media/provider-credential-store.ts:379:7)
```
</details>

### `apps/website/src/features/deployments/deploy-ops/__tests__/run-ops.test.ts` [website]
Executed tests=25 pass=24 fail=1

| result | name | class |
|---|---|---|
| ✖ | T20: bodyless POST and DELETE omit content-type while JSON writes retain it | RED-as-predicted |

+ 24 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/deployments/deploy-ops/__tests__/run-ops.test.ts:1:388
✖ T20: bodyless POST and DELETE omit content-type while JSON writes retain it (189.768916ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
      {
        body: undefined,
  +     contentType: 'application/json',
  -     contentType: null,
        method: 'POST',
        url: 'https://api.example-host.dev/v1/targets/shop/secrets/OLD_KEY'
```
</details>

### `apps/website/src/features/deployments/static-publish/__tests__/adapter.plan.unit.test.ts` [website]
Executed tests=4 pass=3 fail=1

| result | name | class |
|---|---|---|
| ✔ | readStaticPublishConfig keeps declared string fields, refuses non-strings in JSON mode, and drops unknown keys | pass (touched) |
| ✖ | T24: blankAsAbsent refuses non-string declared fields instead of silently dropping them | RED-as-predicted |

+ 2 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/deployments/static-publish/__tests__/adapter.plan.unit.test.ts:1:3091
✖ T24: blankAsAbsent refuses non-string declared fields instead of silently dropping them (3.22484ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
  +   config: {
  +     target: 'fixture-host'
  +   },
  +   ok: true
  -   message: "'bucket' must be a string",
  -   ok: false
```
</details>

### `apps/website/src/features/source-control/__tests__/store.unit.test.ts` [website]
Executed tests=62 pass=59 fail=3

| result | name | class |
|---|---|---|
| ✖ | vault default resolution never lists sibling credentials | other-failure (or sub-test of a RED group) |
| ✖ | T26: token-only rotation retains the saved provider | RED-as-predicted |
| ✖ | T36: blank-token patches refuse changes to other connection fields | RED-as-predicted |

+ 59 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/source-control/__tests__/store.unit.test.ts:1:27547
✖ vault default resolution never lists sibling credentials (0.884327ms)
  Error: The credential could not be saved or unlocked. Check the site credential store.
      at resolveDefaultForSourceControl (/home/user/Tovu/apps/website/src/features/source-control/store.ts:504:19)
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/source-control/__tests__/store.unit.test.ts:626:17)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)

test at apps/website/src/features/source-control/__tests__/store.unit.test.ts:1:42735
✖ T26: token-only rotation retains the saved provider (9.588403ms)
  AssertionError [ERR_ASSERTION]: Got unwanted rejection.
  Actual message: "connection.providerId must be one of: example-git, example-token, example-paired"
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/source-control/__tests__/store.unit.test.ts:819:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error: connection.providerId must be one of: example-git, example-token, example-paired
        at requireProvider (/home/user/Tovu/apps/website/src/features/source-control/store.ts:257:22)
        at validateConnection (/home/user/Tovu/apps/website/src/features/source-control/store.ts:281:22)
test at apps/website/src/features/source-control/__tests__/store.unit.test.ts:1:43401
✖ T36: blank-token patches refuse changes to other connection fields (1.636408ms)
  AssertionError [ERR_ASSERTION]: Missing expected rejection (SourceControlCredentialValidationError).
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/source-control/__tests__/store.unit.test.ts:841:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    operator: 'rejects',
    diff: 'simple'
  }
```
</details>

### `apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts` [website]
Executed tests=10 pass=8 fail=2

| result | name | class |
|---|---|---|
| ✖ | T27: renaming a project credential refuses a label already claimed by this site | RED-as-predicted |
| ✖ | T35: ambiguous site credentials never fall back to a shadowed project default | RED-as-predicted |

+ 8 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts:1:5373
✖ T27: renaming a project credential refuses a label already claimed by this site (6.46955ms)
  AssertionError [ERR_ASSERTION]: Missing expected rejection (SourceControlCredentialDuplicateLabelError).
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts:116:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    operator: 'rejects',
    diff: 'simple'
  }
test at apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts:1:6022
✖ T35: ambiguous site credentials never fall back to a shadowed project default (5.161721ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
  +   metadata: 'sc-8',
  +   opened: 'sc-8'
  -   metadata: null,
  -   opened: null
    }
  
```
</details>

### `apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts` [website]
Executed tests=35 pass=31 fail=4

| result | name | class |
|---|---|---|
| ✖ | T28: commit targets reject traversal and malformed Git branch names | RED-as-predicted |
| ✖ | commitSiteToSourceControl: a vault result from another provider group is rejected as NO_CREDENTIALS_CONFIGURED before opening or forwarding its token | other-failure (or sub-test of a RED group) |
| ✖ | commitSiteToSourceControl: a vault repo throwing a non-Error value produces a safe NO_CREDENTIALS_CONFIGURED message without exposing adapter details | other-failure (or sub-test of a RED group) |
| ✖ | T37: plugin exceptions and unknown error codes become safe PROVIDER_ERROR outcomes | RED-as-predicted |

+ 31 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts:1:3899
✖ T28: commit targets reject traversal and malformed Git branch names (4.434426ms)
  AssertionError [ERR_ASSERTION]: ../../x
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts:142:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
test at apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts:1:9715
✖ commitSiteToSourceControl: a vault result from another provider group is rejected as NO_CREDENTIALS_CONFIGURED before opening or forwarding its token (184.782476ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + "No source control credential is configured for 'example-git'. Connect one in the admin's Source Control page first."
  - 'credential could not be resolved: The credential could not be saved or unlocked. Check the site credential store.'
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts:301:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
test at apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts:1:11894
✖ commitSiteToSourceControl: a vault repo throwing a non-Error value produces a safe NO_CREDENTIALS_CONFIGURED message without exposing adapter details (188.976476ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + "No source control credential is configured for 'example-git'. Connect one in the admin's Source Control page first."
  - 'credential could not be resolved: The credential could not be saved or unlocked. Check the site credential store.'
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts:324:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
test at apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts:1:25973
✖ T37: plugin exceptions and unknown error codes become safe PROVIDER_ERROR outcomes (208.615399ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
  +   'rejected',
      'fulfilled',
  -   'fulfilled'
    ]
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/source-control/__tests__/commit-site.unit.test.ts:614:10)
```
</details>

### `apps/website/src/features/post/__tests__/publish-content.terms.test.ts` [website]
Executed tests=7 pass=6 fail=1

| result | name | class |
|---|---|---|
| ✖ | T31: a term write failure after importing a post removes the unrecorded post | RED-as-predicted |

+ 6 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/post/__tests__/publish-content.terms.test.ts:1:5107
✖ T31: a term write failure after importing a post removes the unrecorded post (119.487454ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + {
  +   author: null,
  +   bodyFormat: 'doc',
  +   bodyHtml: null,
  +   bodyJson: {
  +     content: [],
  +     type: 'doc'
```
</details>

### `apps/website/src/features/post/__tests__/publish-content.test.ts` [website]
Executed tests=42 pass=38 fail=4

| result | name | class |
|---|---|---|
| ✖ | apply() restores an existing destination forward when change-set recording fails (byline=null, visible=false) | other-failure (or sub-test of a RED group) |
| ✖ | apply() restores an existing destination forward when change-set recording fails (byline=Hidden credit, visible=false) | other-failure (or sub-test of a RED group) |
| ✖ | apply() restores an existing destination forward when change-set recording fails (byline=Visible credit, visible=true) | other-failure (or sub-test of a RED group) |
| ✖ | T32: reverting a retirement from history restores the holder's original free slug | RED-as-predicted |

+ 38 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/post/__tests__/publish-content.test.ts:1:14439
✖ apply() restores an existing destination forward when change-set recording fails (byline=null, visible=false) (11.902687ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
  +   'content.saved',
      'entry.unpublished',
      'entry.published'
    ]
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/post/__tests__/publish-content.test.ts:465:10)
test at apps/website/src/features/post/__tests__/publish-content.test.ts:1:14439
✖ apply() restores an existing destination forward when change-set recording fails (byline=Hidden credit, visible=false) (1.464866ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
  +   'content.saved',
      'entry.unpublished',
      'entry.published'
    ]
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/post/__tests__/publish-content.test.ts:465:10)
test at apps/website/src/features/post/__tests__/publish-content.test.ts:1:14439
✖ apply() restores an existing destination forward when change-set recording fails (byline=Visible credit, visible=true) (5.270042ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
  +   'content.saved',
      'entry.unpublished',
      'entry.published'
    ]
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/post/__tests__/publish-content.test.ts:465:10)
test at apps/website/src/features/post/__tests__/publish-content.test.ts:1:20188
✖ T32: reverting a retirement from history restores the holder's original free slug (1.093272ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'about-replaced-20260918'
  - 'about'
          ^
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/post/__tests__/publish-content.test.ts:602:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
```
</details>

### `apps/website/src/features/post/__tests__/tool-registrations.partial-update.test.ts` [website]
Executed tests=15 pass=12 fail=3

| result | name | class |
|---|---|---|
| ✔ | create results link to the public slug when published, and update removes that link when drafted | pass (touched) |
| ✖ | empty paragraph without content | other-failure (or sub-test of a RED group) |
| ✖ | widget cssClass and htmlAttributes | other-failure (or sub-test of a RED group) |
| ✖ | T33: the update body schema accepts an empty editor paragraph and preserves existing widget styling | RED-as-predicted |

+ 11 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/post/__tests__/tool-registrations.partial-update.test.ts:1:12927
✖ empty paragraph without content (7.312984ms)
  AssertionError [ERR_ASSERTION]: [{"instanceLocation":"#","keyword":"properties","keywordLocation":"#/properties","error":"Property \"content\" does not match schema."},{"instanceLocation":"#/content","keyword":"items","keywordLocation":"#/properties/content/items","error":"Items did not match schema."},{"instanceLocation":"#/content/0","keyword":"$ref","keywordLocation":"#/properties/content/items/$ref","error":"A subschema had errors."},{"instanceLocation":"#/content/0","keyword":"oneOf","keywordLocation":"#/properties/content/items/$ref/oneOf","error":"Instance does not match exactly one subschema (0 matches)."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/0/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/1/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/1/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/1/properties/type/const","error":"Instance does not match \"heading\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/2/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/2/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/2/properties/type/const","error":"Instance does not match \"bulletList\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/3/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/3/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/3/properties/type/const","error":"Instance does not match \"orderedList\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/4/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/4/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/4/properties/type/const","error":"Instance does not match \"taskList\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/5/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/5/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/5/properties/type/const","error":"Instance does not match \"blockquote\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/6/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/6/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/6/properties/type/const","error":"Instance does not match \"codeBlock\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/7/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/7/properties/type/const","error":"Instance does not match \"horizontalRule\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/8/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/8/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/8/properties/type/const","error":"Instance does not match \"table\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/9/required","error":"Instance does not have required property \"attrs\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/9/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/9/properties/type/const","error":"Instance does not match \"media\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/10/required","error":"Instance does not have required property \"attrs\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/10/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/10/properties/type/const","error":"Instance does not match \"youtube\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/11/required","error":"Instance does not have required property \"attrs\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/11/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/11/properties/type/const","error":"Instance does not match \"widgetEmbed\"."}]
  
  false !== true
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/post/__tests__/tool-registrations.partial-update.test.ts:411:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/post/__tests__/tool-registrations.partial-update.test.ts:401:43)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
test at apps/website/src/features/post/__tests__/tool-registrations.partial-update.test.ts:1:12927
✖ widget cssClass and htmlAttributes (1.674689ms)
  AssertionError [ERR_ASSERTION]: [{"instanceLocation":"#","keyword":"properties","keywordLocation":"#/properties","error":"Property \"content\" does not match schema."},{"instanceLocation":"#/content","keyword":"items","keywordLocation":"#/properties/content/items","error":"Items did not match schema."},{"instanceLocation":"#/content/0","keyword":"$ref","keywordLocation":"#/properties/content/items/$ref","error":"A subschema had errors."},{"instanceLocation":"#/content/0","keyword":"oneOf","keywordLocation":"#/properties/content/items/$ref/oneOf","error":"Instance does not match exactly one subschema (0 matches)."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/0/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/0/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/0/properties/type/const","error":"Instance does not match \"paragraph\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/1/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/1/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/1/properties/type/const","error":"Instance does not match \"heading\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/2/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/2/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/2/properties/type/const","error":"Instance does not match \"bulletList\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/3/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/3/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/3/properties/type/const","error":"Instance does not match \"orderedList\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/4/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/4/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/4/properties/type/const","error":"Instance does not match \"taskList\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/5/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/5/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/5/properties/type/const","error":"Instance does not match \"blockquote\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/6/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/6/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/6/properties/type/const","error":"Instance does not match \"codeBlock\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/7/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/7/properties/type/const","error":"Instance does not match \"horizontalRule\"."},{"instanceLocation":"#/content/0","keyword":"required","keywordLocation":"#/properties/content/items/$ref/oneOf/8/required","error":"Instance does not have required property \"content\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/8/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/8/properties/type/const","error":"Instance does not match \"table\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/9/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/9/properties/type/const","error":"Instance does not match \"media\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/10/properties","error":"Property \"type\" does not match schema."},{"instanceLocation":"#/content/0/type","keyword":"const","keywordLocation":"#/properties/content/items/$ref/oneOf/10/properties/type/const","error":"Instance does not match \"youtube\"."},{"instanceLocation":"#/content/0","keyword":"properties","keywordLocation":"#/properties/content/items/$ref/oneOf/11/properties","error":"Property \"attrs\" does not match schema."},{"instanceLocation":"#/content/0/attrs","keyword":"additionalProperties","keywordLocation":"#/properties/content/items/$ref/oneOf/11/properties/attrs/additionalProperties","error":"Property \"cssClass\" does not match additional properties schema."},{"instanceLocation":"#/content/0/attrs/cssClass","keyword":"false","keywordLocation":"#/content/0/attrs/cssClass","error":"False boolean schema."},{"instanceLocation":"#/content/0/attrs","keyword":"additionalProperties","keywordLocation":"#/properties/content/items/$ref/oneOf/11/properties/attrs/additionalProperties","error":"Property \"htmlAttributes\" does not match additional properties schema."},{"instanceLocation":"#/content/0/attrs/htmlAttributes","keyword":"false","keywordLocation":"#/content/0/attrs/htmlAttributes","error":"False boolean schema."}]
  
  false !== true
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/post/__tests__/tool-registrations.partial-update.test.ts:411:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/post/__tests__/tool-registrations.partial-update.test.ts:401:43)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
```
</details>

### `apps/website/src/features/post/__tests__/reverters.test.ts` [website]
Executed tests=8 pass=3 fail=5

| result | name | class |
|---|---|---|
| ✔ | reverting a delete of a post that no longer exists fails loudly, naming the post | pass (touched) |
| ✖ | update: new revision is present in history | other-failure (or sub-test of a RED group) |
| ✖ | update: a concurrent edit survives | other-failure (or sub-test of a RED group) |
| ✖ | delete: new revision is present in history | other-failure (or sub-test of a RED group) |
| ✖ | delete: a concurrent edit survives | other-failure (or sub-test of a RED group) |
| ✖ | T34: reverts record their new revision and preserve an edit committed after their read | RED-as-predicted |

+ 2 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/post/__tests__/reverters.test.ts:1:3636
✖ update: new revision is present in history (8.186815ms)
  AssertionError [ERR_ASSERTION]: the reverted state must appear in post history
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/post/__tests__/reverters.test.ts:68:14)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/post/__tests__/reverters.test.ts:60:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: true,
test at apps/website/src/features/post/__tests__/reverters.test.ts:1:4312
✖ update: a concurrent edit survives (4.603795ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  ... Skipped lines
  
    {
      bodyFormat: 'doc',
      bodyHtml: null,
      bodyJson: {
        content: [],
  ...
test at apps/website/src/features/post/__tests__/reverters.test.ts:1:3636
✖ delete: new revision is present in history (1.128153ms)
  AssertionError [ERR_ASSERTION]: the reverted state must appear in post history
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/post/__tests__/reverters.test.ts:68:14)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/post/__tests__/reverters.test.ts:60:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: true,
test at apps/website/src/features/post/__tests__/reverters.test.ts:1:4312
✖ delete: a concurrent edit survives (2.319599ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
      bodyFormat: 'doc',
      bodyHtml: null,
      bodyJson: {
        content: [],
        type: 'doc'
      },
```
</details>

### `apps/website/src/features/site-backup/__tests__/import-registry.unit.test.ts` [website]
Executed tests=36 pass=35 fail=1

| result | name | class |
|---|---|---|
| ✖ | T25: interrupted verification and orphaned payloads release the staging budget without discarding live owner setup | RED-as-predicted |

+ 35 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/site-backup/__tests__/import-registry.unit.test.ts:1:8552
✖ T25: interrupted verification and orphaned payloads release the staging budget without discarding live owner setup (40.756936ms)
  AssertionError [ERR_ASSERTION]: Got unwanted exception: crash leftovers must not permanently exhaust the four-payload staging budget
  Actual message: "Four imports are staged. Complete owner setup or wait for expiry before uploading another."
      at run (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-registry.unit.test.ts:224:12)
      at async runHeldAsync (/home/user/Jini/packages/platform/src/fs/file-lock.ts:288:19) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: SiteShareRefusal: Four imports are staged. Complete owner setup or wait for expiry before uploading another.
        at refusal (/home/user/Tovu/apps/website/src/features/site-backup/import-backend-steps.ts:23:71)
        at requireStagingBudget (/home/user/Tovu/apps/website/src/features/site-backup/import-backend-steps.ts:73:29)
        at <anonymous> (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/import-registry.unit.test.ts:224:31)
```
</details>

### `apps/website/src/server/inbound/public-http/routes/publish-trust/__tests__/handshake-keyless.unit.test.ts` [website]
Executed tests=14 pass=13 fail=1

| result | name | class |
|---|---|---|
| ✖ | T43: a keyless session response does not disclose whether the source has a grant | RED-as-predicted |
| ✔ | POST /session answers 500 rather than hanging when the grant store throws | pass (touched) |

+ 12 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/inbound/public-http/routes/publish-trust/__tests__/handshake-keyless.unit.test.ts:1:2871
✖ T43: a keyless session response does not disclose whether the source has a grant (6.991876ms)
  AssertionError [ERR_ASSERTION]: keyless response must be independent of source unknown-source
  
  401 !== 503
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/inbound/public-http/routes/publish-trust/__tests__/handshake-keyless.unit.test.ts:112:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 401,
```
</details>

### `apps/website/src/server/__tests__/routes/member-oidc-callback.unit.test.ts` [website]
Executed tests=1 pass=0 fail=1

| result | name | class |
|---|---|---|
| ✖ | T44: a rate-limited OIDC email continuation redirects the browser to the sign-in error page | RED-as-predicted |

+ 0 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/__tests__/routes/member-oidc-callback.unit.test.ts:1:761
✖ T44: a rate-limited OIDC email continuation redirects the browser to the sign-in error page (48.734594ms)
  AssertionError [ERR_ASSERTION]: the top-level callback must redirect instead of rendering 429 JSON
  
  429 !== 303
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/__tests__/routes/member-oidc-callback.unit.test.ts:78:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 429,
```
</details>

### `apps/website/src/platform/site-dir/__tests__/integration/duplicate-pglite-store.integration.test.ts` [website]
Executed tests=1 pass=0 fail=1

| result | name | class |
|---|---|---|
| ✖ | apps/website/src/platform/site-dir/__tests__/integration/duplicate-pglite-store.integration.test.ts | other-failure (or sub-test of a RED group) |

+ 0 other passing tests (not listed).

RED names not found in output: T38: a synchronous source-open failure releases the owner lock

<details><summary>failure details</summary>

```
test at apps/website/src/platform/site-dir/__tests__/integration/duplicate-pglite-store.integration.test.ts:1:1
✖ apps/website/src/platform/site-dir/__tests__/integration/duplicate-pglite-store.integration.test.ts (14146.668705ms)
  'test failed'

```
</details>

### `apps/website/src/platform/site-dir/__tests__/integration/publish-backstop-file.integration.test.ts` [website]
Executed tests=33 pass=32 fail=1

| result | name | class |
|---|---|---|
| ✖ | T42: a completed file undo reclaims its backup and keeps another pending undo | RED-as-predicted |

+ 32 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/platform/site-dir/__tests__/integration/publish-backstop-file.integration.test.ts:1:8303
✖ T42: a completed file undo reclaims its backup and keeps another pending undo (8.327837ms)
  AssertionError [ERR_ASSERTION]: completed undo must reclaim its previous-file bytes
  
  true !== false
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/platform/site-dir/__tests__/integration/publish-backstop-file.integration.test.ts:239:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
```
</details>

### `apps/website/src/server/inbound/public-http/middleware/__tests__/site-cookie-consent.regressions.unit.test.ts` [website]
Executed tests=2 pass=0 fail=2

| result | name | class |
|---|---|---|
| ✖ | T40: end-only HTML over 4 MiB and empty HEAD responses pass through with their validators | RED-as-predicted |
| ✖ | T41: collector requests from rotating IPv6 addresses share one /64 rate budget | RED-as-predicted |

+ 0 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/inbound/public-http/middleware/__tests__/site-cookie-consent.regressions.unit.test.ts:1:1345
✖ T40: end-only HTML over 4 MiB and empty HEAD responses pass through with their validators (34.13362ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
      headBodyBytes: 0,
  +   headEtag: undefined,
  +   headLength: undefined,
  +   oversizedBytesUnchanged: false,
  +   oversizedEtag: undefined,
  +   oversizedLength: undefined,
test at apps/website/src/server/inbound/public-http/middleware/__tests__/site-cookie-consent.regressions.unit.test.ts:1:2508
✖ T41: collector requests from rotating IPv6 addresses share one /64 rate budget (244.967352ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
  +   delivered: 142,
  +   rotatedStatus: 200,
  -   delivered: 141,
  -   rotatedStatus: 429,
      unrelatedStatus: 200
    }
```
</details>

### `apps/website/src/server/__tests__/unit/boot-lifecycle.unit.test.ts` [website]
Executed tests=10 pass=9 fail=1

| result | name | class |
|---|---|---|
| ✖ | T45: critical start failure releases resources of modules prepared but not yet started | RED-as-predicted |

+ 9 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/__tests__/unit/boot-lifecycle.unit.test.ts:1:578
✖ T45: critical start failure releases resources of modules prepared but not yet started (8.388221ms)
  AssertionError [ERR_ASSERTION]: rollback must release prepare resources even when start was never reached
  + actual - expected
  
  + [
  +   'prepared-only'
  + ]
  - []
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/__tests__/unit/boot-lifecycle.unit.test.ts:48:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
```
</details>

### `apps/desktop/src/product-telemetry-ipc.test.ts` [desktop]
Executed tests=3 pass=2 fail=1

| result | name | class |
|---|---|---|
| ✖ | T46: telemetry from a frame disposed during delivery is dropped without throwing | RED-as-predicted |

+ 2 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at src/product-telemetry-ipc.test.ts:22:1
✖ T46: telemetry from a frame disposed during delivery is dropped without throwing (2.437388ms)
  AssertionError [ERR_ASSERTION]: Got unwanted exception.
  Actual message: "Render frame was disposed before WebFrameMain could be accessed"
      at TestContext.<anonymous> (file:///home/user/Tovu/apps/desktop/src/product-telemetry-ipc.test.ts:32:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: Error: Render frame was disposed before WebFrameMain could be accessed
```
</details>

### `apps/website/src/server/runtime/lifecycle/__tests__/close-store-on-shutdown.test.ts` [website]
Executed tests=11 pass=10 fail=1

| result | name | class |
|---|---|---|
| ✖ | T47/runtime-0#3: beforeExit stops the daemon before closing its shared store | RED-as-predicted |

+ 10 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/runtime/lifecycle/__tests__/close-store-on-shutdown.test.ts:1:1010
✖ T47/runtime-0#3: beforeExit stops the daemon before closing its shared store (17.183679ms)
  AssertionError [ERR_ASSERTION]: the store must stay open while the daemon is stopping
  + actual - expected
  
    [
  +   'store'
  -   'daemon'
    ]
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/runtime/lifecycle/__tests__/close-store-on-shutdown.test.ts:61:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
```
</details>

### `apps/website/src/server/runtime/lifecycle/__tests__/local-site-process.unit.test.ts` [website]
Executed tests=8 pass=7 fail=1

| result | name | class |
|---|---|---|
| ✖ | T47/runtime-0#5: stderr overflow retains the later fatal tail | RED-as-predicted |

+ 7 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/runtime/lifecycle/__tests__/local-site-process.unit.test.ts:1:401
✖ T47/runtime-0#5: stderr overflow retains the later fatal tail (12.609502ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /FATAL ERROR: crash after verbose startup/. Input:
  
  '{"seq":1,"at":"2026-10-27T06:20:50.378Z","level":"info","source":"server","message":"[local-site alpha] spawned pid=42"}\n' +
    '{"seq":2,"at":"2026-10-27T06:20:50.382Z","level":"error","source":"server","message":"[local-site alpha] pid=42 exited code=none signal=SIGABRT; stderr tail=[oversized stderr omitted]"}\n' +
    '{"seq":3,"at":"2026-10-27T06:20:50.382Z","level":"info","source":"server","message":"[local-site alpha] stderr closed; stderr tail=[oversized stderr omitted]"}\n'
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/runtime/lifecycle/__tests__/local-site-process.unit.test.ts:24:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
```
</details>

### `apps/website/src/server/runtime/lifecycle/__tests__/serving-host-singletons.unit.test.ts` [website]
Executed tests=13 pass=12 fail=1

| result | name | class |
|---|---|---|
| ✖ | T47/runtime-0#6: a binding can assemble a usable supervisor after its prior host shuts down | RED-as-predicted |

+ 12 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/runtime/lifecycle/__tests__/serving-host-singletons.unit.test.ts:1:2890
✖ T47/runtime-0#6: a binding can assemble a usable supervisor after its prior host shuts down (6.79521ms)
  AssertionError [ERR_ASSERTION]: Got unwanted rejection: host assembly must not return the cached terminal supervisor
  Actual message: "SITE_HOST_STOPPING"
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/runtime/lifecycle/__tests__/serving-host-singletons.unit.test.ts:113:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: LocalSiteError: SITE_HOST_STOPPING
        at checkName (/home/user/Tovu/apps/website/src/platform/site-dir/local-site-supervisor.ts:72:23)
        at <anonymous> (/home/user/Tovu/apps/website/src/platform/site-dir/local-site-supervisor.ts:172:7),
```
</details>

### `apps/website/src/platform/site-dir/__tests__/unit/local-site-supervisor.unit.test.ts` [website]
Executed tests=37 pass=36 fail=1

| result | name | class |
|---|---|---|
| ✖ | T47/site-dir-1#2: a crash queued behind Stop cannot overwrite the stopped state | RED-as-predicted |

+ 36 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/platform/site-dir/__tests__/unit/local-site-supervisor.unit.test.ts:1:6125
✖ T47/site-dir-1#2: a crash queued behind Stop cannot overwrite the stopped state (6.321555ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + 'crashed'
  - 'stopped'
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/platform/site-dir/__tests__/unit/local-site-supervisor.unit.test.ts:146:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
```
</details>

### `apps/website/src/platform/site-dir/__tests__/unit/local-site-child.unit.test.ts` [website]
Executed tests=14 pass=13 fail=1

| result | name | class |
|---|---|---|
| ✖ | T47/site-dir-1#3: owner loss during a pending bundle build prevents the later site import | RED-as-predicted |

+ 13 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/platform/site-dir/__tests__/unit/local-site-child.unit.test.ts:1:1161
✖ T47/site-dir-1#3: owner loss during a pending bundle build prevents the later site import (9.809739ms)
  AssertionError [ERR_ASSERTION]: a completed bundle must not resume boot after the watchdog observed owner loss
  + actual - expected
  
  + [
  +   '../../index.js'
  + ]
  - []
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/platform/site-dir/__tests__/unit/local-site-child.unit.test.ts:60:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
```
</details>

### `apps/website/src/features/site-backup/__tests__/plan-store.unit.test.ts` [website]
Executed tests=8 pass=7 fail=1

| result | name | class |
|---|---|---|
| ✖ | T48: other principals and workspaces cannot evict a caller's live backup plan | RED-as-predicted |

+ 7 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/site-backup/__tests__/plan-store.unit.test.ts:1:2830
✖ T48: other principals and workspaces cannot evict a caller's live backup plan (6.297597ms)
  AssertionError [ERR_ASSERTION]: another caller's plans must not consume this caller's retention budget
  + actual - expected
  
    {
  +   code: 'PLAN_NOT_FOUND',
  +   ok: false
  -   ok: true,
  -   plan: {
  -     commitMessage: 'backup',
  -     createdAt: '2026-09-21T00:00:00.000Z',
```
</details>

### `apps/website/src/features/site-backup/__tests__/share-hosting.unit.test.ts` [website]
Executed tests=71 pass=69 fail=2

| result | name | class |
|---|---|---|
| ✖ | T48: an unparseable public origin raises a typed STORAGE_SETUP refusal | RED-as-predicted |
| ✖ | T48: an invalid runtime origin falls back to object storage or private ZIP delivery | RED-as-predicted |

+ 69 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/site-backup/__tests__/share-hosting.unit.test.ts:2:1075
✖ T48: an unparseable public origin raises a typed STORAGE_SETUP refusal (8.768347ms)
  AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:
  
    assert.ok(error instanceof SiteShareRefusal)
  
      at Object.<anonymous> (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/share-hosting.unit.test.ts:85:12)
      at expectedException (node:assert:578:17)
      at expectsError (node:assert:703:21)
      at strict.throws (node:assert:759:3)
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/share-hosting.unit.test.ts:84:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
test at apps/website/src/features/site-backup/__tests__/share-hosting.unit.test.ts:2:11778
✖ T48: an invalid runtime origin falls back to object storage or private ZIP delivery (0.888744ms)
  SiteShareRefusal: TOVU_SHARE_PUBLIC_ORIGIN must be a public HTTPS origin without a path or credentials.
      at createRuntimeShareDelivery (/home/user/Tovu/apps/website/src/features/site-backup/share-hosting.ts:38:140)
      at Object.runtime (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/share-hosting.unit.test.ts:294:22)
      at resolveServerDelivery (/home/user/Tovu/apps/website/src/features/site-backup/share-hosting.ts:100:28)
      at async resolveShareDelivery (/home/user/Tovu/apps/website/src/features/site-backup/share-hosting.ts:117:20)
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/share-hosting.unit.test.ts:298:18)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    code: 'STORAGE_SETUP'
  }
```
</details>

### `apps/website/src/server/__tests__/routes/member-request-limits.unit.test.ts` [website]
Executed tests=2 pass=0 fail=2

| result | name | class |
|---|---|---|
| ✖ | T30: an already limited IP cannot consume a victim's email or identity budget | RED-as-predicted |
| ✖ | T30: Retry-After and its JSON detail report the longest applicable wait | RED-as-predicted |

+ 0 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/__tests__/routes/member-request-limits.unit.test.ts:1:963
✖ T30: an already limited IP cannot consume a victim's email or identity budget (4.723696ms)
  AssertionError [ERR_ASSERTION]: the blocked IP must leave both victim budgets unspent
  
  false !== true
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/__tests__/routes/member-request-limits.unit.test.ts:42:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: false,
test at apps/website/src/server/__tests__/routes/member-request-limits.unit.test.ts:1:2035
✖ T30: Retry-After and its JSON detail report the longest applicable wait (0.996123ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  '15' !== '90'
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/__tests__/routes/member-request-limits.unit.test.ts:61:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: '15',
```
</details>

### `apps/website/src/server/__tests__/routes/member-password-auth.test.ts` [website]
Executed tests=27 pass=25 fail=2

| result | name | class |
|---|---|---|
| ✖ | T30: password limits check normalized email only after IP admission | RED-as-predicted |
| ✖ | T30: forgot and sign-in skip the shared email counter when their IP is denied | RED-as-predicted |

+ 25 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/__tests__/routes/member-password-auth.test.ts:1:15329
✖ T30: password limits check normalized email only after IP admission (229.326795ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   'ada@example.test'
  + ]
  - []
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/__tests__/routes/member-password-auth.test.ts:288:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
test at apps/website/src/server/__tests__/routes/member-password-auth.test.ts:1:16008
✖ T30: forgot and sign-in skip the shared email counter when their IP is denied (121.855066ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + [
  +   'ada@example.test',
  +   'ada@example.test'
  + ]
  - []
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/__tests__/routes/member-password-auth.test.ts:306:10)
```
</details>

### `apps/website/src/server/runtime/composition/__tests__/provider-plugins.unit.test.ts` [website]
Executed tests=40 pass=39 fail=1

| result | name | class |
|---|---|---|
| ✖ | 1: saved provider environment wins over the host default; blank uses host and release stays host-owned | RED-as-predicted |

+ 39 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/runtime/composition/__tests__/provider-plugins.unit.test.ts:1:53090
✖ 1: saved provider environment wins over the host default; blank uses host and release stays host-owned (10.920589ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  ... Skipped lines
  
    [
      {
        attribution: {
          attributes: {
            'deployment.environment': 'local',
  ...
```
</details>

### `apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts` [website]
Executed tests=37 pass=35 fail=2

| result | name | class |
|---|---|---|
| ✖ | ordinary media travels unchanged; an active document loses its uploader; an inactive document is dropped | other-failure (or sub-test of a RED group) |
| ✖ | S6: shared sites preserve published cookie-banner settings and the separate draft | RED-as-predicted |

+ 35 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts:1:11823
✖ ordinary media travels unchanged; an active document loses its uploader; an inactive document is dropped (253.134631ms)
  SiteShareRefusal: Media 'm1' has no source blob.
      at <anonymous> (/home/user/Tovu/apps/website/src/platform/db/sqlite/share-database.ts:353:22)
      at Array.map (<anonymous>)
      at archiveMediaSources (/home/user/Tovu/apps/website/src/platform/db/sqlite/share-database.ts:351:15)
      at async sanitizeShareDatabase (/home/user/Tovu/apps/website/src/platform/db/sqlite/share-database.ts:333:53)
      at async share (/home/user/Tovu/apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts:43:22)
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts:223:20)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    code: 'MISSING_MEDIA'
test at apps/website/src/platform/db/sqlite/__tests__/share-database.integration.test.ts:1:18840
✖ S6: shared sites preserve published cookie-banner settings and the separate draft (339.418553ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + {}
  - {
  -   'draft-consent': {
  -     acceptLabel: 'Accept all',
  -     enabled: false,
  -     message: 'We use necessary cookies to run this site. You can choose whether to allow functional, analytics, and marketing cookies.',
  -     placement: 'bottom-right',
```
</details>

### `apps/website/src/features/source-control/__tests__/github-backup-secrets.integration.test.ts` [website]
Executed tests=1 pass=0 fail=1

| result | name | class |
|---|---|---|
| ✖ | SEC-1: GitHub backup excludes password hashes, sessions, magic-link tokens and sealed vault rows | RED-as-predicted |

+ 0 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/source-control/__tests__/github-backup-secrets.integration.test.ts:1:1237
✖ SEC-1: GitHub backup excludes password hashes, sessions, magic-link tokens and sealed vault rows (237.358276ms)
  AssertionError [ERR_ASSERTION]: GitHub backup payload must contain no private canaries
  + actual - expected
  
  + [
  +   'passwordHash',
  +   'session',
  +   'memberSession',
  +   'magicLink',
  +   'sealedVault'
  + ]
```
</details>

### `apps/website/src/features/deployments/static-publish/__tests__/credentials.unit.test.ts` [website]
Executed tests=57 pass=54 fail=3

| result | name | class |
|---|---|---|
| ✖ | credentialId: readiness selects a named non-default key without decrypting an ambiguous inventory | RED-as-predicted |
| ✖ | credentialId: readiness refuses missing, foreign and incompatible IDs despite a valid default | RED-as-predicted |
| ✖ | credentialId: neither composed nor env readiness falls back for an unavailable saved connection | RED-as-predicted |

+ 54 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/deployments/static-publish/__tests__/credentials.unit.test.ts:1:21903
✖ credentialId: readiness selects a named non-default key without decrypting an ambiguous inventory (9.034184ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
  +   configured: false,
  +   reason: "no default 'vercel' credential is saved for this workspace yet — add one in the Static Site tab"
  -   configured: true
    }
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/deployments/static-publish/__tests__/credentials.unit.test.ts:517:10)
test at apps/website/src/features/deployments/static-publish/__tests__/credentials.unit.test.ts:1:22796
✖ credentialId: readiness refuses missing, foreign and incompatible IDs despite a valid default (3.429348ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  true !== false
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/deployments/static-publish/__tests__/credentials.unit.test.ts:533:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: true,
test at apps/website/src/features/deployments/static-publish/__tests__/credentials.unit.test.ts:1:23822
✖ credentialId: neither composed nor env readiness falls back for an unavailable saved connection (0.727465ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  true !== false
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/deployments/static-publish/__tests__/credentials.unit.test.ts:545:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: true,
```
</details>

### `apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts` [website]
Executed tests=106 pass=104 fail=1

| result | name | class |
|---|---|---|
| ✖ | preview and execute use the chosen credential when two compatible keys have no default | RED-as-predicted |

+ 104 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts:1:18921
✖ preview and execute use the chosen credential when two compatible keys have no default (178.38448ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts:440:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
```
</details>

### `apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts` [website]
Executed tests=13 pass=10 fail=3

| result | name | class |
|---|---|---|
| ✖ | readiness honors an attached project key among non-default peers and refuses an unattached key | RED-as-predicted |
| ✖ | a project rename cannot be hidden by a site-owned label, including a provider move | RED-as-predicted |
| ✖ | create and rename translate hidden project label conflicts without attaching or changing either row | RED-as-predicted |
| ✔ | a stale project update remains a CAS conflict when no other row owns the requested label | GREEN-unexpected |

+ 9 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:1:7351
✖ readiness honors an attached project key among non-default peers and refuses an unattached key (8.11436ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
  +   configured: false,
  +   reason: "no default 'vercel' credential is saved for this workspace yet — add one in the Static Site tab"
  -   configured: true
    }
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:160:10)
test at apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:1:8583
✖ a project rename cannot be hidden by a site-owned label, including a provider move (4.244419ms)
  AssertionError [ERR_ASSERTION]: Missing expected rejection (PublishCredentialDuplicateLabelError).
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:175:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    operator: 'rejects',
    diff: 'simple'
  }
test at apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:1:9459
✖ create and rename translate hidden project label conflicts without attaching or changing either row (2.568328ms)
  AssertionError [ERR_ASSERTION]: The error is expected to be an instance of "PublishCredentialDuplicateLabelError". Received "VaultError"
  
  Error message:
  
  Secrets vault: conflict
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:194:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
```
</details>

### `apps/website/src/features/consent/__tests__/service.test.ts` [website]
Executed tests=43 pass=41 fail=2

| result | name | class |
|---|---|---|
| ✖ | deployment accepts explicit OFF before validating legacy or published copy; enabled copy stays strict | RED-as-predicted |
| ✖ | legacy editor reads default only invalid text without changing activation or stored state | RED-as-predicted |
| ✔ | legacy editor reads preserve valid text at each limit and an empty optional link label | GREEN-unexpected |

+ 40 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/consent/__tests__/service.test.ts:1:7260
✖ deployment accepts explicit OFF before validating legacy or published copy; enabled copy stays strict (135.422751ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  
  + {
  +   blockingProblems: [
  +     {
  +       code: 'CONSENT_UNAVAILABLE',
  +       message: 'The published consent policy could not be verified. Deployment was not started.'
  +     }
  +   ],
test at apps/website/src/features/consent/__tests__/service.test.ts:1:8074
✖ legacy editor reads default only invalid text without changing activation or stored state (106.56021ms)
  Error [ToolInputError]: title must contain 1–120 characters.
      at validateConsentTextFields (/home/user/Tovu/apps/website/src/features/consent/validation.ts:42:69)
      at validateConsentCopy (/home/user/Tovu/apps/website/src/features/consent/validation.ts:33:3)
      at parseConsentConfig (/home/user/Tovu/apps/website/src/features/consent/validation.ts:23:3)
      at Object.read (/home/user/Tovu/apps/website/src/features/consent/service.ts:67:78)
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/consent/__tests__/service.test.ts:138:23)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)

```
</details>

### `apps/website/src/features/consent/__tests__/readiness.pins.test.ts` [website]
Executed tests=14 pass=12 fail=2

| result | name | class |
|---|---|---|
| ✔ | inventory caps at 200 entries and distinguishes an exhausted head from more templates | GREEN-unexpected |
| ✖ | 200 body items report truncation only when another gated item exists | other-failure (or sub-test of a RED group) |
| ✖ | a dry run at exactly 200 gated items remains complete with ordinary DOM nodes left | RED-as-predicted |

+ 11 other passing tests (not listed).

RED names not found in output: ${count} body items report truncation only when another gated item exists

<details><summary>failure details</summary>

```
test at apps/website/src/features/consent/__tests__/readiness.pins.test.ts:9:1817
✖ 200 body items report truncation only when another gated item exists (7.099941ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  true !== false
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/consent/__tests__/readiness.pins.test.ts:57:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
test at apps/website/src/features/consent/__tests__/readiness.pins.test.ts:9:2196
✖ a dry run at exactly 200 gated items remains complete with ordinary DOM nodes left (34.455806ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  true !== false
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/consent/__tests__/readiness.pins.test.ts:66:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
```
</details>

### `apps/website/src/features/custom-credentials/__tests__/credential-save-tool.unit.test.ts` [website]
Executed tests=31 pass=30 fail=1

| result | name | class |
|---|---|---|
| ✖ | credential_save projects the shared attachment result for direct and plugin-owned saves | RED-as-predicted |

+ 30 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/custom-credentials/__tests__/credential-save-tool.unit.test.ts:1:11963
✖ credential_save projects the shared attachment result for direct and plugin-owned saves (4.607976ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    [
      {
  +     label: 'Hosting',
        result: {
          credentialId: 'key-a',
          saved: true
        }
```
</details>

### `apps/website/src/features/form-destinations/__tests__/key-store.unit.test.ts` [website]
Executed tests=5 pass=4 fail=1

| result | name | class |
|---|---|---|
| ✖ | a receiver key stays site-owned with a project store and republishing reuses the installed secret | RED-as-predicted |

+ 4 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/features/form-destinations/__tests__/key-store.unit.test.ts:1:3205
✖ a receiver key stays site-owned with a project store and republishing reuses the installed secret (5.125799ms)
  AssertionError [ERR_ASSERTION]: the receiver and the stored credential must keep the same secret
  + actual - expected
  
  + 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  - 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/form-destinations/__tests__/key-store.unit.test.ts:72:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
```
</details>

### `apps/website/src/features/project-keys/__tests__/tools.unit.test.ts` [website]
Executed tests=12 pass=12 fail=0

| result | name | class |
|---|---|---|
| ✔ | save attaches to this site immediately, and detach leaves the saved row | GREEN-unexpected |
| ✔ | a committed provider save attaches immediately and retains the restart outcome | GREEN-unexpected |

+ 10 other passing tests (not listed).

### `apps/website/src/server/__tests__/routes/mail-providers-route.test.ts` [website]
Executed tests=8 pass=7 fail=1

| result | name | class |
|---|---|---|
| ✖ | mail card saves attach the project key immediately and re-saving rotates that same key | RED-as-predicted |

+ 7 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/__tests__/routes/mail-providers-route.test.ts:1:6699
✖ mail card saves attach the project key immediately and re-saving rotates that same key (428.174724ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/__tests__/routes/mail-providers-route.test.ts:135:10)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
```
</details>

### `apps/website/src/server/inbound/admin-http/routes/plugins/__tests__/unit/provider-settings-route.unit.test.ts` [website]
Executed tests=18 pass=18 fail=0

| result | name | class |
|---|---|---|
| ✔ | a provider settings save attaches to this site and reopening shows the saved fields | GREEN-unexpected |

+ 17 other passing tests (not listed).

### `apps/website/src/server/runtime/composition/__tests__/provider-config-source.unit.test.ts` [website]
Executed tests=16 pass=14 fail=2

| result | name | class |
|---|---|---|
| ✖ | site values win; unattached project values stay hidden; a different key on B leaves A unchanged | RED-as-predicted |
| ✖ | a project provider save commits its attachment before returning usage | RED-as-predicted |
| ✔ | an attached project's migrated OTel choice feeds boot, both cards and the next save without secret re-entry | GREEN-unexpected |

+ 13 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/runtime/composition/__tests__/provider-config-source.unit.test.ts:1:5463
✖ site values win; unattached project values stay hidden; a different key on B leaves A unchanged (8.367039ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
      keyId: 'plugin-state:obs:provider.config',
      store: 'project',
  +   usedBy: [],
  +   usedByThisSite: false
  -   usedBy: [
  -     'a'
test at apps/website/src/server/runtime/composition/__tests__/provider-config-source.unit.test.ts:1:7077
✖ a project provider save commits its attachment before returning usage (1.528156ms)
  AssertionError [ERR_ASSERTION]: attachment exists before commit
  
  false !== true
  
      at transaction (/home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/provider-config-source.unit.test.ts:135:14)
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/provider-config-source.unit.test.ts:140:20)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
```
</details>

### `apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts` [website]
Executed tests=12 pass=6 fail=6

| result | name | class |
|---|---|---|
| ✖ | browser restart after a committed attached save produces a success card with reload guidance | RED-as-predicted |
| ✖ | the chat card saves the provider's settings into the PROJECT store, not the site vault; the key never reaches the result, transcript or model input | RED-as-predicted |
| ✖ | the shared re-entry rule: a changed host with the saved key kept is refused and nothing is written | other-failure (or sub-test of a RED group) |
| ✖ | a blank key with an unchanged host keeps the saved key | other-failure (or sub-test of a RED group) |
| ✖ | the chat save refuses a missing conditional token with exact guidance and accepts explicit no auth | RED-as-predicted |
| ✔ | provider_status reports presence only: configured, missing, store, never a value | GREEN-unexpected |
| ✖ | assistant reports saved settings with the plugin startup reason and correction, never restart guidance | other-failure (or sub-test of a RED group) |

+ 5 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts:1:2780
✖ browser restart after a committed attached save produces a success card with reload guidance (19.857981ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts:67:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
test at apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts:1:6495
✖ the chat card saves the provider's settings into the PROJECT store, not the site vault; the key never reaches the result, transcript or model input (8.247481ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
      appliesAt: 'restart',
  +   configured: false,
  -   configured: true,
      keyId: 'plugin-state:analytics-posthog:provider.config',
      pluginId: 'analytics-posthog',
      saved: true,
test at apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts:1:8091
✖ the shared re-entry rule: a changed host with the saved key kept is refused and nothing is written (2.588155ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Changing Region \/ host needs Project API key entered again/. Input:
  
  'A required key was left blank. Nothing was saved.'
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts:140:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'A required key was left blank. Nothing was saved.',
test at apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts:1:8671
✖ a blank key with an unchanged host keeps the saved key (3.127392ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts:148:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
test at apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts:1:9249
✖ the chat save refuses a missing conditional token with exact guidance and accepts explicit no auth (6.33482ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
      appliesAt: 'restart',
  +   configured: false,
  -   configured: true,
      keyId: 'plugin-state:analytics-posthog:provider.config',
      pluginId: 'analytics-posthog',
      saved: true,
test at apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts:1:15570
✖ assistant reports saved settings with the plugin startup reason and correction, never restart guidance (2.523395ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/runtime/composition/__tests__/provider-settings-chat-card.unit.test.ts:239:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
```
</details>

### `apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts` [website]
Executed tests=7 pass=5 fail=2

| result | name | class |
|---|---|---|
| ✖ | installed + enabled + configured provider plugin boots through the real composition root (no TDZ fallback to noop) | RED-as-predicted |
| ✖ | two sites of one project: settings saved from site A land in project.db and configure site B's provider | RED-as-predicted |

+ 5 other passing tests (not listed).

<details><summary>failure details</summary>

```
test at apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts:12:1190
✖ installed + enabled + configured provider plugin boots through the real composition root (no TDZ fallback to noop) (1453.231368ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
    {
      keyId: 'plugin-state:obs-boot-fake:provider.config',
      store: 'project',
  +   usedBy: [],
  +   usedByThisSite: false
  -   usedBy: [
  -     'site'
test at apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts:12:3717
✖ two sites of one project: settings saved from site A land in project.db and configure site B's provider (983.749644ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  
  + null
  - {
  -   secrets: {},
  -   settings: {
  -     endpoint: 'https://project-collector.example.test'
  -   }
  - }
```
</details>

## 3. Minor findings (not acted on)
- Jini `pnpm --no-bail -r build` exit 1: `@jini-ai/memory` tsc error TS2352 (src/__tests__/note-store.test.ts:120) and `@jini-ai/cookie-consent` build failed (tsc && build-client.mjs); dist still emitted for the rest. `packages/sidecar/dist` exists.
- pnpm 10.33.2 ran (corepack pulled 12.15.0 binary but repo pinned 10); "approve-builds" warning on install.
- Tovu: `npm install` (with cookie-consent file: workaround, reverted) OK. Path taken: `npm run build --workspace @tovu/sdk` FAILED first (tsc: "Entry point of type library 'node'" — Tovu had no node_modules yet / or registry mismatch); after `link:jini` the sdk build succeeded; second link:jini run OK. (link:jini warns builds are blocked while linked.)
- `npm rebuild argon2 better-sqlite3 esbuild` failed: Unsupported URL Type "workspace:" (workspace:*); native modules nonetheless loaded.
- apps/desktop `npm ci` fine; `build:preload` fine; symlinked @jini-ai/* into apps/desktop/node_modules (only packages already present, 13).
- 4 INVENTORY entries carry a "(new file)" suffix; my runner ignored the suffix.
- App.render.test.ts takes ~99s before dying.

## 4. Not tested
- Nothing skipped. Not mapped: per-leaf parent for the 22 sub-test rows; duplicate-pglite-store T38 and App.render T3 could not be observed individually (file aborts).
- No vitest, no browser/Postgres tests in the inventory.
- Full logs at /tmp/*.log in the (ephemeral) sandbox; failure excerpts are in the details blocks above.
