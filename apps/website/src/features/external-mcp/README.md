## Wiring

`external-mcp-store.ts` binds the host's credential policy, vault ports and settings path once
(`externalMcpStorePorts`) into `@jini-ai/mcp/federation/hosted`. Callers import the hosted store's
own names (`externalMcpAccessSnapshot`, `externalMcpAdmissionRevision`, `parseArgs`,
`toResolvedFederatedConnections`, ...) from `@jini-ai/mcp/federation/hosted`; only the bound wrappers
(`saveExternalMcpServer`, `listExternalMcpServerViews`, `readEnabledExternalMcpConfigs`, ...) live here.
`ExternalMcpValidationError`, `ExternalMcpSecretStoreUnconfiguredError`, `applyExternalMcpAccess` and
`deleteExternalMcpServer` are still forwarded here only until the route files and the plugin-runtime
test that import them from this path are repointed.

`contracts.ts` holds only the host's two generic bindings: `ExternalMcpServerView` (bound to the
credential-hint shape) and `ExternalMcpOAuthDeps` (bound to `SharedExternalMcpOwner`). Every other
external-MCP type is imported from its owner: record/config/view/revocation types from
`@jini-ai/core/contracts/hosted-mcp`, `ExternalMcpOAuthService`/`DeviceAuthorizationStore` from
`@jini-ai/integrations/api-connections/hosted-mcp`, and the vocabulary values from
`@jini-ai/mcp/federation/hosted`. `external-mcp-revocation.ts` binds only the host's model-facing
revocation text and error code into the hosted error class; `rosterRefusalFor` is imported from
`@jini-ai/mcp/federation/hosted` directly.
