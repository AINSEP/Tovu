import { CredentialInputError, CREDENTIAL_MESSAGES, assertCredentialFreeField, normalizeCredentialToken, type CredentialConnection } from '../../contracts/core/credential-token.js';
import type { Clock as ClockPort, UUID } from "@jini-ai/core/primitives";

import { isUniqueViolation } from "../../platform/db/kernel/dialect.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import { VaultError, type VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import { credentialVault, credentialScope, credentialHint } from "../vendor-credentials/vault-adapter.js";
import { buildSourceControlProvider, type LoadSourceControlProviders } from "./provider-registry.js";
import type {
  SourceControlConnectionInput,
  SourceControlCredentialSetRecord,
  SourceControlCredentialSetRepoPort,
  SourceControlCredentialSummary,
  SourceControlProviderId,
} from "./types.js";
import type { ObservabilityPort } from "../../platform/observability/index.js";

/** Source-control validation and inline identity probes remain feature policy. Jini owns
 * sealing, persistence, hints and defaults. Plain read models require neither keys nor opens. */

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

async function toSummary(record: SourceControlCredentialSetRecord): Promise<SourceControlCredentialSummary> {
  return { id: record.id, providerId: record.providerId, label: record.label, configured: true,
    tokenHint: record.tokenHint ?? null, isDefault: record.isDefault, accountLabel: record.accountLabel,
    createdAt: record.createdAt, updatedAt: record.updatedAt };
}
function vaultSummary({ summary }: { summary: VaultSummary }, _options = {}): SourceControlCredentialSummary {
  return { id: summary.id, providerId: summary.provider as SourceControlProviderId, label: summary.label,
    configured: true, tokenHint: credentialHint({ record: summary }), isDefault: summary.isDefault,
    accountLabel: summary.meta.accountLabel as string | null, createdAt: summary.createdAt, updatedAt: summary.updatedAt };
}
function vault(deps: SourceControlCredentialReadDeps & Partial<SourceControlCredentialWriteDeps>, _options = {}) {
  return credentialVault({ ...deps, sealer: deps.sealer!, storageError: () => new SourceControlCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage) });
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
    // Write-only callers may omit account discovery; production supplies its boot-bound loader.
    if (!deps.loadSourceControlProviders) return { accountLabel: null, connection };
    const built = await buildSourceControlProvider({
      load: deps.loadSourceControlProviders,
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
  return record ? toSummary(record) : null;
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
  return Promise.all(records.map(record => toSummary(record)));
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
  /** Optional account-label discovery for write-only clients; composition supplies the boot-bound providers. */
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
/** A token-only host can move without opening the secret. Bitbucket needs a new paired
 * connection when entering its group, so an envelope-only move cannot invent its username.
 * @throws SourceControlCredentialValidationError for unsupported/incompatible providers.
 * @complexity O(1) time/space; fixed provider catalog, no I/O. */
function preservedProvider({ raw, existing }: { raw: unknown; existing: SourceControlProviderId }, _options = {}): SourceControlProviderId {
  if (raw === undefined) return existing;
  const providerId = (raw as Record<string, unknown>).providerId;
  if (providerId === undefined) return existing;
  if (typeof providerId !== "string" || !isSourceControlProviderId(providerId)) {
    throw new SourceControlCredentialValidationError(`connection.providerId must be one of: ${[...PROVIDER_IDS].join(", ")}`);
  }
  if (providerId === "bitbucket" && existing !== providerId) {
    throw new SourceControlCredentialValidationError("moving to bitbucket requires a new token and username");
  }
  return providerId;
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
   *  this turns out to be the provider's FIRST saved connection; Jini owns atomic auto-defaulting. */
  isDefault?: unknown;
}

/** Validate and make the secret durable before probing; probe failures never undo a save. */
export async function createSourceControlCredential(
  deps: SourceControlCredentialWriteDeps,
  input: CreateSourceControlCredentialInput
): Promise<SourceControlCredentialSummary> {
  const label = validateLabel(input.label);
  const connection = validateConnection(input.connection);
  const isDefault = optionalBoolean(input.isDefault, "isDefault") === true;
  const id = deps.idGen.newId();
  const summary = await saveConnection({ deps, input: { ...credentialScope({ workspaceId: input.workspaceId, kind: "source-control", id }),
    id, provider: connection.providerId, label, expectedRevision: null, payload: { ...connection }, hintToken: connection.token,
    meta: { accountLabel: null }, isDefault } });
  return probeSavedConnection({ deps, summary, connection });
}

/** Conflict translation is label-specific; a CAS conflict is never reported as a duplicate. */
async function saveConnection({ deps, input }: { deps: SourceControlCredentialWriteDeps; input: Parameters<ReturnType<typeof vault>["put"]>[0] }, _options = {}): Promise<VaultSummary> {
  try { return await vault(deps).put(input); }
  catch (error) {
    const duplicate = isUniqueLabelViolation(error) || error instanceof VaultError && error.code === "conflict" &&
      (await deps.repo.listByProvider({ workspaceId: input.workspaceId, providerId: input.provider as SourceControlProviderId }))
        .some(row => row.id !== input.id && row.label === input.label);
    if (duplicate) throw new SourceControlCredentialDuplicateLabelError(`a '${input.provider}' credential labeled '${input.label}' already exists in this workspace`);
    throw error;
  }
}

async function probeSavedConnection({ deps, summary, connection }: { deps: SourceControlCredentialWriteDeps; summary: VaultSummary; connection: SourceControlConnectionInput }, _options = {}): Promise<SourceControlCredentialSummary> {
  const probe = await probeAccountLabel(deps, summary.workspaceId, connection.providerId, connection.token);
  try { if (probe.accountLabel !== null) assertPlainAccountLabel({ value: probe.accountLabel }); } catch { probe.accountLabel = null; }
  if (probe.accountLabel !== null) {
    // This is the saved revision, not a new read's revision: an old probe must not heal a rotation.
    try { await deps.repo.vault!.patchMeta({ workspaceId: summary.workspaceId, id: summary.id,
      expectedRevision: summary.revision, patch: { accountLabel: assertPlainAccountLabel({ value: probe.accountLabel }) }, updatedAt: summary.updatedAt }); }
    catch { /* A metadata failure does not undo the saved token. */ }
  }
  return { ...vaultSummary({ summary }), accountLabel: probe.accountLabel, connection: probe.connection };
}
function assertPlainAccountLabel({ value }: { value: string }, _options = {}): string {
  assertPlainField({ value, field: "accountLabel" });
  return value;
}

export interface UpdateSourceControlCredentialInput {
  workspaceId: UUID;
  id: UUID;
  /** Omitted = leave the label unchanged. */
  label?: unknown;
  /** Omitted = leave the stored connection (and its provider) untouched. */
  connection?: unknown;
  /** `true` selects the destination default. Omitted/`false` preserves a same-provider default;
   * a move uses the destination group's default/first-row rule. */
  isDefault?: unknown;
}

/** Omitted/blank tokens keep the envelope; explicit rotations reset and re-probe the label. */
export async function updateSourceControlCredential(
  deps: SourceControlCredentialWriteDeps,
  input: UpdateSourceControlCredentialInput
): Promise<SourceControlCredentialSummary> {
  const existing = await deps.repo.findById(input);
  if (!existing) throw new SourceControlCredentialNotFoundError(`no source control credential '${input.id}' in this workspace`);
  const label = input.label !== undefined ? validateLabel(input.label) : existing.label;
  const requestedDefault = optionalBoolean(input.isDefault, "isDefault");
  const row = await deps.repo.vault!.find(input);
  if (!row) throw new SourceControlCredentialNotFoundError(`no source control credential '${input.id}' in this workspace`);
  if (input.connection !== undefined && !isEmptyTokenPatch(input.connection)) {
    const connection = validateConnection(input.connection);
    const summary = await saveConnection({ deps, input: { ...credentialScope({ ...input, kind: "source-control" }), id: input.id,
      expectedRevision: row.revision, provider: connection.providerId, label, payload: { ...connection }, hintToken: connection.token,
      meta: { ...row.meta, accountLabel: null }, ...(requestedDefault === true ? { isDefault: true } : {}) } });
    return probeSavedConnection({ deps, summary, connection });
  }
  const provider = preservedProvider({ raw: input.connection, existing: existing.providerId });
  // Omitting payload retains ciphertext/hints without a key; Jini owns both groups' defaults.
  const summary = await saveConnection({ deps, input: { ...credentialScope({ ...input, kind: "source-control" }), id: input.id,
    expectedRevision: row.revision, provider, label,
    meta: { ...row.meta, accountLabel: provider === existing.providerId ? row.meta.accountLabel : null },
    ...(requestedDefault === true ? { isDefault: true } : {}) } });
  return { ...vaultSummary({ summary }), connection: "saved" };
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

/** Resolve exactly one indexed default through Jini's context-checked open. Genuine decrypt
 * failures stay typed: this runs in the daemon as well as the HTTP process. */
export async function resolveDefaultForSourceControl(
  deps: { repo: SourceControlCredentialSetRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID; providerId: SourceControlProviderId }
): Promise<{ id: UUID; label: string; connection: SourceControlConnectionInput } | null> {
  try {
    const resolved = await vault(deps).findDefault({ ...credentialScope({ workspaceId: input.workspaceId, kind: "source-control" }), provider: input.providerId });
    if (resolved && !resolved.payload) throw new SourceControlCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage);
    return resolved ? { id: resolved.summary.id, label: resolved.summary.label,
      connection: validateConnection({ ...resolved.payload, providerId: resolved.summary.provider }) } : null;
  } catch { throw new SourceControlCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage); }
}
