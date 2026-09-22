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

/** `username` is spread in conditionally rather than assigned as a possibly-`undefined` property so
 *  a credential without one has NO `username` key at all — "absent" stays a single representation
 *  all the way out to the admin JSON and `custom_credential_list`, instead of becoming a second,
 *  falsy-but-present value every consumer would have to remember to treat as absent. */
function toSummary(record: CustomCredentialSetRecord): CustomCredentialSummary {
  return {
    id: record.id,
    label: record.label,
    category: record.category,
    baseUrl: record.baseUrl,
    additionalHosts: record.additionalHosts,
    ...(record.username !== undefined ? { username: record.username } : {}),
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
 * The non-decrypting sibling of {@link resolveCustomCredentialByLabel}: finds a credential by its
 * exact label and returns its read model — `baseUrl`/`additionalHosts` included, since both are
 * plaintext columns (`db/schema.sqlite.ts`'s own doc) — WITHOUT ever touching `sealer`/`keyring`. Exists so
 * a caller that only needs to validate a request's target origin or render a confirmation dialog
 * (`features/custom-credentials/credentialed-request.ts`'s `resolveRequestTarget`,
 * `tool-registrations.ts`'s DELETE confirmation gate) never has to decrypt just to read two plaintext
 * fields — the same "never touches the sealer" contract {@link describeCredential} already documents,
 * applied to a label lookup instead of an id lookup.
 *
 * @complexity O(n) in the workspace's own (small) credential-set count — same `listByWorkspace` +
 *   filter shape {@link resolveCustomCredentialByLabel} uses, since this table has no `findByLabel`
 *   repo method (see that function's own doc for why).
 */
export async function describeCredentialByLabel(deps: CustomCredentialReadDeps, input: { workspaceId: UUID; label: string }): Promise<CustomCredentialSummary | null> {
  const records = await deps.repo.listByWorkspace({ workspaceId: input.workspaceId });
  const record = records.find((row) => row.label === input.label);
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

/** One `additionalHosts` entry's own validation — split out of {@link validateAdditionalHosts} so
 *  that function's `.map()` body stays a single call, and so each rejection names its own index. */
function validateAdditionalHostEntry(raw: unknown, index: number): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CustomCredentialValidationError(`additionalHosts[${index}] must be a non-empty string`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CustomCredentialValidationError(`additionalHosts[${index}] must be a valid absolute URL`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CustomCredentialValidationError(`additionalHosts[${index}] must use http or https`);
  }
  return parsed.origin;
}

/**
 * Validates and normalizes the optional `additionalHosts` field (2026-08-31, owner-driven multi-host
 * support — see `db/schema.sqlite.ts`'s `customCredentialSets.additionalHostsJson` doc). `undefined` (the
 * field was omitted) degrades to no extra hosts, matching every other optional field's "omitted is
 * not an error" contract on this store. Each entry is normalized to its own ORIGIN (scheme+host+port,
 * no path) and the result is deduped — this is what lets
 * `features/custom-credentials/credentialed-request.ts` compare a request's resolved URL origin
 * against this list with plain `===`/`.includes()`, never re-parsing at request time.
 *
 * @throws {CustomCredentialValidationError} `raw` is not an array, or any entry fails
 *   {@link validateAdditionalHostEntry}.
 * @complexity O(n) in the number of supplied hosts.
 */
function validateAdditionalHosts(raw: unknown): readonly string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new CustomCredentialValidationError("additionalHosts must be an array of absolute http/https URLs");
  }
  return [...new Set(raw.map((entry, index) => validateAdditionalHostEntry(entry, index)))];
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
 * Validates {@link UpdateCustomCredentialInput.username} — a THREE-way field, unlike
 * {@link optionalString}'s two-way "omitted or a non-empty string": this function is only ever
 * called once the caller has already checked `raw !== undefined` (omitted = leave the column alone,
 * a case this function never sees), so the two values left to distinguish are "clear it" and "set
 * it". `null` is the deliberate clear sentinel — chosen specifically because a blank string could not
 * serve double duty as both "leave alone" (the `optionalString` convention every other field on this
 * store already trained a caller to expect from a falsy value) and "clear" without one of those two
 * meanings silently winning over the other; `updateCustomCredential`'s own doc has the full
 * precedence writeup. A blank string is therefore still rejected here, same as everywhere else on
 * this store — it is neither of this field's two valid non-omitted values, not a quiet no-op.
 *
 * @throws {CustomCredentialValidationError} `raw` is present, not `null`, and not a non-empty string.
 * @complexity O(1).
 */
function validateUsernamePatch(raw: unknown): string | undefined {
  if (raw === null) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new CustomCredentialValidationError("'username' must be a non-empty string, or null to clear it");
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
  /** Omitted = no extra hosts beyond `baseUrl`. See `validateAdditionalHosts`'s own doc. */
  additionalHosts?: unknown;
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
  const additionalHosts = validateAdditionalHosts(input.additionalHosts);
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
    additionalHosts,
    // Written to the plaintext column AND left inside the sealed connection object above — see
    // `db/schema.sqlite.ts`'s `customCredentialSets.username` doc: the column is the read model's source,
    // the sealed copy keeps every existing decrypting reader working until the migration's Pass 2.
    ...(connection.username !== undefined ? { username: connection.username } : {}),
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
  /** Omitted = leave the additional hosts unchanged. Supplying a value REPLACES the whole list
   *  (never merges) — same "full replace, not append" contract this store's other array-ish writes
   *  don't have to disclaim only because none existed before this field. */
  additionalHosts?: unknown;
  /** Omitted = leave the stored connection untouched — same "omitting `connection` keeps the
   *  secret" contract every sibling credential route documents. */
  connection?: unknown;
  /**
   * Independent, top-level control over the plaintext `username` column — added 2026-09-01 so an
   * operator can fix a saved credential's username (the name.com incident this field exists for: the
   * saved row had no username, so every request 401'd, and the only correct value was already known —
   * re-pasting the token to say so was pure friction) WITHOUT retyping the token. Before this field
   * existed, `username` only ever changed as a side effect of a full `connection` replacement (see
   * {@link connection}'s own doc) — correct when username lived inside the sealed blob, no longer
   * necessary now that it is its own column (`db/schema.sqlite.ts`'s `customCredentialSets.username` doc).
   *
   * Three states, validated by {@link validateUsernamePatch}: omitted (`undefined`) leaves the column
   * exactly as `connection` (if supplied) would otherwise have set it; `null` explicitly clears it;
   * any other value must be a non-empty string. See `updateCustomCredential`'s own doc for the
   * precedence rule when this field AND `connection` are both supplied in the same call.
   */
  username?: unknown;
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
 *
 * ## `username`/`connection` precedence (2026-09-01)
 *
 * These two fields can each independently touch the `username` column, so a call supplying BOTH
 * needs one documented winner: the top-level {@link UpdateCustomCredentialInput.username} field
 * ALWAYS wins for what the column ends up holding. It is the more specific, explicit "set (or clear)
 * the username" signal a caller can send on its own with no token in hand at all; `connection`'s own
 * `username` member only ever arrives bundled with a token replacement, so treating it as the
 * decisive value would make an operator's explicit, standalone edit losable by an unrelated,
 * incidental field on a DIFFERENT input. Note this CAN leave the plaintext column and the sealed
 * copy's own embedded username disagreeing when both fields are supplied together with different
 * values — that is an accepted, pre-existing divergence, not a new inconsistency this introduces:
 * `resolveCustomCredentialByLabel`'s own doc already establishes the column as authoritative over the
 * sealed copy for every reader, precisely so a future gap between the two is never a correctness
 * problem, only ever a fact about which write path touched last.
 *
 * One divergence is NOT left standing, though: a standalone `username: null` clear (no `connection`
 * supplied in the same call) re-seals the existing token WITHOUT a username, rather than leaving the
 * old ciphertext in place. Skipping that reseal would be invisible to every non-decrypting reader
 * (`describeCredential`/`listCustomCredentials` never look at the sealed copy at all) but would
 * silently resurrect the just-cleared value the moment `resolveCustomCredentialByLabel` — the one
 * decrypting reader — hit a row whose column is `undefined` and fell back to the stale embedded
 * username.
 *
 * @complexity O(1) — one read, at most one seal, one update, plus one extra decrypt+seal on a
 *   standalone username clear.
 */
/** The four "keep existing unless a new value was supplied" scalar fields `updateCustomCredential`
 *  can patch — validates each supplied value, otherwise keeps `existing`'s as-is. Extracted so the
 *  orchestrator's own body reads as pure sequencing. */
function resolveUpdatedScalarFields(
  existing: CustomCredentialSetRecord,
  input: UpdateCustomCredentialInput
): Pick<CustomCredentialSetRecord, "label" | "category" | "baseUrl" | "additionalHosts"> {
  return {
    label: input.label !== undefined ? validateLabel(input.label) : existing.label,
    category: input.category !== undefined ? validateCategory(input.category) : existing.category,
    baseUrl: input.baseUrl !== undefined ? validateBaseUrl(input.baseUrl) : existing.baseUrl,
    additionalHosts: input.additionalHosts !== undefined ? validateAdditionalHosts(input.additionalHosts) : existing.additionalHosts,
  };
}

/**
 * Resolves the `sealed`/`username` pair for an update, applying the documented precedence (see
 * {@link updateCustomCredential}'s own doc for the full writeup):
 *
 * `username` tracks the CONNECTION, not the row: replacing the connection replaces the username
 * (including clearing it, when the new connection omits one — the two are one credential, and a
 * rotation that dropped the username while the old one lingered in the column would be a lie).
 * Omitting `connection` entirely leaves both the ciphertext and the username exactly as they were,
 * matching this store's documented "omitting `connection` keeps the secret" contract.
 *
 * The top-level `username` field is then applied AFTER `connection` so it can override whatever the
 * block above just computed. Left as a no-op (not even revalidated) when omitted, so a caller that
 * never mentions `username` keeps exactly what `connection` decided (or `existing.username`, if
 * `connection` was omitted too) — the untouched-unless-asked contract every other optional field on
 * this store already has.
 *
 * An explicit clear (`username: null`) with no `connection` replacement additionally re-seals with
 * the existing token and no username: skipping that would leave `sealed` still carrying the OLD
 * username inside the ciphertext, and `resolveCustomCredentialByLabel` falls back to that embedded
 * value whenever the plaintext column is `undefined` (its own doc explains why: half-migrated rows)
 * — so without this reseal the clear would silently resurrect on the next decrypting read. Not
 * needed for the "set a new value" case: the column always wins over the sealed copy once it holds
 * a real value, so that divergence never surfaces to a reader (see `update-username.unit.test.ts`'s
 * byte-identical assertion for that case, which this function must not disturb).
 *
 * @complexity O(1) — at most one seal, plus one extra decrypt+seal on a standalone username clear.
 */
async function resolveSealedAndUsername(
  deps: CustomCredentialWriteDeps,
  input: UpdateCustomCredentialInput,
  existing: CustomCredentialSetRecord
): Promise<{ sealed: CustomCredentialSetRecord["sealed"]; username: string | undefined }> {
  let sealed = existing.sealed;
  let username = existing.username;

  if (input.connection !== undefined) {
    const connection = validateConnection(input.connection);
    sealed = await sealConnection(deps, { workspaceId: input.workspaceId, id: input.id, connection });
    username = connection.username;
  }

  if (input.username !== undefined) {
    username = validateUsernamePatch(input.username);
    if (username === undefined && input.connection === undefined) {
      const oldConnection = await decryptRecord(deps.sealer, existing);
      sealed = await sealConnection(deps, { workspaceId: input.workspaceId, id: input.id, connection: { token: oldConnection.token } });
    }
  }

  return { sealed, username };
}

export async function updateCustomCredential(deps: CustomCredentialWriteDeps, input: UpdateCustomCredentialInput): Promise<CustomCredentialSummary> {
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) {
    throw new CustomCredentialNotFoundError(`no custom credential '${input.id}' in this workspace`);
  }

  const scalarFields = resolveUpdatedScalarFields(existing, input);
  const now: ISODateTime = deps.clock.nowIso();
  const { sealed, username } = await resolveSealedAndUsername(deps, input, existing);

  const record: CustomCredentialSetRecord = {
    workspaceId: input.workspaceId,
    id: input.id,
    ...scalarFields,
    ...(username !== undefined ? { username } : {}),
    sealed,
    createdAt: existing.createdAt,
    updatedAt: now,
  };

  try {
    await deps.repo.update(record);
  } catch (err) {
    if (isUniqueLabelViolation(err)) {
      throw new CustomCredentialDuplicateLabelError(`a custom credential labeled '${scalarFields.label}' already exists in this workspace`);
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
): Promise<{ id: UUID; category: CustomCredentialCategoryId; baseUrl: string; additionalHosts: readonly string[]; connection: CustomProviderConnectionInput } | null> {
  const records = await deps.repo.listByWorkspace({ workspaceId: input.workspaceId });
  const record = records.find((row) => row.label === input.label);
  if (!record) return null;
  const decrypted = await decryptRecord(deps.sealer, record);
  // The plaintext column WINS over the sealed copy when both are present — it is the authoritative
  // home as of 2026-09-01 and the only one a write can update on its own. The sealed copy is the
  // fallback purely for rows the Pass 1 backfill has not reached yet (or could not decrypt), so this
  // resolver keeps returning the right username on a half-migrated database, in either direction.
  const username = record.username ?? decrypted.username;
  const connection: CustomProviderConnectionInput = { token: decrypted.token, ...(username !== undefined ? { username } : {}) };
  return { id: record.id, category: record.category, baseUrl: record.baseUrl, additionalHosts: record.additionalHosts, connection };
}
