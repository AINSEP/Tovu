export type { MediaProviderCredentialRecord, MediaProviderCredentialReplacePlan, MediaProviderCredentialReplacePlanner, MediaProviderCredentialRepoPort } from "./provider-credential-contracts.js";
import type { MediaProviderCredentialRecord, MediaProviderCredentialReplacePlanner, MediaProviderCredentialRepoPort } from "./provider-credential-contracts.js";
import { CredentialInputError, CREDENTIAL_MESSAGES, assertCredentialFreeField, normalizeCredentialToken, type CredentialTokenHint } from '../../contracts/core/credential-token.js';
import { nowIso as clockNowIso } from "@jini-ai/core/primitives";
import { MEDIA_PROVIDERS } from "@jini-ai/integrations/media-providers/catalog";
import type { Clock as ClockPort, ISODateTime, UUID } from "@jini-ai/core/primitives";

import type { KeyringPort, SealedSecret, SecretSealerPort } from "../webhooks/index.js";
import { type VaultRepoPort } from "@jini-ai/platform/secrets/credential-sets";
import { createTovuStoreVault } from "#src/platform/secrets/vault-kinds";
import { mediaProviderVault, mediaVaultId, mediaVaultRecord, mediaVaultScope } from "./provider-credential-vault.js";

type VaultPutRecord = Parameters<VaultRepoPort["put"]>[0]["record"];

/**
 * One provider as the admin screen sees it — the marker half only, never the key.
 *
 * Field names are `@jini-ai/ui`'s `MediaProviderCredentials`, not Tovu's own, because this shape
 * crosses the wire straight into that component. Structurally duplicated rather than imported:
 * `@jini-ai/ui` is a browser/React package and this is server code, so the wire contract is
 * restated here and pinned by `__tests__/provider-credential-store.test.ts`.
 */
export interface MediaProviderCredentialView {
  baseUrl?: string;
  model?: string;
  /** `true` iff a sealed key is stored. Absent rather than `false` when none is. */
  apiKeyConfigured?: boolean;
  apiKeyHint?: CredentialTokenHint | null;
  /** Bare tail, no `••••` prefix — `@jini-ai/ui`'s `maskedKeyLabel` adds and clamps that itself. */
  apiKeyTail?: string;
}

/** Credentials keyed by engine-canonical provider id. */
export type MediaProviderCredentialMap = Record<string, MediaProviderCredentialView>;

/** Longest accepted `baseUrl`/`model`. Not a vendor limit — a bound on what an admin payload may
 *  write into a text column, so a malformed client cannot store unbounded blobs. */
const MAX_FIELD_LENGTH = 2048;

/** Engine-canonical ids, the only accepted keys. Frozen at module load from the catalogue the
 *  dispatch engine itself looks credentials up by, which is what stops the UI-vs-engine id
 *  divergence (`xai-grok-imagine` vs `grok`) from ever reaching storage. */
const KNOWN_PROVIDER_IDS: ReadonlySet<string> = new Set(MEDIA_PROVIDERS.map((provider) => provider.id));

export class MediaProviderCredentialValidationError extends Error {}

/** Thrown when a caller supplies a new key but the site key (`TOVU_SITE_KEY`) is
 *  unavailable — fail-closed, mirroring the two sibling credential stores so the route can map it
 *  to its own `503 SECRET_STORE_UNCONFIGURED` rather than a generic `400`. */
export class MediaProviderCredentialSecretStoreUnconfiguredError extends Error {}

/** The key half of a view: only stored safe hints, so reading never opens an envelope. Short or
 *  unknown-length tokens withhold their suffix. */
function keyMarkers(record: MediaProviderCredentialRecord): MediaProviderCredentialView {
  if (record.sealed === null) return {};
  const row = record.vaultRecord;
  if (row?.tokenLength === null || row?.tokenLength === undefined) return { apiKeyConfigured: true };
  const last4 = row.tokenLength >= 12 ? row.last4 : null;
  return { apiKeyConfigured: true, apiKeyHint: { length: row.tokenLength, last4 }, ...(last4 === null ? {} : { apiKeyTail: last4 }) };
}

/** Stored safe hints keep metadata readable without opening any envelopes, even with no site key. */
function toView(record: MediaProviderCredentialRecord): MediaProviderCredentialView {
  return { ...(record.baseUrl === null ? {} : { baseUrl: record.baseUrl }),
    ...(record.model === null ? {} : { model: record.model }), ...keyMarkers(record) };
}

function toMap(records: readonly MediaProviderCredentialRecord[]): MediaProviderCredentialMap {
  return Object.fromEntries(records.map(record => [record.providerId, toView(record)]));
}

export interface MediaProviderCredentialReadDeps {
  repo: MediaProviderCredentialRepoPort;
  sealer?: SecretSealerPort;
}

/**
 * Every configured provider for a workspace, as markers only. Pure DB read — never decrypts, so a
 * missing or rotated site key cannot make this fail.
 *
 * @complexity O(n) over the workspace's provider rows, itself bounded by the catalogue size.
 */
export async function getMediaProviderCredentials(
  deps: MediaProviderCredentialReadDeps,
  input: { workspaceId: UUID }
): Promise<MediaProviderCredentialMap> {
  return toMap(await deps.repo.listByWorkspaceId(input.workspaceId));
}

/** One provider's incoming edit. `apiKey` present and non-blank sets a new key; absent or blank
 *  leaves the stored one alone (`@jini-ai/ui`'s `filled()` treats blank as absent, and the tab
 *  clears a key by omitting the whole provider rather than by sending an empty one). */
export interface MediaProviderCredentialInput {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  /** Accepted and ignored — the tab echoes back markers it was given. Listed so a payload carrying
   *  them is not rejected as having unknown fields. */
  apiKeyConfigured?: boolean;
  apiKeyHint?: CredentialTokenHint | null;
  apiKeyTail?: string;
  source?: string;
}

export interface SaveMediaProviderCredentialsInput {
  workspaceId: UUID;
  providers: Record<string, MediaProviderCredentialInput>;
}

export interface MediaProviderCredentialWriteDeps extends MediaProviderCredentialReadDeps {
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
  /** The live media provider registry (built-in + plugin vendors, 2026-10-21). A plugin vendor's id is
   *  accepted only when the registry holds that exact public id; omitted, only built-in ids are. */
  providerCatalog?: MediaProviderIdCatalog;
}

/** Structurally `MediaProviderRegistry['findProvider']` — only the id is read. */
export interface MediaProviderIdCatalog {
  findProvider(required: { id: string }): { readonly id: string } | null;
}

/** Writes use only `replaceWorkspace`; new envelopes are prepared through the vault port. */
export type MediaProviderCredentialSaveDeps = Omit<MediaProviderCredentialWriteDeps, "repo"> & {
  repo: Pick<MediaProviderCredentialRepoPort, "replaceWorkspace" | "vault">;
};

function trimmedOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Only a credential-policy refusal is an operator mistake; anything else surfaces unchanged. */
function rethrowAsValidation<T>({ run }: { run: () => T }, _options = {}): T {
  try { return run(); }
  catch (err) { if (err instanceof CredentialInputError) throw new MediaProviderCredentialValidationError(err.message); throw err; }
}

/** An exact (never alias-resolved) non-built-in id the injected registry holds. @complexity O(m). */
function isPluginProviderId(providerId: string, catalog: MediaProviderIdCatalog | undefined): boolean {
  return !KNOWN_PROVIDER_IDS.has(providerId) && catalog?.findProvider({ id: providerId })?.id === providerId;
}

/** Built-in ids, or a plugin vendor id the injected registry holds. @complexity O(m). */
function isKnownProviderId(providerId: string, catalog: MediaProviderIdCatalog | undefined): boolean {
  return KNOWN_PROVIDER_IDS.has(providerId) || isPluginProviderId(providerId, catalog);
}

function assertKnownProviderId({ providerId }: { providerId: string }, { catalog }: { catalog?: MediaProviderIdCatalog } = {}): void {
  rethrowAsValidation({ run: () => assertCredentialFreeField({ value: providerId, field: 'providerId' }) });
  if (!isKnownProviderId(providerId, catalog)) {
    throw new MediaProviderCredentialValidationError(
      `unknown media provider "${providerId}" — expected an engine-canonical id from @jini-ai/integrations/media-providers`
    );
  }
}

/** `apiKey` is only type-checked here: token normalization owns its own policy and limit. */
function assertEntryField({ providerId, field, value }: { providerId: string; field: "apiKey" | "baseUrl" | "model"; value: unknown }, _options = {}): void {
  if (value === undefined) return;
  if (typeof value !== "string") {
    throw new MediaProviderCredentialValidationError(`${field} for "${providerId}" must be a string`);
  }
  if (field === "apiKey") return;
  rethrowAsValidation({ run: () => assertCredentialFreeField({ value, field }) });
  if (value.length > MAX_FIELD_LENGTH) {
    throw new MediaProviderCredentialValidationError(
      `${field} for "${providerId}" exceeds ${MAX_FIELD_LENGTH} characters`
    );
  }
}

/** Rejects anything the row cannot faithfully hold, before a single write happens. */
function assertValidEntry(providerId: string, entry: MediaProviderCredentialInput, catalog: MediaProviderIdCatalog | undefined): void {
  assertKnownProviderId({ providerId }, { catalog });
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new MediaProviderCredentialValidationError(`provider "${providerId}" must be an object`);
  }
  for (const field of ["apiKey", "baseUrl", "model"] as const) assertEntryField({ providerId, field, value: entry[field] });
}

/** Prepare only supplied keys before the replacement transaction. The later planner re-reads
 * CURRENT rows for all preserved keys, so a rotation during this await cannot be resurrected.
 * @complexity Catalogue-bounded reads/seals; no writes or per-row opens.
 */
async function sealNewProviderKeys(
  deps: MediaProviderCredentialSaveDeps,
  input: SaveMediaProviderCredentialsInput,
): Promise<Map<string, VaultPutRecord>> {
  const fresh = new Map<string, VaultPutRecord>();
  const vault = createTovuStoreVault({ ...deps, kind: "media-provider",
    storageError: () => new MediaProviderCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage) });
  for (const [providerId, entry] of Object.entries(input.providers)) {
    const submitted = entry.apiKey;
    if (submitted === undefined || submitted === "") continue;
    const apiKey = rethrowAsValidation({ run: () => normalizeCredentialToken({ value: submitted, field: "apiKey" }) });
    const scope = mediaVaultScope({ workspaceId: input.workspaceId, providerId });
    const existing = (await deps.repo.vault!.list(scope))[0];
    fresh.set(providerId, await vault.prepare({ ...scope,
      id: existing?.id ?? mediaVaultId({ providerId }), expectedRevision: existing?.revision ?? null,
      provider: providerId, label: providerId, meta: { ...existing?.meta, baseUrl: trimmedOrNull(entry.baseUrl), model: trimmedOrNull(entry.model) },
      payload: { apiKey }, hintToken: apiKey }));
  }
  return fresh;
}

/** Pure merge against the transaction's snapshot; hints and envelope travel as one private unit. */
function buildProviderUpsertRow(input: {
  workspaceId: UUID; providerId: string; entry: MediaProviderCredentialInput;
  existing?: MediaProviderCredentialRecord; fresh?: VaultPutRecord; now: ISODateTime;
}, _options = {}): MediaProviderCredentialRecord {
  const { workspaceId, providerId, entry, existing, fresh, now } = input;
  const credential = fresh ? mediaVaultRecord({ row: fresh }) : existing;
  // Only a new provider must bring a key. A stored keyless row (migrated or recovered, metadata
  // only) is re-sent by every whole-map save, so refusing it would block every other provider's edit.
  if (!credential) throw new MediaProviderCredentialValidationError('Enter a token. Spaces alone are not a token.');
  const row: MediaProviderCredentialRecord = { workspaceId, providerId,
    baseUrl: trimmedOrNull(entry.baseUrl), model: trimmedOrNull(entry.model),
    sealed: credential.sealed, keyTail: credential.keyTail, aadVersion: credential.aadVersion,
    createdAt: existing?.createdAt ?? now, updatedAt: now };
  Object.defineProperty(row, "vaultRecord", { value: credential.vaultRecord });
  return row;
}

/**
 * Replaces the workspace's ENTIRE provider set and resolves the authoritative copy afterward.
 *
 * Whole-map semantics over the BUILT-IN vendors, because that is what the port promises: a built-in
 * provider absent from `providers` is DELETED, not left in place; any other stored row (a plugin
 * vendor's, registered or not) is kept. A present entry with a blank/absent `apiKey` keeps whatever key is
 * already stored, so an operator editing only `baseUrl` never has to re-paste a key they cannot
 * see.
 *
 * Ordering is deliberate and load-bearing: every entry is validated, then every new key is sealed,
 * and only then is anything written. Sealing is the one step that can fail for an environmental
 * reason (a missing `TOVU_SITE_KEY`), so doing it up front means that failure cannot
 * leave the workspace half-rewritten — the alternative, sealing inside the write loop, would delete
 * some providers and abort before writing the rest.
 *
 * Sealing up front is also what lets the merge itself be synchronous: this function hands
 * `replaceWorkspace` a plain function of the workspace's CURRENT rows, and the repo runs that read,
 * that merge, and every resulting write inside one transaction under the writer lock.
 * Reading preserved keys out here instead — the shape this function used to have — reintroduces a
 * window in which a concurrent rotation lands between the read and the write and is then reverted by
 * this call's own merge, because a metadata-only entry re-writes the sealed key it read.
 *
 * @throws {MediaProviderCredentialValidationError} `providers` is not an object, names an unknown
 *   provider id, or carries a non-string/oversized `apiKey`/`baseUrl`/`model`.
 * @throws {MediaProviderCredentialSecretStoreUnconfiguredError} a new key was supplied but the
 *   site key is unavailable — never downgraded to a plaintext write or a silent skip.
 * @complexity O(n) over the submitted providers, plus one keyring derivation per NEW key. `n` is
 *   bounded by the catalogue: unknown ids are rejected, so the payload cannot exceed its size.
 */
export async function saveMediaProviderCredentials(
  deps: MediaProviderCredentialSaveDeps,
  input: SaveMediaProviderCredentialsInput
): Promise<MediaProviderCredentialMap> {
  const { providers } = input;
  if (providers === null || typeof providers !== "object" || Array.isArray(providers)) {
    throw new MediaProviderCredentialValidationError("providers must be an object keyed by provider id");
  }

  const entries = Object.entries(providers);
  for (const [providerId, entry] of entries) assertValidEntry(providerId, entry, deps.providerCatalog);

  const now = clockNowIso({ clock: deps.clock });

  // Seal every new key BEFORE any write — see this function's doc for why the order matters, and
  // why this is the ONLY async step left before the transaction opens.
  const sealedByProviderId = await sealNewProviderKeys(deps, input);

  const submittedIds = new Set(entries.map(([providerId]) => providerId));

  /** Merges the submitted payload against whatever rows the transaction just read. Synchronous and
   *  pure by contract — it runs inside the open transaction. */
  const plan: MediaProviderCredentialReplacePlanner = (existingRows) => {
    const existingByProviderId = new Map(existingRows.map((row) => [row.providerId, row]));
    const upserts = entries.map(([providerId, entry]) =>
      buildProviderUpsertRow({ workspaceId: input.workspaceId, providerId, entry,
        existing: existingByProviderId.get(providerId), fresh: sealedByProviderId.get(providerId), now })
    );
    return {
      upserts,
      // A plugin vendor's row is never tombstoned by omission: the admin tab renders only built-in
      // vendors, so its whole-map save would otherwise silently delete a key saved for a plugin vendor.
      // Keyed on "not built-in", not "registry holds it": a disabled plugin, a restart or a loader
      // fault drops the vendor from the registry, and its stored key must survive that too.
      tombstoneProviderIds: existingRows
        .map((row) => row.providerId)
        .filter((providerId) => !submittedIds.has(providerId) && KNOWN_PROVIDER_IDS.has(providerId)),
    };
  };

  return toMap(await deps.repo.replaceWorkspace({ workspaceId: input.workspaceId, plan }));
}

export interface MediaProviderCredentialResolveDeps {
  repo: MediaProviderCredentialRepoPort;
  sealer: SecretSealerPort;
}

/** One provider's decrypted, USABLE credential — never logged, never returned from a tool result;
 *  see {@link resolveMediaProviderCredential}'s own doc for the one caller this exists for. */
export interface ResolvedMediaProviderCredential {
  apiKey: string;
  baseUrl: string | null;
  model: string | null;
}

/**
 * The ONLY decrypting read this table has. Finds the workspace's saved credential for `providerId`
 * (an engine-canonical id from `@jini-ai/integrations/media-providers` — same catalogue
 * {@link KNOWN_PROVIDER_IDS} is frozen from) and decrypts it.
 *
 * Returns `null`, never throws, for either "not configured at all" (no row) or "configured with no
 * key yet" (`sealed === null` — `MediaProviderCredentialRecord`'s own doc: "a row may legitimately
 * hold only `baseUrl`/`model` with no key yet"). Both are the same ordinary, expected state for an
 * optional integration a caller should handle with a clear "nothing saved yet" message, not treat as
 * exceptional — matching `resolveCustomCredentialByLabel`'s identical "not found is not an error"
 * contract for the sibling table.
 *
 * @throws {MediaProviderCredentialSecretStoreUnconfiguredError} A row with a sealed key exists but
 *   `sealer.open()` failed — the site key is missing/rotated, or the stored row is corrupted.
 * @complexity One indexed provider-group read, at most one selected envelope open.
 */
export async function resolveMediaProviderCredential(
  deps: MediaProviderCredentialResolveDeps,
  input: { workspaceId: UUID; providerId: string }
): Promise<ResolvedMediaProviderCredential | null> {
  const vault = createTovuStoreVault({ ...deps, repo: { vault: mediaProviderVault({ vault: deps.repo.vault!, providerId: input.providerId }) }, kind: "media-provider",
    storageError: () => new MediaProviderCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage) });
  const resolved = await vault.findOne(mediaVaultScope(input));
  if (!resolved?.payload) return null;
  if (typeof resolved.payload.apiKey !== "string") throw new MediaProviderCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage);
  return { apiKey: resolved.payload.apiKey, baseUrl: resolved.summary.meta.baseUrl as string | null,
    model: resolved.summary.meta.model as string | null };
}
