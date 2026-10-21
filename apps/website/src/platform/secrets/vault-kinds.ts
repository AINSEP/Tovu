import { createVaultMetaParsers, isCopyableKind, SecretsVaultService, VAULT_KINDS, VaultError,
  type VaultRepoPort, type VaultContext,
  type VaultKind, type VaultMeta, type VaultMetaParser, type VaultMetaParsers, type VaultOptions } from "@jini-ai/platform/secrets/credential-sets";
import type { Clock } from "@jini-ai/core/primitives";
import type { KeyringPort, SecretSealerPort } from "@jini-ai/platform/secrets";
import { createStoreKeyring, protectStorage } from "./store-vault-guards.js";
import { assertHostMetaRules, assertRecoveryMeta, parseStructuralMeta, withRecoveryMeta } from "./vault-meta-rules.js";

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
  return { metaParsers: createHostMetaParsers({ policy }), policy, isCopyableKind };
}

/** Jini's parsers with one host parser per kind; only the policy's metadata decision is consulted.
 * @complexity O(kinds) setup; no I/O.
 */
function createHostMetaParsers({ policy }: { policy: Pick<TovuVaultPolicy, "validateMeta"> }, _optional = {}): VaultMetaParsers {
  const base = createVaultMetaParsers({});
  const parsers = Object.fromEntries([...VAULT_KINDS, "custom" as const].map(kind => [kind, createHostParser({ kind, base, policy })]));
  return createVaultMetaParsers({}, { parsers: parsers as VaultMetaParsers });
}

/** One kind's host parser. Jini hands it a JSON-safe clone that already passed its own checks.
 * Order: recovery provenance, structural parse, host rules, then the host policy's catalog decision.
 * @throws VaultError, CredentialInputError, TypeError (unparseable origin) or host policy errors.
 * @complexity O(metadata size); no I/O.
 */
function createHostParser(
  { kind, base, policy }: { kind: VaultKind; base: VaultMetaParsers; policy: Pick<TovuVaultPolicy, "validateMeta"> },
  _optional = {},
): VaultMetaParser {
  return ({ meta, provider }, _options: VaultOptions = {}) => {
    const input = meta as VaultMeta;
    assertRecoveryMeta({ meta: input });
    const { migration, normalization, ...plain } = input;
    const parsed = parseStructuralMeta({ kind, meta: plain, provider, base });
    assertHostMetaRules({ kind, meta: parsed });
    return withRecoveryMeta({ meta: policy.validateMeta({ kind, meta: parsed }), migration, normalization });
  };
}

/** Feature permissions stay at their existing boundary; this host policy constrains the injected
 * service to one Tovu-owned kind. Only crypto errors become the feature's safe storage error.
 * @complexity Constant setup; the Jini service owns all persistence and sealing work.
 */
export function createTovuStoreVault(required: {
  repo: { vault?: VaultRepoPort }; kind: "media-provider" | "vendor" | "custom" | "site-assistant" | "personal-execution"; sealer: SecretSealerPort;
  keyring?: KeyringPort; clock?: Clock; storageError: (error?: unknown) => Error;
  /** Assistant stores constrain the full session/site scope and mint stable singleton IDs. */
  context?: VaultContext; newId?: (input: VaultOptions) => string;
}, _options = {}): SecretsVaultService {
  if (!required.repo.vault) throw new VaultError({ code: "invalid-record" });
  const protect = <T>(operation: () => Promise<T>): Promise<T> => protectStorage({ operation, source: required });
  return new SecretsVaultService({ repo: required.repo.vault, metaParsers: storeMetaParsers,
    authorize: async ({ context }) => {
      if (required.context && context.workspaceId !== required.context.workspaceId) throw new VaultError({ code: "context" });
      if (context.kind !== required.kind || context.ownerKey !== "tovu" || context.principalId !== (required.context?.principalId ?? null) ||
        ("binding" in context && context.binding !== null)) throw new VaultError({ code: "context" });
    },
    keyring: createStoreKeyring({ source: required }),
    sealer: { seal: input => protect(() => required.sealer.seal({ plaintext: input.plaintext, key: input.key, aad: input.aad })),
      open: (input, options) => protect(() => required.sealer.open(input, options)) },
    now: () => new Date(required.clock?.nowMs() ?? 0).toISOString(),
    newId: () => { if (required.newId) return required.newId({}); throw new VaultError({ code: "invalid-record" }); },
  });
}

// Immutable registration; feature stores validate their inputs, these parsers also validate reads.
const storeMetaParsers = createHostMetaParsers({ policy: { validateMeta: ({ meta }) => meta } });

/** Parse complete feature metadata through the same registration used by the vault service. */
export function parseTovuStoreMeta(input: { kind: "media-provider" | "vendor" | "custom" | "site-assistant" | "personal-execution" | "api-connection"; meta: unknown; provider?: string | null | undefined }, _options = {}): VaultMeta {
  return storeMetaParsers[input.kind](input);
}

/** Binary label order for labelled kinds (`custom`, `publish-peer`): what their pre-vault label
 * index returned on every dialect. Labels are unique per workspace and kind, so ties never occur.
 * @complexity O(1) per comparison. */
export function byVaultLabel(a: { label: string }, b: { label: string }): number {
  return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
}
