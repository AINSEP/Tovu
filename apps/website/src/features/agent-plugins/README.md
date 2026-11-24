# agent-plugins (Tovu host)

Tovu's host composition around `@jini-ai/agent-plugins`: the lifecycle owner, bundled catalog,
card identity, product copy and the bindings that hand them to the portable Jini bodies.

## Wiring

- `@jini-ai/agent-plugins/site/retired-plugin-tool-aliases`: `server/runtime/composition/installed-extension-tools.ts`
  injects `replacements` (`bundled-catalog.ts`'s `RETIRED_PLUGIN_REPLACEMENTS`) and `toToolId`
  (`bundled-catalog.ts`'s `toAgentPluginToolId`).
- `@jini-ai/agent-plugins/site/deploy-split-activation`: `lifecycle.ts`'s `migrateBeforeSeed` injects
  `activations` (the boot's lifecycle owner) into `carryCloudflareActivation`.
- `@jini-ai/agent-plugins/site/admin-surfaces/public-config`: bound by `admin-surfaces/public-config.ts`
  (Tovu's public-config name pattern).
- `@jini-ai/agent-plugins/connect`: `connect-card-ui.ts` binds Tovu's card identity (`card-host-bindings.ts`)
  and token-form copy; `federate-mcp.ts` binds the lifecycle reads, trust rule and federation copy.
  Portable names (`buildAgentPluginConnectCardWithPorts`, `AgentPluginConnectCardSpec`,
  `findAgentPluginMcpServerDefaults`, `deriveAgentPluginConnectionId`, `isEmptyJsonList`, ...) are imported
  from `@jini-ai/agent-plugins/connect` directly, never re-exported here.
