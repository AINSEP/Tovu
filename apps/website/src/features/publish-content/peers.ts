import { buildPublishContentPeerAad, PUBLISH_CONTENT_PEER_AAD_VERSION } from "./peer-aad.js";
import { normalizePeerBaseUrl } from "./peer-url.js";
import type { KeyringPort, SealedSecret, SecretSealerPort } from "#src/features/webhooks/index";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 10.
 *
 * `publish_content_peers` CRUD — a named remote Tovu this workspace can push content to or pull it
 * from. A peer is a URL plus a sealed API key and nothing else (plan §0b: never a platform
 * identifier, so the same row works against Fly, Railway, Render, AWS or a bare VPS).
 *
 * TWO STRICTLY SEPARATED OPERATIONS, the same discipline
 * `features/deployments/publish-credentials/store.ts` documents and for the same reason:
 *
 * - {@link toPeerSummary} / {@link listPublishContentPeers} / {@link getPublishContentPeerSummary} —
 *   read model only. Never decrypts, never touches `sealer`/`keyring` at all, so neither can fail
 *   on a misconfigured root key. This is what every route response is built from.
 * - {@link resolvePeerCredential} — the ONLY function in this module that decrypts. Its one
 *   legitimate caller is the outbound transport driver (`peer-transport.ts`), server-side and
 *   human-gated behind `publish_content.apply`. It is named to say "decrypts" out loud so a future
 *   caller cannot reach for it the way a generically-named `getPeer` would invite.
 *
 * WHAT MAY LEAVE THE SERVER: {@link PublishContentPeerSummary} has no field capable of carrying
 * secret material — `masked` (a display hint derived from the key, never the key) and
 * `hasCredential` (a boolean) are the only credential-shaped fields that exist on it. The sealed
 * columns are not merely omitted from the read model; the read model has nowhere to put them.
 *
 * STORAGE SHAPE, and why it is the vendor-neutral one: the sealed bytes live in `content.db`'s own
 * `sealed_*` columns, wrapped under the install's root key (`KeyringPort`, an env var today —
 * `TOVU_INTEGRATIONS_ROOT_KEY` — with an OS-keychain adapter as the rule-of-two second). Nothing
 * here reaches for a platform secret store, so there is no `fly secrets` / AWS Secrets Manager /
 * SSM / Render env-group dependency to port. Confirmed by reading
 * `features/deployments/publish-credentials/store.ts` before copying it, per this task's brief.
 */

/** Thrown when a named peer does not exist in this workspace. */
export class PublishContentPeerNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishContentPeerNotFoundError";
  }
}

/** Thrown when operator-supplied peer input is unusable. `message` is operator-facing and never
 *  echoes a supplied credential. */
export class PublishContentPeerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishContentPeerValidationError";
  }
}

/** Thrown when a write would violate `publish_content_peers_workspace_label_unique`. */
export class PublishContentPeerDuplicateLabelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishContentPeerDuplicateLabelError";
  }
}

/** Thrown when `sealer.seal()`/`keyring.activeKey()` fails — fail-closed, never a plaintext write.
 *  Mirrors `PublishCredentialSecretStoreUnconfiguredError`. */
export class PublishContentPeerSecretStoreUnconfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishContentPeerSecretStoreUnconfiguredError";
  }
}

/** Thrown when a peer row exists but carries no sealed credential — a push/pull cannot proceed. */
export class PublishContentPeerCredentialMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublishContentPeerCredentialMissingError";
  }
}

/** A `publish_content_peers` row, decrypted-shape (`sealed` is the DB's opaque {@link SealedSecret};
 *  the raw API key only exists in memory after {@link resolvePeerCredential} opens it). */
export interface PublishContentPeerRecord {
  readonly workspaceId: string;
  readonly id: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly remoteWorkspaceId: string;
  readonly sealed: SealedSecret | null;
  /** Display-only hint derived from the key at seal time (see {@link maskApiKey}) — held in the
   *  clear deliberately, the same "public label, not secret material" reasoning
   *  `publishCredentialSets.accountLabel` documents. */
  readonly masked: string | null;
  /** The {@link buildPublishContentPeerAad} format version this row's ciphertext was sealed under. */
  readonly aadVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * The read model every peers route returns. FROZEN CONTRACT (Task 10's dispatch): `masked` and
 * `hasCredential` are the only credential-shaped fields that ever leave the server — no
 * `sealedCiphertext`, `sealedNonce`, `sealedKeyId` or `sealedAlg` in any response body, log line,
 * error message or report, ever. Enforced by construction: this type has no field capable of
 * carrying one.
 */
export interface PublishContentPeerSummary {
  readonly id: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly remoteWorkspaceId: string;
  readonly masked: string | null;
  readonly hasCredential: boolean;
}

/** Workspace-scoped persistence for {@link PublishContentPeerRecord} (ADR-007 §1). `insert`/`update`
 *  may reject on the `(workspace_id, label)` UNIQUE index; this module turns that driver error into
 *  {@link PublishContentPeerDuplicateLabelError} rather than propagating it raw. */
export interface PublishContentPeerRepoPort {
  insert(record: PublishContentPeerRecord): Promise<void>;
  /** Full-row replace by `(workspaceId, id)`. */
  update(record: PublishContentPeerRecord): Promise<void>;
  findById(input: { workspaceId: string; id: string }): Promise<PublishContentPeerRecord | null>;
  /** Every peer a workspace has saved. Inherently small — bounded by how many peers a human types
   *  into this one form, never by a caller-supplied N — so no pagination or cap, the same reasoning
   *  `PublishCredentialSetRepoPort.listByWorkspace` records. */
  listByWorkspace(input: { workspaceId: string }): Promise<PublishContentPeerRecord[]>;
  /** No-op (not an error) if no row exists — matches this feature's DELETE route contract. */
  delete(input: { workspaceId: string; id: string }): Promise<void>;
}

/** Read-side deps: NO sealer, NO keyring — see this file's header. */
export interface PublishContentPeerReadDeps {
  readonly repo: PublishContentPeerRepoPort;
}

/** Write-side deps. `sealer`/`keyring` are the shared ADR-058 instances every other credential table
 *  in this codebase uses (`RouteDeps.siteAssistantSecretSealer`/`siteAssistantSecretKeyring`). */
export interface PublishContentPeerWriteDeps extends PublishContentPeerReadDeps {
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
  readonly clock: { nowIso(): string };
  readonly idGen: { newId(): string };
}

/** How many trailing characters of an API key {@link maskApiKey} reveals. */
const MASK_VISIBLE_SUFFIX = 4;

/** Below this length a key reveals NOTHING — four characters of an eight-character key is half the
 *  secret, and this feature must never be the reason a short key becomes guessable. */
const MASK_MIN_KEY_LENGTH = 12;

/**
 * Builds the display-only hint stored in `masked`. Never reversible, never enough to authenticate
 * with: at most the last {@link MASK_VISIBLE_SUFFIX} characters, and nothing at all for a key too
 * short to spare them.
 *
 * @complexity O(1).
 * @example maskApiKey("tovu_live_abcdefgh1234"); // => "••••1234"
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length < MASK_MIN_KEY_LENGTH) return "••••";
  return `••••${apiKey.slice(-MASK_VISIBLE_SUFFIX)}`;
}

/**
 * The one projection from a stored row to what a route may return.
 *
 * @complexity O(1) — fixed-shape field mapping.
 */
export function toPeerSummary(record: PublishContentPeerRecord): PublishContentPeerSummary {
  return {
    id: record.id,
    label: record.label,
    baseUrl: record.baseUrl,
    remoteWorkspaceId: record.remoteWorkspaceId,
    masked: record.masked,
    hasCredential: record.sealed !== null,
  };
}

/** Trims and rejects a blank required string, with the field's own name in the message.
 *  @complexity O(n). */
function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PublishContentPeerValidationError(`'${field}' is required and must be a non-empty string`);
  }
  return value.trim();
}

/** Longest accepted `label`/`remoteWorkspaceId`/`apiKey` — a bound on what one operator-typed field
 *  can push into a row, so a paste accident cannot write an unbounded value. */
const MAX_FIELD_LENGTH = 512;

/** @complexity O(1). */
function requireBoundedField(value: unknown, field: string): string {
  const trimmed = requireNonEmpty(value, field);
  if (trimmed.length > MAX_FIELD_LENGTH) {
    throw new PublishContentPeerValidationError(`'${field}' must be at most ${MAX_FIELD_LENGTH} characters`);
  }
  return trimmed;
}

/** @complexity O(n) in the length of `raw`. */
function requireBaseUrl(raw: unknown): string {
  const trimmed = requireBoundedField(raw, "baseUrl");
  const result = normalizePeerBaseUrl(trimmed);
  if ("error" in result) throw new PublishContentPeerValidationError(result.error);
  return result.baseUrl;
}

/**
 * Wraps `sealer.seal()`/`keyring.activeKey()` failure into the fail-closed
 * {@link PublishContentPeerSecretStoreUnconfiguredError} contract — never falls through to a
 * plaintext write. The underlying error's message is carried through because it names the
 * MISCONFIGURATION (an unset root key), never the plaintext being sealed.
 *
 * @complexity O(1) plus one key derivation and one AEAD seal.
 */
async function sealApiKey(
  deps: Pick<PublishContentPeerWriteDeps, "sealer" | "keyring">,
  input: { workspaceId: string; id: string; apiKey: string }
): Promise<SealedSecret> {
  try {
    const activeKey = await deps.keyring.activeKey();
    const aad = buildPublishContentPeerAad({ workspaceId: input.workspaceId, id: input.id });
    return await deps.sealer.seal({ plaintext: input.apiKey, key: activeKey, aad });
  } catch (err) {
    throw new PublishContentPeerSecretStoreUnconfiguredError(
      `publish-content peer secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** True iff `err` is the underlying SQLite driver's "UNIQUE constraint failed" error — the same
 *  detection shape `publish-credentials/store.ts` already uses for the identical problem
 *  (better-sqlite3 has no typed constraint-violation error class).
 *  @complexity O(n) in the message length. */
function isUniqueLabelViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/i.test(err.message);
}

export interface CreatePeerInput {
  readonly workspaceId: string;
  readonly label: unknown;
  readonly baseUrl: unknown;
  readonly remoteWorkspaceId: unknown;
  readonly apiKey: unknown;
}

/**
 * Validates, seals and inserts a new peer. The row id is minted here (`deps.idGen`), never
 * caller-supplied — the AAD binds it, so a caller able to choose it could pre-compute an AAD.
 *
 * @returns The read model, never the record — a create response carries no more than a list row.
 * @throws {PublishContentPeerValidationError} on any unusable field.
 * @throws {PublishContentPeerDuplicateLabelError} when the label is already taken in this workspace.
 * @throws {PublishContentPeerSecretStoreUnconfiguredError} when the root key is unavailable.
 * @complexity O(1) — one seal and one insert.
 */
export async function createPublishContentPeer(
  deps: PublishContentPeerWriteDeps,
  input: CreatePeerInput
): Promise<PublishContentPeerSummary> {
  const label = requireBoundedField(input.label, "label");
  const baseUrl = requireBaseUrl(input.baseUrl);
  const remoteWorkspaceId = requireBoundedField(input.remoteWorkspaceId, "remoteWorkspaceId");
  const apiKey = requireBoundedField(input.apiKey, "apiKey");

  const id = deps.idGen.newId();
  const sealed = await sealApiKey(deps, { workspaceId: input.workspaceId, id, apiKey });
  const now = deps.clock.nowIso();

  const record: PublishContentPeerRecord = {
    workspaceId: input.workspaceId,
    id,
    label,
    baseUrl,
    remoteWorkspaceId,
    sealed,
    masked: maskApiKey(apiKey),
    aadVersion: PUBLISH_CONTENT_PEER_AAD_VERSION,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await deps.repo.insert(record);
  } catch (err) {
    if (isUniqueLabelViolation(err)) {
      throw new PublishContentPeerDuplicateLabelError(`a peer labelled '${label}' already exists in this workspace`);
    }
    throw err;
  }

  return toPeerSummary(record);
}

export interface UpdatePeerInput {
  readonly workspaceId: string;
  readonly id: string;
  /** Every field is optional: an absent key means "leave it alone", which is what makes a rename
   *  possible without re-typing the credential. An explicitly supplied `apiKey` is ALWAYS resealed
   *  as a fresh ciphertext — never a re-wrap of the stored one. */
  readonly label?: unknown;
  readonly baseUrl?: unknown;
  readonly remoteWorkspaceId?: unknown;
  readonly apiKey?: unknown;
}

/**
 * Applies a partial update to an existing peer.
 *
 * @throws {PublishContentPeerNotFoundError} when no row exists for `(workspaceId, id)`.
 * @complexity O(1) — one read, at most one seal, one update.
 */
export async function updatePublishContentPeer(
  deps: PublishContentPeerWriteDeps,
  input: UpdatePeerInput
): Promise<PublishContentPeerSummary> {
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) throw new PublishContentPeerNotFoundError(`peer '${input.id}' was not found`);

  const label = input.label === undefined ? existing.label : requireBoundedField(input.label, "label");
  const baseUrl = input.baseUrl === undefined ? existing.baseUrl : requireBaseUrl(input.baseUrl);
  const remoteWorkspaceId =
    input.remoteWorkspaceId === undefined
      ? existing.remoteWorkspaceId
      : requireBoundedField(input.remoteWorkspaceId, "remoteWorkspaceId");

  let sealed = existing.sealed;
  let masked = existing.masked;
  let aadVersion = existing.aadVersion;
  if (input.apiKey !== undefined) {
    const apiKey = requireBoundedField(input.apiKey, "apiKey");
    sealed = await sealApiKey(deps, { workspaceId: input.workspaceId, id: input.id, apiKey });
    masked = maskApiKey(apiKey);
    aadVersion = PUBLISH_CONTENT_PEER_AAD_VERSION;
  }

  const record: PublishContentPeerRecord = {
    ...existing,
    label,
    baseUrl,
    remoteWorkspaceId,
    sealed,
    masked,
    aadVersion,
    updatedAt: deps.clock.nowIso(),
  };

  try {
    await deps.repo.update(record);
  } catch (err) {
    if (isUniqueLabelViolation(err)) {
      throw new PublishContentPeerDuplicateLabelError(`a peer labelled '${label}' already exists in this workspace`);
    }
    throw err;
  }

  return toPeerSummary(record);
}

/**
 * Every peer in a workspace, as read models.
 * @complexity O(n) in the workspace's peer count (one repo read plus one projection each).
 */
export async function listPublishContentPeers(
  deps: PublishContentPeerReadDeps,
  input: { workspaceId: string }
): Promise<PublishContentPeerSummary[]> {
  const records = await deps.repo.listByWorkspace(input);
  return records.map(toPeerSummary);
}

/**
 * One peer's read model.
 * @returns `null` when no row exists — a route decides whether that is a 404.
 * @complexity O(1).
 */
export async function getPublishContentPeerSummary(
  deps: PublishContentPeerReadDeps,
  input: { workspaceId: string; id: string }
): Promise<PublishContentPeerSummary | null> {
  const record = await deps.repo.findById(input);
  return record ? toPeerSummary(record) : null;
}

/**
 * Idempotent delete — removing an already-absent peer is not an error.
 * @complexity O(1).
 */
export async function deletePublishContentPeer(
  deps: PublishContentPeerReadDeps,
  input: { workspaceId: string; id: string }
): Promise<void> {
  await deps.repo.delete(input);
}

/** What {@link resolvePeerCredential} hands the transport driver: everything needed to dial the
 *  peer, with the opened key. NEVER serialize this — see this file's header. */
export interface ResolvedPeerCredential {
  readonly id: string;
  readonly label: string;
  readonly baseUrl: string;
  readonly remoteWorkspaceId: string;
  /** The opened API key. In memory only, for the lifetime of one outbound request. */
  readonly apiKey: string;
}

/**
 * THE ONLY DECRYPTING FUNCTION IN THIS MODULE — see this file's header before adding a caller.
 *
 * @throws {PublishContentPeerNotFoundError} when no row exists.
 * @throws {PublishContentPeerCredentialMissingError} when the row carries no sealed credential.
 * @throws {PublishContentPeerSecretStoreUnconfiguredError} when the root key is unavailable or the
 * ciphertext fails auth-tag verification — a typed error rather than whatever raw error
 * `SecretSealerPort.open()` produced, so a boundary never renders a driver message.
 * @complexity O(1) — one read and one AEAD open.
 */
export async function resolvePeerCredential(
  deps: { repo: PublishContentPeerRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: string; id: string }
): Promise<ResolvedPeerCredential> {
  const record = await deps.repo.findById(input);
  if (!record) throw new PublishContentPeerNotFoundError(`peer '${input.id}' was not found`);
  if (!record.sealed) {
    throw new PublishContentPeerCredentialMissingError(
      `peer '${record.label}' has no saved credential; add one before pushing or pulling`
    );
  }

  const aad = buildPublishContentPeerAad({
    workspaceId: record.workspaceId,
    id: record.id,
    aadVersion: record.aadVersion,
  });
  let apiKey: string;
  try {
    apiKey = await deps.sealer.open({ sealed: record.sealed, aad });
  } catch (err) {
    throw new PublishContentPeerSecretStoreUnconfiguredError(
      `peer '${record.label}' credential could not be opened: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    id: record.id,
    label: record.label,
    baseUrl: record.baseUrl,
    remoteWorkspaceId: record.remoteWorkspaceId,
    apiKey,
  };
}

/**
 * In-memory {@link PublishContentPeerRepoPort} — the ADR-006 rule-of-two second adapter beside
 * `platform/db/sqlite/publish-content-peer-repo.sqlite.ts`, colocated here exactly as
 * `bundle-staging.ts` colocates `InMemoryPublishContentBundleRepo`.
 *
 * Enforces the `(workspaceId, label)` UNIQUE index in the SAME shape the SQLite driver reports it,
 * so a test exercising the duplicate-label path proves the real translation rather than a friendlier
 * in-memory one.
 */
export class InMemoryPublishContentPeerRepo implements PublishContentPeerRepoPort {
  private readonly rows = new Map<string, PublishContentPeerRecord>();

  private static key(workspaceId: string, id: string): string {
    return `${workspaceId}:${id}`;
  }

  /** @complexity O(n) in the stored row count (the uniqueness scan). */
  private assertLabelFree(record: PublishContentPeerRecord): void {
    for (const existing of this.rows.values()) {
      if (existing.workspaceId !== record.workspaceId) continue;
      if (existing.id === record.id) continue;
      if (existing.label === record.label) {
        throw new Error("UNIQUE constraint failed: publish_content_peers.workspace_id, publish_content_peers.label");
      }
    }
  }

  async insert(record: PublishContentPeerRecord): Promise<void> {
    this.assertLabelFree(record);
    this.rows.set(InMemoryPublishContentPeerRepo.key(record.workspaceId, record.id), record);
  }

  async update(record: PublishContentPeerRecord): Promise<void> {
    this.assertLabelFree(record);
    this.rows.set(InMemoryPublishContentPeerRepo.key(record.workspaceId, record.id), record);
  }

  async findById(input: { workspaceId: string; id: string }): Promise<PublishContentPeerRecord | null> {
    return this.rows.get(InMemoryPublishContentPeerRepo.key(input.workspaceId, input.id)) ?? null;
  }

  async listByWorkspace(input: { workspaceId: string }): Promise<PublishContentPeerRecord[]> {
    return Array.from(this.rows.values()).filter((row) => row.workspaceId === input.workspaceId);
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    this.rows.delete(InMemoryPublishContentPeerRepo.key(input.workspaceId, input.id));
  }
}

/**
 * Saves (or refreshes) the row for a destination this install is CONNECTED to — a site whose
 * publishing is authorized by the derived Site Token handshake rather than by a pasted key.
 *
 * `sealed: null` IS the marker, and it needs no migration or new column because it was previously
 * unreachable: {@link createPublishContentPeer} always seals, and {@link updatePublishContentPeer}
 * can only replace a sealed value, so no existing row can be null. `destination-credential.ts` is
 * the one reader of that distinction.
 *
 * Keyed on `baseUrl`, not on `label`: the address is what identifies a site, and re-connecting the
 * same site must update its row rather than collide with it. A label already taken by a DIFFERENT
 * site falls back to the full address, so connecting can never fail on a name the owner never chose
 * and would have to go and edit.
 *
 * @returns The read model, which by construction can carry no credential-shaped field.
 * @complexity O(n) in the workspace's peer count (one list scan), plus one write.
 */
export async function saveConnectedDestination(
  deps: PublishContentPeerReadDeps & { clock: { nowIso(): string }; idGen: { newId(): string } },
  input: { workspaceId: string; label: string; baseUrl: string; remoteWorkspaceId: string }
): Promise<PublishContentPeerSummary> {
  const baseUrl = requireBaseUrl(input.baseUrl);
  const remoteWorkspaceId = requireBoundedField(input.remoteWorkspaceId, "remoteWorkspaceId");
  const existing = await deps.repo.listByWorkspace({ workspaceId: input.workspaceId });
  const match = existing.find((row) => row.baseUrl === baseUrl) ?? null;

  const wanted = requireBoundedField(input.label, "label");
  const takenByAnother = existing.some((row) => row.label === wanted && row.id !== match?.id);
  const label = takenByAnother ? baseUrl : wanted;

  const now = deps.clock.nowIso();
  const record: PublishContentPeerRecord = {
    workspaceId: input.workspaceId,
    id: match?.id ?? deps.idGen.newId(),
    label,
    baseUrl,
    remoteWorkspaceId,
    // Never a key: a connected destination authenticates by proving possession of the Site Token
    // at publish time, so there is nothing to store between publishes.
    sealed: null,
    masked: null,
    aadVersion: PUBLISH_CONTENT_PEER_AAD_VERSION,
    createdAt: match?.createdAt ?? now,
    updatedAt: now,
  };

  if (match) await deps.repo.update(record);
  else await deps.repo.insert(record);
  return toPeerSummary(record);
}

/**
 * Removes the row for a connected destination, by address.
 *
 * Refuses to touch a row that carries a sealed key — disconnecting must never silently delete a
 * peer the owner configured by hand with a credential they would then have to find again.
 *
 * @returns `true` when a row was removed.
 * @complexity O(n) in the workspace's peer count, plus at most one delete.
 */
export async function removeConnectedDestination(
  deps: PublishContentPeerReadDeps,
  input: { workspaceId: string; baseUrl: string }
): Promise<boolean> {
  const rows = await deps.repo.listByWorkspace({ workspaceId: input.workspaceId });
  const match = rows.find((row) => row.baseUrl === input.baseUrl && row.sealed === null);
  if (!match) return false;
  await deps.repo.delete({ workspaceId: input.workspaceId, id: match.id });
  return true;
}
