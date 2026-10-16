import { createVaultMetaParsers, isCopyableKind, SecretsVaultService, VAULT_KINDS, VaultError,
  type VaultRepoPort, type VaultContext,
  type VaultKind, type VaultMeta, type VaultMetaParsers, type VaultOptions } from "@jini-ai/platform/secrets/credential-sets";
import { assertCredentialFreeField } from "#src/contracts/core/credential-token";
import { CUSTOM_CREDENTIAL_CATEGORIES } from "#src/features/custom-credentials/types";
import type { Clock } from "@jini-ai/core/primitives";
import type { KeyringPort, SecretSealerPort } from "@jini-ai/platform/secrets";

/** Tovu owns catalogs and safe-metadata policy; Jini owns structural parsing and the vault lifecycle. */
export interface TovuVaultPolicy {
  validateMeta(input: { kind: VaultKind; meta: VaultMeta }): VaultMeta;
  /** Workspace registry first, bundled registry second, as in the former publish backfill.
   * Missing plugins leave their legacy records recoverable instead of guessing a vendor. */
  legacyPublishCredential(input: { workspaceId: string; providerId: string }): { vendorId: string; tokenField: string } | undefined;
  tokenField(input: { kind: VaultKind; provider: string | null }): string | undefined;
}

/** Register host policy in Jini's complete-shape parsers (also used on reads and merged patches).
 * Provenance is retained for recovery; legacy AAD markers are deliberately not accepted here.
 * @throws VaultError or host policy errors for unsafe/invalid metadata.
 * @complexity O(metadata size); no I/O or module-owned registry state.
 */
export function createTovuVaultKinds(
  { policy }: { policy: TovuVaultPolicy },
  _optional: Record<string, never> = {},
): { metaParsers: VaultMetaParsers; policy: TovuVaultPolicy; isCopyableKind: typeof isCopyableKind } {
  const base = createVaultMetaParsers({});
  const metaParsers = createVaultMetaParsers({}, { parsers: Object.fromEntries(VAULT_KINDS.map(kind => [kind,
    ({ meta }: { meta: unknown }, _options: VaultOptions = {}) => {
      if (Object.hasOwn(meta as object, "legacyAad")) throw new VaultError({ code: "invalid-meta" });
      const { migration, normalization, ...plain } = meta as VaultMeta;
      if (normalization !== undefined && !["missing-key", "unopenable", "invalid-meta", "catalog-unavailable", "conflict"].includes(String(normalization))) {
        throw new VaultError({ code: "invalid-meta" });
      }
      if (migration !== undefined && (migration === null || typeof migration !== "object" || Array.isArray(migration))) throw new VaultError({ code: "invalid-meta" });
      if (migration !== undefined) for (const field of ["originalLabel", "mappedLabel"]) {
        const value = (migration as VaultMeta)[field];
        if (typeof value === "string") assertCredentialFreeField({ value, field });
      }
      // savedAt describes the destination save, not the last metadata patch. Old migrated rows
      // omit it and use createdAt; it must survive later lastRun updates without changing.
      const { savedAt, ...destinationMeta } = plain;
      const parsed = base[kind]({ meta: kind === "database-destination" ? destinationMeta : plain });
      if (kind === "database-destination" && savedAt !== undefined) {
        if (typeof savedAt !== "string") throw new VaultError({ code: "invalid-meta" });
        parsed.savedAt = savedAt;
      }
      validatePeerDestinationMeta({ kind, meta: parsed });
      if (kind === "custom" && !CUSTOM_CREDENTIAL_CATEGORIES.includes(parsed.category as typeof CUSTOM_CREDENTIAL_CATEGORIES[number])) {
        throw new VaultError({ code: "invalid-meta" });
      }
      for (const field of ["baseUrl", "model", "username", "accountLabel"]) {
        const value = parsed[field];
        if (typeof value === "string") assertCredentialFreeField({ value, field });
      }
      if (Array.isArray(parsed.additionalHosts)) for (const value of parsed.additionalHosts) {
        if (typeof value !== "string" || new URL(value).origin !== value) throw new VaultError({ code: "invalid-meta" });
        assertCredentialFreeField({ value, field: "additionalHosts" });
      }
      const validated = policy.validateMeta({ kind, meta: parsed });
      return { ...validated, ...(migration === undefined ? {} : { migration }),
        ...(normalization === undefined ? {} : { normalization }) };
    }])) as VaultMetaParsers });
  return { metaParsers, policy, isCopyableKind };
}

/** Host read/write invariants, including merged lastRun patches. No connection URI is metadata.
 * @throws VaultError for malformed descriptions, peer bindings or run summaries.
 * @complexity O(metadata size); fixed field checks, no I/O.
 */
function validatePeerDestinationMeta({ kind, meta }: { kind: VaultKind; meta: VaultMeta }, _options: VaultOptions = {}): void {
  if (kind === "publish-peer" && (typeof meta.baseUrl !== "string" || typeof meta.remoteWorkspaceId !== "string" || !meta.remoteWorkspaceId)) {
    throw new VaultError({ code: "invalid-meta" });
  }
  if (kind !== "database-destination") return;
  const description = meta.description as VaultMeta | null;
  if (!description || ["host", "port", "database", "user"].some(field => typeof description[field] !== "string") ||
    Object.keys(description).some(field => !["host", "port", "database", "user"].includes(field))) throw new VaultError({ code: "invalid-meta" });
  for (const [field, value] of Object.entries(description)) assertCredentialFreeField({ value: value as string, field });
  if (meta.lastRun === null) return;
  const run = meta.lastRun as VaultMeta | null;
  if (!run || typeof run.snapshotAt !== "string" || (run.copied !== true && run.copied !== false)) throw new VaultError({ code: "invalid-meta" });
  const fields = run.copied ? ["copied", "snapshotAt", "tableCount", "rowCount"] : ["copied", "snapshotAt", "code", "message"];
  if (Object.keys(run).some(field => !fields.includes(field)) || (run.copied
    ? [run.tableCount, run.rowCount].some(value => typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    : typeof run.code !== "string" || typeof run.message !== "string")) throw new VaultError({ code: "invalid-meta" });
}

/** Feature permissions stay at their existing boundary; this host policy constrains the injected
 * service to one Tovu-owned kind. Only crypto errors become the feature's safe storage error.
 * @complexity Constant setup; the Jini service owns all persistence and sealing work.
 */
export function createTovuStoreVault(required: {
  repo: { vault?: VaultRepoPort }; kind: "media-provider" | "custom" | "site-assistant" | "personal-execution"; sealer: SecretSealerPort;
  keyring?: KeyringPort; clock?: Clock; storageError: (error?: unknown) => Error;
  /** Assistant stores constrain the full session/site scope and mint stable singleton IDs. */
  context?: VaultContext; newId?: (input: VaultOptions) => string;
}, _options = {}): SecretsVaultService {
  if (!required.repo.vault) throw new VaultError({ code: "invalid-record" });
  const protect = async <T>(operation: () => Promise<T>): Promise<T> => {
    try { return await operation(); } catch (error) { throw required.storageError(error); }
  };
  return new SecretsVaultService({ repo: required.repo.vault, metaParsers: storeKinds.metaParsers,
    authorize: async ({ context }) => {
      if (required.context && context.workspaceId !== required.context.workspaceId) throw new VaultError({ code: "context" });
      if (context.kind !== required.kind || context.ownerKey !== "tovu" || context.principalId !== (required.context?.principalId ?? null) ||
        ("binding" in context && context.binding !== null)) throw new VaultError({ code: "context" });
    },
    keyring: {
      derive: input => protect(() => { if (!required.keyring) throw required.storageError(); return required.keyring.derive(input); }),
      deriveSigningSecret: input => protect(() => { if (!required.keyring) throw required.storageError(); return required.keyring.deriveSigningSecret(input); }),
      activeKey: () => protect(() => {
        if (!required.keyring) throw required.storageError();
        return required.keyring.activeKey({});
      }),
    },
    sealer: { seal: input => protect(() => required.sealer.seal({ plaintext: input.plaintext, key: input.key, aad: input.aad })),
      open: (input, options) => protect(() => required.sealer.open(input, options)) },
    now: () => new Date(required.clock?.nowMs() ?? 0).toISOString(),
    newId: () => { if (required.newId) return required.newId({}); throw new VaultError({ code: "invalid-record" }); },
  });
}

// Immutable registration; feature stores validate their inputs, these parsers also validate reads.
const storeKinds = createTovuVaultKinds({ policy: {
  validateMeta: ({ meta }) => meta, legacyPublishCredential: () => undefined, tokenField: () => undefined,
} });

/** Parse complete feature metadata through the same registration used by the vault service. */
export function parseTovuStoreMeta(input: { kind: "media-provider" | "custom" | "site-assistant" | "personal-execution"; meta: unknown }, _options = {}): VaultMeta {
  return storeKinds.metaParsers[input.kind]({ meta: input.meta });
}

/** Binary label order for labelled kinds (`custom`, `publish-peer`): what their pre-vault label
 * index returned on every dialect. Labels are unique per workspace and kind, so ties never occur.
 * @complexity O(1) per comparison. */
export function byVaultLabel(a: { label: string }, b: { label: string }): number {
  return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
}
