REVIEW r62t-rev-ex5a COMPLETE

**`codex/ex2-holds-tovu` at `34d713e9e` — FIX**

I reviewed the branch read-only. The builder report records the red-before-change runs and mutations cited below. Git history groups the tests and implementation in the same commits, so the test-first chronology comes from the builder’s record.

### 1. SH-3 — APPROVE

All three credential-set shells are gone. Both listed test importers use `@jini-ai/integrations/credentialed-http/sets` directly, and the final `apps/**` scan found no stale importer. The source-scan test preserves the Jini dependency and product-vocabulary checks. Its new absence assertion failed before removal and caught a restored shell in the reported mutation.

### 2. C043 — FIX

For covered ESM imports, the resolver accepts the two exact SDK specifiers and refuses other bare specifiers, including `node:fs`, before normal resolution. The worker tests exercise both SDK aliases, local helpers, and static and dynamic refusals. The reported pre-change failures and allowlist-off mutation show that those assertions catch the missing policy.

1. `apps/website/src/server/runtime/plugin-tier2/worker.ts:60` gives the entire built-ins directory unrestricted imports. The content-analyzer test establishes a need for specific host imports. Make the Tier-2 policy SDK-only by default and, if the owner approves an exception, inject the exact extra specifiers for the registered content-analyzer entry from host composition. If directory containment is retained, reject an absolute `path.relative()` result before exempting an entry. Windows returns an absolute result for a different drive.
2. `apps/website/src/server/runtime/plugin-tier2/worker.ts:81` resolves the entry before Jini’s import-stage error handling and before honoring the injected importer. A malformed file URL previously produced a structured `stage: "import"` reply. Defer policy setup to the real-import path under the existing import-stage error handling. Cover that reply and verify that the injected importer skips filesystem preflight.
3. `apps/website/src/server/runtime/plugin-tier2/__tests__/worker-import-allowlist.integration.test.ts:34` creates an isolated temporary package without provisioning the dependency used at line 74. Put a resolvable non-SDK fixture in its local `node_modules`. Keep the assertion on the policy refusal so the test distinguishes a blocked import from a missing package.
4. `apps/website/src/features/plugin-runtime/sdk-resolver.ts:62` adds reusable Node import-policy logic to Tovu. Put that logic in the Jini Node worker adapter and inject Tovu’s aliases and host trust decisions through the existing worker seam. At `apps/website/src/server/runtime/plugin-tier2/worker.ts:56`, make the helper private or add the required `_optional = {}` pad if it stays exported.

### 3. C115 — APPROVE

`apps/website/src/server/inbound/shared/admin-failure.ts:79` returns the typed 507 before ID minting, logging, or tracker reporting. The response preserves the actionable message and omits `errorId`. The explicit 503 override still works. The test checks the exact 507 envelope, both incident sinks, and a real 500 through the same sender in both orders. The reported report-before-return mutation made those checks fail.

### 4. howto2 revert — APPROVE

I compared both files against the first parent of the howto2 merge. The chat-rules section and release-gate paragraph match byte for byte. The gate requires 360, 390, 768, 1024, 1280, and 1440 px. The reported mutations caught both reverted behaviors. The screenshot tool exposes three presets, of which 768 and 1280 satisfy the gate. The other four widths require a capture path that supports them.

### 5. C026 — FIX

5. `apps/website/src/features/api-connections/shared-owner.ts:81` should read `Label projection opens only the listed lifecycle/context rows, never token payloads.` This is the exact wording specified in the review.
6. `apps/website/src/features/api-connections/__tests__/vendor-neutrality.test.ts:52` should add the three exact `path:text` keys for `apps/website/src/features/agent-plugins/bundled-catalog.ts:47`, `:48`, and `:57`. Keep the guard’s exact-match and stale-entry checks. The existing guard was already red and the reported mutation restored the comment hit. The three approved inventory hits still fail at tip, and the other baseline hits remain open.

### 6. Jini RT-1/RT-2 follow-ups — APPROVE

I found no Tovu app import of either retired entry. The live `@jini-ai/infra/events/outbox` imports use the retained entry. The separate capability-vocabulary repoint is correctly deferred because the linked Jini merge-13 lacks that export.

### 7. P0.T — APPROVE

The transport, types, and unit test moved as specified. Both live callers and the test imports and mocks resolve through `lib/admin-http`. `apps/admin/src/lib/ledger-slice.ts:15` still defaults only a 404 `ApiError` to an empty namespace. The reported pre-move failure caught the missing transport, and the named mutation caught the loss of the 404 check. The existing tests also cover a non-API failure.
