import { type Clock } from "@jini-ai/core/primitives";
import { buildVaultAad, type SecretsVaultService, VaultError, type VaultContext, type VaultRecord, type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SecretSealerPort } from "../features/webhooks/index.js";
import { credentialTokenHint, type CredentialTokenHint } from "../contracts/core/credential-token.js";
import { createTovuStoreVault, parseTovuStoreMeta } from "#src/platform/secrets/vault-kinds";
import { credentialWriteFields } from "./credential-store-fields.js";

const INVALID_RECORD = "invalid-record";

export type AssistantVaultRepo = VaultRepoPort & { findOne: NonNullable<VaultRepoPort["findOne"]> };

/** Compatibility adapters expose their Jini persistence port without changing the public stores.
 * Missing capabilities fail closed; there is no parallel legacy persistence/crypto path. */
export function assistantVaultRepo({ repo }: { repo: object }, _options = {}): AssistantVaultRepo {
  if (!("vault" in repo)) throw new VaultError({ code: INVALID_RECORD });
  const vault = repo.vault as VaultRepoPort | undefined;
  if (!vault?.findOne) throw new VaultError({ code: INVALID_RECORD });
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
}, { onSealFailure }: { onSealFailure?: (required: { error: unknown }, optional?: Record<string, never>) => never } = {}): SecretsVaultService {
  const unavailable = (): Promise<never> => Promise.reject(new VaultError({ code: INVALID_RECORD }));
  if (context.kind !== "site-assistant" && context.kind !== "personal-execution") throw new VaultError({ code: "context" });
  return createTovuStoreVault({ repo: { vault: repo }, kind: context.kind, context, keyring, clock,
    sealer: sealer ?? { seal: unavailable, open: unavailable },
    storageError: (_required, { error } = {}) => {
      if (onSealFailure) onSealFailure({ error });
      return error instanceof Error ? error : new VaultError({ code: INVALID_RECORD });
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
  if (!repo.findOne) throw new VaultError({ code: INVALID_RECORD });
  const raw = supplied ?? await repo.findOne(context);
  if (!raw) return { record: null, tokenHint: null };
  if (buildVaultAad({ ...context, id: raw.id }) !== buildVaultAad(raw)) throw new VaultError({ code: "context" });
  const record = { ...raw, meta: parseTovuStoreMeta({ kind: context.kind as "site-assistant" | "personal-execution", meta: raw.meta }) };
  return { record, tokenHint: record.sealed && sealer ? await openTokenHint({ repo, context, sealer, record }) : null };
}

/** Prepares and CAS-writes one assistant credential singleton. Omitted keys preserve the envelope.
 * Crypto failures alone become the feature's own "unconfigured" error; persistence/CAS errors keep
 * their contract. The hint comes from the new key, or from one open of the saved snapshot.
 * @complexity One singleton read, one CAS write, O(payload size) sealing. */
export async function writeAssistantVault(
  { deps, context, apiKey, unconfigured, settings }: {
    deps: { repo: object; sealer: SecretSealerPort; keyring: KeyringPort; clock: Clock };
    context: VaultContext;
    apiKey: string | undefined;
    unconfigured: (required: { detail: string }) => Error;
    settings: (required: { existing: VaultRecord | null }) => Pick<Parameters<SecretsVaultService["prepare"]>[0], "provider" | "meta">;
  },
  _optional: Record<string, never> = {},
): Promise<{ record: VaultRecord; tokenHint: CredentialTokenHint | null }> {
  const repo = assistantVaultRepo({ repo: deps.repo });
  const existing = await repo.findOne(context);
  const vault = createAssistantVault({ ...deps, repo, context }, { onSealFailure: ({ error }, _optional = {}) => {
    throw unconfigured({ detail: error instanceof Error ? error.message : String(error) });
  } });
  const prepared = await vault.prepare({ ...context, ...credentialWriteFields({ existing, apiKey }), ...settings({ existing }) });
  const record = await repo.put({ record: prepared, expectedRevision: existing?.revision ?? null });
  const tokenHint = apiKey !== undefined
    ? credentialTokenHint({ token: apiKey })
    : (await readAssistantVault({ repo, context, sealer: deps.sealer }, { record })).tokenHint;
  return { record, tokenHint };
}

/** Open exactly the supplied snapshot through Jini and derive its token hint.
 * @returns null when the payload has no string apiKey or the envelope cannot be opened.
 * @complexity One open, O(payload size) memory; never reads the repository again. */
async function openTokenHint({ repo, context, sealer, record }: {
  repo: VaultRepoPort; context: VaultContext; sealer: SecretSealerPort; record: VaultRecord;
}, _options = {}): Promise<CredentialTokenHint | null> {
  // This port only serves get's identity read; every other operation remains with the owner.
  const snapshot: VaultRepoPort = Object.create(repo);
  snapshot.find = async () => record;
  try {
    const opened = await createAssistantVault({ repo: snapshot, context, sealer }).get({ ...context, id: record.id });
    return typeof opened?.payload?.apiKey === "string" ? credentialTokenHint({ token: opened.payload.apiKey }) : null;
  } catch { /* Site-key rotation must not prevent reading settings. */ return null; }
}
