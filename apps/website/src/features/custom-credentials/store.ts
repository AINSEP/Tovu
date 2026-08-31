import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import { buildCustomCredentialAad } from "./aad.js";
import {
  CUSTOM_CREDENTIAL_CATEGORIES,
  type CustomCredentialCategoryId,
  type CustomCredentialSetRecord,
  type CustomCredentialSetRepoPort,
  type CustomCredentialSummary,
  type CustomProviderConnectionInput,
} from "./types.js";

/**
 * @file Validate-then-seal-then-write CRUD over `custom_credential_sets`, structurally mirroring
 * `features/source-control/store.ts` — see that file's own header for the design this one copies.
 * Simpler than either sibling: no provider-id dispatch (every row is its own standalone identity —
 * see `types.ts`'s own header), no `isDefault` group invariant, no account-label probe, no
 * decrypting read (nothing in this codebase consumes the plaintext connection yet — adding one with
 * no caller would be dead code, same reasoning `source-control/store.ts`'s header gives for its own
 * "no `resolveForX`" choice; the day something needs to actually USE a saved custom credential, a
 * decrypt path can be added the same way `resolveForPublish`/`resolveDefaultForSourceControl` were).
 *
 * {@link describeCredential}/{@link listCustomCredentials} — read model only, never touch
 * `sealer`/`keyring` at all, so neither can fail on a misconfigured master secret.
 *
 * {@link createCustomCredential}/{@link updateCustomCredential}/{@link deleteCustomCredential} —
 * validate-then-write. `connection`, when supplied, is ALWAYS resealed as a fresh ciphertext (never
 * a re-wrap of the old one) under a fresh AAD bound to that row's own `(workspaceId, id)` — see
 * `./aad.ts`'s `buildCustomCredentialAad`.
 *
 * {@link resolveCustomCredentialByLabel} — added 2026-08-31 for the mail HTTP-API/SMTP adapters
 * (`server/runtime/boot/resolve-mailer.ts`), the first real decrypting reader this table has ever
 * had. This file's header USED TO say "nothing in this codebase consumes the plaintext connection
 * yet — adding one with no caller would be dead code"; that day arrived, so the decrypt path was
 * added the same way the header itself predicted (mirroring `vendor-credentials/store.ts`'s own
 * `resolveForVendor`/`decryptRecord`). Looked up by LABEL, not id: this table has no `purpose`/
 * `role` column and `label` is this table's own identity field (see this file's header above), so
 * a caller that needs "the row a well-known integration should use" has no other stable handle to
 * find it by. `resolve-mailer.ts` documents the exact label strings an operator must type into the
 * Access Tokens "Add custom provider" form to activate each mail adapter.
 */

const MAX_LABEL_LENGTH = 200;
const CATEGORY_IDS: ReadonlySet<CustomCredentialCategoryId> = new Set(CUSTOM_CREDENTIAL_CATEGORIES);

function isCustomCredentialCategoryId(value: string): value is CustomCredentialCategoryId {
  return CATEGORY_IDS.has(value as CustomCredentialCategoryId);
}

export class CustomCredentialValidationError extends Error {}

/** A `(workspaceId, label)` collision — the route maps this to `409 DUPLICATE_LABEL`. */
export class CustomCredentialDuplicateLabelError extends Error {}

/** Thrown when `sealer.seal()`/`keyring.activeKey()` fails while writing a connection — the
 *  realistic cause is a missing master secret (`TOVU_INTEGRATIONS_ROOT_KEY`), same fail-closed
 *  contract every sibling credential table's store documents. */
export class CustomCredentialSecretStoreUnconfiguredError extends Error {}

export class CustomCredentialNotFoundError extends Error {}

function toSummary(record: CustomCredentialSetRecord): CustomCredentialSummary {
  return {
    id: record.id,
    label: record.label,
    category: record.category,
    baseUrl: record.baseUrl,
    configured: true,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export interface CustomCredentialReadDeps {
  repo: CustomCredentialSetRepoPort;
}

/**
 * The read model for ONE credential set. Pure DB read — no sealer, no keyring, cannot fail on a
 * misconfigured master secret. Returns `null` if no row exists for `(workspaceId, id)` (not an
 * error — the caller decides whether that is a 404).
 *
 * @complexity O(1) — one `findById` lookup.
 */
export async function describeCredential(deps: CustomCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<CustomCredentialSummary | null> {
  const record = await deps.repo.findById(input);
  return record ? toSummary(record) : null;
}

/**
 * The read model for EVERY credential set a workspace has saved — what
 * `GET .../custom/credentials` returns. Same "never decrypts" contract as {@link describeCredential}.
 *
 * @complexity O(n) in the workspace's own (small) credential-set count. One repo read, one array
 *   map, no per-row I/O.
 */
export async function listCustomCredentials(deps: CustomCredentialReadDeps, input: { workspaceId: UUID }): Promise<CustomCredentialSummary[]> {
  const records = await deps.repo.listByWorkspace(input);
  return records.map(toSummary);
}

export interface CustomCredentialWriteDeps extends CustomCredentialReadDeps {
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
  idGen: { newId(): string };
}

/** Narrows and validates a caller-supplied `label`. Never throws a raw `TypeError` — every
 *  rejection is a {@link CustomCredentialValidationError} the route layer can map to its own `400`. */
function validateLabel(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CustomCredentialValidationError("label must be a non-empty string");
  }
  if (raw.length > MAX_LABEL_LENGTH) {
    throw new CustomCredentialValidationError(`label must be ${MAX_LABEL_LENGTH} characters or fewer`);
  }
  return raw;
}

/** Narrows and validates a caller-supplied `category` against the Access Tokens page's own known
 *  set — see `types.ts`'s `CustomCredentialCategoryId` doc for why this list is duplicated (not
 *  imported) from the admin app. */
function validateCategory(raw: unknown): CustomCredentialCategoryId {
  if (typeof raw !== "string" || !isCustomCredentialCategoryId(raw)) {
    throw new CustomCredentialValidationError(`category must be one of: ${CUSTOM_CREDENTIAL_CATEGORIES.join(", ")}`);
  }
  return raw;
}

/** Narrows and validates a caller-supplied `baseUrl` — must parse as an absolute `http`/`https` URL
 *  (`new URL()` accepts far more schemes than this form should — `javascript:`, `file:`, a bare
 *  `mailto:` — so the scheme is checked explicitly rather than trusting "did not throw"). */
function validateBaseUrl(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CustomCredentialValidationError("baseUrl must be a non-empty string");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CustomCredentialValidationError("baseUrl must be a valid absolute URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CustomCredentialValidationError("baseUrl must use http or https");
  }
  return raw;
}

function requireNonEmptyString(raw: unknown, field: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CustomCredentialValidationError(`'${field}' (non-empty string) is required`);
  }
  return raw;
}

function optionalString(raw: unknown, field: string): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CustomCredentialValidationError(`'${field}' must be a non-empty string when provided`);
  }
  return raw;
}

/**
 * Validates a caller-supplied `connection` — just `{token, username?}`, no provider dispatch (see
 * this file's own header). Never throws a raw shape error — every rejection is a
 * {@link CustomCredentialValidationError}.
 *
 * @complexity O(1) — fixed-shape field reads, no iteration.
 */
function validateConnection(raw: unknown): CustomProviderConnectionInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CustomCredentialValidationError("connection must be an object");
  }
  const value = raw as Record<string, unknown>;
  const token = requireNonEmptyString(value.token, "token");
  const username = optionalString(value.username, "username");
  return { token, ...(username !== undefined ? { username } : {}) };
}

/** Wraps `sealer.seal()`/`keyring.activeKey()` failure into the fail-closed
 *  {@link CustomCredentialSecretStoreUnconfiguredError} contract — never falls through to a
 *  plaintext write. */
async function sealConnection(
  deps: CustomCredentialWriteDeps,
  input: { workspaceId: UUID; id: UUID; connection: CustomProviderConnectionInput }
) {
  try {
    const activeKey = await deps.keyring.activeKey();
    const aad = buildCustomCredentialAad({ workspaceId: input.workspaceId, id: input.id });
    return await deps.sealer.seal({ plaintext: JSON.stringify(input.connection), key: activeKey, aad });
  } catch (err) {
    throw new CustomCredentialSecretStoreUnconfiguredError(
      `custom credential secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** True iff `err` is the underlying SQLite driver's "UNIQUE constraint failed" error — same
 *  detection shape every sibling credential store's own `isUniqueLabelViolation` uses. */
export function isUniqueLabelViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || err.message.includes("UNIQUE constraint failed");
}

export interface CreateCustomCredentialInput {
  workspaceId: UUID;
  label: unknown;
  category: unknown;
  baseUrl: unknown;
  connection: unknown;
}

/**
 * Validates, seals, and inserts a new credential set. `id` is minted here (`deps.idGen`), not
 * caller-supplied.
 *
 * @throws {CustomCredentialValidationError} `label`/`category`/`baseUrl`/`connection` fails shape
 *   validation.
 * @throws {CustomCredentialDuplicateLabelError} `(workspaceId, label)` already exists.
 * @throws {CustomCredentialSecretStoreUnconfiguredError} The master secret is unavailable.
 * @complexity O(1) plus one keyring derivation, one seal, and one insert (which may itself throw on
 *   the UNIQUE index, translated here rather than propagated raw).
 */
export async function createCustomCredential(deps: CustomCredentialWriteDeps, input: CreateCustomCredentialInput): Promise<CustomCredentialSummary> {
  const label = validateLabel(input.label);
  const category = validateCategory(input.category);
  const baseUrl = validateBaseUrl(input.baseUrl);
  const connection = validateConnection(input.connection);
  const id = deps.idGen.newId();
  const now = deps.clock.nowIso();

  const sealed = await sealConnection(deps, { workspaceId: input.workspaceId, id, connection });
  const record: CustomCredentialSetRecord = {
    workspaceId: input.workspaceId,
    id,
    label,
    category,
    baseUrl,
    sealed,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await deps.repo.insert(record);
  } catch (err) {
    if (isUniqueLabelViolation(err)) {
      throw new CustomCredentialDuplicateLabelError(`a custom credential labeled '${label}' already exists in this workspace`);
    }
    throw err;
  }
  return toSummary(record);
}

export interface UpdateCustomCredentialInput {
  workspaceId: UUID;
  id: UUID;
  /** Omitted = leave the label unchanged. */
  label?: unknown;
  /** Omitted = leave the category unchanged. */
  category?: unknown;
  /** Omitted = leave the base URL unchanged. */
  baseUrl?: unknown;
  /** Omitted = leave the stored connection untouched — same "omitting `connection` keeps the
   *  secret" contract every sibling credential route documents. */
  connection?: unknown;
}

/**
 * Validate-then-write for an existing credential set.
 *
 * @throws {CustomCredentialNotFoundError} No row exists for `(workspaceId, id)`.
 * @throws {CustomCredentialValidationError} A supplied field fails validation.
 * @throws {CustomCredentialDuplicateLabelError} The (possibly renamed) `label` collides with a
 *   different row.
 * @throws {CustomCredentialSecretStoreUnconfiguredError} A new `connection` was supplied but the
 *   master secret is unavailable.
 * @complexity O(1) — one read, at most one seal, one update.
 */
export async function updateCustomCredential(deps: CustomCredentialWriteDeps, input: UpdateCustomCredentialInput): Promise<CustomCredentialSummary> {
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) {
    throw new CustomCredentialNotFoundError(`no custom credential '${input.id}' in this workspace`);
  }

  const label = input.label !== undefined ? validateLabel(input.label) : existing.label;
  const category = input.category !== undefined ? validateCategory(input.category) : existing.category;
  const baseUrl = input.baseUrl !== undefined ? validateBaseUrl(input.baseUrl) : existing.baseUrl;
  const now: ISODateTime = deps.clock.nowIso();

  let sealed = existing.sealed;
  if (input.connection !== undefined) {
    const connection = validateConnection(input.connection);
    sealed = await sealConnection(deps, { workspaceId: input.workspaceId, id: input.id, connection });
  }

  const record: CustomCredentialSetRecord = {
    workspaceId: input.workspaceId,
    id: input.id,
    label,
    category,
    baseUrl,
    sealed,
    createdAt: existing.createdAt,
    updatedAt: now,
  };

  try {
    await deps.repo.update(record);
  } catch (err) {
    if (isUniqueLabelViolation(err)) {
      throw new CustomCredentialDuplicateLabelError(`a custom credential labeled '${label}' already exists in this workspace`);
    }
    throw err;
  }
  return toSummary(record);
}

/**
 * Deletes a credential set. No-op (not an error) if no row exists for `(workspaceId, id)` — matches
 * `CustomCredentialSetRepoPort.delete`'s own idempotent contract and this feature's `DELETE`
 * route's documented 204-always behavior.
 *
 * @complexity O(1).
 */
export async function deleteCustomCredential(deps: CustomCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<void> {
  await deps.repo.delete(input);
}

/** Shared decrypt step for {@link resolveCustomCredentialByLabel} — same hardened-from-the-start
 *  shape `vendor-credentials/store.ts`'s own `decryptRecord` documents (never lets a raw decrypt
 *  failure escape as an unhandled rejection; see that file's header for the 2026-08-16 incident
 *  this pattern exists to avoid repeating). */
async function decryptRecord(sealer: SecretSealerPort, record: CustomCredentialSetRecord): Promise<CustomProviderConnectionInput> {
  const aad = buildCustomCredentialAad({ workspaceId: record.workspaceId, id: record.id });
  try {
    const plaintext = await sealer.open({ sealed: record.sealed, aad });
    return JSON.parse(plaintext) as CustomProviderConnectionInput;
  } catch (err) {
    throw new CustomCredentialSecretStoreUnconfiguredError(
      `custom credential could not be decrypted (secret store unconfigured, or the stored row is corrupted): ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export interface CustomCredentialResolveDeps {
  repo: CustomCredentialSetRepoPort;
  sealer: SecretSealerPort;
}

/**
 * The ONLY decrypting read this table has (see this file's header). Finds the workspace's custom
 * credential set by its exact `label` and decrypts it. Returns `null` if no row has that label —
 * NOT an error, since "not configured" is an expected, ordinary state for an optional integration
 * (a caller like `resolve-mailer.ts` falls back to a safe default in that case, it does not treat
 * this as exceptional).
 *
 * `listByWorkspace` + an in-memory filter, rather than a new `findByLabel` repo method: this
 * table's own `listByWorkspace` doc already establishes "inherently small — bounded by how many an
 * operator bothers to add", so a client-side scan costs nothing measurable and avoids widening
 * `CustomCredentialSetRepoPort`'s surface (and therefore both its adapters) for a single caller.
 *
 * @throws {CustomCredentialSecretStoreUnconfiguredError} A row with this label exists but
 *   `decryptRecord` failed (master secret missing/rotated, or a corrupted row).
 * @complexity O(n) in the workspace's own (small) credential-set count, plus one decrypt.
 */
export async function resolveCustomCredentialByLabel(
  deps: CustomCredentialResolveDeps,
  input: { workspaceId: UUID; label: string }
): Promise<{ id: UUID; category: CustomCredentialCategoryId; baseUrl: string; connection: CustomProviderConnectionInput } | null> {
  const records = await deps.repo.listByWorkspace({ workspaceId: input.workspaceId });
  const record = records.find((row) => row.label === input.label);
  if (!record) return null;
  const connection = await decryptRecord(deps.sealer, record);
  return { id: record.id, category: record.category, baseUrl: record.baseUrl, connection };
}
