import { CredentialInputError, CREDENTIAL_MESSAGES, assertCredentialFreeField, normalizeCredentialToken } from '../../../contracts/core/credential-token.js';
import type { Clock as ClockPort, UUID } from "@jini-ai/core/primitives";

import { isUniqueViolation } from "../../../platform/db/kernel/dialect.js";
import type { StorageKernel } from "@jini-ai/db/kernel";
import type { KeyringPort, SecretSealerPort } from "../../webhooks/index.js";
import { VaultError, type VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import { credentialVault, credentialScope, credentialHint } from "../../vendor-credentials/vault-adapter.js";
import type { VendorCredentialSetRecord, VendorCredentialSetRepoPort } from "../../vendor-credentials/types.js";
import type { DeployTargetCredentialSpec, DeployTargetRegistry } from "../deploy-targets/types.js";
import type { PublishConnectionInput, PublishCredentialSummary, PublishProviderId } from "./types.js";

/** Publish credentials map deploy hosts to vendor accounts. Feature validation and human-gated
 * verification remain here; Jini's vault owns sealing, defaults and persistence. Create/update
 * are shared with an agent-facing caller, so provider probes stay in the human-gated verify path.
 * Migration 0012 folds legacy rows once; there is no recurring backfill to resurrect deletions. */

const MAX_LABEL_LENGTH = 200;

/** Thrown for any caller-supplied value that fails shape validation — the route maps this to `400`. */
export class PublishCredentialValidationError extends Error {}

/** A `(workspaceId, vendor, label)` collision — the route maps this to `409 DUPLICATE_LABEL`. */
export class PublishCredentialDuplicateLabelError extends Error {}

/** Thrown when `sealer.seal()`/`keyring.activeKey()` fails while writing a connection — the realistic
 *  cause is a missing site key (`TOVU_SITE_KEY`), same fail-closed contract
 *  `SiteAssistantSecretStoreUnconfiguredError` documents for the sibling ADR-058 table. */
export class PublishCredentialSecretStoreUnconfiguredError extends Error {}

export class PublishCredentialNotFoundError extends Error {}

/**
 * Vendor -> the host its rows are shown and resolved under: the first host in registry order that
 * declares that vendor. A vendor no host declares (a source-control-only vendor) is absent, so its
 * rows are not publish credentials.
 *
 * @complexity O(t) targets.
 */
function hostsByVendor(registry: DeployTargetRegistry): Map<string, PublishProviderId> {
  const hosts = new Map<string, PublishProviderId>();
  for (const { descriptor } of registry.list()) {
    if (descriptor.credential !== undefined && !hosts.has(descriptor.credential.vendorId)) hosts.set(descriptor.credential.vendorId, descriptor.id);
  }
  return hosts;
}

async function toSummary(record: VendorCredentialSetRecord, providerId: PublishProviderId, _deps: PublishCredentialReadDeps): Promise<PublishCredentialSummary> {
  const tokenHint = record.tokenHint ?? null;
  return { id: record.id, providerId, vendorId: record.vendorId, label: record.label, configured: true,
    isDefault: record.isDefault, tokenTail: tokenHint?.last4 ?? "", tokenHint, accountLabel: record.accountLabel,
    createdAt: record.createdAt, updatedAt: record.updatedAt };
}
function vaultSummary({ summary, providerId }: { summary: VaultSummary; providerId: PublishProviderId }, _options = {}): PublishCredentialSummary {
  const tokenHint = credentialHint({ record: summary });
  return { id: summary.id, providerId, vendorId: summary.provider!, label: summary.label, configured: true,
    isDefault: summary.isDefault, tokenTail: tokenHint?.last4 ?? "", tokenHint, accountLabel: summary.meta.accountLabel as string | null,
    createdAt: summary.createdAt, updatedAt: summary.updatedAt };
}
function vault(deps: PublishCredentialReadDeps & Partial<PublishCredentialWriteDeps>, _options = {}) {
  return credentialVault({ ...deps, sealer: deps.sealer!, storageError: () => new PublishCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage) });
}

export interface PublishCredentialReadDeps {
  repo: VendorCredentialSetRepoPort;
  sealer?: SecretSealerPort;
  /** This workspace's deploy registry: which vendor each host's credential belongs to. */
  loadDeployTargets(workspaceId: string): Promise<DeployTargetRegistry>;
}

/**
 * The read model for ONE credential set. Pure DB read — no sealer, no keyring, cannot fail on a
 * misconfigured site key. Returns `null` if no row exists for `(workspaceId, id)`, or the row's
 * vendor is no deploy host's (not an error — the caller decides whether that is a 404).
 *
 * @complexity O(1) — one `findById` lookup plus one registry load.
 */
export async function describeCredential(deps: PublishCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<PublishCredentialSummary | null> {
  const record = await deps.repo.findById(input);
  if (!record) return null;
  const providerId = hostsByVendor(await deps.loadDeployTargets(input.workspaceId)).get(record.vendorId);
  return providerId === undefined ? null : toSummary(record, providerId, deps);
}

/**
 * The read model for EVERY publish credential a workspace has saved — what `GET .../publish/credentials`
 * returns: each row whose vendor a deploy host declares. Same "never decrypts" contract as
 * {@link describeCredential}.
 *
 * @complexity O(n + t) in the workspace's own (small) credential-set count and the registry's targets.
 */
export async function listPublishCredentials(deps: PublishCredentialReadDeps, input: { workspaceId: UUID }): Promise<PublishCredentialSummary[]> {
  const hosts = hostsByVendor(await deps.loadDeployTargets(input.workspaceId));
  const records = await deps.repo.listByWorkspace(input);
  return Promise.all(records.flatMap(record => {
    const providerId = hosts.get(record.vendorId);
    return providerId === undefined ? [] : [toSummary(record, providerId, deps)];
  }));
}

/**
 * Whether `providerId`'s vendor has a default saved connection. Never decrypts — what a readiness
 * check (`isConfigured`) reads.
 *
 * @complexity O(1) — one registry load, one repo read.
 */
export async function hasDefaultForPublish(deps: PublishCredentialReadDeps, input: { workspaceId: UUID; providerId: PublishProviderId }): Promise<boolean> {
  const spec = (await deps.loadDeployTargets(input.workspaceId)).get(input.providerId)?.descriptor.credential;
  if (spec === undefined) return false;
  return (await deps.repo.findDefaultByVendor({ workspaceId: input.workspaceId, vendorId: spec.vendorId })) !== null;
}

export interface PublishCredentialWriteDeps extends PublishCredentialReadDeps {
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
  idGen: { newId(): string };
}

/** Narrows and validates a caller-supplied `label`. Never throws a raw `TypeError` — every rejection
 *  is a {@link PublishCredentialValidationError} the route/tool layer can map to its own `400`. */
function validateLabel(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new PublishCredentialValidationError("label must be a non-empty string");
  }
  if (raw.length > MAX_LABEL_LENGTH) {
    throw new PublishCredentialValidationError(`label must be ${MAX_LABEL_LENGTH} characters or fewer`);
  }
  assertPlainField({ value: raw, field: "label" });
  return raw;
}

/** Shared check-then-trim step for {@link requireNonEmptyString}/{@link optionalString} — the two
 *  differ only in whether `undefined` is acceptable, never in what counts as "non-empty" or what gets
 *  persisted. Always returns the TRIMMED value, never the raw one just validated: a leading or trailing
 *  space pasted alongside a real value (an endpoint URL, an access key, a bearer token) is never
 *  meaningful, and returning it unmodified lets it survive into storage, then into every reader
 *  downstream — for a secret field, that surfaces later as a misleading "wrong credentials" far from
 *  where the stray space was typed. Extracted (2026-09-05) after `optionalString` was fixed alone once
 *  already and `requireNonEmptyString` was found carrying the identical untrimmed-return bug days
 *  later — a single shared step is what keeps the two from drifting apart a second time. */
function assertNonEmptyTrimmed(raw: unknown, message: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new PublishCredentialValidationError(message);
  }
  return raw.trim();
}

function requireNonEmptyString(raw: unknown, field: string, providerId: string): string {
  return assertNonEmptyTrimmed(raw, `'${field}' (non-empty string) is required for provider '${providerId}'`);
}

function optionalString(raw: unknown, field: string): string | undefined {
  if (raw === undefined) return undefined;
  return assertNonEmptyTrimmed(raw, `'${field}' must be a non-empty string when provided`);
}

/** Narrows a caller-supplied `isDefault`. `undefined` means "no default change requested" (the same
 *  omitted-means-unchanged convention `label`/`connection` already use); any other non-boolean value
 *  is rejected rather than coerced, so a stray string/number in the request body cannot silently be
 *  read as truthy. */
function optionalBoolean(raw: unknown, field: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "boolean") {
    throw new PublishCredentialValidationError(`'${field}' must be a boolean when provided`);
  }
  return raw;
}

/** A validated connection plus the host credential spec it was validated against. */
interface ValidatedConnection {
  readonly connection: PublishConnectionInput;
  readonly spec: DeployTargetCredentialSpec;
}

/**
 * Validates a caller-supplied `connection` against the credential its host declares
 * (`DeployTargetDescriptor.credential` in this workspace's deploy registry): `providerId` must be a
 * target that takes a saved credential; every declared required field must be a non-empty string,
 * every declared optional one a non-empty string when present. Required fields are checked before
 * optional ones, in declaration order. Values are trimmed; undeclared keys are dropped. Never throws a
 * raw shape error — every rejection is a {@link PublishCredentialValidationError}.
 *
 * @complexity O(t + f): one pass over the registry's targets (for the error text), one over the fields.
 */
function normalizeSecret(required: { value: unknown; field: string }): string {
  try { return normalizeCredentialToken(required); }
  catch (err) { if (err instanceof CredentialInputError) throw new PublishCredentialValidationError(err.message); throw err; }
}
function assertPlainField(required: { value: string; field: string }): void {
  try { assertCredentialFreeField(required); }
  catch (err) { if (err instanceof CredentialInputError) throw new PublishCredentialValidationError(err.message); throw err; }
}

function validateConnection(raw: unknown, registry: DeployTargetRegistry): ValidatedConnection {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PublishCredentialValidationError("connection must be an object");
  }
  const value = raw as Record<string, unknown>;
  const providerId = value.providerId;
  const spec = typeof providerId === "string" ? registry.get(providerId)?.descriptor.credential : undefined;
  if (typeof providerId !== "string" || spec === undefined) {
    const known = registry.list().flatMap((target) => (target.descriptor.credential !== undefined ? [target.descriptor.id] : []));
    throw new PublishCredentialValidationError(`connection.providerId must be one of: ${known.join(", ")}`);
  }

  const fields: Record<string, string> = {};
  for (const field of spec.fields.filter((candidate) => candidate.required)) {
    const secret = field.secret || field.name === spec.tokenField;
    fields[field.name] = secret ? normalizeSecret({ value: value[field.name], field: field.name }) : requireNonEmptyString(value[field.name], field.name, providerId);
    if (!secret) assertPlainField({ value: fields[field.name]!, field: field.name });
  }
  for (const field of spec.fields.filter((candidate) => !candidate.required)) {
    const secret = field.secret || field.name === spec.tokenField;
    const optional = secret && value[field.name] !== undefined ? normalizeSecret({ value: value[field.name], field: field.name }) : optionalString(value[field.name], field.name);
    if (!secret && optional !== undefined) assertPlainField({ value: optional, field: field.name });
    if (optional !== undefined) fields[field.name] = optional;
  }
  if (fields[spec.tokenField] === undefined) normalizeSecret({ value: undefined, field: spec.tokenField });
  return { connection: { providerId, ...fields }, spec };
}

/** True iff `err` is the label's UNIQUE `(workspace_id, vendor_id, label)` index rejecting a
 *  duplicate, on any database (`isUniqueViolation`, storage kernel: SQLite's code/message, Postgres
 *  SQLSTATE 23505). */
export function isUniqueLabelViolation(err: unknown): boolean {
  return isUniqueViolation(err);
}

export interface CreatePublishCredentialInput {
  workspaceId: UUID;
  label: unknown;
  connection: unknown;
  /** `true` makes this the vendor's default connection (clearing any previous one — see
   *  `VendorCredentialSetRepoPort`'s own header). Omitted/`false` still auto-defaults if this turns
   *  out to be the vendor's FIRST saved connection; Jini owns atomic auto-defaulting. */
  isDefault?: unknown;
}

/** Label conflicts keep the feature's error contract; stale CAS failures stay conflicts. */
async function saveConnection({ deps, input, providerId }: { deps: PublishCredentialWriteDeps;
  input: Parameters<ReturnType<typeof vault>["put"]>[0]; providerId: PublishProviderId }, _options = {}): Promise<VaultSummary> {
  try { return await vault(deps).put(input); }
  catch (error) {
    const duplicate = isUniqueLabelViolation(error) || error instanceof VaultError && error.code === "conflict" &&
      (await deps.repo.listByVendor({ workspaceId: input.workspaceId, vendorId: input.provider! })).some(row => row.id !== input.id && row.label === input.label);
    if (duplicate) throw new PublishCredentialDuplicateLabelError(`a '${providerId}' credential labeled '${input.label}' already exists in this workspace`);
    throw error;
  }
}

/** Validate before the vault write. Jini atomically auto-defaults the first vendor credential. */
export async function createPublishCredential(deps: PublishCredentialWriteDeps, input: CreatePublishCredentialInput): Promise<PublishCredentialSummary> {
  const label = validateLabel(input.label);
  const validated = validateConnection(input.connection, await deps.loadDeployTargets(input.workspaceId));
  const isDefault = optionalBoolean(input.isDefault, "isDefault") === true;
  const { providerId, ...fields } = validated.connection;
  const summary = await saveConnection({ deps, providerId, input: {
    ...credentialScope({ workspaceId: input.workspaceId, kind: "vendor" }), id: deps.idGen.newId(), expectedRevision: null,
    provider: validated.spec.vendorId, label, meta: { accountLabel: null }, payload: { vendorId: validated.spec.vendorId, ...fields },
    hintToken: fields[validated.spec.tokenField], isDefault,
  } });
  return vaultSummary({ summary, providerId });
}

export interface UpdatePublishCredentialInput {
  workspaceId: UUID;
  id: UUID;
  /** Omitted = leave the label unchanged. */
  label?: unknown;
  /** Omitted = leave the stored connection (and its vendor) untouched — this route's own
   *  "connection omitted => keep the stored secret untouched" contract. Supplying a NEW connection
   *  may change the host and vendor. A provider-only move between token-only hosts retains the
   *  envelope: vault AAD binds the stable identity, not the vendor. Explicit secrets rotate. */
  connection?: unknown;
  /** `true` makes this the default connection for its (possibly new — see `connection` above)
   *  vendor, clearing any previous default in the same repo call. Omitted/`false` preserves a
   *  same-vendor default; moves use the destination's default/first-row rule. Use
   *  `createPublishCredential`/another `updatePublishCredential` call with `isDefault: true` to
   *  promote a different row instead. */
  isDefault?: unknown;
}

/** Preserve only a provider change between compatible token-only contracts. Companion-field
 * changes and different secret schemas still require the validated replacement path.
 * @complexity O(k) time/space for k supplied keys; fixed schema checks, no I/O. */
function preservedMove({ raw, registry, host }: { raw: unknown; registry: DeployTargetRegistry; host: PublishProviderId }, _options = {}): { providerId: string; spec: DeployTargetCredentialSpec } | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const values = raw as Record<string, unknown>;
  if (typeof values.providerId !== "string" || values.providerId === host) return undefined;
  const spec = registry.get(values.providerId)?.descriptor.credential;
  const previous = registry.get(host)?.descriptor.credential;
  if (!spec || !previous || spec.tokenField !== previous.tokenField) return undefined;
  if (![spec, previous].every(candidate => candidate.fields.length === 1 && candidate.fields[0]!.name === candidate.tokenField)) return undefined;
  if (!Object.keys(values).every(key => key === "providerId" || key === spec.tokenField) ||
    (values[spec.tokenField] !== undefined && values[spec.tokenField] !== "")) return undefined;
  return { providerId: values.providerId, spec };
}

/** Blank secret fields keep their stored value; non-secret companion fields still update. */
async function updatedConnection({ deps, input, existing, registry, host }: { deps: PublishCredentialWriteDeps; input: UpdatePublishCredentialInput;
  existing: VendorCredentialSetRecord; registry: DeployTargetRegistry; host: PublishProviderId }, _options = {}): Promise<ValidatedConnection> {
  let raw = input.connection;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const values = raw as Record<string, unknown>;
    const spec = typeof values.providerId === "string" ? registry.get(values.providerId)?.descriptor.credential : undefined;
    if (spec?.vendorId === existing.vendorId && spec.fields.some(field => (field.secret || field.name === spec.tokenField) && (values[field.name] === "" || values[field.name] === undefined))) {
      const stored = await decryptRecord(deps, existing, host);
      const merged = { ...stored, ...values };
      for (const field of spec.fields.filter(field => field.secret || field.name === spec.tokenField)) {
        if (values[field.name] === "" || values[field.name] === undefined) merged[field.name] = stored[field.name];
      }
      raw = merged;
    }
  }
  return validateConnection(raw, registry);
}

/** Omitted connections retain their sealed envelope/hints and never require a site key. */
export async function updatePublishCredential(deps: PublishCredentialWriteDeps, input: UpdatePublishCredentialInput): Promise<PublishCredentialSummary> {
  const existing = await deps.repo.findById(input);
  const registry = await deps.loadDeployTargets(input.workspaceId);
  const host = existing ? hostsByVendor(registry).get(existing.vendorId) : undefined;
  if (!existing || host === undefined) throw new PublishCredentialNotFoundError(`no publish credential '${input.id}' in this workspace`);
  const label = input.label !== undefined ? validateLabel(input.label) : existing.label;
  const requestedDefault = optionalBoolean(input.isDefault, "isDefault");
  const row = await deps.repo.vault!.find(input);
  if (!row) throw new PublishCredentialNotFoundError(`no publish credential '${input.id}' in this workspace`);
  const move = preservedMove({ raw: input.connection, registry, host });
  if (input.connection !== undefined && !move) {
    const validated = await updatedConnection({ deps, input, existing, registry, host });
    const { providerId, ...fields } = validated.connection;
    const summary = await saveConnection({ deps, providerId, input: { ...credentialScope({ ...input, kind: "vendor" }), id: input.id,
      expectedRevision: row.revision, provider: validated.spec.vendorId, label, meta: { ...row.meta, accountLabel: null },
      payload: { vendorId: validated.spec.vendorId, ...fields }, hintToken: fields[validated.spec.tokenField],
      ...(requestedDefault === true ? { isDefault: true } : {}) } });
    return vaultSummary({ summary, providerId });
  }
  // Payload omission preserves ciphertext/hints; the vault atomically promotes/selects defaults.
  const providerId = move?.providerId ?? host;
  const provider = move?.spec.vendorId ?? existing.vendorId;
  const summary = await saveConnection({ deps, providerId, input: { ...credentialScope({ ...input, kind: "vendor" }), id: input.id,
    expectedRevision: row.revision, provider, label,
    meta: { ...row.meta, accountLabel: provider === existing.vendorId ? row.meta.accountLabel : null },
    ...(requestedDefault === true ? { isDefault: true } : {}) } });
  return vaultSummary({ summary, providerId });
}

/** Legacy rows were folded by 0012. Delete only the vault row; reboot has no source to recopy. */
export async function deletePublishCredential(deps: {
  repo: Pick<VendorCredentialSetRepoPort, "delete">;
  transaction?: Pick<StorageKernel<unknown>, "transaction">;
}, input: { workspaceId: UUID; id: UUID }): Promise<void> {
  await deps.repo.delete(input);
}

/** Jini checks exact ownership before opening. Keep the typed error used by HTTP and daemon
 * boundaries: a missing key must not become an unhandled rejection in a publishing process. */
async function decryptRecord(deps: PublishCredentialResolveDeps, record: VendorCredentialSetRecord, providerId: PublishProviderId): Promise<PublishConnectionInput> {
  try {
    const resolved = await vault(deps).get({ ...credentialScope({ workspaceId: record.workspaceId, kind: "vendor" }), id: record.id });
    if (!resolved?.payload) throw new PublishCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage);
    const { vendorId: _vendorId, ...fields } = resolved.payload as Record<string, string>;
    return { ...fields, providerId };
  } catch { throw new PublishCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage); }
}

export interface PublishCredentialResolveDeps extends PublishCredentialReadDeps {
  sealer: SecretSealerPort;
}

/**
 * The ONLY decrypting read by id — see this file's header. Resolves a credential set's full
 * `PublishConnectionInput` (labelled with the host its vendor is shown under), ready for a real
 * publish call. Distinguishes "no such publish credential" (`null`, a normal outcome — a
 * caller-supplied id that does not exist, or a row whose vendor no deploy host declares) from a
 * genuine decrypt failure (thrown — a publish credential resolves for a human-triggered write with
 * real external effect, so a decrypt failure must surface, not degrade).
 *
 * @throws {PublishCredentialSecretStoreUnconfiguredError} `decryptRecord` failed.
 * @complexity O(1) — one repo read, one registry load, one decrypt, one `JSON.parse`.
 */
export async function resolveForPublish(
  deps: PublishCredentialResolveDeps,
  input: { workspaceId: UUID; id: UUID }
): Promise<{ providerId: PublishProviderId; vendorId: string; label: string; isDefault: boolean; connection: PublishConnectionInput } | null> {
  const record = await deps.repo.findById(input);
  if (!record) return null;
  const providerId = hostsByVendor(await deps.loadDeployTargets(input.workspaceId)).get(record.vendorId);
  if (providerId === undefined) return null;
  const connection = await decryptRecord(deps, record, providerId);
  return { providerId, vendorId: record.vendorId, label: record.label, isDefault: record.isDefault, connection };
}

/**
 * Contract v2 Correction B — the host-scoped sibling of {@link resolveForPublish}: resolves the
 * DEFAULT credential set of `providerId`'s vendor instead of a caller-supplied `id`. This is what a
 * real publish attempt actually has (a target host, never a specific saved connection's id). `null`
 * — "not configured" — when the host takes no saved credential or its vendor has no default.
 *
 * @throws {PublishCredentialSecretStoreUnconfiguredError} `decryptRecord` failed.
 * @complexity O(1) — one registry load, one repo read, one decrypt, one `JSON.parse`.
 */
export async function resolveDefaultForPublish(
  deps: PublishCredentialResolveDeps,
  input: { workspaceId: UUID; providerId: PublishProviderId }
): Promise<{ id: UUID; label: string; connection: PublishConnectionInput } | null> {
  const spec = (await deps.loadDeployTargets(input.workspaceId)).get(input.providerId)?.descriptor.credential;
  if (spec === undefined) return null;
  try {
    const resolved = await vault(deps).findDefault({ ...credentialScope({ workspaceId: input.workspaceId, kind: "vendor" }), provider: spec.vendorId });
    if (!resolved) return null;
    if (!resolved.payload) throw new PublishCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage);
    const { vendorId: _vendorId, ...fields } = resolved.payload as Record<string, string>;
    return { id: resolved.summary.id, label: resolved.summary.label, connection: { ...fields, providerId: input.providerId } };
  } catch { throw new PublishCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage); }
}

/**
 * Persists a freshly-verified account label onto an existing row — see this file's own header for
 * why {@link createPublishCredential}/{@link updatePublishCredential} never do this themselves. The
 * ONE intended caller is the admin credential-CRUD route (`server/routes/admin/system/publish-
 * credentials.ts`), immediately after its own `verifyPublishCredentialById` call returns a `"valid"`
 * result carrying an `accountLabel`. Never call this with an EMPTY/absent label to "clear" one: a
 * failed or inconclusive re-verify carries no `accountLabel` at all and must leave a previously-healed
 * value alone — the caller's own `result.accountLabel !== undefined` check enforces that.
 *
 * A targeted single-column write ({@link VendorCredentialSetRepoPort.updateAccountLabel}), not a
 * full-row replace — never touches `sealed`, `isDefault`, or `updatedAt`.
 *
 * @complexity O(1) — one repo write (a no-op, not an error, if the row vanished meanwhile).
 */
export async function healAccountLabel(deps: { repo: VendorCredentialSetRepoPort }, input: { workspaceId: UUID; id: UUID; accountLabel: string }): Promise<void> {
  await deps.repo.updateAccountLabel(input);
}
