### jini:packages/agent-plugins/src/connect/plugin-host/index.ts
- **Over:** `createPluginHost` 107
- **Phase:** now · **Batch:** size-27
- **Tests:** `rg -l "createPluginHost|connect/plugin-host" packages/agent-plugins --glob '*.test.*'` (none matched the path stem in the survey; smoke = `packages/agent-plugins/src/lifecycle/__tests__/provider-contribution.test.ts`) (pkg `@jini-ai/agent-plugins`)
- **Responsibility map:** A = `const agentPlugins: AgentPluginLifecycleCapability<UninstallInput> = {` (~30, lifecycle orchestration bound to the host's MCP pair); B = provider listing (`listSiteProviders`, `resolveAgentProviders`, `listAgentProviders`, `listProviders`, `lookup`) + return — plugin discovery.
- **Splits:**
  1. HELPER `createAgentPluginsCapability<UninstallInput, Layout>({ deps, lifecycle, mcp, mcpPorts, resolveServers, warn }: CreateAgentPluginsCapabilityInput<UninstallInput, Layout>, { resolveMcpServers }: CreateAgentPluginsCapabilityOptions = {}): AgentPluginLifecycleCapability<UninstallInput>` (module level, above `createPluginHost`) ← the object literal verbatim; `optional.x` reads become the options param. The "Preview, provisioning grant and status share…" comment stays on `const { mcp, mcpPorts } = deps;` in the host.
  2. `createPluginHost`: `const agentPlugins = createAgentPluginsCapability({ … }, { resolveMcpServers: optional.resolveMcpServers });` (pass only the optional fields the literal reads).
- **Importers to update:** none (index.ts is an exports target — nothing removed).
- **After:** `createPluginHost` ~80; helper ~33.
- **Risks / notes:** generic params must match `PluginHostDeps<UninstallInput, Layout>`.
