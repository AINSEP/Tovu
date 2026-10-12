import { type Clock } from "@jini-ai/core/primitives";
import { buildVaultAad, type SecretsVaultService, VaultError, type VaultContext, type VaultRecord, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SecretSealerPort } from "../features/webhooks/index.js";
import { credentialTokenHint, type CredentialTokenHint } from "../contracts/core/credential-token.js";
import { createTovuStoreVault, parseTovuStoreMeta } from "../server/runtime/composition/vault-kinds.js";

export type AssistantVaultRepo = VaultRepoPort & { findOne: NonNullable<VaultRepoPort["findOne"]> };

/** Compatibility adapters expose their Jini persistence port without changing the public stores.
 * Missing capabilities fail closed; there is no parallel legacy persistence/crypto path. */
export function assistantVaultRepo({ repo }: { repo: object }, _options = {}): AssistantVaultRepo {
  if (!("vault" in repo)) throw new VaultError({ code: "invalid-record" });
  const vault = repo.vault as VaultRepoPort | undefined;
  if (!vault?.findOne) throw new VaultError({ code: "invalid-record" });
  return vault as AssistantVaultRepo;
}

/** Tovu singleton ownership matches the pinned migration; personal scope comes from the session. */
export function assistantVaultContext({ workspaceId, kind, principalId = null }: {
  workspaceId: string; kind: "site-assistant" | "personal-execution"; principalId?: string | null;
}, _options = {}): VaultContext {
  return { workspaceId, kind, ownerKey: "tovu", principalId, binding: null };
}

/** Matches the migration's singleton ID shape; concurrent creates contend on one CAS key. */
export function assistantVaultId({ context }: { context: VaultContext }, _options = {}): string {
  return `vault:${JSON.stringify([context.kind, context.principalId])}`;
}

/** Bind Jini's lifecycle to one already-authorized feature scope. Routes remain permission owners.
 * Crypto failures alone map to the feature's unconfigured error; persistence/CAS errors retain
 * their own contract. Read-only calls cannot accidentally derive a key or seal a payload. */
export function createAssistantVault({ repo, context, sealer, keyring, clock }: {
  repo: VaultRepoPort; context: VaultContext; sealer?: SecretSealerPort; keyring?: KeyringPort; clock?: Clock;
}, { onSealFailure }: { onSealFailure?: (error: unknown) => never } = {}): SecretsVaultService {
  const unavailable = (): never => { throw new VaultError({ code: "invalid-record" }); };
  if (context.kind !== "site-assistant" && context.kind !== "personal-execution") throw new VaultError({ code: "context" });
  return createTovuStoreVault({ repo: { vault: repo }, kind: context.kind, context, keyring, clock,
    sealer: sealer ?? { seal: async () => unavailable(), open: async () => unavailable() },
    storageError: error => {
      if (onSealFailure) onSealFailure(error);
      return error instanceof Error ? error : new VaultError({ code: "invalid-record" });
    },
    newId: () => assistantVaultId({ context }),
  });
}

/** Read metadata once and open that exact snapshot through Jini. A failed open removes the hint
 * while retaining settings, and concurrent rotation cannot mix old settings with a new key.
 * @complexity One indexed singleton read and at most one open, O(payload size) memory. */
export async function readAssistantVault({ repo, context, sealer }: {
  repo: VaultRepoPort; context: VaultContext; sealer?: SecretSealerPort;
}, { record: supplied }: { record?: VaultRecord } = {}): Promise<{ record: VaultRecord | null; tokenHint: CredentialTokenHint | null }> {
  if (!repo.findOne) throw new VaultError({ code: "invalid-record" });
  const raw = supplied ?? await repo.findOne(context);
  if (!raw) return { record: null, tokenHint: null };
  if (buildVaultAad({ ...context, id: raw.id }) !== buildVaultAad(raw)) throw new VaultError({ code: "context" });
  const record = { ...raw, meta: parseTovuStoreMeta({ kind: context.kind as "site-assistant" | "personal-execution", meta: raw.meta }) };
  let tokenHint: CredentialTokenHint | null = null;
  if (record.sealed && sealer) {
    // This port only serves get's identity read; every other operation remains with the owner.
    const snapshot: VaultRepoPort = Object.create(repo);
    snapshot.find = async () => record;
    try {
      const opened = await createAssistantVault({ repo: snapshot, context, sealer }).get({ ...context, id: record.id });
      if (typeof opened?.payload?.apiKey === "string") tokenHint = credentialTokenHint({ token: opened.payload.apiKey });
    } catch { /* Site-key rotation must not prevent reading settings. */ }
  }
  return { record, tokenHint };
}
