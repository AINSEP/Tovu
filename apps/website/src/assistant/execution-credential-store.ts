import { nowIso as readNowIso, type Clock as ClockPort, type ISODateTime, type UUID } from "@jini-ai/core/primitives";
import type { VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SealedSecret, SecretSealerPort } from "../features/webhooks/index.js";
import { credentialTokenHint, type CredentialTokenHint } from "../contracts/core/credential-token.js";
import { assistantVaultContext, assistantVaultRepo, createAssistantVault, readAssistantVault } from "./assistant-vault.js";

/** The admin session principal owns this feature contract. Jini owns vault persistence and
 * JSON sealing. Omitted keys preserve envelopes; clearing retains settings. Legacy AAD is opened
 * only during boot normalization/recovery (ADR-058 amendment, S3a). */
export interface AdminExecutionCredentialRecord {
  workspaceId: UUID;
  principalId: UUID;
  protocol: string;
  providerId: string | null;
  baseUrl: string | null;
  model: string | null;
  maxTokens: number | null;
  sealed: SealedSecret | null;
  /** `••••<last 4 chars>` — precomputed at write time. `null` iff `sealed` is `null`. */
  masked: string | null;
  /** Compatibility marker: 2 = vault AAD/JSON; 0 = no stored key. Legacy AAD belongs to boot. */
  aadVersion: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Persistence for {@link AdminExecutionCredentialRecord}, scoped by `(workspaceId, principalId)`
 *  together — every method requires both, so there is no query shape that can return one admin's
 *  row for another admin's id. `upsert` always writes the full row; `clearKey` is a narrower
 *  partial update because deleting the key must not disturb the other fields. */
export interface AdminExecutionCredentialRepoPort {
  findByWorkspaceAndPrincipal(required: { workspaceId: UUID; principalId: UUID }): Promise<AdminExecutionCredentialRecord | null>;
  upsert(record: AdminExecutionCredentialRecord): Promise<void>;
  /** No-op if no row exists for `(workspaceId, principalId)` — idempotent, not an error to delete an
   *  already-unset key. */
  clearKey(input: { workspaceId: UUID; principalId: UUID; updatedAt: ISODateTime }): Promise<void>;
}

/** The read model every route in this feature returns — never contains key material, only whether
 *  one is set and what it ends in. */
export interface AdminExecutionCredentialView {
  isSet: boolean;
  masked: string | null;
  tokenHint?: CredentialTokenHint | null;
  protocol: string;
  providerId: string | null;
  baseUrl: string | null;
  model: string | null;
  maxTokens: number | null;
  updatedAt: ISODateTime | null;
}

function toView({ record, tokenHint = null }: { record: VaultRecord | null; tokenHint?: CredentialTokenHint | null }, _options = {}): AdminExecutionCredentialView {
  const isSet = record?.sealed != null;
  return { isSet, masked: tokenHint?.last4 ? `••••${tokenHint.last4}` : null, tokenHint,
    protocol: record?.meta.protocol as string ?? "anthropic", providerId: record?.provider ?? null,
    baseUrl: record?.meta.baseUrl as string | null ?? null, model: record?.meta.model as string | null ?? null,
    maxTokens: record?.meta.maxTokens as number | null ?? null,
    updatedAt: record?.updatedAt ?? null };
}

export interface ExecutionCredentialReadDeps { repo: AdminExecutionCredentialRepoPort; sealer?: SecretSealerPort; }

/** Metadata survives an unavailable key; hints open the same snapshot at most once. */
export async function getExecutionCredential(deps: ExecutionCredentialReadDeps, input: { workspaceId: UUID; principalId: UUID }): Promise<AdminExecutionCredentialView> {
  return toView(await readAssistantVault({ repo: assistantVaultRepo({ repo: deps.repo }), context: assistantVaultContext({ ...input, kind: "personal-execution" }), sealer: deps.sealer }));
}

export class ExecutionCredentialValidationError extends Error {}

/** Thrown when a caller supplies a new `apiKey` but the site key
 *  (`TOVU_SITE_KEY`) is unavailable — fail-closed, mirroring
 *  `SiteAssistantSecretStoreUnconfiguredError`. Distinct from
 *  {@link ExecutionCredentialValidationError} so the route can map it to its own `503
 *  SECRET_STORE_UNCONFIGURED` response rather than a `400`. */
export class ExecutionCredentialSecretStoreUnconfiguredError extends Error {}

export interface ExecutionCredentialWriteDeps extends ExecutionCredentialReadDeps {
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
}

export interface SetExecutionCredentialInput {
  workspaceId: UUID;
  principalId: UUID;
  /** Omitted = leave the stored key untouched. Empty string is rejected (use DELETE to clear). */
  apiKey?: string;
  protocol?: string;
  providerId?: string | null;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
}

function assertValidExecutionCredentialApiKey(apiKey: string | undefined): void {
  if (apiKey !== undefined && apiKey.trim().length === 0) {
    throw new ExecutionCredentialValidationError("apiKey must not be empty — use DELETE to clear it");
  }
}

/** {@link setExecutionCredential}'s `protocol`/`baseUrl`/`model` string checks, split out purely to
 *  keep that function's validation under the shop complexity ceiling. */
function assertValidExecutionCredentialStringFields(input: Pick<SetExecutionCredentialInput, "protocol" | "baseUrl" | "model">): void {
  for (const [field, value] of [
    ["protocol", input.protocol],
    ["baseUrl", input.baseUrl],
    ["model", input.model],
  ] as const) {
    if (value !== undefined && typeof value !== "string") {
      throw new ExecutionCredentialValidationError(`${field} must be a string`);
    }
  }
}

/** {@link setExecutionCredential}'s `providerId` check, split out purely to keep that function's
 *  validation under the shop complexity ceiling. */
function assertValidExecutionCredentialProviderId(providerId: string | null | undefined): void {
  if (providerId !== undefined && providerId !== null && typeof providerId !== "string") {
    throw new ExecutionCredentialValidationError("providerId must be a string or null");
  }
}

/** {@link setExecutionCredential}'s `maxTokens` check, split out purely to keep that function's
 *  validation under the shop complexity ceiling. */
function assertValidExecutionCredentialMaxTokens(maxTokens: number | undefined): void {
  if (maxTokens !== undefined && !(typeof maxTokens === "number" && maxTokens > 0)) {
    throw new ExecutionCredentialValidationError("maxTokens must be a positive number");
  }
}

/** Runs every {@link SetExecutionCredentialInput} validation, in the same order as the original
 *  inline checks, before any write. Split out of {@link setExecutionCredential} purely to keep
 *  that function's complexity under the shop ceiling — behavior (including message text and
 *  ordering) is unchanged. */
function assertValidSetExecutionCredentialInput(input: SetExecutionCredentialInput): void {
  assertValidExecutionCredentialApiKey(input.apiKey);
  assertValidExecutionCredentialStringFields(input);
  assertValidExecutionCredentialProviderId(input.providerId);
  assertValidExecutionCredentialMaxTokens(input.maxTokens);
}

/** Validate in the feature, then delegate sealing and CAS to Jini. A settings-only provider move
 * preserves identity, envelope and hints without deriving a key or resealing. The response may open its snapshot for a safe hint.
 * @complexity Constant singleton/identity reads and one CAS write, O(payload size) sealing. */
export async function setExecutionCredential(deps: ExecutionCredentialWriteDeps, input: SetExecutionCredentialInput): Promise<AdminExecutionCredentialView> {
  assertValidSetExecutionCredentialInput(input);
  const repo = assistantVaultRepo({ repo: deps.repo });
  const context = assistantVaultContext({ ...input, kind: "personal-execution" });
  const existing = await repo.findOne!(context);
  const vault = createAssistantVault({ ...deps, repo, context }, { onSealFailure: error => {
    throw new ExecutionCredentialSecretStoreUnconfiguredError(`admin execution credential secret store is unconfigured: ${error instanceof Error ? error.message : String(error)}`);
  } });
  const prepared = await vault.prepare({ ...context, ...(existing ? { id: existing.id } : {}),
    expectedRevision: existing?.revision ?? null, provider: input.providerId !== undefined ? input.providerId : existing?.provider ?? null, label: existing?.label ?? "",
    meta: { ...existing?.meta, protocol: input.protocol ?? existing?.meta.protocol ?? "anthropic",
      baseUrl: input.baseUrl ?? existing?.meta.baseUrl ?? null, model: input.model ?? existing?.meta.model ?? null,
      maxTokens: input.maxTokens ?? existing?.meta.maxTokens ?? null },
    payload: input.apiKey === undefined ? (existing ? undefined : null) : { apiKey: input.apiKey },
    ...(input.apiKey === undefined ? {} : { hintToken: input.apiKey }),
  });
  const saved = await repo.put({ record: prepared, expectedRevision: existing?.revision ?? null });
  let tokenHint: CredentialTokenHint | null;
  if (input.apiKey !== undefined) tokenHint = credentialTokenHint({ token: input.apiKey });
  else tokenHint = (await readAssistantVault({ repo, context, sealer: deps.sealer }, { record: saved })).tokenHint;
  return toView({ record: saved, tokenHint });
}

/** Clears the envelope through the compatibility port; settings and scope remain intact. */
export async function deleteExecutionCredential(deps: ExecutionCredentialReadDeps & { clock: ClockPort }, input: { workspaceId: UUID; principalId: UUID }): Promise<AdminExecutionCredentialView> {
  await deps.repo.clearKey({ ...input, updatedAt: readNowIso({ clock: deps.clock }) });
  return getExecutionCredential(deps, input);
}

export interface ResolvedAdminExecutionCredential {
  apiKey: string;
  protocol: string;
  providerId: string | null;
  baseUrl: string | null;
  model: string | null;
  maxTokens: number | null;
}

/** Runtime fail-closed read: one indexed singleton lookup and at most one Jini open. Metadata and
 * payload come from one snapshot, so rotation cannot return a half-replaced credential. */
export async function resolveExecutionCredential(deps: { repo: AdminExecutionCredentialRepoPort; sealer: SecretSealerPort }, input: { workspaceId: UUID; principalId: UUID },
  onDecryptFailure: (error: unknown) => void = () => {},
): Promise<ResolvedAdminExecutionCredential | null> {
  try {
    const context = assistantVaultContext({ ...input, kind: "personal-execution" });
    const opened = await createAssistantVault({ ...deps, repo: assistantVaultRepo({ repo: deps.repo }), context }).findOne(context);
    if (typeof opened?.payload?.apiKey !== "string") return null;
    const { summary, payload } = opened;
    return { apiKey: payload!.apiKey as string, protocol: summary.meta.protocol as string, providerId: summary.provider,
      baseUrl: summary.meta.baseUrl as string | null, model: summary.meta.model as string | null,
      maxTokens: summary.meta.maxTokens as number | null, };
  } catch (error) { onDecryptFailure(error); return null; }
}
