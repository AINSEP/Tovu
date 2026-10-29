import { randomUUID } from "node:crypto";
import { InMemoryVaultRepo, SecretsVaultService, VaultError, type VaultMeta, type VaultRecord,
  type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SealedSecret, SecretSealerPort } from "@jini-ai/platform/secrets";
import { createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";

type Identity = { workspaceId: string; serverId: string };
type Kind = "mcp-env" | "mcp-auth";
const contextKey = Symbol("external-mcp-vault-context");
const stagedKey = Symbol("external-mcp-staged");
type Envelope = SealedSecret & { [contextKey]?: Omit<VaultRecord, "sealed">; [stagedKey]?: boolean };

// The public MCP row still carries opaque envelopes. A non-enumerable context travels with each
// envelope in memory; only its vault ID is persisted on the server. No plaintext cache or registry.
export function externalMcpVaultEnvelope({ record }: { record: VaultRecord }, { staged = false }: { staged?: boolean } = {}): SealedSecret | null {
  if (!record.sealed) return null;
  const { sealed, ...context } = record;
  return Object.defineProperties({ ...sealed }, { [contextKey]: { value: context }, [stagedKey]: { value: staged } });
}

/** Validate the expected server/kind before a read or write; never infer authorization from a row. */
export function externalMcpVaultRecord(
  { sealed, identity, kind }: { sealed: SealedSecret; identity: Identity; kind: Kind }, _options = {},
): VaultRecord {
  const context = (sealed as Envelope)[contextKey];
  if (!context) throw new VaultError({ code: "context" });
  const invalidOwner = context.workspaceId !== identity.workspaceId || context.ownerKey !== identity.serverId;
  const invalidScope = context.kind !== kind || context.principalId !== null || context.binding !== null;
  if (invalidOwner || invalidScope) throw new VaultError({ code: "context" });
  return { ...context, sealed: { keyId: sealed.keyId, ciphertext: sealed.ciphertext, nonce: sealed.nonce, alg: sealed.alg } };
}

function service({ repo, sealer, keyring, identity, kind }: {
  repo: VaultRepoPort; sealer: SecretSealerPort; keyring: KeyringPort; identity: Identity; kind: Kind;
}) {
  // Refuse a foreign kind before its metadata parser or any crypto can run.
  if (kind !== "mcp-env" && kind !== "mcp-auth") throw new VaultError({ code: "context" });
  const registry = createTovuVaultKinds({ policy: {
    validateMeta: ({ kind: requested, meta }) => {
      if (requested !== "mcp-env" && requested !== "mcp-auth") throw new VaultError({ code: "context" });
      return meta;
    }, legacyPublishCredential: () => undefined, tokenField: () => undefined,
  } });
  return new SecretsVaultService({ repo, sealer, keyring, metaParsers: registry.metaParsers,
    authorize: async ({ context }) => {
      if (context.workspaceId !== identity.workspaceId || context.ownerKey !== identity.serverId ||
        context.kind !== kind || context.principalId !== null) throw new VaultError({ code: "context" });
    }, now: () => new Date().toISOString(), newId: () => randomUUID() });
}

/** Stage ciphertext through Jini; the host repository commits it with pointers/status/expiry.
 * @complexity O(payload bytes), one seal, no database I/O before the host transaction.
 */
export async function sealExternalMcpVaultPayload(
  { deps, identity, kind, payload }: { deps: { sealer: SecretSealerPort; keyring: KeyringPort }; identity: Identity;
    kind: Kind; payload: VaultMeta }, _options = {},
): Promise<SealedSecret> {
  const repo = new InMemoryVaultRepo({});
  const id = randomUUID();
  const saved = await service({ repo, sealer: deps.sealer, keyring: deps.keyring, identity, kind }).put({ workspaceId: identity.workspaceId,
    kind, ownerKey: identity.serverId, principalId: null, binding: null, expectedRevision: null,
    id, provider: null, label: id, meta: {}, payload });
  const record = await repo.find(saved);
  if (!record?.sealed) throw new VaultError({ code: "invalid-record" });
  return externalMcpVaultEnvelope({ record }, { staged: true })!;
}

/** Opening a hydrated envelope performs no extra SQL; legacy AAD belongs to boot normalization.
 * @complexity O(payload bytes), one open; expected ownership is checked before crypto.
 */
export async function openExternalMcpVaultPayload(
  { sealer, sealed, identity, kind }: { sealer: Pick<SecretSealerPort, "open">; sealed: SealedSecret;
    identity: Identity; kind: Kind }, _options = {},
): Promise<VaultMeta> {
  const record = externalMcpVaultRecord({ sealed, identity, kind });
  const repo = new InMemoryVaultRepo({});
  await repo.put({ record: { ...record, revision: 1 }, expectedRevision: null });
  // Reads never acquire a sealing key. These fail-closed ports guard accidental future writes.
  const unavailable = async (): Promise<never> => { throw new VaultError({ code: "invalid-record" }); };
  const vault = service({ repo, identity, kind, sealer: { open: sealer.open.bind(sealer), seal: unavailable },
    keyring: { activeKey: unavailable, deriveSigningSecret: unavailable, derive: unavailable } });
  const opened = await vault.get({ workspaceId: identity.workspaceId, id: record.id, kind,
    ownerKey: identity.serverId, principalId: null, binding: null });
  if (!opened?.payload) throw new VaultError({ code: "invalid-record" });
  return opened.payload;
}

/** Persist staged envelopes with Jini CAS; carried envelopes must still exist byte-for-byte.
 * @complexity Constant indexed reads/writes per envelope; callers own the surrounding transaction.
 */
export async function persistExternalMcpVaultEnvelope(
  { repo, sealed, identity, kind }: { repo: VaultRepoPort; sealed: SealedSecret | null; identity: Identity; kind: Kind }, _options = {},
): Promise<string | null> {
  if (!sealed) return null;
  const record = externalMcpVaultRecord({ sealed, identity, kind });
  const existing = await repo.find(record);
  if (existing) {
    if (existing.kind !== kind || existing.ownerKey !== identity.serverId ||
      JSON.stringify(existing.sealed) !== JSON.stringify(record.sealed)) throw new VaultError({ code: "conflict" });
    return record.id;
  }
  if (!(sealed as Envelope)[stagedKey]) throw new VaultError({ code: "conflict" });
  await repo.put({ record: { ...record, revision: 1 }, expectedRevision: null });
  return record.id;
}

/** Call only after unlinking the server pointer; read the revision after any default changes. */
export async function deleteExternalMcpVaultEnvelope(
  { repo, workspaceId, id }: { repo: VaultRepoPort; workspaceId: string; id: string | null }, _options = {},
): Promise<void> {
  if (!id) return;
  const record = await repo.find({ workspaceId, id });
  if (record) await repo.delete({ workspaceId, id, expectedRevision: record.revision });
}
