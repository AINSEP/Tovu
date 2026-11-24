# agent-plugins (Tovu host)

Tovu's host composition around `@jini-ai/agent-plugins`: the lifecycle owner, bundled catalog,
card identity, product copy and the bindings that hand them to the portable Jini bodies.

## Wiring

- `@jini-ai/agent-plugins/lifecycle` capability projection: `lifecycle.ts` exports the owner's `mcpServerTrustClassifier` and installed skill/`mcp.json` readers (callers: `federate-mcp.ts`, `enable-access.ts`, `connect-tool.ts`, `access-token-tool.ts`, `host-tool-ports.ts`, `composition/plugin-host.ts`); `onEvent` keeps the `[agent-plugins]` warning prefix.
- `@jini-ai/agent-plugins/site/retired-plugin-tool-aliases`: `server/runtime/composition/installed-extension-tools.ts`
  injects `replacements` (`bundled-catalog.ts`'s `RETIRED_PLUGIN_REPLACEMENTS`) and `toToolId`
  (`bundled-catalog.ts`'s `toAgentPluginToolId`).
- `@jini-ai/agent-plugins/site/deploy-split-activation`: `lifecycle.ts`'s `migrateBeforeSeed` injects
  `activations` (the boot's lifecycle owner) into `carryPluginRenameActivation`.
- `@jini-ai/agent-plugins/site/admin-surfaces/public-config`: bound by `admin-surfaces/public-config.ts`
  (Tovu's public-config name pattern).
- `@jini-ai/agent-plugins/site/admin-surfaces/handlers`: `server/runtime/composition/agent-plugin-connections.ts`
  injects `filename` (`admin-surfaces/surfaces.ts`'s `ADMIN_SURFACES_FILENAME`) and `log` (the
  `[admin-surfaces]`-prefixed `console.warn` sink) into `createAgentPluginAdminSurfaceHandlers`.
- `@jini-ai/agent-plugins/site/customize-tool`: `install-tool.ts` injects `lifecycle` (`lifecycle.ts`'s
  `listInstalledPlugins`, `readBundledAgentPluginDigests`, `preferBundledAgentPluginDigests`,
  `maxAgentPluginInstallArchiveBytes`) into `prepareCustomizedAgentPluginArchive`; `customize-tool.ts` keeps
  only the model-facing tool definition (product copy).
- `@jini-ai/agent-plugins/site/activation-effects`: `server/runtime/composition/commerce.ts` and
  `assistant/external-mcp-connection-source.ts` inject `resolveAgentPluginActivation` from
  `activation-effects.ts`'s `agentPluginActivations` (the explicit-root lifecycle owner) into
  `createAgentPluginEnabledReader`.
- `@jini-ai/agent-plugins/site/provider-plugin-link`: `provider-plugin-link.ts` keeps Tovu's bindings —
  `providerFaceLifecycle` (`activations` = `activation-effects.ts`'s `agentPluginActivations`; `catalog` =
  `lifecycle.ts`'s `listInstalledPlugins`, `readBundledAgentPluginDigests`, `preferBundledAgentPluginDigests`,
  `readTrustedPluginFile`), spread into `bindProviderFacePorts` at every call site (`bootstrap.ts`,
  `store-basics.ts`, `app.ts`, `agent-plugin-service-ports.ts`, `set-enabled.ts`); `warnProviderFace` (the
  `[agent-plugins]`-prefixed `console.warn` line) passed as `followProviderActivations`' `reportFollowFailure` in
  `store-basics.ts` and `app.ts`; and `AgentPluginLinkedError`, whose copy names Tovu's real switch.
- `@jini-ai/agent-plugins/site/host-plugin-guidance`: `host-plugin-guidance.ts` keeps `agentPluginOverlaysDir`
  (product root / `TOVU_AGENT_PLUGIN_OVERLAYS_DIR`, re-exported by `composition/site-paths.ts`) and
  `isFailsafeYamlMapping` (js-yaml failsafe reader); `tool-registrations.ts` and `lifecycle.ts` inject them as
  `overlaysDir` and `isYamlMapping`.
- `@jini-ai/agent-plugins/site/service-ports`: consumers import the ports directly; Tovu instantiates
  `AgentPluginApiConnectionsPort<DeclaredApiConnection>` (`api-connections/contribution.ts`) in
  `connect-tool.ts` and `server/runtime/composition/agent-plugin-service-ports.ts`.
- `@jini-ai/agent-plugins/site/analytics-provider-registry`: `server/runtime/composition/analytics-providers.ts`
  injects `analytics` (`@jini-ai/analytics`'s forwarder/ingest-hook contracts, `asAnalyticsForwarderModule`,
  `asAnalyticsIngestHook`, `createAnalyticsForwarderRegistry`, and Tovu's `tovu-analytics-forwarders.json` /
  `tovu-analytics-hooks.json` manifest filenames) next to `loadContributions` into `loadAnalyticsProviders`.
- `@jini-ai/agent-plugins/site/host-signals`: `server/runtime/composition/host-signals.ts` and
  `apps/desktop/src/desktop-host-signals.ts` inject `sources` (`bundled-contribution-sources.ts`'s
  `bundledContributionSources`) and `@tovu/contracts/host-signals`' `evaluateHostSignals` /
  `selectCoreHostSignalDeclaration` (the core security fallback owner) into `resolveBundledHostSignals`.
- `@jini-ai/agent-plugins/connect`: `connect-card-ui.ts` binds Tovu's card identity (`card-host-bindings.ts`)
  and token-form copy; `federate-mcp.ts` binds the lifecycle reads, trust rule and federation copy.
  Portable names (`buildAgentPluginConnectCardWithPorts`, `AgentPluginConnectCardSpec`,
  `findAgentPluginMcpServerDefaults`, `deriveAgentPluginConnectionId`, `isEmptyJsonList`, ...) are imported
  from `@jini-ai/agent-plugins/connect` directly, never re-exported here.
- `@jini-ai/agent-plugins/site/bundled-contribution-sources`: `bundled-contribution-sources.ts` binds Tovu's
  `RETIRED_BUNDLED_AGENT_PLUGINS` (`bundled-catalog.ts`) as `retired` into `listBundledContributionSources`; every
  bundled reader keeps importing that bound `bundledContributionSources` (or receives it as `sources`).
- `@jini-ai/agent-plugins/site/auth-schemes`: `server/runtime/composition/site-deps/route-deps-publish-credentials.ts`
  (and the `__tests__/fixtures/site-layout-context.ts` double) inject the boot lifecycle's `loadPluginContributions` and
  `@jini-ai/integrations/credentialed-http`'s `parseCredentialSchemesFile` into `loadCredentialSchemeRegistry`;
  `server/runtime/composition/memory-deps/route-deps/publish-export.ts` injects `bundledContributionSources` as
  `sources`, `lifecycle.ts`'s `loadPluginContributionsFromSource` as `loadFromSource`, and `parseCredentialSchemesFile`
  into `loadBundledCredentialSchemeRegistry`.
