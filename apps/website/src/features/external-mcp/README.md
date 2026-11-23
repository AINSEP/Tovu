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

## Wiring (forwarding lines removed)

`external-mcp-oauth.ts` re-exports nothing: `createDeviceAuthorizationStore` and `createHostedMcpSignInService` come
from `@jini-ai/integrations/api-connections/hosted-mcp`, `createHostedMcpConnectionGate` and
`HostedMcpConnectionGatePorts` from `@jini-ai/mcp/federation/hosted`. `external-mcp-vault.ts` binds only the vault
ports and the host-record readers over the hosted module; `externalMcpVaultEnvelope` and
`deleteExternalMcpVaultEnvelope` are imported from `@jini-ai/mcp/federation/hosted` directly.

`external-mcp-host-copy.ts` binds the host's model-facing copy (`Settings → External MCP`,
`content_read.external_mcp`), the probe budget (`OUTBOUND_CALL_PER_IP` via `createRateLimiter`) and the
redacting log formatter (`describeErrorForLog`) into `@jini-ai/mcp/external/*` and
`@jini-ai/mcp/federation/external-mcp-admissions` once. It exports the
bound `externalMcpAgentToolCatalog`, `externalMcpOperationsToolCatalog`, `readServerAdmissions` and
`externalMcpOperationsHost`, which every `contributeExternalMcpOperationsTools` caller spreads into its
services (`tool-catalog-manifest.ts`). `EXTERNAL_MCP_MANAGE_PERMISSION`, `ExternalMcpOperations` and
the operations builders are imported from `@jini-ai/mcp/external/*` directly.

## Wiring (save form)

The `external_mcp_save` form builder is owned by `@jini-ai/mcp/external/save-form`. Tovu injects its
MCP-UI app name (`appName: "tovu-external-mcp-save"`) at the card registration in
`tool-registrations.ts`.

## Wiring (saved-server probe)

The probe body lives in `@jini-ai/mcp/federation/external-mcp-probe`. `external-mcp-host-copy.ts` binds it once with
`createExternalMcpProbe<ExternalMcpProbeServiceDeps>({ host })`: `readEnabledExternalMcpConfigs` over this host's
deps (`externalMcpServerRepo`, `siteAssistantSecretSealer`, `externalMcpOAuth?.tokenResolver`), the assistant's
`connectMcpHttpSession` (Tovu's MCP client identity), `createExternalMcpReauthRequiredError`,
`externalMcpSettingsDeepLink`, the `EXTERNAL_MCP_REAUTH_REQUIRED` code and `credentialText` from
`@tovu/contracts/credential-copy`. `ExternalMcpProbeServiceDeps` is declared there too; the probe route
(`server/inbound/admin-http/routes/external-mcp/probe.ts`), `tool-catalog-manifest.ts` and the tests import the
bound `probeExternalMcpServer` and that type from the host-copy module.
