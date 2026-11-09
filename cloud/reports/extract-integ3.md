# EXTRACT-INTEG3

Status: verification in progress. This report supersedes EXTRACT-INTEG2's claim that its extraction starting pin proved 80 failures prior. The comparison baseline for this job is cloud/combine: Tovu `7cf9658e5`, Jini `e1b1bdbd6`. Work continues on cloud/extract-integ from the requested Tovu `d3dc793299f5cb7a331cad8fe5592efee0c1b56d` and Jini `4de40e0bb766b56118d0335e2c464d679340070d`.

Conservative accounting start: 2026-11-09 21:20 UTC; deadline 23:20 UTC (two hours). Neither main nor cloud/combine is merged or modified. The private brief is not committed. Builds and probes use separate detached combine checkouts in the same container; the existing branch is preserved in each delivery repository.

## Unknowns and compatibility

The six alternating fresh-process serve measurements, boot to first HTTP response, were:

| Trial | Combine serve | Tip serve | Combine init | Tip init |
| --- | ---: | ---: | ---: | ---: |
| 1 | 8.135 s | 8.177 s | 16.100 s | 11.955 s |
| 2 | 10.941 s | 7.742 s | 6.444 s | 6.410 s |
| 3 | 8.120 s | 7.433 s | 7.202 s | 5.990 s |

Every response was HTTP 200. Median serve: combine 8.135 s, tip 7.742 s (tip 4.83% faster); mean: combine 9.065 s, tip 7.784 s (tip 14.13% faster). Each run initializes a fresh genuine site and terminates its server before the next run. Both sides use Node 24.22.1, the source CLI through tsx, the same installed external dependencies, their own built Jini checkout and composed plugin payloads, and the same HTTP polling method. No tests/builds/type-checks ran during timing. Runs alternate combine then tip; observed one-minute load declined from 3.15 to 1.86. The measurements show no >15% extraction boot regression in this container. Fresh process does not mean dropped kernel page cache.

The unchanged preview-switcher live-server case passed at the tip after setup repair, then its whole nine-case file passed. No failing assertion was reproduced at the tip. The combine whole-file run failed that live-server case at its unchanged revision-count assertion, `81 !== 69`, line 148; background boot writes can race that assertion. Earlier tip attempts failed before assertions on missing/stale build artifacts, and are setup evidence, not product regressions.

The real production `readInstalledMcpServers` path read on-disk legacy plugin.json/mcp.json on both sides. The old `extensions.tovu`, `tovuAuthMode`, `tovuDefaultTools` and explicit namespace `tovu` preserved identity `tovu/legacy`, OAuth mode, allow/write grants and reviewed read names. The normalized returned projections were identical. The tip emits a deprecation warning; its parsed output fields are portable. Legacy fixture inputs in the operator-read-only suite remain old-form, so that suite still exercises compatibility.

The enable test's hang was traced before editing it. The old names were supplied directly as an already-parsed server, bypassing plugin.json's compatibility reader. Preview and handler reject with ToolInputError (configured-separately refusal), before emitting any surface. `answerCard` catches/suppresses the handler outcome rejection and awaits only its unresolved card promise. The diagnostic traced zero emitted surfaces with the original seeded-off activation. Only this pre-parsed fixture's two keys were updated; the helper and all assertions remain unchanged. The whole file now passes.

Jini plugin-identity: combine passes 13/13; tip passes 10/13. The three new failures are the exact warning/event-array expectations for parsed shared identity, interrupted prune, and advisory keyword coercion. Extraction adds the legacy metadata warning (and plugin identity on that event); identity/provides and accepted installation still succeed. These are new diagnostic expectation drift, not prior failures. They are traced and left unchanged: no edit to this Jini file was authorized.

## Findings F2/F4

F2: plugin-catalog release tooling now contains the small namespace lookup it uses; it no longer imports agent-plugins/src. Catalog generation before and after the edit, against the same rebuilt artifacts, was byte-identical: SHA-256 `b86fcee83dcd5d29a31f3eefb0a353da9b05519dee99f3b56f26f192611728a1`. The 65 owning catalog tests pass. The tracked catalog itself was restored byte-for-byte; regenerated build artifacts differ from the originally tracked digest catalog, which is not included in this change. Catalog has no build script.

F4: exactly seven authorized comment lines changed in management.ts (five), install.ts (one), source.ts (one). TypeScript transpilation with comments removed yields identical executable JavaScript for all three files. F5 remains unchanged. No guide, card, tool-metadata golden, saved-data fixture, package manifest, lockfile or guard baseline changed.

## Authorized test edits

| Group | File(s) | Exact purpose |
| --- | --- | --- |
| A | assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts | Expect parsed defaultTools; preserve the legacy input fixture. |
| A | features/plugin-runtime/__tests__/unit/plugin-enable-access.regression.test.ts | Two pre-parsed fixture keys after tracing the no-card wait. |
| A | server/runtime/composition/__tests__/plugin-host.integration.test.ts | Bundled agent identity namespace jini; runtime-plugin namespace stays tovu. |
| A | features/site-guide/__tests__/plugin-contributions.test.ts | Current bundled agent extension key. |
| A | server/runtime/composition/__tests__/recharts-package-pin.unit.test.ts | Agent-face extension key only; provider runtime extension stays tovu. |
| A | content/agent-plugin-overlays/google-login/__tests__/exports.test.mjs | Explicit namespace jini for the six cases; publisher IDs stay tovu/google-login. |
| A | content/agent-plugin-overlays/composio/__tests__/connection-contract.test.mjs | Current raw authMode key only. Its following guide assertion remains unchanged and outside the edit allowance. |
| B | features/agent-plugins/__tests__/unit/bundled-ui-ux-design-package.unit.test.ts | Pin 0.6.3 in the manifest and three seed cases. |
| C | features/agent-plugins/__tests__/unit/bundled-{composio-package,github-actions-ops,github-package,supabase-package}.unit.test.ts | Nine specified cases retain their ordering, routing, backup, SQL/approval and connection checks using the guides' existing neutral words. |
| C | content/agent-plugin-overlays/{railway,render}/__tests__/credential-card.test.mjs | Existing guidance must direct deployment through tools and then start a deployment. Guides unchanged. |
| E | content/agent-plugin-overlays/google-workspace/__tests__/oauth.contract.test.mjs | Test helper passes the same apiConnectionCallbackFieldRules as Tovu's host. The sole production parser call, features/api-connections/contribution.ts:73, already passes it. |
| F | assistant/__tests__/mcp-ui-allowlist-completeness.test.ts | One named agent_plugin_connect carve-out beside the existing Jini-owned exchanges. |
| G | assistant/__tests__/approval-single-path.test.ts | Allow the existing features/custom-credentials/tool-registrations.ts host transport only. |
| H | content/agent-plugin-overlays/higgsfield-media/__tests__/higgsfield-media-overlay.test.mjs | Extend the sensor's existing exception with generate_image, generate_video, job_status, in_progress. |
| I | cloud/reports/raw/extract-s4/s40b-a7-red.txt | Replace exactly four fake token-shaped strings with [REDACTED-TEST-VALUE]; scanner unchanged and values not copied. |
| Broad types | features/api-connections/__tests__/surface-connections.host-port.unit.test.ts | Supply the record port's required staged:null; status/service fixtures and assertions stay unchanged. |
| Broad types | server/runtime/boot/__tests__/agent-plugin-token-boot-order.unit.test.ts | Two already-parsed server keys become authMode/tokenAuth; assertions unchanged. |

Website-relative paths in this table are under apps/website/src. Every other assertion is preserved. Group D's Google card and its assertion are untouched and waiting for the owner.

The Group G binding is the same `requireHumanConfirm({ctx,surfaces,spec:description},options)` transport used by combine's approvalToolHandler. Both use createApprovalHandler, ask:true, the same post-consent permission/abort checks, and identical decline/expired/abandoned outcomes. The unchanged make-request-delete-confirmation suite passes 23/23 on both sides.

## Verification and delivery still running

Tovu linked production type-check passes. Tool-metadata projections pass and the golden is unchanged at SHA-256 `a0d6b428be4ea369f6abdf70a9892f0ce13db651ac4ac560e43dc2993fa2a0b6`. Broad final test types currently report ten diagnostics after the three extraction fixture corrections; immutable original-pin and combine comparisons are being completed. No full suite was requested or run. The final per-outcome table, gate receipts, delivery commits, last-green qualification and process cleanup will replace this in-progress section after the focused runs finish.
