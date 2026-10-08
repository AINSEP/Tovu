import { CredentialInputError, CREDENTIAL_MESSAGES, assertCredentialFreeField, normalizeCredentialToken, credentialTokenHint, type CredentialTokenHint, type CredentialConnection } from '../../contracts/core/credential-token.js';
import { nowIso as clockNowIso } from "@jini-ai/core/primitives";
import type { Clock as ClockPort, ISODateTime, UUID } from "@jini-ai/core/primitives";

import { isUniqueViolation } from "../../platform/db/kernel/dialect.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import { buildSourceControlCredentialAad } from "./aad.js";
import { buildSourceControlProvider, type LoadSourceControlProviders } from "./provider-registry.js";
import type {
  SourceControlConnectionInput,
  SourceControlCredentialSetRecord,
  SourceControlCredentialSetRepoPort,
  SourceControlCredentialSummary,
  SourceControlProviderId,
} from "./types.js";
import type { ObservabilityPort } from "../../platform/observability/index.js";

/**
 * @file Validate-then-seal-then-write CRUD over `source_control_credential_sets`, structurally
 * mirroring `features/deployments/publish-credentials/store.ts` — see that file's own header for
 * the design this one copies. One deliberate divergence: there is no `resolveForX`/decrypt function
 * here. This feature connects an identity only (no commit history, sync, or git operation reads it
 * back yet — see `types.ts`'s own header), so nothing in this codebase needs the plaintext
 * `SourceControlConnectionInput` back out of a sealed row today. Adding a decrypt path with no
 * caller would be dead code; the day a git-operating feature needs one, it can be added the same
 * way `resolveForPublish`/`resolveDefaultForPublish` were added to the publish-credentials sibling,
 * against a real caller.
 *
 * {@link describeCredential}/{@link listSourceControlCredentials} — read model only, never touch
 * `sealer`/`keyring` at all, so neither can fail on a misconfigured site key.
 *
 * {@link createSourceControlCredential}/{@link updateSourceControlCredential}/
 * {@link deleteSourceControlCredential} — validate-then-write. `connection`, when supplied, is
 * ALWAYS resealed as a fresh ciphertext (never a re-wrap of the old one) under a fresh AAD bound to
 * that row's own `(workspaceId, providerId, id)` — see `./aad.ts`'s `buildSourceControlCredentialAad`.
 *
 * `isDefault` invariant: a provider's first-ever saved connection auto-defaults; `isDefault: true`
 * on create/update always wins; omitted/`false` never removes the CURRENT default without a
 * replacement — same contract `publish-credentials/store.ts` documents for its own write path.
 *
 * `accountLabel` (migration `0044`, 2026-08-16): {@link probeAccountLabel} runs INLINE, right here in
 * `create`/`update`, unlike `publish-credentials/store.ts`'s sibling column — a deliberate difference,
 * not an inconsistency. That module's create/update path is shared with an agent-facing tool
 * (`deployment_propose_custom_provider_credential`), so `static-publish/verify.ts`'s "never
 * agent-facing" network-probe boundary rules a probe out of that shared path entirely. Nothing under
 * this feature's own tool catalog (`tool-registrations.ts`) calls `createSourceControlCredential`/
 * `updateSourceControlCredential` — only the human-gated admin route does — so no such boundary
 * exists here to protect, and this table also has no existing verify concept
 * (`publish-credentials`'s sibling) for a save-time probe to defer to instead. Probing inline is
 * therefore both safe and the only way to satisfy "populate at save time, no extra human step."
 */

const MAX_LABEL_LENGTH = 200;
const PROVIDER_IDS: ReadonlySet<SourceControlProviderId> = new Set(["github", "gitlab", "bitbucket"]);

/** Type-predicate wrapper around `PROVIDER_IDS.has()` — `Set<T>.has()` alone does not narrow its
 *  argument's static type, so `validateConnection` below would otherwise see `providerId` as a
 *  plain `string` even after the runtime membership check. */
export function isSourceControlProviderId(value: string): value is SourceControlProviderId {
  return PROVIDER_IDS.has(value as SourceControlProviderId);
}

export class SourceControlCredentialValidationError extends Error {}

/** A `(workspaceId, providerId, label)` collision — the route maps this to `409 DUPLICATE_LABEL`. */
export class SourceControlCredentialDuplicateLabelError extends Error {}

/** Thrown when `sealer.seal()`/`keyring.activeKey()` fails while writing a connection — the
 *  realistic cause is a missing site key (`TOVU_SITE_KEY`), same fail-closed
 *  contract `PublishCredentialSecretStoreUnconfiguredError` documents for the sibling table. */
export class SourceControlCredentialSecretStoreUnconfiguredError extends Error {}

export class SourceControlCredentialNotFoundError extends Error {}

/** Owner 2026-10-07 amendment to historical never-decrypt comments below: an injected sealer
 * now opens server-side solely to derive a safe hint. Failure keeps metadata readable. */
async function toSummary(record: SourceControlCredentialSetRecord, sealer?: SecretSealerPort): Promise<SourceControlCredentialSummary> {
  let tokenHint: CredentialTokenHint | null = null;
  if (sealer) { try { tokenHint = credentialTokenHint({ token: (await decryptRecord(sealer, record)).token }); } catch { /* Keep metadata readable after site-key rotation. */ } }
  return {
    id: record.id,
    providerId: record.providerId,
    label: record.label,
    configured: true,
    tokenHint,
    isDefault: record.isDefault,
    accountLabel: record.accountLabel,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Best-effort "who does this token belong to" probe, run inline at save time — see this file's own
 * header for why THIS table's `create`/`update` may do this while `publish-credentials/store.ts`'s
 * may not. NEVER throws: no provider, a network failure, timeout, or non-2xx response degrades to
 * `null` (no account label learned) rather than failing the save.
 *
 * The host-specific read lives in the plugin that provides the host (`provider-module.ts`'s
 * `readAccountLabel`; the bundled `github` plugin reads `GET /user` -> `login`). A host no enabled
 * plugin provides (gitlab and bitbucket today) yields `null` with no request made.
 *
 * @complexity One registry load plus at most one bounded HTTP request.
 */
async function probeAccountLabel(deps: SourceControlCredentialWriteDeps, workspaceId: UUID, providerId: SourceControlProviderId, token: string): Promise<{ accountLabel: string | null; connection: CredentialConnection }> {
  let connection: CredentialConnection = 'saved';
  const fetchFn: typeof fetch = async (input, init) => {
    try {
      const response = await (deps.fetchFn ?? fetch)(input, init);
      connection = response.status === 401 || response.status === 403 ? 'auth' : response.ok ? 'connected' : 'unreachable';
      return response;
    } catch (err) {
      connection = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError') ? 'timeout' : 'unreachable';
      throw err;
    }
  };
  try {
    const built = await buildSourceControlProvider({
      ...(deps.loadSourceControlProviders ? { load: deps.loadSourceControlProviders } : {}),
      fetchFn,
      observability: deps.observability,
      workspaceId,
      providerId,
    });
    const accountLabel = built.ok ? await built.provider.readAccountLabel(token) : null;
    return { accountLabel, connection };
  } catch {
    return { accountLabel: null, connection };
  }
}

export interface SourceControlCredentialReadDeps {
  repo: SourceControlCredentialSetRepoPort;
  sealer?: SecretSealerPort;
}

/**
 * The read model for ONE credential set. Pure DB read — no sealer, no keyring, cannot fail on a
 * misconfigured site key. Returns `null` if no row exists for `(workspaceId, id)` (not an
 * error — the caller decides whether that is a 404).
 *
 * @complexity O(1) — one `findById` lookup.
 */
export async function describeCredential(
  deps: SourceControlCredentialReadDeps,
  input: { workspaceId: UUID; id: UUID }
): Promise<SourceControlCredentialSummary | null> {
  const record = await deps.repo.findById(input);
  return record ? toSummary(record, deps.sealer) : null;
}

/**
 * The read model for EVERY credential set a workspace has saved — what
 * `GET .../source-control/credentials` returns. Same "never decrypts" contract as
 * {@link describeCredential}.
 *
 * @complexity O(n) in the workspace's own (small) credential-set count. One repo read, one array
 *   map, no per-row I/O.
 */
export async function listSourceControlCredentials(
  deps: SourceControlCredentialReadDeps,
  input: { workspaceId: UUID }
): Promise<SourceControlCredentialSummary[]> {
  const records = await deps.repo.listByWorkspace(input);
  return Promise.all(records.map(record => toSummary(record, deps.sealer)));
}

export interface SourceControlCredentialWriteDeps extends SourceControlCredentialReadDeps {
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
  idGen: { newId(): string };
  /** Injected by tests; defaults to global `fetch`. Used only by {@link probeAccountLabel}. */
  fetchFn?: typeof fetch;
  /** `RouteDeps.observability`: the identity probe is one outbound span. */
  observability?: ObservabilityPort;
  /** This workspace's git-host providers; the installed, enabled Agent Plugins when omitted. */
  loadSourceControlProviders?: LoadSourceControlProviders;
}

/** Narrows and validates a caller-supplied `label`. Never throws a raw `TypeError` — every
 *  rejection is a {@link SourceControlCredentialValidationError} the route layer can map to its own
 *  `400`. */
function validateLabel(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new SourceControlCredentialValidationError("label must be a non-empty string");
  }
  if (raw.length > MAX_LABEL_LENGTH) {
    throw new SourceControlCredentialValidationError(`label must be ${MAX_LABEL_LENGTH} characters or fewer`);
  }
  assertPlainField({ value: raw, field: "label" });
  return raw;
}

function requireNonEmptyString(raw: unknown, field: string, providerId: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new SourceControlCredentialValidationError(`'${field}' (non-empty string) is required for provider '${providerId}'`);
  }
  return raw;
}

/** Narrows a caller-supplied `isDefault`. `undefined` means "no default change requested"; any
 *  other non-boolean value is rejected rather than coerced. */
function optionalBoolean(raw: unknown, field: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "boolean") {
    throw new SourceControlCredentialValidationError(`'${field}' must be a boolean when provided`);
  }
  return raw;
}

/**
 * Validates a caller-supplied `connection` against its own provider's required shape. Never throws
 * a raw shape error — every rejection is a {@link SourceControlCredentialValidationError}.
 *
 * @complexity O(1) — fixed-shape field reads, no iteration.
 */
function isEmptyTokenPatch(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const token = (raw as Record<string, unknown>).token;
  return token === '' || token === undefined;
}
function normalizeStoredToken({ value }: { value: unknown }): string {
  try { return normalizeCredentialToken({ value }); }
  catch (err) { if (err instanceof CredentialInputError) throw new SourceControlCredentialValidationError(err.message); throw err; }
}
function assertPlainField(required: { value: string; field: string }): void {
  try { assertCredentialFreeField(required); }
  catch (err) { if (err instanceof CredentialInputError) throw new SourceControlCredentialValidationError(err.message); throw err; }
}

function validateConnection(raw: unknown): SourceControlConnectionInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SourceControlCredentialValidationError("connection must be an object");
  }
  const value = raw as Record<string, unknown>;
  const providerId = value.providerId;
  if (typeof providerId !== "string" || !isSourceControlProviderId(providerId)) {
    throw new SourceControlCredentialValidationError(`connection.providerId must be one of: ${[...PROVIDER_IDS].join(", ")}`);
  }

  const token = normalizeStoredToken({ value: value.token });
  if (providerId !== "bitbucket") return { providerId, token };

  // Bitbucket authenticates the (token, username) pair, not the token alone — see `types.ts`'s
  // `BitbucketSourceControlConnectionInput` doc.
  const username = requireNonEmptyString(value.username, "username", providerId);
  assertPlainField({ value: username, field: "username" });
  return { providerId, token, username };
}

/** Wraps `sealer.seal()`/`keyring.activeKey()` failure into the fail-closed
 *  {@link SourceControlCredentialSecretStoreUnconfiguredError} contract — never falls through to a
 *  plaintext write. */
async function sealConnection(
  deps: SourceControlCredentialWriteDeps,
  input: { workspaceId: UUID; providerId: SourceControlProviderId; id: UUID; connection: SourceControlConnectionInput }
) {
  try {
    const activeKey = await deps.keyring.activeKey();
    const aad = buildSourceControlCredentialAad({ workspaceId: input.workspaceId, providerId: input.providerId, id: input.id });
    return await deps.sealer.seal({ plaintext: JSON.stringify(input.connection), key: activeKey, aad });
  } catch (err) {
    throw new SourceControlCredentialSecretStoreUnconfiguredError(
      CREDENTIAL_MESSAGES.storage
    );
  }
}

/** True iff `err` is the label's UNIQUE `(workspace_id, provider_id, label)` index rejecting a
 *  duplicate, on any database (`isUniqueViolation`, storage kernel: SQLite's code/message, Postgres
 *  SQLSTATE 23505). */
export function isUniqueLabelViolation(err: unknown): boolean {
  return isUniqueViolation(err);
}

export interface CreateSourceControlCredentialInput {
  workspaceId: UUID;
  label: unknown;
  connection: unknown;
  /** `true` makes this the provider's default connection. Omitted/`false` still auto-defaults if
   *  this turns out to be the provider's FIRST saved connection — see {@link decideCreateDefault}. */
  isDefault?: unknown;
}

/**
 * Decides whether a newly-created row should be the group's default: always `true` for a
 * provider's first-ever saved connection (a saved connection that can never resolve because
 * nothing is marked default would be a silently-broken feature, not a safe default), otherwise
 * exactly the caller's own request.
 *
 * @complexity O(1) — one length check.
 */
function decideCreateDefault(existingForProvider: readonly unknown[], requested: boolean | undefined): boolean {
  return existingForProvider.length === 0 || requested === true;
}

/**
 * Validates, seals, and inserts a new credential set. `id` is minted here (`deps.idGen`), not
 * caller-supplied.
 *
 * @throws {SourceControlCredentialValidationError} `label`/`connection`/`isDefault` fails shape
 *   validation.
 * @throws {SourceControlCredentialDuplicateLabelError} `(workspaceId, providerId, label)` already
 *   exists.
 * @throws {SourceControlCredentialSecretStoreUnconfiguredError} The site key is unavailable.
 * @complexity O(n) in the provider's own (small) existing-connection count, to decide default
 *   auto-assignment, plus one keyring derivation, one seal, and one insert (which may itself throw
 *   on the UNIQUE index, translated here rather than propagated raw).
 */
export async function createSourceControlCredential(
  deps: SourceControlCredentialWriteDeps,
  input: CreateSourceControlCredentialInput
): Promise<SourceControlCredentialSummary> {
  const label = validateLabel(input.label);
  const connection = validateConnection(input.connection);
  const requestedDefault = optionalBoolean(input.isDefault, "isDefault");
  const id = deps.idGen.newId();
  const now = clockNowIso({ clock: deps.clock });

  const existingForProvider = await deps.repo.listByProvider({ workspaceId: input.workspaceId, providerId: connection.providerId });
  const isDefault = decideCreateDefault(existingForProvider, requestedDefault);

  const sealed = await sealConnection(deps, { workspaceId: input.workspaceId, providerId: connection.providerId, id, connection });
  // Best-effort — see probeAccountLabel's own doc. Run against the SAME plaintext token about to be
  // sealed, before it leaves this function's scope; never throws, degrades to null.
  // Owner 2026-10-07: make the secret durable first; a failed probe must never undo a save.
  const accountLabel = null;
  const record: SourceControlCredentialSetRecord = {
    workspaceId: input.workspaceId,
    id,
    providerId: connection.providerId,
    label,
    sealed,
    isDefault,
    accountLabel,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await deps.repo.insert(record);
  } catch (err) {
    if (isUniqueLabelViolation(err)) {
      throw new SourceControlCredentialDuplicateLabelError(`a '${connection.providerId}' credential labeled '${label}' already exists in this workspace`);
    }
    throw err;
  }
  const probe = await probeAccountLabel(deps, input.workspaceId, connection.providerId, connection.token);
  const probedRecord = { ...record, accountLabel: probe.accountLabel };
  if (probe.accountLabel !== null) {
    try { await deps.repo.updateAccountLabel?.({ workspaceId: input.workspaceId, id, accountLabel: probe.accountLabel, expectedSealed: record.sealed }); } catch { /* A metadata failure does not undo the saved token. */ }
  }
  return { ...await toSummary(probedRecord, deps.sealer), connection: probe.connection };
}

export interface UpdateSourceControlCredentialInput {
  workspaceId: UUID;
  id: UUID;
  /** Omitted = leave the label unchanged. */
  label?: unknown;
  /** Omitted = leave the stored connection (and its provider) untouched. */
  connection?: unknown;
  /** `true` makes this the default connection for its (possibly new) provider, clearing any
   *  previous default in the same repo call. Omitted/`false` leaves default status UNCHANGED. */
  isDefault?: unknown;
}

/**
 * Validate-then-write for an existing credential set.
 *
 * @throws {SourceControlCredentialNotFoundError} No row exists for `(workspaceId, id)`.
 * @throws {SourceControlCredentialValidationError} A supplied `label`/`connection`/`isDefault`
 *   fails validation.
 * @throws {SourceControlCredentialDuplicateLabelError} The (possibly renamed) `(providerId, label)`
 *   collides with a different row.
 * @throws {SourceControlCredentialSecretStoreUnconfiguredError} A new `connection` was supplied but
 *   the site key is unavailable.
 * @complexity O(1) — one read, at most one seal, one update.
 */
export async function updateSourceControlCredential(
  deps: SourceControlCredentialWriteDeps,
  input: UpdateSourceControlCredentialInput
): Promise<SourceControlCredentialSummary> {
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) {
    throw new SourceControlCredentialNotFoundError(`no source control credential '${input.id}' in this workspace`);
  }

  const label = input.label !== undefined ? validateLabel(input.label) : existing.label;
  const requestedDefault = optionalBoolean(input.isDefault, "isDefault");
  const now: ISODateTime = clockNowIso({ clock: deps.clock });

  let providerId = existing.providerId;
  let sealed = existing.sealed;
  // Re-probed (never carried over) whenever a NEW connection is resealed — same "a stale label is
  // worse than none once the token has changed" reasoning `publish-credentials/store.ts` documents
  // for its own sibling column, just resolved here by an immediate re-probe instead of a later heal.
  let accountLabel = existing.accountLabel;
  let probeConnection: CredentialConnection = "saved";
  let changedConnection: SourceControlConnectionInput | undefined;
  if (input.connection !== undefined && !isEmptyTokenPatch(input.connection)) {
    const connection = validateConnection(input.connection);
    providerId = connection.providerId;
    sealed = await sealConnection(deps, { workspaceId: input.workspaceId, providerId, id: input.id, connection });
    changedConnection = connection;
    accountLabel = null;
  }

  const record: SourceControlCredentialSetRecord = {
    workspaceId: input.workspaceId,
    id: input.id,
    providerId,
    label,
    sealed,
    isDefault: requestedDefault === true ? true : existing.isDefault,
    accountLabel,
    createdAt: existing.createdAt,
    updatedAt: now,
  };

  try {
    await deps.repo.update(record);
  } catch (err) {
    if (isUniqueLabelViolation(err)) {
      throw new SourceControlCredentialDuplicateLabelError(`a '${providerId}' credential labeled '${label}' already exists in this workspace`);
    }
    throw err;
  }
  let probedRecord = record;
  if (changedConnection) {
    const probe = await probeAccountLabel(deps, input.workspaceId, changedConnection.providerId, changedConnection.token);
    probedRecord = { ...record, accountLabel: probe.accountLabel };
    probeConnection = probe.connection;
    if (probe.accountLabel !== null) {
      try { await deps.repo.updateAccountLabel?.({ workspaceId: input.workspaceId, id: input.id, accountLabel: probe.accountLabel, expectedSealed: record.sealed }); } catch { /* A metadata failure does not undo the saved token. */ }
    }
  }
  return { ...await toSummary(probedRecord, deps.sealer), connection: probeConnection };
}

/**
 * Deletes a credential set. No-op (not an error) if no row exists for `(workspaceId, id)` — matches
 * `SourceControlCredentialSetRepoPort.delete`'s own idempotent contract and this feature's `DELETE`
 * route's documented 204-always behavior. If the deleted row was its provider's default,
 * `SourceControlCredentialSetRepoPort.delete` itself promotes the group's next candidate.
 *
 * @complexity O(1) at this layer (the repo's own promotion work is O(n) in the small provider
 *   group).
 */
export async function deleteSourceControlCredential(deps: SourceControlCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<void> {
  await deps.repo.delete(input);
}

/** Shared decrypt step for {@link resolveDefaultForSourceControl} — the exact same AAD-derive-then-
 *  open-then-parse sequence `publish-credentials/store.ts`'s own `decryptRecord` uses for its table.
 *  Kept local rather than imported cross-feature — this table's AAD format is this file's own concern
 *  (`aad.ts`'s header).
 *
 *  Wraps ANY failure (bad AAD, tampered ciphertext, wrong key, or — the realistic one — a missing
 *  `TOVU_SITE_KEY` surfacing as a raw `KeyringPort` error) into the SAME typed
 *  {@link SourceControlCredentialSecretStoreUnconfiguredError} {@link sealConnection} already throws
 *  for the write side, rather than letting a raw `Error` escape — mirrors `publish-credentials/
 *  store.ts`'s own `decryptRecord` fix (2026-08-16) byte-for-byte, for the identical reason.
 *
 *  Found live (2026-08-16): before this wrap existed, a raw `Error` from this exact call reached
 *  `commit-site.ts`'s `commitSiteToSourceControl` uncaught — that function's own doc claims "Never
 *  throws", but the call site had no try/catch at all, so a genuine decrypt failure broke that
 *  contract as an escaping rejection. Worse than the publish-credentials sibling's version of this
 *  bug: this feature's only caller runs inside `agent-daemon-server.ts`, a separate OS process with no
 *  process-level `unhandledRejection` guard of its own and no restart supervisor, so the escaping
 *  rejection would have taken the WHOLE daemon process down, not just answered one request with an
 *  error. */
async function decryptRecord(sealer: SecretSealerPort, record: SourceControlCredentialSetRecord): Promise<SourceControlConnectionInput> {
  const aad = buildSourceControlCredentialAad({ workspaceId: record.workspaceId, providerId: record.providerId, id: record.id });
  try {
    const plaintext = await sealer.open({ sealed: record.sealed }, { aad });
    return JSON.parse(plaintext) as SourceControlConnectionInput;
  } catch (err) {
    throw new SourceControlCredentialSecretStoreUnconfiguredError(
      CREDENTIAL_MESSAGES.storage
    );
  }
}

/**
 * The ONLY decrypting read in this module — added for this table's first real git-operating caller
 * (`tool-registrations.ts`'s `source_control_execute_commit`), per this file's own header: "the day a
 * git-operating feature needs one, it can be added the same way `resolveForPublish`/
 * `resolveDefaultForPublish` were added." Mirrors `resolveDefaultForPublish` exactly: resolves the
 * DEFAULT credential set for `(workspaceId, providerId)`, since a commit call names a provider it wants
 * to push to, never a specific saved connection's id — same reasoning `resolveDefaultForPublish`'s own
 * doc gives for why no id-specific sibling exists on that side either.
 *
 * `resolveForSourceControl` (an id-specific sibling, mirroring `resolveForPublish`) is deliberately NOT
 * added alongside this — nothing in this feature's tool catalog resolves a specific, non-default
 * credential set, and adding an unused decrypt path would be exactly the "dead code with no caller"
 * this file's header already warns against.
 *
 * Same "no such row" (`null`, a normal outcome) vs. genuine decrypt failure (thrown, a tampered row or
 * missing site key) distinction {@link resolveDefaultForPublish} documents for its own contract.
 *
 * @throws {SourceControlCredentialSecretStoreUnconfiguredError} `decryptRecord` failed — a
 *   tampered/corrupt row or (the realistic cause) a missing site key. See that function's own
 *   doc for why this is a typed error rather than whatever raw error `SecretSealerPort.open()`/
 *   `KeyringPort` produced.
 * @complexity O(1) — one repo read, one decrypt, one `JSON.parse`.
 */
export async function resolveDefaultForSourceControl(
  deps: { repo: SourceControlCredentialSetRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID; providerId: SourceControlProviderId }
): Promise<{ id: UUID; label: string; connection: SourceControlConnectionInput } | null> {
  const record = await deps.repo.findDefaultByProvider(input);
  if (!record) return null;
  const connection = await decryptRecord(deps.sealer, record);
  return { id: record.id, label: record.label, connection };
}
