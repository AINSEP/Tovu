import { nowIso as readNowIso, type Clock as ClockPort, type ISODateTime, type UUID } from "@jini-ai/core/primitives";
import type { VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import type { KeyringPort, SealedSecret, SecretSealerPort } from "../features/webhooks/index.js";
import { credentialTokenHint, type CredentialTokenHint } from "../contracts/core/credential-token.js";
import { assistantVaultContext, assistantVaultRepo, createAssistantVault, readAssistantVault } from "./assistant-vault.js";
import { credentialViewFields, credentialWriteFields } from './credential-store-fields.js';

/** The site visitor assistant owns this feature contract. Jini owns vault persistence and
 * JSON sealing. Omitted keys preserve envelopes; clearing retains settings. Legacy AAD is opened
 * only during boot normalization/recovery (ADR-058 amendment, S3a). */
export interface SiteAssistantCredentialRecord {
  workspaceId: UUID;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  sealed: SealedSecret | null;
  /** `••••<last 4 chars>` — precomputed at write time. `null` iff `sealed` is `null`. */
  masked: string | null;
  /** Compatibility marker: 2 = vault AAD/JSON; 0 = no stored key. Legacy AAD belongs to boot. */
  aadVersion: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Workspace-scoped persistence for {@link SiteAssistantCredentialRecord} (ADR-007 §1). One row per
 *  workspace — `upsert` always writes the full row; `clearKey` is a narrower partial update because
 *  deleting the key must not disturb `provider`/`baseUrl`/`model` (ADR-058 §8). */
export interface SiteAssistantCredentialRepoPort {
  findByWorkspaceId(workspaceId: UUID): Promise<SiteAssistantCredentialRecord | null>;
  upsert(record: SiteAssistantCredentialRecord): Promise<void>;
  /** No-op if no row exists for `workspaceId` — same "clearing nothing is fine" posture DELETE's
   *  route handler needs (idempotent, not an error to delete an already-unset key). */
  clearKey(input: { workspaceId: UUID; updatedAt: ISODateTime }): Promise<void>;
}

/** The read model every route in this feature returns — never contains key material, only whether
 *  one is set and what it ends in. */
export interface SiteAssistantCredentialView {
  isSet: boolean;
  masked: string | null;
  tokenHint?: CredentialTokenHint | null;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  updatedAt: ISODateTime | null;
}

function toView({ record, tokenHint = null }: { record: VaultRecord | null; tokenHint?: CredentialTokenHint | null }, _options = {}): SiteAssistantCredentialView {
  return { ...credentialViewFields({ record, tokenHint }), provider: record?.provider ?? "google",
    baseUrl: record?.meta.baseUrl as string | null ?? null, model: record?.meta.model as string | null ?? null };
}

function siteMetadata({ input, existing }: { input: SetSiteAssistantCredentialInput; existing: VaultRecord | null }, _options = {}) {
  const meta = existing?.meta;
  return { ...meta, baseUrl: input.baseUrl ?? meta?.baseUrl ?? null,
    model: input.model ?? meta?.model ?? null };
}

export interface SiteAssistantCredentialReadDeps { repo: SiteAssistantCredentialRepoPort; sealer?: SecretSealerPort; }

/** Metadata survives an unavailable key; hints open the same snapshot at most once. */
export async function getSiteAssistantCredential(deps: SiteAssistantCredentialReadDeps, input: { workspaceId: UUID }): Promise<SiteAssistantCredentialView> {
  return toView(await readAssistantVault({ repo: assistantVaultRepo({ repo: deps.repo }), context: assistantVaultContext({ workspaceId: input.workspaceId, kind: "site-assistant" }), sealer: deps.sealer }));
}

export class SiteAssistantCredentialValidationError extends Error {}

/** Thrown when a caller supplies a new `apiKey` but the site key
 *  (`TOVU_SITE_KEY`) is unavailable — ADR-058 §4's fail-closed contract. Distinct from
 *  {@link SiteAssistantCredentialValidationError} so the route can map it to its own `503
 *  SECRET_STORE_UNCONFIGURED` response rather than a `400`. */
export class SiteAssistantSecretStoreUnconfiguredError extends Error {}

export interface SiteAssistantCredentialWriteDeps extends SiteAssistantCredentialReadDeps {
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
}

export interface SetSiteAssistantCredentialInput {
  workspaceId: UUID;
  /** Omitted = leave the stored key untouched. Empty string is rejected (use DELETE to clear). */
  apiKey?: string;
  provider?: string;
  baseUrl?: string;
  model?: string;
}

function assertValidSiteAssistantCredentialApiKey(apiKey: string | undefined): void {
  if (apiKey !== undefined && apiKey.trim().length === 0) {
    throw new SiteAssistantCredentialValidationError("apiKey must not be empty — use DELETE to clear it");
  }
}

/** {@link setSiteAssistantCredential}'s `provider`/`baseUrl`/`model` string checks, split out
 *  purely to keep that function's validation under the shop complexity ceiling. */
function assertValidSiteAssistantCredentialStringFields(input: Pick<SetSiteAssistantCredentialInput, "provider" | "baseUrl" | "model">): void {
  for (const [field, value] of [
    ["provider", input.provider],
    ["baseUrl", input.baseUrl],
    ["model", input.model],
  ] as const) {
    if (value !== undefined && typeof value !== "string") {
      throw new SiteAssistantCredentialValidationError(`${field} must be a string`);
    }
  }
}

/** Runs every {@link SetSiteAssistantCredentialInput} validation, in the same order as the
 *  original inline checks, before any write. Split out of {@link setSiteAssistantCredential}
 *  purely to keep that function's complexity under the shop ceiling — behavior (including message
 *  text and ordering) is unchanged. */
function assertValidSetSiteAssistantCredentialInput(input: SetSiteAssistantCredentialInput): void {
  assertValidSiteAssistantCredentialApiKey(input.apiKey);
  assertValidSiteAssistantCredentialStringFields(input);
}

/** Validate in the feature, then delegate sealing and CAS to Jini. A settings-only provider move
 * preserves identity, envelope and hints without deriving a key or resealing. The response may open its snapshot for a safe hint.
 * @complexity Constant singleton/identity reads and one CAS write, O(payload size) sealing. */
export async function setSiteAssistantCredential(deps: SiteAssistantCredentialWriteDeps, input: SetSiteAssistantCredentialInput): Promise<SiteAssistantCredentialView> {
  assertValidSetSiteAssistantCredentialInput(input);
  const repo = assistantVaultRepo({ repo: deps.repo });
  const context = assistantVaultContext({ workspaceId: input.workspaceId, kind: "site-assistant" });
  const existing = await repo.findOne!(context);
  const vault = createAssistantVault({ ...deps, repo, context }, { onSealFailure: error => {
    throw new SiteAssistantSecretStoreUnconfiguredError(`site assistant secret store is unconfigured: ${error instanceof Error ? error.message : String(error)}`);
  } });
  const prepared = await vault.prepare({ ...context, ...credentialWriteFields({ existing, apiKey: input.apiKey }),
    provider: input.provider ?? existing?.provider ?? "google",
    meta: siteMetadata({ input, existing }),
  });
  const saved = await repo.put({ record: prepared, expectedRevision: existing?.revision ?? null });
  let tokenHint: CredentialTokenHint | null;
  if (input.apiKey !== undefined) tokenHint = credentialTokenHint({ token: input.apiKey });
  else tokenHint = (await readAssistantVault({ repo, context, sealer: deps.sealer }, { record: saved })).tokenHint;
  return toView({ record: saved, tokenHint });
}

/** Clears the envelope through the compatibility port; settings and scope remain intact. */
export async function deleteSiteAssistantCredential(deps: SiteAssistantCredentialReadDeps & { clock: ClockPort }, input: { workspaceId: UUID }): Promise<SiteAssistantCredentialView> {
  await deps.repo.clearKey({ ...input, updatedAt: readNowIso({ clock: deps.clock }) });
  return getSiteAssistantCredential(deps, input);
}

export interface ResolvedSiteAssistantCredential {
  apiKey: string;
  provider: string;
  baseUrl: string | null;
  model: string | null;
}

/** Runtime fail-closed read: one indexed singleton lookup and at most one Jini open. Metadata and
 * payload come from one snapshot, so rotation cannot return a half-replaced credential. */
export async function resolveSiteAssistantApiKey(deps: { repo: SiteAssistantCredentialRepoPort; sealer: SecretSealerPort }, input: { workspaceId: UUID },
  onDecryptFailure: (error: unknown) => void = () => {},
): Promise<ResolvedSiteAssistantCredential | null> {
  try {
    const context = assistantVaultContext({ workspaceId: input.workspaceId, kind: "site-assistant" });
    const opened = await createAssistantVault({ ...deps, repo: assistantVaultRepo({ repo: deps.repo }), context }).findOne(context);
    if (typeof opened?.payload?.apiKey !== "string") return null;
    const { summary, payload } = opened;
    return { apiKey: payload!.apiKey as string, provider: summary.provider!, baseUrl: summary.meta.baseUrl as string | null,
      model: summary.meta.model as string | null, };
  } catch (error) { onDecryptFailure(error); return null; }
}
