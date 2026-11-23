## Wiring

`external-mcp-store.ts` binds the host's credential policy, vault ports and settings path once
(`externalMcpStorePorts`) into `@jini-ai/mcp/federation/hosted`. Callers import the hosted store's
own names (`externalMcpAccessSnapshot`, `externalMcpAdmissionRevision`, `parseArgs`,
`toResolvedFederatedConnections`, ...) from `@jini-ai/mcp/federation/hosted`; only the bound wrappers
(`saveExternalMcpServer`, `listExternalMcpServerViews`, `readEnabledExternalMcpConfigs`, ...) live here.
`ExternalMcpValidationError`, `ExternalMcpSecretStoreUnconfiguredError`, `applyExternalMcpAccess` and
`deleteExternalMcpServer` are still forwarded here only until the route files and the plugin-runtime
test that import them from this path are repointed.
