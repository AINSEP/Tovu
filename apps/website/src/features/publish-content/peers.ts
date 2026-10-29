import { nowIso, type Clock } from "@jini-ai/core/primitives";
import { isUniqueViolation } from "@jini-ai/db/kernel";
import { InMemoryVaultRepo, SecretsVaultService, VaultError, type VaultRepoPort, type VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import { credentialTokenHint } from "#src/contracts/core/credential-token";
import { byVaultLabel, createTovuVaultKinds } from "#src/platform/secrets/vault-kinds";
import { normalizePeerBaseUrl } from "./peer-url.js";
import type { KeyringPort, SealedSecret, SecretSealerPort } from "#src/features/webhooks/index";

/**
 * @file Task 10 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4 task 10.
 *
 * `publish-peer` vault CRUD — a named remote Tovu this workspace can push content to or pull it
 * from. A peer is a URL plus a sealed API key and nothing else (plan §0b: never a platform
 * identifier, so the same row works against any container host, cloud or a bare VPS).
 *
 * TWO STRICTLY SEPARATED OPERATIONS, the same discipline
 * `features/deployments/publish-credentials/store.ts` documents and for the same reason:
 *
 * - {@link toPeerSummary} / {@link listPublishContentPeers} / {@link getPublishContentPeerSummary} —
 *   read model only. Never decrypts, never touches `sealer`/`keyring` at all, so neither can fail
 *   on a misconfigured site key. This is what every route response is built from.
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
 * STORAGE SHAPE: Jini's vault owns persistence, JSON sealing and context-bound AAD. The site
 * key remains installation-owned; no vendor secret-store dependency is introduced here.
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

/** The existing peer record projected from the vault (`sealed` is the DB's opaque {@link SealedSecret};
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
  /** Compatibility version; vault AAD is owned by Jini. */
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
  readonly vault: VaultRepoPort;
  insert(record: PublishContentPeerRecord): Promise<void>;
  /** Full-row replace by `(workspaceId, id)`. */
  update(record: PublishContentPeerRecord): Promise<void>;
  findById(input: { workspaceId: string; id: string }): Promise<PublishContentPeerRecord | null>;
  /** Every peer a workspace has saved. Inherently small — bounded by how many peers a human types
   *  into this one form, never by a caller-supplied N — so no pagination or cap, the same reasoning
   *  `VendorCredentialSetRepoPort.listByWorkspace` records. */
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
  readonly clock: Clock;
  readonly idGen: { newId(): string };
}

/** Jini owns hint length policy; the feature keeps its existing display format. */
export function maskApiKey(apiKey: string): string {
  const hint = credentialTokenHint({ token: apiKey });
  return `••••${hint.last4 ?? ""}`;
}

const peerKinds = createTovuVaultKinds({ policy: {
  validateMeta: ({ meta }) => meta, legacyPublishCredential: () => undefined, tokenField: () => "apiKey",
} });
const peerScope = { kind: "publish-peer" as const, ownerKey: "tovu", principalId: null, provider: null };

/** Keep feature permissions at the calling route/tool; restrict this adapter to its own kind.
 * @complexity O(1); constructing a service performs no I/O.
 */
function peerVault({ repo, sealer, keyring, now }: {
  repo: PublishContentPeerRepoPort; sealer: SecretSealerPort; keyring?: KeyringPort; now?: () => string;
}, _options = {}): SecretsVaultService {
  const unavailable = async (): Promise<never> => { throw new Error("peer read cannot access keyring"); };
  return new SecretsVaultService({ repo: repo.vault, sealer,
    keyring: keyring ?? { activeKey: unavailable, derive: unavailable, deriveSigningSecret: unavailable },
    metaParsers: peerKinds.metaParsers, now: now ?? (() => new Date().toISOString()), newId: () => { throw new Error("peer ID must be supplied"); },
    authorize: async ({ context }) => {
      if (context.kind !== peerScope.kind || context.ownerKey !== peerScope.ownerKey || context.principalId !== null) throw new VaultError({ code: "context" });
    },
  });
}

/** Vault to the existing internal record; summaries never expose the envelope.
 * @complexity O(metadata size) validation, then fixed projection.
 */
function peerRecord({ record }: { record: VaultRecord }, _options = {}): PublishContentPeerRecord {
  const wrongKind = record.kind !== "publish-peer" || record.ownerKey !== "tovu";
  if (wrongKind || record.principalId !== null || record.provider !== null || record.binding !== null) throw new VaultError({ code: "context" });
  const meta = peerKinds.metaParsers["publish-peer"]({ meta: record.meta });
  return { workspaceId: record.workspaceId, id: record.id, label: record.label, baseUrl: meta.baseUrl as string,
    remoteWorkspaceId: meta.remoteWorkspaceId as string, sealed: record.sealed,
    masked: peerRecordHint({ record }),
    aadVersion: 1, createdAt: record.createdAt, updatedAt: record.updatedAt };
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
 * @throws {PublishContentPeerSecretStoreUnconfiguredError} when the site key is unavailable.
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
  const now = nowIso({ clock: deps.clock });
  try {
    await peerVault({ ...deps, now: () => now }).put({ ...peerScope, workspaceId: input.workspaceId, id,
      binding: null, expectedRevision: null, label, meta: { baseUrl, remoteWorkspaceId },
      payload: { apiKey }, hintToken: apiKey });
  } catch (err) {
    await rethrowPeerWriteError(deps, { err, workspaceId: input.workspaceId, label });
  }
  return { id, label, baseUrl, remoteWorkspaceId, masked: maskApiKey(apiKey), hasCredential: true };
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

  const now = nowIso({ clock: deps.clock });
  if (input.apiKey === undefined) {
    await updatePeerMetadata(deps, { record: { ...existing, label, baseUrl, remoteWorkspaceId, updatedAt: now } });
    return toPeerSummary({ ...existing, label, baseUrl, remoteWorkspaceId });
  }
  const apiKey = requireBoundedField(input.apiKey, "apiKey");
  const current = await deps.repo.vault.find({ workspaceId: input.workspaceId, id: input.id });
  if (!current) throw new PublishContentPeerNotFoundError(`peer '${input.id}' was not found`);
  try {
    await peerVault({ ...deps, now: () => now }).put({ ...peerScope, workspaceId: input.workspaceId, id: input.id,
      binding: null, expectedRevision: current.revision, label, meta: { ...current.meta, baseUrl, remoteWorkspaceId },
      payload: { apiKey }, hintToken: apiKey });
  } catch (err) {
    await rethrowPeerWriteError(deps, { err, workspaceId: input.workspaceId, label, excludeId: input.id });
  }
  return { id: input.id, label, baseUrl, remoteWorkspaceId, masked: maskApiKey(apiKey), hasCredential: true };
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
 * @throws {PublishContentPeerSecretStoreUnconfiguredError} when the site key is unavailable or the
 * ciphertext fails auth-tag verification — a typed error rather than whatever raw error
 * `SecretSealerPort.open()` produced, so a boundary never renders a driver message.
 * @complexity Two row reads and one AEAD open; no group scan.
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

  let apiKey: string;
  try {
    const opened = await peerVault(deps).get({ ...peerScope, ...input, binding: null });
    if (typeof opened?.payload?.apiKey !== "string") throw new VaultError({ code: "invalid-record" });
    apiKey = opened.payload.apiKey;
  } catch {
    // Raw crypto/driver errors can describe secrets; only the feature's safe error crosses out.
    throw new PublishContentPeerSecretStoreUnconfiguredError(`peer '${record.label}' credential could not be opened`);
  }

  return {
    id: record.id,
    label: record.label,
    baseUrl: record.baseUrl,
    remoteWorkspaceId: record.remoteWorkspaceId,
    apiKey,
  };
}

/** Thin compatibility facade: Jini owns storage, uniqueness, defaults and revision CAS.
 * Metadata-only connected destinations retain the nullable envelope marker.
 */
export class VaultPublishContentPeerRepo implements PublishContentPeerRepoPort {
  constructor({ vault }: { vault: VaultRepoPort }, _options = {}) { this.vault = vault; }
  readonly vault: VaultRepoPort;

  async insert(record: PublishContentPeerRecord): Promise<void> { await this.write({ record, insert: true }); }
  async update(record: PublishContentPeerRecord): Promise<void> { await this.write({ record, insert: false }); }

  /** Preserve opaque bytes for metadata edits; Jini guards the replacement revision.
   * @complexity O(metadata size), one read and one CAS write; only conflicts query labels.
   */
  private async write({ record, insert }: { record: PublishContentPeerRecord; insert: boolean }, _options = {}): Promise<void> {
    const existing = insert ? null : await this.vault.find(record);
    if (!insert && !existing) return;
    if (existing) peerRecord({ record: existing });
    const saved = replacementPeerRecord({ record, existing });
    try { await this.vault.put({ record: saved, expectedRevision: existing?.revision ?? null }); }
    catch (err) {
      if (await vaultLabelConflicts({ vault: this.vault, err, record })) {
        throw new Error("UNIQUE constraint failed: publish_content_peers.workspace_id, publish_content_peers.label");
      }
      throw err;
    }
  }
  async findById(input: { workspaceId: string; id: string }): Promise<PublishContentPeerRecord | null> {
    const record = await this.vault.find(input);
    return record ? peerRecord({ record }) : null;
  }
  async listByWorkspace(input: { workspaceId: string }): Promise<PublishContentPeerRecord[]> {
    // Label order, as before the vault (the label index drove the scan); the vault lists by id.
    return (await this.vault.list({ ...peerScope, ...input })).sort(byVaultLabel).map(record => peerRecord({ record }));
  }
  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const existing = await this.vault.find(input);
    if (!existing) return;
    peerRecord({ record: existing });
    await this.vault.delete({ ...input, expectedRevision: existing.revision });
  }
}

/** Same facade as SQL, backed by Jini's memory adapter rather than a second lifecycle. */
export class InMemoryPublishContentPeerRepo extends VaultPublishContentPeerRepo {
  constructor(_required = {}, _options = {}) { super({ vault: new InMemoryVaultRepo({}) }); }
}

/**
 * Saves (or refreshes) the row for a destination this install is CONNECTED to — a site whose
 * publishing is authorized by the derived site key handshake rather than by a pasted key.
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
 * **At most one connected row per workspace.** Connecting to a different address moves the
 * connection — the previous connected row is removed, not left beside the new one. This is not a
 * policy choice; it is what the authorisation layer already does. `publish-trust/connect.ts` writes
 * the grant through `provisioning.connect`, which merges by source installation id and so
 * "replaces this computer's own entry" on every connect, and `disconnectDestination` takes no
 * address because there is only ever one entry to remove. A second `sealed: null` row is therefore
 * not a second connection; it is a row describing an authorisation that no longer exists, and every
 * reader used to take whichever such row the repository listed first (sol review 2026-09-20, High
 * finding 4: the operator is shown "connected", and Publish silently targets the stale site).
 *
 * @returns The read model, which by construction can carry no credential-shaped field.
 * @complexity O(n) in the workspace's peer count (one list scan), plus one write and at most one
 * delete per superseded connection (at most one in practice, since this rule keeps it at one).
 */
/**
 * The one destination this install is CONNECTED to, or `null`.
 *
 * The single definition of "which connected row do we mean", so the three readers that ask —
 * `routes/publish-content/destination.ts`'s view, and `publish-content/tool-registrations.ts`'s
 * readiness and publish handlers — cannot drift apart or answer differently for the same rows.
 *
 * {@link saveConnectedDestination} keeps at most one connected row per workspace, so in practice
 * there is nothing to choose between. The tie-break exists for rows written before that rule
 * (sol review 2026-09-20, High finding 4, where every reader took whichever row the repository
 * happened to list first): this install holds exactly ONE grant, `provisioning.connect` replaces it
 * on every connect, so the only row that grant can possibly authorise is the most recently written
 * one. Picking by repository order could return a connection that no longer exists and publish
 * someone's content to the wrong site.
 *
 * A peer with a sealed key is deliberately NOT a candidate: it is a destination the owner
 * configured by hand, not a connection, and `destination.ts` must not report one as "connected"
 * with `hasCredential: false`.
 *
 * @complexity O(n) in the workspace's peer count.
 */
export function selectConnectedDestination(
  rows: readonly PublishContentPeerRecord[]
): PublishContentPeerRecord | null {
  let chosen: PublishContentPeerRecord | null = null;
  for (const row of rows) {
    if (row.sealed !== null) continue;
    if (chosen === null || row.updatedAt > chosen.updatedAt) chosen = row;
  }
  return chosen;
}

export async function saveConnectedDestination(
  deps: PublishContentPeerReadDeps & { clock: Clock; idGen: { newId(): string } },
  input: { workspaceId: string; label: string; baseUrl: string; remoteWorkspaceId: string }
): Promise<PublishContentPeerSummary> {
  const baseUrl = requireBaseUrl(input.baseUrl);
  const remoteWorkspaceId = requireBoundedField(input.remoteWorkspaceId, "remoteWorkspaceId");
  const existing = await deps.repo.listByWorkspace({ workspaceId: input.workspaceId });
  const match = existing.find((row) => row.baseUrl === baseUrl) ?? null;

  // Connecting to a different site MOVES the connection; it does not add a second one. See this
  // function's doc comment for why a second connected row cannot describe anything real. Only
  // `sealed === null` rows are superseded — a peer the owner configured by hand with a pasted key
  // is untouched, exactly as `removeConnectedDestination` refuses to delete one.
  const superseded = existing.filter((row) => row.sealed === null && row.baseUrl !== baseUrl);
  const supersededIds = new Set(superseded.map((row) => row.id));

  const wanted = requireBoundedField(input.label, "label");
  const takenByAnother = existing.some(
    (row) => row.label === wanted && row.id !== match?.id && !supersededIds.has(row.id)
  );
  const label = takenByAnother ? baseUrl : wanted;

  const now = nowIso({ clock: deps.clock });
  const record: PublishContentPeerRecord = {
    workspaceId: input.workspaceId,
    id: match?.id ?? deps.idGen.newId(),
    label,
    baseUrl,
    remoteWorkspaceId,
    // Never a key: a connected destination authenticates by proving possession of the site key
    // at publish time, so there is nothing to store between publishes.
    sealed: null,
    masked: null,
    aadVersion: 1,
    createdAt: match?.createdAt ?? now,
    updatedAt: now,
  };

  // Superseded rows go BEFORE the new one lands, deliberately. The grant has already been rewritten
  // for the new site by the time this runs, so if the write below fails the two possible end states
  // are "no connected row" (the owner is told to connect again — `connect.ts` makes clicking it
  // again explicitly safe) and "the stale row plus the new one", which is the state this whole rule
  // exists to prevent. Being briefly disconnected is truthful; publishing to the wrong site is not.
  for (const row of superseded) await deps.repo.delete({ workspaceId: input.workspaceId, id: row.id });

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

/** Read-only hint projection retains the legacy length threshold without opening the envelope. */
function peerRecordHint({ record }: { record: VaultRecord }, _options = {}): string | null {
  if (!record.sealed) return null;
  const last4 = record.tokenLength !== null && record.tokenLength >= 12 ? record.last4?.slice(-4) ?? "" : "";
  return `••••${last4}`;
}

/** The same vault-write failure policy governs create and credential replacement.
 * Recognises the `(workspace_id, label)` UNIQUE index rejecting a write, from any database
 * (`isUniqueViolation`, storage kernel: SQLite's message, Postgres SQLSTATE 23505).
 * @complexity O(n) in the message length, plus a workspace vault read for conflicts. */
async function rethrowPeerWriteError(
  { repo }: PublishContentPeerReadDeps,
  { err, workspaceId, label, excludeId }: { err: unknown; workspaceId: string; label: string; excludeId?: string },
): Promise<never> {
  if (isUniqueViolation(err)) throw new PublishContentPeerDuplicateLabelError(`a peer labelled '${label}' already exists in this workspace`);
  if (err instanceof VaultError && err.code === "conflict") {
    const rows = await repo.listByWorkspace({ workspaceId });
    if (rows.some(row => row.id !== excludeId && row.label === label)) throw new PublishContentPeerDuplicateLabelError(`a peer labelled '${label}' already exists in this workspace`);
  }
  if (err instanceof VaultError) throw err;
  throw new PublishContentPeerSecretStoreUnconfiguredError("publish-content peer secret store is unconfigured");
}

async function updatePeerMetadata({ repo }: PublishContentPeerReadDeps, { record }: { record: PublishContentPeerRecord }): Promise<void> {
  try { await repo.update(record); }
  catch (err) {
    if (isUniqueViolation(err)) throw new PublishContentPeerDuplicateLabelError(`a peer labelled '${record.label}' already exists in this workspace`);
    throw err;
  }
}

/** Preserve opaque envelope bytes and vault defaults when the feature edits metadata. */
function replacementPeerRecord({ record, existing }: { record: PublishContentPeerRecord; existing: VaultRecord | null }, _options = {}): VaultRecord {
  const meta = peerKinds.metaParsers["publish-peer"]({ meta: { ...existing?.meta, baseUrl: record.baseUrl, remoteWorkspaceId: record.remoteWorkspaceId } });
  return { ...peerScope, workspaceId: record.workspaceId, id: record.id, binding: null,
    label: record.label, meta, sealed: record.sealed, updatedAt: record.updatedAt,
    ...peerRevisionFields({ record, existing }), ...peerEnvelopeHint({ record, existing }) };
}

function peerRevisionFields({ record, existing }: { record: PublishContentPeerRecord; existing: VaultRecord | null }, _options = {}): Pick<VaultRecord, "isDefault" | "revision" | "createdAt"> {
  return { isDefault: existing?.isDefault ?? false, revision: (existing?.revision ?? 0) + 1, createdAt: existing?.createdAt ?? record.createdAt };
}

function peerEnvelopeHint({ record, existing }: { record: PublishContentPeerRecord; existing: VaultRecord | null }, _options = {}): Pick<VaultRecord, "last4" | "tokenLength"> {
  if (!record.sealed) return { last4: null, tokenLength: null };
  return { last4: existing?.last4 ?? null, tokenLength: existing?.tokenLength ?? null };
}

async function vaultLabelConflicts({ vault, err, record }: { vault: VaultRepoPort; err: unknown; record: PublishContentPeerRecord }, _options = {}): Promise<boolean> {
  return err instanceof VaultError && err.code === "conflict" &&
    (await vault.list({ ...peerScope, workspaceId: record.workspaceId })).some(row => row.id !== record.id && row.label === record.label);
}
