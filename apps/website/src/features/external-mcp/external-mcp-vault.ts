import { InMemoryVaultRepo, SecretsVaultService, VaultError, type VaultMeta, type VaultRecord,
  type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SealedSecret, SecretSealerPort } from "@jini-ai/platform/secrets";
import { createTovuVaultKinds } from "../../platform/secrets/vault-kinds.js";
import * as hosted from "@jini-ai/mcp/federation/hosted";
import type { HostedMcpVaultPorts, Identity, Kind } from "@jini-ai/mcp/federation/hosted";

// The envelope module moved to `@jini-ai/mcp/federation/hosted` (EXTRACT-S5 H1b, source blob 5d77eda7).
// This path binds Tovu's real vault service, memory repo, VaultError and vault kinds ONCE and keeps the
// old signatures. Every caller (store, memory repo, SQL repo) reaches the same hosted module instance.
export const externalMcpVaultPorts: HostedMcpVaultPorts = {
  vault: { createService: (deps) => new SecretsVaultService(deps), createMemoryRepo: () => new InMemoryVaultRepo({}) },
  vaultErrors: { create: ({ code }) => new VaultError({ code }) },
  metaParsers: ({ validateMeta }) => createTovuVaultKinds({ policy: {
    validateMeta, legacyPublishCredential: () => undefined, tokenField: () => undefined,
  } }).metaParsers,
};

export const externalMcpVaultEnvelope = hosted.externalMcpVaultEnvelope;
export const deleteExternalMcpVaultEnvelope = hosted.deleteExternalMcpVaultEnvelope;

export function externalMcpVaultRecord(
  input: { sealed: SealedSecret; identity: Identity; kind: Kind }, _options = {},
): VaultRecord {
  return hosted.externalMcpVaultRecord({ ...input, vaultErrors: externalMcpVaultPorts.vaultErrors }, _options);
}

export async function sealExternalMcpVaultPayload(
  { deps, ...input }: { deps: { sealer: SecretSealerPort; keyring: KeyringPort }; identity: Identity;
    kind: Kind; payload: VaultMeta }, _options = {},
): Promise<SealedSecret> {
  return hosted.sealExternalMcpVaultPayload({ ...input, deps: { sealer: deps.sealer, keyring: deps.keyring, ...externalMcpVaultPorts } }, _options);
}

export async function openExternalMcpVaultPayload(
  input: { sealer: Pick<SecretSealerPort, "open">; sealed: SealedSecret; identity: Identity; kind: Kind }, _options = {},
): Promise<VaultMeta> {
  return hosted.openExternalMcpVaultPayload({ ...input, ports: externalMcpVaultPorts }, _options);
}

export async function persistExternalMcpVaultEnvelope(
  input: { repo: VaultRepoPort; sealed: SealedSecret | null; identity: Identity; kind: Kind }, _options = {},
): Promise<string | null> {
  return hosted.persistExternalMcpVaultEnvelope({ ...input, vaultErrors: externalMcpVaultPorts.vaultErrors }, _options);
}
