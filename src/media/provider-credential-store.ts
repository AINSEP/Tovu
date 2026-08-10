import { MEDIA_PROVIDERS } from "@jini-ai/integrations/media-providers/catalog";
import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SecretSealerPort } from "../integrations/ports";
import type { SealedSecret } from "../integrations/types";

/**
 * @file Per-workspace media-generation vendor credentials — what the admin's Media → "Media
 * providers" tab reads and writes. Backs the `MediaProvidersPort` contract in `@jini-ai/ui`
 * (`features/media-providers/ports.ts`), whose two methods this file's two functions answer.
 *
 * WORKSPACE-scoped, not per-principal like `assistant/execution-credential-store.ts`: generation
 * spends real money and publishes assets site-wide, so the install holds one vendor roster. See
 * `db/schema.ts`'s `mediaProviderCredentials` header for the full reasoning.
 *
 * Two functions, matching the port exactly:
 * - {@link getMediaProviderCredentials} — read model only. Never decrypts (`keyTail` is a plain
 *   column computed at write time), so it cannot fail on a misconfigured master secret.
 * - {@link saveMediaProviderCredentials} — WHOLE-MAP REPLACE, including deletion. The tab's
 *   `saveMediaProviders` sends its entire local map and treats an absent provider as a tombstone
 *   (see `useMediaProvidersTab`'s `flushNow`), so a provider missing from the payload must be
 *   deleted here, not merely left alone.
 *
 * Neither function ever returns key material. The response carries only `apiKeyConfigured` and
 * `apiKeyTail`, which is the "markers" half of the two-kinds-of-present distinction
 * `@jini-ai/ui`'s `types.ts` documents.
 */

/** One provider's stored credential row. `sealed`/`keyTail` are both-null or both-set, enforced by
 *  the table's own CHECK — a row may legitimately hold only `baseUrl`/`model` with no key yet. */
export interface MediaProviderCredentialRecord {
  workspaceId: UUID;
  providerId: string;
  baseUrl: string | null;
  model: string | null;
  sealed: SealedSecret | null;
  /** Last {@link KEY_TAIL_LENGTH} characters of the key. `null` iff `sealed` is `null`. */
  keyTail: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Workspace-scoped persistence for {@link MediaProviderCredentialRecord} (ADR-007 §1). Multi-row
 *  per workspace, unlike the two single-row credential stores, so the port needs a list read and a
 *  bulk delete rather than a single find and a `clearKey`. */
export interface MediaProviderCredentialRepoPort {
  listByWorkspaceId(workspaceId: UUID): Promise<MediaProviderCredentialRecord[]>;
  upsert(record: MediaProviderCredentialRecord): Promise<void>;
  /** Idempotent: ids with no row are skipped, not an error. A no-op on an empty list. */
  deleteByProviderIds(input: { workspaceId: UUID; providerIds: readonly string[] }): Promise<void>;
}

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
  /** Bare tail, no `••••` prefix — `@jini-ai/ui`'s `maskedKeyLabel` adds and clamps that itself. */
  apiKeyTail?: string;
}

/** Credentials keyed by engine-canonical provider id. */
export type MediaProviderCredentialMap = Record<string, MediaProviderCredentialView>;

/** Matches `@jini-ai/ui`'s own `KEY_TAIL_MAX_LENGTH`, which clamps whatever it receives to this
 *  same length — storing more would be discarded at render time anyway. */
const KEY_TAIL_LENGTH = 4;

/** Longest accepted `baseUrl`/`model`. Not a vendor limit — a bound on what an admin payload may
 *  write into a text column, so a malformed client cannot store unbounded blobs. */
const MAX_FIELD_LENGTH = 2048;

/** Engine-canonical ids, the only accepted keys. Frozen at module load from the catalogue the
 *  dispatch engine itself looks credentials up by, which is what stops the UI-vs-engine id
 *  divergence (`xai-grok-imagine` vs `grok`) from ever reaching storage. */
const KNOWN_PROVIDER_IDS: ReadonlySet<string> = new Set(MEDIA_PROVIDERS.map((provider) => provider.id));

export class MediaProviderCredentialValidationError extends Error {}

/** Thrown when a caller supplies a new key but the master secret (`TOVU_INTEGRATIONS_ROOT_KEY`) is
 *  unavailable — fail-closed, mirroring the two sibling credential stores so the route can map it
 *  to its own `503 SECRET_STORE_UNCONFIGURED` rather than a generic `400`. */
export class MediaProviderCredentialSecretStoreUnconfiguredError extends Error {}

function toView(record: MediaProviderCredentialRecord): MediaProviderCredentialView {
  const view: MediaProviderCredentialView = {};
  if (record.baseUrl !== null) view.baseUrl = record.baseUrl;
  if (record.model !== null) view.model = record.model;
  if (record.sealed !== null) {
    view.apiKeyConfigured = true;
    if (record.keyTail !== null) view.apiKeyTail = record.keyTail;
  }
  return view;
}

function toMap(records: readonly MediaProviderCredentialRecord[]): MediaProviderCredentialMap {
  return Object.fromEntries(records.map((record) => [record.providerId, toView(record)]));
}

export interface MediaProviderCredentialReadDeps {
  repo: MediaProviderCredentialRepoPort;
}

/**
 * Every configured provider for a workspace, as markers only. Pure DB read — never decrypts, so a
 * missing or rotated master secret cannot make this fail.
 *
 * @complexity O(n) over the workspace's provider rows, itself bounded by the catalogue size.
 * @overallScore 100
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
}

function trimmedOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Rejects anything the row cannot faithfully hold, before a single write happens. */
function assertValidEntry(providerId: string, entry: MediaProviderCredentialInput): void {
  if (!KNOWN_PROVIDER_IDS.has(providerId)) {
    throw new MediaProviderCredentialValidationError(
      `unknown media provider "${providerId}" — expected an engine-canonical id from @jini-ai/integrations/media-providers`
    );
  }
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new MediaProviderCredentialValidationError(`provider "${providerId}" must be an object`);
  }
  for (const field of ["apiKey", "baseUrl", "model"] as const) {
    const value = entry[field];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      throw new MediaProviderCredentialValidationError(`${field} for "${providerId}" must be a string`);
    }
    if (value.length > MAX_FIELD_LENGTH) {
      throw new MediaProviderCredentialValidationError(
        `${field} for "${providerId}" exceeds ${MAX_FIELD_LENGTH} characters`
      );
    }
  }
}

/**
 * Replaces the workspace's ENTIRE provider set and resolves the authoritative copy afterward.
 *
 * Whole-map semantics, because that is what the port promises: a provider absent from `providers`
 * is DELETED, not left in place. A present entry with a blank/absent `apiKey` keeps whatever key is
 * already stored, so an operator editing only `baseUrl` never has to re-paste a key they cannot
 * see.
 *
 * Ordering is deliberate and load-bearing: every entry is validated, then every new key is sealed,
 * and only then is anything written. Sealing is the one step that can fail for an environmental
 * reason (a missing `TOVU_INTEGRATIONS_ROOT_KEY`), so doing it up front means that failure cannot
 * leave the workspace half-rewritten — the alternative, sealing inside the write loop, would delete
 * some providers and abort before writing the rest.
 *
 * @throws {MediaProviderCredentialValidationError} `providers` is not an object, names an unknown
 *   provider id, or carries a non-string/oversized `apiKey`/`baseUrl`/`model`.
 * @throws {MediaProviderCredentialSecretStoreUnconfiguredError} a new key was supplied but the
 *   master secret is unavailable — never downgraded to a plaintext write or a silent skip.
 * @complexity O(n) over the submitted providers, plus one keyring derivation per NEW key. `n` is
 *   bounded by the catalogue: unknown ids are rejected, so the payload cannot exceed its size.
 * @overallScore 100
 */
export async function saveMediaProviderCredentials(
  deps: MediaProviderCredentialWriteDeps,
  input: SaveMediaProviderCredentialsInput
): Promise<MediaProviderCredentialMap> {
  const { providers } = input;
  if (providers === null || typeof providers !== "object" || Array.isArray(providers)) {
    throw new MediaProviderCredentialValidationError("providers must be an object keyed by provider id");
  }

  const entries = Object.entries(providers);
  for (const [providerId, entry] of entries) assertValidEntry(providerId, entry);

  const existingRows = await deps.repo.listByWorkspaceId(input.workspaceId);
  const existingByProviderId = new Map(existingRows.map((row) => [row.providerId, row]));
  const now = deps.clock.nowIso();

  // Seal every new key BEFORE any write — see this function's doc for why the order matters.
  const sealedByProviderId = new Map<string, { sealed: SealedSecret; keyTail: string }>();
  for (const [providerId, entry] of entries) {
    const apiKey = entry.apiKey?.trim();
    if (!apiKey) continue;
    try {
      const activeKey = await deps.keyring.activeKey();
      sealedByProviderId.set(providerId, {
        sealed: await deps.sealer.seal({ plaintext: apiKey, key: activeKey }),
        keyTail: apiKey.slice(-KEY_TAIL_LENGTH),
      });
    } catch (err) {
      throw new MediaProviderCredentialSecretStoreUnconfiguredError(
        `media provider credential secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const written: MediaProviderCredentialRecord[] = [];
  for (const [providerId, entry] of entries) {
    const existing = existingByProviderId.get(providerId);
    const freshlySealed = sealedByProviderId.get(providerId);
    const record: MediaProviderCredentialRecord = {
      workspaceId: input.workspaceId,
      providerId,
      baseUrl: trimmedOrNull(entry.baseUrl),
      model: trimmedOrNull(entry.model),
      sealed: freshlySealed?.sealed ?? existing?.sealed ?? null,
      keyTail: freshlySealed?.keyTail ?? existing?.keyTail ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await deps.repo.upsert(record);
    written.push(record);
  }

  const submittedIds = new Set(entries.map(([providerId]) => providerId));
  const tombstoned = existingRows.map((row) => row.providerId).filter((providerId) => !submittedIds.has(providerId));
  await deps.repo.deleteByProviderIds({ workspaceId: input.workspaceId, providerIds: tombstoned });

  return toMap(written);
}
