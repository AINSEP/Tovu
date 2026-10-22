import { CredentialInputError, CREDENTIAL_MESSAGES, assertCredentialFreeField, normalizeCredentialToken, type CredentialConnection } from '../../contracts/core/credential-token.js';
import type { Clock as ClockPort, UUID } from "@jini-ai/core/primitives";

import { isUniqueViolation } from "../../platform/db/kernel/dialect.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import { VaultError, type VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import { credentialVault, credentialScope, credentialHint } from "../vendor-credentials/vault-adapter.js";
import { buildSourceControlProvider, type LoadSourceControlProviders, type SourceControlProviderRegistry, type SourceControlProviderDescriptor } from "./provider-registry.js";
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
 * `readAccountLabel`; each provider owns its account identity read). A host no enabled
 * plugin provides yields `null` with no request made.
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
  /** Loaded provider declarations govern admission and optional account-label discovery. */
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

/** Blank/omitted canonical tokens preserve the envelope after connection-shape validation. */
function isEmptyTokenPatch({ value }: { value: Record<string, unknown> }, _options = {}): boolean {
  const token = value.token;
  return token === '' || token === undefined;
}

/** Reject malformed connection shapes before either rotation or envelope preservation. */
function connectionObject({ raw }: { raw: unknown }, _options = {}): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SourceControlCredentialValidationError('connection must be an object');
  }
  return raw as Record<string, unknown>;
}

/** Forms and vault payloads use `token`; accept a declared form name at the store boundary too.
 * An explicitly supplied canonical value takes precedence, including blank/invalid values. */
function canonicalConnection({ value, descriptor }: { value: Record<string, unknown>; descriptor?: SourceControlProviderDescriptor }, _options = {}): Record<string, unknown> {
  if (value.token !== undefined) return value;
  const tokenField = descriptor?.credential?.tokenField ?? 'token';
  return { ...value, token: value[tokenField] };
}

/** Normalize alternate form names before deciding whether this is a rotation. Ordinary metadata
 * patches and canonical-token patches need no registry lookup, keeping opaque saved rows editable.
 * @complexity O(k) input keys plus at most one registry load for provider-specific fields. */
async function normalizeConnectionPatch({ raw, existing, registry }: {
  raw: unknown; existing: SourceControlProviderId; registry: () => Promise<SourceControlProviderRegistry>;
}, _options = {}): Promise<Record<string, unknown> | undefined> {
  if (raw === undefined) return undefined;
  const value = connectionObject({ raw });
  if (value.token !== undefined || Object.keys(value).every(key => key === 'providerId' || key === 'token')) return value;
  const providerId = value.providerId ?? existing;
  const loaded = await registry();
  const descriptor = typeof providerId === 'string' ? loaded.get(providerId)?.descriptor : undefined;
  return canonicalConnection({ value, descriptor });
}
/** A token-only host can move without opening the secret. Entering a host with required
 * paired fields needs a new connection; an envelope-only move cannot invent those fields.
 * Saved, unlisted ids may keep their envelope and metadata without loading plugin code. */
async function preservedProvider({ raw, existing, registry }: {
  raw: unknown; existing: SourceControlProviderId; registry: () => Promise<SourceControlProviderRegistry>;
}, _options = {}): Promise<SourceControlProviderId> {
  if (raw === undefined) return existing;
  const providerId = (raw as Record<string, unknown>).providerId;
  if (providerId === undefined || providerId === existing) return existing;
  const descriptor = requireProvider({ providerId, registry: await registry() });
  const paired = descriptor.credential?.fields.find(field => field.required && field.name !== descriptor.credential!.tokenField);
  if (paired) throw new SourceControlCredentialValidationError(`moving to ${descriptor.id} requires a new token and ${paired.name}`);
  return descriptor.id;
}

/** Only loaded providers admit new connections; stored ids are never checked against this list. */
function requireProvider({ providerId, registry }: { providerId: unknown; registry: SourceControlProviderRegistry }, _options = {}): SourceControlProviderDescriptor {
  const loaded = typeof providerId === 'string' ? registry.get(providerId) : undefined;
  if (!loaded) throw new SourceControlCredentialValidationError(`connection.providerId must be one of: ${registry.list().map(provider => provider.descriptor.id).join(', ')}`);
  return loaded.descriptor;
}

/** Write-only callers without a provider port cannot introduce a new credential/provider. */
async function credentialRegistry({ deps, workspaceId }: { deps: SourceControlCredentialWriteDeps; workspaceId: UUID }, _options = {}): Promise<SourceControlProviderRegistry> {
  if (!deps.loadSourceControlProviders) return { list: () => [], get: () => undefined, refusals: [] };
  return deps.loadSourceControlProviders(workspaceId);
}

function normalizeStoredToken({ value }: { value: unknown }): string {
  try { return normalizeCredentialToken({ value }); }
  catch (err) { if (err instanceof CredentialInputError) throw new SourceControlCredentialValidationError(err.message); throw err; }
}
function assertPlainField(required: { value: string; field: string }): void {
  try { assertCredentialFreeField(required); }
  catch (err) { if (err instanceof CredentialInputError) throw new SourceControlCredentialValidationError(err.message); throw err; }
}

/** Validate declared fields before sealing. Authentication pairs stay in one ciphertext blob.
 * Only declared fields are accepted on new writes; existing saved payloads remain opaque.
 * @complexity O(f) time/space, f bounded by the existing credential-form parser (10 fields). */
function validateConnection({ raw, registry }: { raw: unknown; registry: SourceControlProviderRegistry }, _options = {}): SourceControlConnectionInput {
  const value = connectionObject({ raw });
  const descriptor = requireProvider({ providerId: value.providerId, registry });
  const canonical = canonicalConnection({ value, descriptor });
  const token = normalizeStoredToken({ value: canonical.token });
  return { ...collectDeclaredFields({ value, descriptor }), providerId: descriptor.id, token };
}

/** Collect only the provider's additional declared fields; the primary secret is stored as `token`.
 * Authentication pairs stay in the same ciphertext blob. @complexity O(f) time/space, f <= 10. */
function collectDeclaredFields({ value, descriptor }: { value: Record<string, unknown>; descriptor: SourceControlProviderDescriptor }, _options = {}): Record<string, string> {
  const tokenField = descriptor.credential?.tokenField ?? 'token';
  const fields: Record<string, string> = {};
  for (const field of descriptor.credential?.fields ?? []) {
    if (field.name === tokenField) continue;
    const validated = validateDeclaredField({ value: value[field.name], field, providerId: descriptor.id });
    if (validated !== undefined) fields[field.name] = validated;
  }
  return fields;
}

/** Non-secret metadata uses the existing credential-free admission check; secrets use token admission. */
function validateDeclaredField({ value, field, providerId }: {
  value: unknown; field: import('./credential-form.js').SourceControlCredentialField; providerId: string;
}, _options = {}): string | undefined {
  if (value === undefined && !field.required) return undefined;
  const text = requireNonEmptyString(value, field.name, providerId);
  if (field.secret) return normalizeStoredToken({ value: text });
  assertPlainField({ value: text, field: field.name });
  return text;
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

/** Validate the loaded declaration, then make the secret durable before identity discovery.
 * @param required Explicit store ports and create input. @returns A summary with no secret fields.
 * @throws {SourceControlCredentialValidationError} Invalid or unavailable provider/fields.
 * Probe failures never undo a save; Jini owns sealing, hints and atomic defaults. */
export async function createSourceControlCredential(
  { deps, input }: { deps: SourceControlCredentialWriteDeps; input: CreateSourceControlCredentialInput },
  _options = {},
): Promise<SourceControlCredentialSummary> {
  const label = validateLabel(input.label);
  const connection = validateConnection({ raw: input.connection, registry: await credentialRegistry({ deps, workspaceId: input.workspaceId }) });
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

/** Omitted/blank tokens keep the envelope; explicit rotations reset and re-probe the label.
 * @param required Explicit store ports and update input. @returns A summary with no secret fields.
 * @throws {SourceControlCredentialValidationError} Invalid or unavailable destination/fields.
 * Metadata updates for an unchanged opaque id need neither a provider nor decryption. */
export async function updateSourceControlCredential(
  { deps, input }: { deps: SourceControlCredentialWriteDeps; input: UpdateSourceControlCredentialInput },
  _options = {},
): Promise<SourceControlCredentialSummary> {
  const existing = await deps.repo.findById(input);
  if (!existing) throw new SourceControlCredentialNotFoundError(`no source control credential '${input.id}' in this workspace`);
  const label = input.label !== undefined ? validateLabel(input.label) : existing.label;
  const requestedDefault = optionalBoolean(input.isDefault, "isDefault");
  const row = await deps.repo.vault!.find(input);
  if (!row) throw new SourceControlCredentialNotFoundError(`no source control credential '${input.id}' in this workspace`);
  const patch = await normalizeConnectionPatch({ raw: input.connection, existing: existing.providerId, registry: () => credentialRegistry({ deps, workspaceId: input.workspaceId }) });
  if (patch !== undefined && !isEmptyTokenPatch({ value: patch })) {
    const connection = validateConnection({ raw: patch, registry: await credentialRegistry({ deps, workspaceId: input.workspaceId }) });
    const summary = await saveConnection({ deps, input: { ...credentialScope({ ...input, kind: "source-control" }), id: input.id,
      expectedRevision: row.revision, provider: connection.providerId, label, payload: { ...connection }, hintToken: connection.token,
      meta: { ...row.meta, accountLabel: null }, ...(requestedDefault === true ? { isDefault: true } : {}) } });
    return probeSavedConnection({ deps, summary, connection });
  }
  const provider = await preservedProvider({ raw: patch, existing: existing.providerId, registry: () => credentialRegistry({ deps, workspaceId: input.workspaceId }) });
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
    if (!resolved) return null;
    if (!resolved.payload) throw new SourceControlCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage);
    // Reading a saved connection never requires its plugin or reinterprets its paired fields.
    const connection = { ...resolved.payload, providerId: resolved.summary.provider,
      token: normalizeStoredToken({ value: resolved.payload.token }) } as SourceControlConnectionInput;
    return { id: resolved.summary.id, label: resolved.summary.label, connection };
  } catch { throw new SourceControlCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage); }
}
