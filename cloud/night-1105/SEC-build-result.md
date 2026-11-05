Programmer(Direct): Implemented all four SEC changes. Regression tests were written first; **no tests were run**.

- Typed markers bypassed exchange-only checks in [the route](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/website/src/assistant/mcp-ui-tool-calls-route.ts:205) and [proxy](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/website/src/server/runtime/composition/modules/assistant.ts:461). Typed delivery now permits only `assistant_ask_choice`; Jini secret cards independently reject it.
- [Secret-card validation](/Users/la/Programming/tovu-integration-clones/prov2-jini/packages/ui/src/features/mcp-ui/secret-card.ts:92) now reserves `freeText`.
- [MCP OAuth callbacks](/Users/la/Programming/tovu-integration-clones/prov2-tovu/apps/website/src/server/inbound/public-http/routes/external-mcp/oauth-callback.ts:144) now require browser proof using the existing cookie helpers and sealed-state binding. Reconnect coverage was added; old unbound links require restarting sign-in.
- Federation wrapping did **not** scrub credentials. HTTP and stdio tool results now share exact credential scrubbing, including rotated HTTP tokens.

The [handoff contains every changed file, test case, and remaining limitation](/private/tmp/build-sec-handoff.txt). Other jobs’ edits remain intact; no commits were made.

Both diff checks pass. Package typechecks report missing core exports outside this patch: `UserFacingError`, `decodeToolInputObject`, and `unwrapToolInputEnvelope`. Tests, browser verification, and Jini package integration remain open.

Added cost per sign-in: one GET, two single-record reads, one single-record write, and one session/permission/limiter check each; a 43-byte proof produces roughly a 150-byte cookie. Scrubbing adds **zero external I/O or polling**, with one bounded memory pass per tool result.

Exact test commands:

```bash
cd /Users/la/Programming/tovu-integration-clones/prov2-tovu
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node \
  --import tsx \
  --import ./development/test-support/composed-bundle-env.ts \
  --test --experimental-test-module-mocks \
  --test-timeout=60000 --test-concurrency=2 \
  apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.secret-forms.test.ts \
  apps/website/src/assistant/__tests__/mcp-ui-tool-calls-route.ask-choice-typed-answer.integration.test.ts \
  apps/website/src/server/runtime/composition/modules/__tests__/assistant-mcp-proxy.pin.test.ts \
  apps/website/src/features/api-connections/__tests__/browser-binding.unit.test.ts \
  apps/website/src/features/external-mcp/__tests__/external-mcp-oauth.test.ts \
  apps/website/src/features/external-mcp/__tests__/unit/tool-registrations.oauth-origin.unit.test.ts \
  apps/website/src/features/agent-plugins/__tests__/unit/connect-tool.unit.test.ts \
  apps/website/src/server/inbound/public-http/routes/external-mcp/__tests__/oauth-callback.test.ts \
  apps/website/src/server/__tests__/admin-external-mcp-oauth-routes.test.ts
```

```bash
cd /Users/la/Programming/tovu-integration-clones/prov2-jini
npx vitest run --maxWorkers=2 \
  packages/ui/src/features/mcp-ui/__tests__/secret-card.unit.test.ts \
  packages/mcp/src/federation/__tests__/http-result-secrets.test.ts \
  packages/mcp/src/federation/__tests__/stdio-result-secrets.test.ts \
  packages/mcp/src/federation/__tests__/http-authentication-ports.test.ts \
  packages/mcp/src/federation/__tests__/default-connect.unit.test.ts \
  packages/mcp/src/federation/__tests__/mcp-federation.stdio-adapter.test.ts
```