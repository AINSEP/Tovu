# L11 — plugins / connections (8 edges, D + I + S)

- **D** `DeclaredApiConnection` (`api-connections/contribution.ts:30-42`, Tovu-specific) →
  `contracts/core/declared-api-connection.ts` **once**; migrate *all* consumers —
  `agent-plugins/service-ports.ts:10`, `agent-plugins/connect-tool.ts:24`,
  `api-connections/byo-client.ts:4`, `api-connections/shared-api.ts`, and tests — no re-export left
  (judge 2 #7). STOP if its declaration imports a feature.
- **S** `api-connections/host-bindings.ts:7,8` → local `LoadPluginContributions` function type and a
  `Pick` of the custom-credential repo methods used.
- **S** `sites/site-admin.ts:134` (`import("…agent-plugins/service-ports").PluginCredentialsPort`) →
  local structural type of the members used.
- **I** `external-mcp/external-mcp-oauth.ts:3,137` (`hostedMcpSignInLink`) → oauth deps `signInLink`
  (the object at `:137` already has the slot), passed by composition.
- **I** site-backup → agent-plugins (3 edges; judge 2 #1 E085/N083): `import-plugin-state.ts:43`
  takes `findSoonPlugin` bound in composition over `lifecycle.soonCatalog` (the existing lookup);
  `package-file-inventory.ts:52` takes `listBundledServers`; `bundled-export-file-policy.ts:21` makes
  `selection` a **required** argument (composition passes `SELECTED_AGENT_PLUGIN_PACKAGES`) — the
  current fallback is exactly the hidden dependency.

**Characterization (named risks):** *restore re-enables a "soon" plugin* →
`features/site-backup/__tests__/import-plugin-state*.test.ts` (restore behaviour, judge 2 #1);
*bundled plugin files missing from a backup* → `package-file-inventory*.test.ts`,
`bundled-export-file-policy*.test.ts`; *external MCP sign-in link wrong* →
`features/external-mcp/__tests__/*oauth*.test.ts` and the external-MCP type-pin test;
api-connections connect/BYO tests.

**Gates:** shared gate, `LANE=L11`.

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L11.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L11`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `agent-plugins/service-ports.ts` -> `api-connections/contribution.ts` [D] DeclaredApiConnection -> contracts/core/declared-api-connection.ts (all 4 consumers repointed)
- `api-connections/host-bindings.ts` -> `agent-plugins/lifecycle.ts` [S] LoadPluginContributions -> local function type
- `api-connections/host-bindings.ts` -> `custom-credentials/index.ts` [S] CustomCredentialSetRepoPort -> local Pick
- `external-mcp/external-mcp-oauth.ts` -> `api-connections/browser-binding.ts` [I] hostedMcpSignInLink -> oauth deps (composition)
- `sites/site-admin.ts` -> `agent-plugins/service-ports.ts` [S] PluginCredentialsPort -> local structural type
- `site-backup/bundled-export-file-policy.ts` -> `agent-plugins/bundled-catalog.ts` [I] SELECTED_AGENT_PLUGIN_PACKAGES -> required selection arg from composition
- `site-backup/import-plugin-state.ts` -> `agent-plugins/soon-lock.ts` [I] findSoonAgentPlugin -> lifecycle.findSoonPlugin bound by composition
- `site-backup/package-file-inventory.ts` -> `agent-plugins/new-site-agent-plugin-tokens.ts` [I] listBundledAgentPluginServers -> inventory deps

#### Every import/re-export of a moved or redirected symbol — repoint each; delete each re-export (no forwarder)
- `DeclaredApiConnection`:
    - `features/agent-plugins/connect-tool.ts:24` import from `features/api-connections/contribution.ts`
    - `features/agent-plugins/service-ports.ts:10` import from `features/api-connections/contribution.ts`
    - `features/api-connections/byo-client.ts:4` import from `features/api-connections/contribution.ts`
    - `features/api-connections/shared-api.ts:4` import from `features/api-connections/contribution.ts`

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/agent-plugins/service-ports.ts`
    - prod: features/agent-plugins/access-token-tool.ts, features/agent-plugins/apply-connect-defaults.ts, features/agent-plugins/apply-tool-renames.ts, features/agent-plugins/automatic-agent-plugins.ts, features/agent-plugins/connect-card-ui.ts, features/agent-plugins/connect-tool.ts, features/agent-plugins/connection-status.ts, features/agent-plugins/enable-access.ts, features/agent-plugins/federate-mcp.ts, features/agent-plugins/grant-signed-in-defaults.ts, features/agent-plugins/host-signals.ts, features/agent-plugins/layout.ts, features/agent-plugins/mcp-host-bindings.ts, features/agent-plugins/new-site-agent-plugin-tokens.ts, features/agent-plugins/supersession.ts, features/agent-plugins/switch-on-saved-token.ts, features/agent-plugins/token-sign-in.ts, features/agent-plugins/uninstall-tool.ts, features/sites/site-admin.ts, server/routes/route-deps/credentials-deps.ts, server/runtime/composition/agent-plugin-service-ports.ts, server/runtime/composition/plugin-host.ts
    - tests: features/agent-plugins/__tests__/fixtures/connection-service-ports.ts, features/agent-plugins/__tests__/unit/connect-skip.unit.test.ts, features/agent-plugins/__tests__/unit/connect-tool.api-connections.unit.test.ts, features/agent-plugins/__tests__/unit/connect-tool.unit.test.ts
- `features/api-connections/host-bindings.ts`
    - prod: features/api-connections/host.ts
    - tests: 
- `features/external-mcp/external-mcp-oauth.ts`
    - prod: assistant/agent-daemon-port.ts, assistant/external-mcp-connection-source.ts, assistant/external-mcp-reauth-tool.ts, features/external-mcp/external-mcp-probe.ts, server/inbound/admin-http/routes/external-mcp/oauth.ts, server/runtime/composition/deps.ts, server/runtime/composition/memory-deps/route-deps/assistant-and-site.ts, server/runtime/composition/memory-deps/slices/member-secrets.ts
    - tests: assistant/__tests__/agent-daemon-port.barrel.test.ts, features/agent-plugins/__tests__/unit/apply-connect-defaults.unit.test.ts, features/agent-plugins/__tests__/unit/enable-access.regression.test.ts, features/external-mcp/__tests__/external-mcp-aad-writer-sync.test.ts, features/external-mcp/__tests__/external-mcp-connection-gate.typecheck.ts, features/external-mcp/__tests__/external-mcp-connection-revocation.test.ts, features/external-mcp/__tests__/external-mcp-dcr.test.ts, features/external-mcp/__tests__/external-mcp-frozen-db.postgres.test.ts, features/external-mcp/__tests__/external-mcp-frozen-db.test.ts, features/external-mcp/__tests__/external-mcp-oauth.lost-update.test.ts, features/external-mcp/__tests__/external-mcp-oauth.test.ts, features/external-mcp/__tests__/external-mcp-operations.unit.test.ts, features/external-mcp/__tests__/external-mcp-shared-oauth.test.ts, features/external-mcp/__tests__/fixtures/frozen-db-harness.ts, features/external-mcp/__tests__/fixtures/mint-mcp-credentials-frozen.ts, features/external-mcp/__tests__/h2b/connection-gate-seam.test.ts, features/external-mcp/__tests__/h2c/sign-in-ports.test.ts, features/external-mcp/__tests__/h3/moved-shims.test.ts, features/external-mcp/__tests__/unit/tool-registrations.oauth-origin.unit.test.ts, server/__tests__/admin-external-mcp-oauth-routes.test.ts, server/inbound/admin-http/routes/external-mcp/__tests__/oauth-error-mapping.test.ts, server/runtime/composition/modules/__tests__/assistant-server-federation.integration.test.ts
- `features/site-backup/bundled-export-file-policy.ts`
    - prod: features/site-backup/share-zip.ts
    - tests: features/site-backup/__tests__/bundled-export-file-policy.unit.test.ts, features/site-backup/__tests__/share-zip.unit.test.ts
- `features/site-backup/import-plugin-state.ts`
    - prod: features/site-backup/import-restore.ts
    - tests: features/agent-plugins/__tests__/unit/soon-lock.unit.test.ts
- `features/site-backup/package-file-inventory.ts`
    - prod: features/site-backup/import-verifier.ts
    - tests: features/site-backup/__tests__/import-bundled-packages.integration.test.ts, features/site-backup/__tests__/integration/archive-v2.integration.test.ts, features/site-backup/__tests__/share-file-policy.unit.test.ts
- `features/sites/site-admin.ts`
    - prod: features/sites/deps.ts, features/sites/index.ts, features/sites/tool-registrations.ts, features/sites/warm-switch.ts
    - tests: features/sites/__tests__/site-admin-tools.unit.test.ts, features/sites/__tests__/site-admin.unit.test.ts
