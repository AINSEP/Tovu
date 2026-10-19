Programmer(Execution): s03-assistant-policy handoff; Programmer + TDD personas loaded.

Implemented test-fixture repairs only. No production behavior, package dependency, schema, migration, or shared fixture changed.
Validation: source/history and diff review; git diff --check passed for all ten test files. NO tests, typechecks, builds, servers, commits, staging, or pushes ran. Runtime RED->GREEN is for the lander.
Reuse: independent BYOK fakes use the installed Jini settings resolver and in-memory repo, following byok-tool-surface.test.ts. Direct domain fixtures inject the existing ChatDeleteSurfaceDeps grant; no new fake builder or parallel policy owner.
Security: binding, replay, cancellation, authorization and no-channel assertions retained; added delivery forged-choice/preexisting-grant cases and account-purge assertions with grant OFF and ON.
Test design review: W6 invalid fixtures repaired; F4.6 stale expectations aligned to explicit owner decisions. Existing remembered-grant assertions retain their positive case, including restart/revocation/drift, instead of passing only on refusal.

CHANGED FILES (absolute paths):
- /Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/byok-image-tool-results.test.ts
- /Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/byok-tool-surface.site-capabilities.test.ts
- /Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/mcp-federation.extra-approval-checks.test.ts
- /Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/mcp-federation.remembered-approvals.test.ts
- /Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.permanent-delete.integration.test.ts
- /Users/la/Programming/Tovu/apps/website/src/assistant/__tests__/tool-executor-stack.failure-redaction.test.ts
- /Users/la/Programming/Tovu/apps/website/src/assistant/mcp-federation/__tests__/confirmation-policy.unit.test.ts
- /Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/__tests__/account-purge-protections.test.ts
- /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-15-test-sweep/s03-assistant-policy.md
- /Users/la/Programming/Tovu/ADS-memory/reports/2026-10-15-test-sweep/s03-assistant-policy-lander.md

NEEDS-OTHER-SHARD: Coordinator must assign /Users/la/Programming/Tovu/development/evals/tool-search-eval-registry.ts (not owned by s03; s04 owns adjacent catalog fixtures, but this file was not granted to either shard in this brief).
Exact repair: import { getEffective, InMemorySettingsRepo } from "@jini-ai/core/settings"; add settingsRepo: new InMemorySettingsRepo(), settingsUiTabsReady: Promise.resolve(), and getEffective to fakeEvalRouteDeps(). The real empty repo keeps the permanent-delete policy OFF. Preserve every discovery/ranking assertion and do not fork this shared fake at three call sites.
This addresses rows #235-246 (agent-plugin-search-discovery), #251-254 (move-region-discovery), and #255-263 (write-region-discovery); these 25 reported failures are NOT-FIXED here. The three test files are untouched. The prohibited real-tool-catalog.fixture.ts and Shopify files are untouched.
NEEDS-JINI-RELEASE: none. NEEDS-JINI-BUILD: none. WIRING-FOLLOW-UP: shared fake ownership repair above; lander must verify the existing installed Jini packages.

Exact lander commands for every touched test file (not executed):

```bash
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/assistant/__tests__/byok-image-tool-results.test.ts
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/assistant/__tests__/byok-tool-surface.site-capabilities.test.ts
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/assistant/__tests__/mcp-federation.extra-approval-checks.test.ts
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/assistant/__tests__/mcp-federation.remembered-approvals.test.ts
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.integration.test.ts
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.permanent-delete.integration.test.ts
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/assistant/__tests__/tool-executor-stack.failure-redaction.test.ts
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/assistant/mcp-federation/__tests__/confirmation-policy.unit.test.ts
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/server/runtime/composition/__tests__/account-purge-protections.test.ts
```

After the shared fake owner lands its repair, also run the three original brief commands:

```bash
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/features/agent-plugins/__tests__/integration/agent-plugin-search-discovery.integration.test.ts
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/features/pages/__tests__/move-region-discovery.integration.test.ts
cd /Users/la/Programming/Tovu && env -u TOVU_ADMIN_PASSWORD TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test --experimental-test-module-mocks --test-concurrency=1 apps/website/src/features/pages/__tests__/write-region-discovery.integration.test.ts
```
