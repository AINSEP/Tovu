import { MEDIA_PROVIDERS } from "@jini-ai/integrations/media-providers/catalog";
import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SealedSecret, SecretSealerPort } from "../webhooks/index.js";

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

/** Every write one whole-map replace performs, derived from the rows the replace itself just read. */
export interface MediaProviderCredentialReplacePlan {
  /** Rows to write, in submission order. Already merged against the rows the planner was handed. */
  upserts: readonly MediaProviderCredentialRecord[];
  /** Ids to delete — providers the payload omitted. May be empty. */
  tombstoneProviderIds: readonly string[];
}

/**
 * Turns the workspace's CURRENT rows into the writes that replace them.
 *
 * MUST be synchronous and free of I/O. That is the whole point: `replaceWorkspace` invokes this
 * between its own read and its own writes, inside an open transaction, so a planner that awaited
 * anything would hand the event loop back mid-transaction — which is precisely the defect this
 * signature exists to make unrepresentable (see {@link MediaProviderCredentialRepoPort.replaceWorkspace}).
 * The return type is not a promise, so an `async` planner cannot type-check.
 */
export type MediaProviderCredentialReplacePlanner = (
  existing: readonly MediaProviderCredentialRecord[]
) => MediaProviderCredentialReplacePlan;

/** Workspace-scoped persistence for {@link MediaProviderCredentialRecord} (ADR-007 §1). Multi-row
 *  per workspace, unlike the two single-row credential stores, so the port needs a list read and a
 *  bulk delete rather than a single find and a `clearKey`. */
export interface MediaProviderCredentialRepoPort {
  listByWorkspaceId(workspaceId: UUID): Promise<MediaProviderCredentialRecord[]>;
  upsert(record: MediaProviderCredentialRecord): Promise<void>;
  /** Idempotent: ids with no row are skipped, not an error. A no-op on an empty list. */
  deleteByProviderIds(input: { workspaceId: UUID; providerIds: readonly string[] }): Promise<void>;
  /**
   * READ-PLAN-WRITE for the whole workspace, as one atomic unit: reads the workspace's current
   * rows, calls `plan` with them, then applies that plan's upserts and tombstone deletes. Commits
   * iff every step succeeds; rolls back and rethrows if `plan` throws or any write fails.
   *
   * The read lives INSIDE the boundary on purpose. `saveMediaProviderCredentials` merges each
   * submitted entry against the stored row (an entry with no `apiKey` keeps the stored key, and
   * `createdAt` is preserved), so a read taken before the boundary opens can be stale by the time
   * the merge is written: a concurrent rotation landing in that window would be silently reverted
   * by a metadata-only save that re-wrote the key it had read a moment earlier.
   *
   * `plan` is synchronous by type, which is the second half of the fix — see
   * {@link MediaProviderCredentialReplacePlanner}. Everything that must await (sealing a new key)
   * happens before this method is called.
   *
   * Not reentrant — callers invoke this exactly once, at the outermost level of their own body.
   *
   * @returns the rows written, exactly as the plan supplied them.
   */
  replaceWorkspace(input: {
    workspaceId: UUID;
    plan: MediaProviderCredentialReplacePlanner;
  }): Promise<readonly MediaProviderCredentialRecord[]>;
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

/** Seals every entry's NEW `apiKey` (skips a blank/absent one — an operator editing only `baseUrl`
 *  never has to re-paste a key they cannot see). Runs before any write opens — see
 *  {@link saveMediaProviderCredentials}'s own doc for why the ordering matters. */
async function sealNewProviderKeys(
  deps: MediaProviderCredentialWriteDeps,
  entries: ReadonlyArray<[string, MediaProviderCredentialInput]>
): Promise<Map<string, { sealed: SealedSecret; keyTail: string }>> {
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
  return sealedByProviderId;
}

/** The `sealed`/`keyTail` pair is always both-null or both-set (the table's own CHECK) — resolved as
 *  ONE unit rather than field-by-field so neither can drift out of sync: a fresh seal wins, else the
 *  existing pair is kept whole, else there is none. */
function resolveSealedKeyPair(
  existing: MediaProviderCredentialRecord | undefined,
  freshlySealed: { sealed: SealedSecret; keyTail: string } | undefined
): { sealed: SealedSecret | null; keyTail: string | null } {
  if (freshlySealed) return freshlySealed;
  if (existing) return { sealed: existing.sealed, keyTail: existing.keyTail };
  return { sealed: null, keyTail: null };
}

/** Merges one submitted entry against its existing row (if any) into the row to write — an
 *  absent/blank `apiKey` never clears an existing sealed key (see
 *  {@link saveMediaProviderCredentials}'s own doc). */
function buildProviderUpsertRow(
  workspaceId: UUID,
  providerId: string,
  entry: MediaProviderCredentialInput,
  existing: MediaProviderCredentialRecord | undefined,
  freshlySealed: { sealed: SealedSecret; keyTail: string } | undefined,
  now: ISODateTime
): MediaProviderCredentialRecord {
  const { sealed, keyTail } = resolveSealedKeyPair(existing, freshlySealed);
  return {
    workspaceId,
    providerId,
    baseUrl: trimmedOrNull(entry.baseUrl),
    model: trimmedOrNull(entry.model),
    sealed,
    keyTail,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
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
 * Sealing up front is also what lets the merge itself be synchronous: this function hands
 * `replaceWorkspace` a plain function of the workspace's CURRENT rows, and the repo runs that read,
 * that merge, and every resulting write inside one transaction with no suspension point in between.
 * Reading the stored rows out here instead — the shape this function used to have — reintroduces a
 * window in which a concurrent rotation lands between the read and the write and is then reverted by
 * this call's own merge, because a metadata-only entry re-writes the sealed key it read.
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

  const now = deps.clock.nowIso();

  // Seal every new key BEFORE any write — see this function's doc for why the order matters, and
  // why this is the ONLY async step left before the transaction opens.
  const sealedByProviderId = await sealNewProviderKeys(deps, entries);

  const submittedIds = new Set(entries.map(([providerId]) => providerId));

  /** Merges the submitted payload against whatever rows the transaction just read. Synchronous and
   *  pure by contract — it runs inside the open transaction. */
  const plan: MediaProviderCredentialReplacePlanner = (existingRows) => {
    const existingByProviderId = new Map(existingRows.map((row) => [row.providerId, row]));
    const upserts = entries.map(([providerId, entry]) =>
      buildProviderUpsertRow(
        input.workspaceId,
        providerId,
        entry,
        existingByProviderId.get(providerId),
        sealedByProviderId.get(providerId),
        now
      )
    );
    return {
      upserts,
      tombstoneProviderIds: existingRows
        .map((row) => row.providerId)
        .filter((providerId) => !submittedIds.has(providerId)),
    };
  };

  return toMap(await deps.repo.replaceWorkspace({ workspaceId: input.workspaceId, plan }));
}
