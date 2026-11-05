# Cloud verify 2 — night-1104 results (report-only, no code changed)

- Run: 2026-11-05 07:34–07:52 UTC, Linux x64, 4 cores, Node v24.22.2 (nodejs.org tarball), pnpm 10.33.2 via corepack.
- Tovu `night-1104` @ d995d93f; Jini `integ/night-1104` @ 6670f3b.
- Setup: Jini `pnpm install --frozen-lockfile` ✔, core build then `pnpm --no-bail -r build` ✔ (exit 0). Tovu `npm ci` root/admin/desktop/site-chat ✔; contracts+sdk build ✔; `link:jini` ✔ (79 links); contracts rebuilt after link ✔; desktop `build:preload` ✔. Raw: `raw/setup-*.txt`.

## Deviations from the brief / scripts (read before trusting numbers)
1. **Jini vitest needed `--minWorkers=1`.** Jini's vitest 2.1.9 on a 4-core runner aborts `--maxWorkers=2` alone with `RangeError: options.minThreads and options.maxThreads must not conflict` (0 tests run). All 12 Jini vitest sections were re-run with `--maxWorkers=2 --minWorkers=1`; first-attempt output kept in `raw/attempt1/`. Tovu admin vitest ran with `--maxWorkers=2` only, as briefed.
2. `O-rerun.sh` and `B-forms-urgent-result.md` reference owner-local tsconfigs (`.../O-tsconfig.json`, `ADS-memory/.local-artifacts/forms-urgent/test-tsconfig.json`) not present in the repo; **`apps/site-chat/tsconfig.json` was substituted** (as cloud-rerun-2/Q use).
3. **B25-keys not run**: its file lists live in an owner-local `P25-phase1/*.txt` not in the repo.
4. cloud-rerun-2.sh setup steps (core/dependents build, link, contracts) were done by the setup above rather than re-run. macOS packaged gate skipped (Linux).
5. Sections were run 3 streams in parallel (Jini / Tovu / tsc) to fit the cap; each wrapped in `timeout 600` (none timed out).
6. tsc: root `tsconfig.json` + each of the 4 desktop tsconfigs. ESLint complexity sections: 0 errors (tovu-eslint-complexity has 5 sonarjs warnings only).

## Summary
| section | result | pass / fail / total | raw |
|---|---|---|---|
| jini-core | FAIL (rc=1, 1s) | 195 / 1 (files: 1 failed | 3 passed (4)) / 196 | raw/jini-core.txt |
| jini-ui | PASS (rc=0, 2s) | 3 / 0 / 3 | raw/jini-ui.txt |
| jini-http-kit | FAIL (rc=1, 2s) | 36 / 1 (files: 1 failed | 1 passed (2)) / 37 | raw/jini-http-kit.txt |
| jini-owner-recovery | PASS (rc=0, 3s) | 11 / 0 / 11 | raw/jini-owner-recovery.txt |
| jini-vercel-node | PASS (rc=0, 1s) | 53 / 0 / 53 | raw/jini-vercel-node.txt |
| K1-platform-regression | PASS (rc=0, 1s) | 16 / 0 / 16 | raw/K1-platform-regression.txt |
| O-jini-cf-forms | FAIL (rc=1, 1s) | 48 / 1 / 49 | raw/O-jini-cf-forms.txt |
| O-jini-cms | PASS (rc=0, 2s) | 20 / 0 / 20 | raw/O-jini-cms.txt |
| O-jini-admin | PASS (rc=0, 4s) | 17 / 0 / 17 | raw/O-jini-admin.txt |
| Q-jini-cms-media | PASS (rc=0, 2s) | 75 / 0 / 75 | raw/Q-jini-cms-media.txt |
| Q-jini-diagnostics | PASS (rc=0, 329s) | 196 / 0 / 196 | raw/Q-jini-diagnostics.txt |
| Q-jini-agent-plugins | PASS (rc=0, 0s) | 16 / 0 / 16 | raw/Q-jini-agent-plugins.txt |
| Q-jini-sidecar | PASS (rc=0, 3s) | 123 / 0 / 123 | raw/Q-jini-sidecar.txt |
| Bforms-jini-cms | PASS (rc=0, 4s) | 123 / 0 / 123 | raw/Bforms-jini-cms.txt |
| Bforms-jini-cf | FAIL (rc=1, 0s) | 39 / 1 / 40 | raw/Bforms-jini-cf.txt |
| B7-sidecar-full | PASS (rc=0, 4s) | 245 / 0 / 247 | raw/B7-sidecar-full.txt |
| jini-eslint-complexity | PASS (rc=0, 4s) |  /  / 0 error lines | raw/jini-eslint-complexity.txt |
| tovu-website | FAIL (rc=1, 121s) | 787 / 7 / 795 | raw/tovu-website.txt |
| tovu-admin | FAIL (rc=1, 24s) | 162 / 5 (files: 3 failed | 11 passed (14)) / 167 | raw/tovu-admin.txt |
| tovu-desktop-auth | PASS (rc=0, 3s) | 31 / 0 / 31 | raw/tovu-desktop-auth.txt |
| tovu-eslint-complexity | PASS (rc=0, 4s) |  /  / 1 error lines | raw/tovu-eslint-complexity.txt |
| tovu-desktop-complexity | PASS (rc=0, 1s) |  /  / 0 error lines | raw/tovu-desktop-complexity.txt |
| tovu-eslint-rule-tests | PASS (rc=0, 1s) |  /  / 0 error lines | raw/tovu-eslint-rule-tests.txt |
| K1-dev-scripts | PASS (rc=0, 0s) | 6 / 0 / 6 | raw/K1-dev-scripts.txt |
| backfill-cli-discovery | PASS (rc=0, 16s) | 10 / 0 / 10 | raw/backfill-cli-discovery.txt |
| O-tovu-website-keys | FAIL (rc=1, 55s) | 266 / 6 / 273 | raw/O-tovu-website-keys.txt |
| O-desktop-ipc | FAIL (rc=1, 0s) | 24 / 2 / 26 | raw/O-desktop-ipc.txt |
| O-desktop-renderer | PASS (rc=0, 3s) | 10 / 0 / 10 | raw/O-desktop-renderer.txt |
| O-tovu-website-forms | PASS (rc=0, 23s) | 116 / 0 / 116 | raw/O-tovu-website-forms.txt |
| Q-tovu-website-media | FAIL (rc=1, 13s) | 204 / 5 / 209 | raw/Q-tovu-website-media.txt |
| Q-desktop-node | PASS (rc=0, 3s) | 200 / 0 / 200 | raw/Q-desktop-node.txt |
| Q-desktop-renderer | FAIL (rc=1, 2s) | 19 / 1 / 20 | raw/Q-desktop-renderer.txt |
| Q-admin-alias | PASS (rc=0, 16s) | 9 / 0 / 9 | raw/Q-admin-alias.txt |
| B18-admin | PASS (rc=0, 21s) | 62 / 0 / 62 | raw/B18-admin.txt |
| B13-website-export | PASS (rc=0, 7s) | 39 / 0 / 39 | raw/B13-website-export.txt |
| B14-website-ui | PASS (rc=0, 1s) | 43 / 0 / 43 | raw/B14-website-ui.txt |
| B14-admin | PASS (rc=0, 12s) | 135 / 0 / 135 | raw/B14-admin.txt |
| Bforms-website | FAIL (rc=1, 22s) | 129 / 1 / 130 | raw/Bforms-website.txt |
| M3-desktop | PASS (rc=0, 3s) | 12 / 0 / 12 | raw/M3-desktop.txt |
| tsc-root | FAIL (rc=2, 34s) |  /  / 4 error lines | raw/tsc-root.txt |
| tsc-desktop-main | FAIL (rc=2, 24s) |  /  / 1 error lines | raw/tsc-desktop-main.txt |
| tsc-desktop-preload | PASS (rc=0, 3s) |  /  / 0 error lines | raw/tsc-desktop-preload.txt |
| tsc-desktop-renderer | PASS (rc=0, 9s) |  /  / 0 error lines | raw/tsc-desktop-renderer.txt |
| tsc-desktop-live-verify | PASS (rc=0, 2s) |  /  / 0 error lines | raw/tsc-desktop-live-verify.txt |

Totals: 44 sections run, 13 FAIL (11 test sections + 2 tsc), 31 PASS.

## tsc errors (all)
```
[tsc] apps/website/src/features/project-keys/site-sealer.ts(10,47): error TS2554: Expected 0 arguments, but got 1.
[tsc] apps/website/src/server/runtime/composition/app.ts(1848,71): error TS2304: Cannot find name 'taxonomyDb'.
[tsc] apps/website/src/server/runtime/composition/deps.ts(911,60): error TS2741: Property 'nowMs' is missing in type '{ nowIso: () => string; }' but required in type '{ nowMs(): number; nowIso(): string; }'.
[tsc] apps/website/src/server/runtime/composition/project-store.ts(258,5): error TS2322: Type '() => Promise<{ workspaceId: string; id: string; kind: VaultKind; label: string; ownerKey: string; principalId: null; binding: null; provider: null; isDefault: false; revision: number; sealed: null; ... 4 more ...; updatedAt: string; }[]>' is not assignable to type '(required: Record<string, never>, optional?: Record<string, never> | undefined) => Promise<VaultRecord[]>'.
[tsc] apps/desktop/src/owner-store-ipc.test.ts(34,64): error TS2536: Type 'A' cannot be used to index type '{ list: { entries: { id: string; kind: "vendor"; label: string; provider: string; revision: number; configured: boolean; isDefault: boolean; worksFor: never[]; }[]; }; put: { entry: { id: string; kind: "vendor"; ... 5 more ...; worksFor: never[]; }; }; status: { ...; }; import: LegacyImportReport; }'.
```

## Failing tests (file + name + first ≤20 error lines)



### jini-core — FAIL rc=1

```
FAIL  src/__tests__/redact.test.ts > @jini-ai/core — redact — redactSecrets > stops URL secret values at surrounding quotes and text
AssertionError: expected 'failed "https://example.com/?token=[R…' to be 'failed "https://example.com/?token=[R…' // Object.is equality
Expected: "failed "https://example.com/?token=[REDACTED:url_secret_param]" next"
Received: "failed "https://example.com/?token=[REDACTED:labeled_secret] next"
 ❯ src/__tests__/redact.test.ts:331:8
    329|   it('stops URL secret values at surrounding quotes and text', () => {
    330|     expect(redactSecrets({ input: 'failed "https://example.com/?token=…
    331|       .toBe('failed "https://example.com/?token=[REDACTED:url_secret_p…
       |        ^
    332|   });
    333| 
```

### jini-http-kit — FAIL rc=1

```
FAIL  src/__tests__/adapter-pins.test.ts > adapter characterization before complexity refactor > redacts unknown thrown values with a correlated injected sink: false
AssertionError: expected [ [ …(2) ] ] to deeply equal [ [ …(2) ] ]
- Expected
+ Received
  Array [
    Array [
      "[@jini-ai/http-kit] internal error (POST /pin, correlationId=ecb9d59c-6318-4ba7-bd14-3abd9b4031d5)",
-     "secret=/private/database",
+     "'secret=[REDACTED:labeled_secret]",
    ],
  ]
 ❯ src/__tests__/adapter-pins.test.ts:207:39
    205|       expect(consoleError).not.toHaveBeenCalled();
    206|     } else {
    207|       expect(consoleError.mock.calls).toEqual([[`[@jini-ai/http-kit] i…
       |                                       ^
    208|     }
    209|     expect(f.events.listenerCount('close')).toBe(0);
```

### O-jini-cf-forms — FAIL rc=1

```
packages/agent-plugins/cloudflare/worker/__tests__/forms-receiver.test.mjs:125:1 :: stale rate windows are pruned in the same batch (5.917823ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    [
  +   '8a296fe420e26c371ee039e39fba5756bd06cecc17f4a788dffe91202397feff'
  -   'ae42f6fb8b8c0562eea2650d52b7212f6f36622a722bcb5f215060f650c71bb0'
    ]
      at TestContext.<anonymous> (file:///home/user/Jini/packages/agent-plugins/cloudflare/worker/__tests__/forms-receiver.test.mjs:129:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ '8a296fe420e26c371ee039e39fba5756bd06cecc17f4a788dffe91202397feff' ],
    expected: [ 'ae42f6fb8b8c0562eea2650d52b7212f6f36622a722bcb5f215060f650c71bb0' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```

### Bforms-jini-cf — FAIL rc=1

```
packages/agent-plugins/cloudflare/worker/__tests__/forms-receiver.test.mjs:125:1 :: stale rate windows are pruned in the same batch (4.515348ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    [
  +   '8a296fe420e26c371ee039e39fba5756bd06cecc17f4a788dffe91202397feff'
  -   'ae42f6fb8b8c0562eea2650d52b7212f6f36622a722bcb5f215060f650c71bb0'
    ]
      at TestContext.<anonymous> (file:///home/user/Jini/packages/agent-plugins/cloudflare/worker/__tests__/forms-receiver.test.mjs:129:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ '8a296fe420e26c371ee039e39fba5756bd06cecc17f4a788dffe91202397feff' ],
    expected: [ 'ae42f6fb8b8c0562eea2650d52b7212f6f36622a722bcb5f215060f650c71bb0' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```

### tovu-website — FAIL rc=1

```
apps/website/src/assistant/__tests__/mcp-ui-tool-calls.test.ts:1:7668 :: SECURITY-CRITICAL: the allowlist is exactly this set — widening it cannot happen silently (11.417446ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  ... Skipped lines
    [
      'agent_plugin_connect',
      'agent_plugins_update',
      'assistant_ask_choice',
      'assistant_demo_choices',
  ...
      'plugins_uninstall',
  +   'project_key_use',
      'publish_content_execute_pull',
      'publish_content_publish',
      'redirects_tombstone',
      'search_reindex',
      'search_set_provider',
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/assistant/__tests__/mcp-ui-tool-calls.test.ts:247:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
```
```
apps/website/src/assistant/__tests__/tool-metadata-projections.test.ts:1:890 :: projected search, approval and callback metadata exactly matches the reviewed baseline (6.709554ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
  ... Skipped lines
    {
      'admin.capture_screenshot': 'screenshot screenshots screen capture picture image photo see view look looks looking visual visually appearance layout broken cramped misaligned overlapping clipped cut off ugly render rendering rendered how does this look what does this look like show me the screen check the ui verify visually',
      'admin.publish_content': "publish publishing go live push to live deploy deployment content site update the live site overwrite overwrite live replace what's on live make changes live send to production release ship pages posts media menus redirects navigation pending unpublished changes changed not yet published what would be published preview review before publishing without publishing dry run hasn't haven't been published yet",
      'page.click': 'click activate open bring up show me inspect published handle admin UI',
      'page.find_elements': 'read this screen read admin UI page controls inspect current state show me discover buttons find elements open bring up go to navigate',
  ...
      content_stats: 'how many count number of posts pages articles statistics stats word count words long length percentage chart pie breakdown',
  +   credential_copy_from_project: 'use saved shared keys reuse credentials local project site grant revoke',
  -   credential_copy_from_project: 'copy import reuse keys credentials tokens local project site source overwrite',
      credential_save: 'credential save connect add create new account api key token set update change rotate replace expired refresh secret human form image generation video media provider openai repository backup git source control commits static publish hosting storage bucket registrar dns third-party plugin personal access token pat fallback',
      custom_credential_delete: 'delete remove erase permanently saved custom provider credential credentials api key keys token tokens',
      custom_credential_list: 'credential credentials token tokens api key keys secret secrets saved connected account accounts provider providers registrar registrars dns domain domains hosting host deployment deploy deployments third-party thirdparty external outside service services vendor vendors inventory what do i have do i have list existing configured connections',
      custom_credential_make_request: 'call calling request requests curl wget http https api endpoint third-party thirdparty external outside service services vendor provider dns registrar hosting deployment domain credential credentials token tokens use using saved fetch send get post put patch delete hit query invoke run execute',
      custom_credential_set_username: 'credential username set add fix repair update change login sign in basic auth account name saved api key token 401 unauthorized broken not working',
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/assistant/__tests__/tool-metadata-projections.test.ts:24:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
```
```
apps/website/src/assistant/__tests__/tool-metadata-projections.test.ts:1:1904 :: every baseline ID retains its exchange and fresh-callback refusal rules (0.941297ms)
  AssertionError [ERR_ASSERTION]: project_key_use answering an exchange
  true !== false
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/assistant/__tests__/tool-metadata-projections.test.ts:40:12)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }
```
```
apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts:1:58351 :: publish card saves attach to their site and reopening updates the sole attached non-default (360.251099ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    [
  +   false,
  +   false,
  +   false
  -   true,
  -   true,
  -   true
    ]
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts:1217:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ false, false, false ],
    expected: [ true, true, true ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```
```
apps/website/src/server/inbound/admin-http/http/__tests__/unexpected-route-errors.test.ts:1:3122 :: import expected refusals keep their diagnosis without reporting an incident (3.635947ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    {
      code: 'NOT_FOUND',
  +   message: 'Archive verification failed: Upload expired.'
  -   message: 'Upload expired.'
    }
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/inbound/admin-http/http/__tests__/unexpected-route-errors.test.ts:67:10)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: { code: 'NOT_FOUND', message: 'Archive verification failed: Upload expired.' },
    expected: { code: 'NOT_FOUND', message: 'Upload expired.' },
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```
```
apps/website/src/server/inbound/admin-http/http/__tests__/unexpected-route-errors.test.ts:1:6893 :: publishing: the mapping fallback reports Error and non-Error exceptions without leaking details (1.164683ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + 'The content import could not finish. (error b8c6e759-26b4-4096-8354-60471d2aa6c3)'
  - 'The content import could not finish. Check import history for content already applied before trying again. Copy details and report this problem. (error b8c6e759-26b4-4096-8354-60471d2aa6c3)'
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/inbound/admin-http/http/__tests__/unexpected-route-errors.test.ts:141:14)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'The content import could not finish. (error b8c6e759-26b4-4096-8354-60471d2aa6c3)',
    expected: 'The content import could not finish. Check import history for content already applied before trying again. Copy details and report this problem. (error b8c6e759-26b4-4096-8354-60471d2aa6c3)',
    operator: 'strictEqual',
    diff: 'simple'
  }
```
```
apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-share-failures.test.ts:1:572 :: an archive failure returns the actual job step and redacted copyable details (26.289071ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + 'bfabd3e7-70d4-46d6-9942-6b0779382301'
  - 'ERR-1234-5678-9ABC-DEF0'
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-share-failures.test.ts:19:10)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'bfabd3e7-70d4-46d6-9942-6b0779382301',
    expected: 'ERR-1234-5678-9ABC-DEF0',
    operator: 'strictEqual',
    diff: 'simple'
  }
```

### tovu-admin — FAIL rc=1

```
FAIL  src/components/AssistantDock/__tests__/AgentFailureCard.unit.test.tsx > shows a failure card with a safe next action and copyable disclosure when stderr is absent
TestingLibraryElementError: Found multiple elements with the role "status"
Here are the matching elements:
Ignored nodes: comments, script, style
<div
  class="notice error"
  role="status"
>
  <p>
    The assistant could not continue this answer. Saved work is above.
  </p>
  <p>
    Review the saved work above before sending another message. Copy details and report this problem.
  </p>
  <details>
    <summary>
      Show details
    </summary>
    <pre
      style="white-space: pre-wrap; overflow-wrap: anywhere; user-select: text;"
    >
```
```
FAIL  src/components/AssistantDock/__tests__/AgentFailureCard.unit.test.tsx > keeps history failures polite with host chrome and masks Tovu API keys
TestingLibraryElementError: Found multiple elements with the role "status"
Here are the matching elements:
Ignored nodes: comments, script, style
<div
  class="notice error"
  role="status"
>
  <p>
    failed tovu_ak_012345abcdef.[REDACTED:tovu_api_key]
  </p>
  <p>
    Review the saved work above before sending another message. Copy details and report this problem.
  </p>
  <details>
    <summary>
      Show details
    </summary>
    <pre
      style="white-space: pre-wrap; overflow-wrap: anywhere; user-select: text;"
    >
```
```
FAIL  src/components/AssistantDock/__tests__/agent-failure.unit.test.ts > agent failure reasons > preserves user messages and supplies a generic failure when events are absent
AssertionError: expected [ { kind: 'ext', …(2) } ] to deeply equal [ { kind: 'status', …(2) } ]
- Expected
+ Received
  [
    {
-     "code": "run_terminal",
-     "kind": "status",
-     "label": "The assistant could not continue this answer. Saved work is above.",
+     "data": {
+       "details": "The assistant stopped without reporting a cause.",
+       "reason": "The assistant could not continue this answer. Saved work is above.",
+     },
+     "kind": "ext",
+     "name": "agent_failure",
    },
  ]
 ❯ src/components/AssistantDock/__tests__/agent-failure.unit.test.ts:144:8
    142|     expect(projectAgentFailureMessage({ message: user })).toBe(user);
    143|     expect(projectAgentFailureMessage({ message: { id: "empty", role: …
    144|       .toEqual([{ kind: "status", code: "run_terminal", label: GENERIC…
```
```
FAIL  src/features/security/__tests__/Security.unit.test.tsx > Security — page shell > handleTabChange navigates to the clicked tab's own URL, replacing history
AssertionError: expected '/' to be '/admin/access-tokens' // Object.is equality
Expected: "/admin/access-tokens"
Received: "/"
 ❯ src/features/security/__tests__/Security.unit.test.tsx:119:38
    117|     await user.click(screen.getByRole("tab", { name: /Access Tokens/ }…
    118|     expect(window.history.length).toBe(historyLength);
    119|     expect(window.location.pathname).toBe("/admin/access-tokens");
       |                                      ^
    120|     expect(window.location.search).toBe("?tab=access-tokens");
    121|   });
```
```
FAIL  src/features/security/__tests__/Security.unit.test.tsx > Security — page shell > Site key tab — gated on admin.security.site-key.manage (2026-09-10) > C3: publishes the site-key handle and navigates to the site-key tab URL
AssertionError: expected '/' to be '/admin/access-tokens' // Object.is equality
Expected: "/admin/access-tokens"
Received: "/"
 ❯ src/features/security/__tests__/Security.unit.test.tsx:130:40
    128|       expect(tab).toHaveAttribute("data-agent-element", "security-tab-…
    129|       await user.click(tab);
    130|       expect(window.location.pathname).toBe("/admin/access-tokens");
       |                                        ^
    131|       expect(window.location.search).toBe("?tab=site-key");
    132|     });
```

### O-tovu-website-keys — FAIL rc=1

```
apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts:1:58351 :: publish card saves attach to their site and reopening updates the sole attached non-default (424.208004ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    [
  +   false,
  +   false,
  +   false
  -   true,
  -   true,
  -   true
    ]
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/deployments/__tests__/publish-agent-tools.unit.test.ts:1217:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ false, false, false ],
    expected: [ true, true, true ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```
```
apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:1:8315 :: create and rename translate hidden project label conflicts without attaching or changing either row (6.179921ms)
  AssertionError [ERR_ASSERTION]: The error is expected to be an instance of "PublishCredentialDuplicateLabelError". Received "VaultError"
  Error message:
  Secrets vault: conflict
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:173:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: VaultError: Secrets vault: conflict
        at InMemoryVaultRepo.putRecord (/home/user/Jini/packages/platform/src/secrets/credential-sets/vault.repo.memory.ts:76:86)
        at InMemoryVaultRepo.put (/home/user/Jini/packages/platform/src/secrets/credential-sets/vault.repo.memory.ts:66:17)
        at SecretsVaultService.put (/home/user/Jini/packages/platform/src/secrets/credential-sets/vault.service.ts:158:52)
        at async saveConnection (/home/user/Tovu/apps/website/src/features/deployments/publish-credentials/store.ts:386:16)
        at async createPublishCredential (/home/user/Tovu/apps/website/src/features/deployments/publish-credentials/store.ts:411:19)
        at async waitForActual (node:assert:646:5)
        at async strict.rejects (node:assert:769:25)
        at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:173:3)
        at async Test.run (node:internal/test_runner/test:1409:7)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7),
    operator: 'rejects',
```
```
apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:1:13297 :: a Deployments-page save attaches its project key to this site and survives a list reload, without attaching another site (12.172751ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  201 !== 400
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:273:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 201,
    expected: 400,
    operator: 'strictEqual',
    diff: 'simple'
  }
```
```
apps/website/src/features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts:1:2836 :: exports and imports contain no saved keys or inherited grants (inSite) (898.296707ms)
  TypeError [Error]: Cannot read properties of undefined (reading 'join')
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts:111:35)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
```
```
apps/website/src/features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts:1:2836 :: exports and imports contain no saved keys or inherited grants (appData) (700.996198ms)
  TypeError [Error]: Cannot read properties of undefined (reading 'join')
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/site-backup/__tests__/integration/saved-keys-round-trip.integration.test.ts:111:35)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7)
```
```
apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts:1:9266 :: a Source control-page save is visible after reload on this site only; site-only keys acquire no project attachment (16.118085ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  201 !== 400
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts:206:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 201,
    expected: 400,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

### O-desktop-ipc — FAIL rc=1

```
src/owner-store-ipc.test.ts:42:1 :: S3 all four channels reject untrusted, null, child and navigated frames before any effect (3.789143ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  5 !== 4
      at TestContext.<anonymous> (file:///home/user/Tovu/apps/desktop/src/owner-store-ipc.test.ts:50:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.start (node:internal/test_runner/test:1262:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 5,
    expected: 4,
    operator: 'strictEqual',
    diff: 'simple'
  }
```
```
src/preload/preload.test.ts:46:1 :: the ESM preload exposes shared keys, runner and voice and maps methods to fixed contract channels (30.192935ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected
    [
      'status',
      'list',
      'put',
  +   'import',
      'delete',
  -   'import'
    ]
      at TestContext.<anonymous> (file:///home/user/Tovu/apps/desktop/src/preload/preload.test.ts:118:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: [ 'status', 'list', 'put', 'import', 'delete' ],
    expected: [ 'status', 'list', 'put', 'delete', 'import' ],
    operator: 'deepStrictEqual',
    diff: 'simple'
  }
```

### Q-tovu-website-media — FAIL rc=1

```
apps/website/src/features/media/__tests__/publish-content.apply.test.ts:1:21289 :: ordinary uploaded media retains its content hash after publishing (1.689314ms)
  AssertionError [ERR_ASSERTION]: losing uploaded source metadata must not make the next publish look like a destination edit
  + actual - expected
  + '976e4ba55f32ecd77d100a52833f9ea628857e7e749143254480e8ac6ad79108'
  - '9484cd426e254b8345eb6e2490d0d55796b8bf57fa014688fa465f0ef03ba246'
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/media/__tests__/publish-content.apply.test.ts:635:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: '976e4ba55f32ecd77d100a52833f9ea628857e7e749143254480e8ac6ad79108',
    expected: '9484cd426e254b8345eb6e2490d0d55796b8bf57fa014688fa465f0ef03ba246',
    operator: 'strictEqual',
    diff: 'simple'
  }
```
```
apps/website/src/features/media/__tests__/publish-content.overwrite.test.ts:1:8583 :: rollback cannot clobber an edit that restores the old source while audit recording fails (103.029134ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Could not restore media/. Input:
  'Error: media file changed before metadata could be saved'
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/media/__tests__/publish-content.overwrite.test.ts:150:3)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: Error: media file changed before metadata could be saved
        at <anonymous> (/home/user/Tovu/apps/website/src/platform/db/repos/media-repo.ts:279:19)
        at async <anonymous> (/home/user/Tovu/apps/website/src/platform/db/repos/media-repo.ts:269:9)
        at async Object.begin (/home/user/Jini/packages/db/src/kernel/sqlite/driver.ts:113:24)
        at async <anonymous> (/home/user/Jini/packages/db/src/kernel/kernel-core.ts:123:16)
        at async takingTurn (/home/user/Jini/packages/db/src/kernel/kernel-core.ts:77:12)
        at async SqliteMediaRepo.save (/home/user/Tovu/apps/website/src/platform/db/repos/media-repo.ts:267:7)
        at async InMemoryChangeSetRepo.f.changeSets.insert (/home/user/Tovu/apps/website/src/features/media/__tests__/publish-content.overwrite.test.ts:147:5)
        at async executeCommand (/home/user/Jini/packages/cms/src/core/commands/command.ts:229:5)
        at async Object.apply (/home/user/Tovu/apps/website/src/features/publish-content/repo-handler.ts:303:39)
        at async waitForActual (node:assert:646:5),
    expected: /Could not restore media/,
    operator: 'rejects',
```
```
apps/website/src/features/media/__tests__/publish-content.overwrite.test.ts:1:11576 :: private submitted media refuses Overwrite during planning (78.999707ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  'object' !== 'string'
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/media/__tests__/publish-content.overwrite.test.ts:207:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'object',
    expected: 'string',
    operator: 'strictEqual',
    diff: 'simple'
  }
```
```
apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts:1:6800 :: confirmation binds the reviewed replacement version even when the row outcome stays blocked (6.558902ms)
  AssertionError [ERR_ASSERTION]: The validation function is expected to return "true". Received false
  Caught error:
  Error: the plan backing this confirmation has changed since it was confirmed; re-plan and re-confirm
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts:254:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: Error: the plan backing this confirmation has changed since it was confirmed; re-plan and re-confirm
        at execute (/home/user/Jini/packages/core/src/gated-mutations/gateway.ts:210:11)
        at async waitForActual (node:assert:646:5)
        at async strict.rejects (node:assert:769:25)
        at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts:254:5)
        at async Test.run (node:internal/test_runner/test:1409:7)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7),
    operator: 'rejects',
    diff: 'simple'
  }
```
```
apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts:1:6800 :: confirmation binds the reviewed replacement source even when the row outcome stays blocked (4.875196ms)
  AssertionError [ERR_ASSERTION]: The validation function is expected to return "true". Received false
  Caught error:
  Error: the plan backing this confirmation has changed since it was confirmed; re-plan and re-confirm
      at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts:254:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: Error: the plan backing this confirmation has changed since it was confirmed; re-plan and re-confirm
        at execute (/home/user/Jini/packages/core/src/gated-mutations/gateway.ts:210:11)
        at async waitForActual (node:assert:646:5)
        at async strict.rejects (node:assert:769:25)
        at async TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/publish-content/__tests__/gated-hooks.confirmed-report.test.ts:254:5)
        at async Test.run (node:internal/test_runner/test:1409:7)
        at async Test.processPendingSubtests (node:internal/test_runner/test:974:7),
    operator: 'rejects',
    diff: 'simple'
  }
```

### Q-desktop-renderer — FAIL rc=1

```
src/renderer/use-resources.hooks.render.test.ts:1:4165 :: launch badge recovers from two initial sampler failures within ten seconds (21.940335ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  + actual - expected
  + null
  - 123000000
      at TestContext.<anonymous> (/home/user/Tovu/apps/desktop/src/renderer/use-resources.hooks.render.test.ts:120:10)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: null,
    expected: 123000000,
    operator: 'strictEqual',
    diff: 'simple'
  }
```

### Bforms-website — FAIL rc=1

```
apps/website/src/features/forms/__tests__/repo.postgres.test.ts:1:1644 :: postgres: racing creates of one slug persist one winner and give the loser FormSlugConflictError (0.522878ms)
  Error: failed to drop fixture database "tovu_forms_repo_pg_fixture": psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: No such file or directory
  	Is the server running locally and accepting connections on that socket?
      at recreateDatabase (/home/user/Jini/packages/db/src/pg-fixture.ts:92:25)
      at freshPostgresDatabase (/home/user/Tovu/apps/website/src/platform/db/__tests__/postgres-database.ts:22:3)
      at freshPostgresContentDatabase (/home/user/Tovu/apps/website/src/platform/db/__tests__/postgres-database.ts:31:15)
      at TestContext.<anonymous> (/home/user/Tovu/apps/website/src/features/forms/__tests__/repo.postgres.test.ts:32:15)
      at TestHook.runInAsyncScope (node:async_hooks:227:14)
      at TestHook.run (node:internal/test_runner/test:1402:25)
      at TestHook.run (node:internal/test_runner/test:1757:18)
      at TestHook.run (node:internal/util:581:20)
      at Test.createHook (node:internal/test_runner/test:1117:33)
      at node:internal/test_runner/harness:426:12
```

### tsc-root — FAIL rc=2

```
apps/website/src/features/project-keys/site-sealer.ts(10,47): error TS2554: Expected 0 arguments, but got 1.
apps/website/src/server/runtime/composition/app.ts(1848,71): error TS2304: Cannot find name 'taxonomyDb'.
apps/website/src/server/runtime/composition/deps.ts(911,60): error TS2741: Property 'nowMs' is missing in type '{ nowIso: () => string; }' but required in type '{ nowMs(): number; nowIso(): string; }'.
apps/website/src/server/runtime/composition/project-store.ts(258,5): error TS2322: Type '() => Promise<{ workspaceId: string; id: string; kind: VaultKind; label: string; ownerKey: string; principalId: null; binding: null; provider: null; isDefault: false; revision: number; sealed: null; ... 4 more ...; updatedAt: string; }[]>' is not assignable to type '(required: Record<string, never>, optional?: Record<string, never> | undefined) => Promise<VaultRecord[]>'.
```

### tsc-desktop-main — FAIL rc=2

```
apps/desktop/src/owner-store-ipc.test.ts(34,64): error TS2536: Type 'A' cannot be used to index type '{ list: { entries: { id: string; kind: "vendor"; label: string; provider: string; revision: number; configured: boolean; isDefault: boolean; worksFor: never[]; }[]; }; put: { entry: { id: string; kind: "vendor"; ... 5 more ...; worksFor: never[]; }; }; status: { ...; }; import: LegacyImportReport; }'.
```
