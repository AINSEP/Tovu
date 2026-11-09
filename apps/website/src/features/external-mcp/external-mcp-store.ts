export { ExternalMcpValidationError, externalMcpAdmissionRevision, externalMcpAccessSnapshot, readExternalMcpToolGrants, validateExternalMcpToolNames } from "../../contracts/core/external-mcp-access.js";
import type { ExternalMcpServerView, ExternalMcpStoreDeps, ExternalMcpOAuthTokenResolverPort, ExternalMcpServerRecord, ExternalMcpServerConfig, SaveExternalMcpServerInput, ExternalMcpSealedOAuthPayload, SealedExternalMcpOAuth } from "./contracts.js";
import { CredentialInputError, assertCredentialFreeField, normalizeCredentialToken, assertCredentialToken, CREDENTIAL_MESSAGES, CREDENTIAL_TOKEN_LIMIT, credentialTokenHint } from "../../contracts/core/credential-token.js";
import type { UUID } from "@jini-ai/core/primitives";
import type { SecretSealerPort } from "../webhooks/index.js";
import * as hosted from "@jini-ai/mcp/federation/hosted";
import type { HostedMcpStorePorts } from "@jini-ai/mcp/federation/hosted";
import { externalMcpVaultPorts } from "./external-mcp-vault.js";

/** The one canonical "no site key" error class moved to `@jini-ai/mcp/federation/hosted` (EXTRACT-S5 H1a, source blob 2bac5b32); same identity here. */
import { ExternalMcpSecretStoreUnconfiguredError } from "@jini-ai/mcp/federation/hosted";
export { ExternalMcpSecretStoreUnconfiguredError };

// The operator-editable MCP roster store moved to `@jini-ai/mcp/federation/hosted` (EXTRACT-S5 H1b, source
// blob 23042de1). This path binds Tovu's credential policy, vault ports and settings path ONCE and keeps
// every old export name and signature.
export { EXTERNAL_MCP_VAULT_VERSION, EXTERNAL_MCP_OAUTH_PAYLOAD_VERSION, applyExternalMcpAccess, parseArgs,
  parseAllowedToolNames, parseWriteAllowedToolNames, externalMcpRecordHasStoredToken, toResolvedFederatedConnections,
  parseOAuthScopes, hydrateExternalMcpOAuthPayload, deleteExternalMcpServer } from "@jini-ai/mcp/federation/hosted";

const externalMcpStorePorts: HostedMcpStorePorts = {
  ...externalMcpVaultPorts,
  assertFreeField: assertCredentialFreeField,
  credential: { normalize: normalizeCredentialToken, assert: assertCredentialToken, hint: credentialTokenHint,
    messages: CREDENTIAL_MESSAGES, limit: CREDENTIAL_TOKEN_LIMIT, InputError: CredentialInputError },
  settingsLink: "Settings → External MCP",
  reauthRequiredCode: "EXTERNAL_MCP_REAUTH_REQUIRED",
};

export function parseEnvBlock(text: string): Record<string, string> {
  return hosted.parseEnvBlock(text, externalMcpStorePorts);
}

export async function listExternalMcpServerViews(
  deps: Pick<ExternalMcpStoreDeps, "repo"> & Partial<Pick<ExternalMcpStoreDeps, "sealer">>,
  workspaceId: UUID,
): Promise<ExternalMcpServerView[]> {
  return hosted.listExternalMcpServerViews({ repo: deps.repo, sealer: deps.sealer, ...externalMcpStorePorts }, workspaceId);
}

export async function readEnabledExternalMcpConfigs(
  deps: Pick<ExternalMcpStoreDeps, "repo" | "sealer"> & { oauth?: ExternalMcpOAuthTokenResolverPort },
  workspaceId: UUID,
): Promise<{ configs: ExternalMcpServerConfig[]; failures: { serverId: string; reason: string }[] }> {
  return hosted.readEnabledExternalMcpConfigs({ repo: deps.repo, sealer: deps.sealer, oauth: deps.oauth, ...externalMcpStorePorts }, workspaceId);
}

export async function openExternalMcpOAuthPayload(
  sealer: Pick<SecretSealerPort, "open">,
  record: Pick<ExternalMcpServerRecord, "sealedOAuth" | "workspaceId" | "serverId" | "oauthAadVersion">,
): Promise<ExternalMcpSealedOAuthPayload> {
  return hosted.openExternalMcpOAuthPayload({ sealer, ...externalMcpStorePorts }, record);
}

export async function sealExternalMcpOAuthPayload(
  deps: Pick<ExternalMcpStoreDeps, "sealer" | "keyring">,
  identity: { workspaceId: string; serverId: string },
  payload: ExternalMcpSealedOAuthPayload,
): Promise<SealedExternalMcpOAuth> {
  return hosted.sealExternalMcpOAuthPayload({ sealer: deps.sealer, keyring: deps.keyring, ...externalMcpStorePorts }, identity, payload);
}

export function normalizeExternalMcpAccessToken(
  { value, transport }: { value: unknown; transport: string }, _optional = {},
): string {
  return hosted.normalizeExternalMcpAccessToken({ value, transport, credential: externalMcpStorePorts.credential }, _optional);
}

export async function saveExternalMcpServer(
  deps: ExternalMcpStoreDeps,
  input: SaveExternalMcpServerInput,
): Promise<ExternalMcpServerView> {
  return hosted.saveExternalMcpServer({ repo: deps.repo, sealer: deps.sealer, keyring: deps.keyring, clock: deps.clock, ...externalMcpStorePorts }, input);
}
