import { normalizeCredentialWorksFor, VaultError, type VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import { CredentialInputError, CREDENTIAL_MESSAGES, assertCredentialFreeField, normalizeCredentialToken } from '../../contracts/core/credential-token.js';
import type { Clock as ClockPort, UUID } from "@jini-ai/core/primitives";

import { isUniqueViolation } from "../../platform/db/kernel/dialect.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
import { byVaultLabel, createTovuStoreVault } from "#src/platform/secrets/vault-kinds";
import { customVaultRecord, customVaultScope } from "./vault-repo.js";
import { credentialDeletionRepo, credentialCreateTarget, credentialScopes, type ScopedCredentialDeps } from "../vendor-credentials/project-scope.js";
import {
  CUSTOM_CREDENTIAL_CATEGORIES,
  type CustomCredentialCategoryId,
  type CustomCredentialScope,
  type CustomCredentialSetRecord,
  type CustomCredentialSetRepoPort,
  type CustomCredentialSummary,
  type CustomProviderConnectionInput,
} from "./types.js";

/**
 * @file Feature validation and CRUD over Jini's vault. Public summaries contain saved origins,
 * usernames and safe hints only. Tokens live in sealed JSON; boot/recovery owns legacy decoding.
 * Label selection and origin checks never open unrelated credentials.
 */

const MAX_LABEL_LENGTH = 200;
const CATEGORY_IDS: ReadonlySet<CustomCredentialCategoryId> = new Set(CUSTOM_CREDENTIAL_CATEGORIES);

function isCustomCredentialCategoryId(value: string): value is CustomCredentialCategoryId {
  return CATEGORY_IDS.has(value as CustomCredentialCategoryId);
}

export class CustomCredentialValidationError extends Error {}

/** A `(workspaceId, label)` collision — the route maps this to `409 DUPLICATE_LABEL`. */
export class CustomCredentialDuplicateLabelError extends Error {}

/** A share copied an older revision; the concurrently changed site row remains intact. */
export class CustomCredentialConcurrentModificationError extends Error {}

/** Thrown when `sealer.seal()`/`keyring.activeKey()` fails while writing a connection — the
 *  realistic cause is a missing site key (`TOVU_SITE_KEY`), same fail-closed
 *  contract every sibling credential table's store documents. */
export class CustomCredentialSecretStoreUnconfiguredError extends Error {}

export class CustomCredentialNotFoundError extends Error {}

/** Safe hints are stored with the envelope; no per-row decrypt is needed for readback. `scope` is
 *  reported only where a project store is attached, so a site-only server's summaries are unchanged. */
async function toSummary(record: CustomCredentialSetRecord, optional: { scope?: CustomCredentialScope } = {}): Promise<CustomCredentialSummary> {
  const row = record.vaultRecord;
  return { credentialType: "custom", worksFor: [...(record.worksFor ?? [])], id: record.id, label: record.label, category: record.category, baseUrl: record.baseUrl,
    additionalHosts: record.additionalHosts, ...(record.username !== undefined ? { username: record.username } : {}),
    configured: true, tokenHint: row?.tokenLength === null || row?.tokenLength === undefined ? null :
      { length: row.tokenLength, last4: row.tokenLength >= 12 ? row.last4 : null },
    ...(optional.scope ? { scope: optional.scope } : {}),
    createdAt: record.createdAt, updatedAt: record.updatedAt };
}

/** A row and the store holding it (`vendor-credentials/project-scope.ts`: this site's own vault first,
 *  then the project half `types.ts`'s `repo.project` attaches), with the deps that open it. */
interface Located<D> { readonly scoped: ScopedCredentialDeps<D>; readonly record: CustomCredentialSetRecord }

/** The summary's `scope`, only when a project store is attached. */
const reportedScope = (deps: CustomCredentialInventoryDeps, scoped: ScopedCredentialDeps<unknown>): { scope?: CustomCredentialScope } =>
  deps.repo.project ? { scope: scoped.scope } : {};

/** The row with this id, from the first store holding it (ids are unique across both). @complexity O(scopes). */
async function locateById<D extends CustomCredentialReadDeps>(deps: D, input: { workspaceId: UUID; id: UUID }): Promise<Located<D> | null> {
  for (const scoped of credentialScopes(deps, input.workspaceId)) {
    const record = await scoped.deps.repo.findById({ workspaceId: scoped.workspaceId, id: input.id });
    if (record) return { scoped, record };
  }
  return null;
}

/**
 * Every row this site uses, in label order: its own rows, then project rows whose label no site row
 * already claims (a site row of the same label is the override).
 * @complexity O(n log n) in the two stores' (small) credential counts; no row is opened.
 */
async function listEffective<D extends CustomCredentialInventoryDeps>(deps: D, workspaceId: UUID): Promise<Located<D>[]> {
  const found: Located<D>[] = [];
  const labels = new Set<string>();
  for (const scoped of credentialScopes(deps, workspaceId)) {
    const records = await scoped.deps.repo.listByWorkspace({ workspaceId: scoped.workspaceId });
    for (const record of records.filter((row) => !labels.has(row.label))) found.push({ scoped, record });
    for (const record of records) labels.add(record.label);
  }
  return found.sort((a, b) => byVaultLabel(a.record, b.record));
}

/** Presence inventory never needs a sealer or write ports. */
export interface CustomCredentialInventoryDeps {
  repo: Pick<CustomCredentialSetRepoPort, "listByWorkspace" | "project">;
}

export interface CustomCredentialReadDeps {
  repo: CustomCredentialSetRepoPort;
  sealer?: SecretSealerPort;
}

/**
 * The read model for ONE credential set. Pure DB read — no sealer, no keyring, cannot fail on a
 * misconfigured site key. Returns `null` if no row exists for `(workspaceId, id)` (not an
 * error — the caller decides whether that is a 404).
 *
 * @complexity O(1) — one `findById` lookup.
 */
export async function describeCredential(deps: CustomCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<CustomCredentialSummary | null> {
  const located = await locateById(deps, input);
  return located ? toSummary(located.record, reportedScope(deps, located.scoped)) : null;
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
  const located = (await listEffective(deps, input.workspaceId)).find(({ record }) => record.label === input.label);
  return located ? toSummary(located.record, reportedScope(deps, located.scoped)) : null;
}

/**
 * The effective credential sets this workspace uses. The admin inventory has its own unfiltered
 * read model below. Same "never decrypts" contract as {@link describeCredential}.
 *
 * @complexity O(n) in the workspace's own (small) credential-set count. One repo read, one array
 *   map, no per-row I/O.
 */
export async function listCustomCredentials(deps: CustomCredentialInventoryDeps, input: { workspaceId: UUID }): Promise<CustomCredentialSummary[]> {
  const located = await listEffective(deps, input.workspaceId);
  return Promise.all(located.map(({ scoped, record }) => toSummary(record, reportedScope(deps, scoped))));
}

/** Admin inventory includes unattached project keys and same-label site overrides. The existing
 * guarded metadata repo exposes those rows without changing runtime credential resolution.
 * @param required Metadata repositories and the current site's workspace id.
 * @returns Safe summaries only; never opens an envelope.
 * @throws Repository or metadata-validation errors propagate to the admin adapter.
 * @complexity O(n log n) time and O(n) space for n saved keys; at most two store reads, no per-key I/O.
 * @example await listCustomCredentialInventory({ deps, workspaceId });
 */
export async function listCustomCredentialInventory({ deps, workspaceId }: {
  deps: CustomCredentialInventoryDeps; workspaceId: UUID;
}, _optional = {}): Promise<CustomCredentialSummary[]> {
  const inventoryDeps = { ...deps, repo: credentialDeletionRepo({ repo: deps.repo }) };
  const stores = await Promise.all(credentialScopes(inventoryDeps, workspaceId).map(async scoped => {
    const records = await scoped.deps.repo.listByWorkspace({ workspaceId: scoped.workspaceId });
    return Promise.all(records.map(record => toSummary(record, reportedScope(deps, scoped))));
  }));
  return stores.flat().sort((a, b) => a.label.localeCompare(b.label));
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
  assertPlainField({ value: raw, field: "label" });
  return raw;
}

/** Narrows and validates a caller-supplied `category` against the Access Tokens page's own known
 *  set — see `types.ts`'s `CustomCredentialCategoryId` doc for why this list is duplicated (not
 *  imported) from the admin app. */
function validateCategory(raw: unknown): CustomCredentialCategoryId {
  if (typeof raw === "string") assertPlainField({ value: raw, field: "category" });
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
  assertPlainField({ value: raw, field: "baseUrl" });
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
  assertPlainField({ value: raw, field: "additionalHosts" });
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
  assertPlainField({ value: raw, field: "username" });
  return raw;
}

/**
 * Validates a caller-supplied `connection` — just `{token, username?}`, no provider dispatch (see
 * this file's own header). Never throws a raw shape error — every rejection is a
 * {@link CustomCredentialValidationError}.
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
  catch (err) { if (err instanceof CredentialInputError) throw new CustomCredentialValidationError(err.message); throw err; }
}
function assertPlainField(required: { value: string; field: string }): void {
  try { assertCredentialFreeField(required); }
  catch (err) { if (err instanceof CredentialInputError) throw new CustomCredentialValidationError(err.message); throw err; }
}

function validateConnection(raw: unknown): CustomProviderConnectionInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CustomCredentialValidationError("connection must be an object");
  }
  const value = raw as Record<string, unknown>;
  const token = normalizeStoredToken({ value: value.token });
  const username = optionalString(value.username, "username");
  if (username !== undefined) assertPlainField({ value: username, field: "username" });
  return { token, ...(username !== undefined ? { username } : {}) };
}

export interface CreateCustomCredentialInput {
  workspaceId: UUID;
  label: unknown;
  category: unknown;
  baseUrl: unknown;
  connection: unknown;
  /** Omitted = no extra hosts beyond `baseUrl`. See `validateAdditionalHosts`'s own doc. */
  additionalHosts?: unknown;
  worksFor?: unknown;
  /** `"site"` = a site-owned key. Omitted (or `"project"`) = the project store when one is
   *  attached, visible to attached sites only; this site's vault otherwise. */
  scope?: unknown;
}

/** Where a new row is written (`vendor-credentials/project-scope.ts`): the project store unless "site".
 * @throws {CustomCredentialValidationError} `scope` is neither omitted, `"site"` nor `"project"`. */
const createTarget = <D extends CustomCredentialReadDeps>(deps: D, input: { workspaceId: UUID; scope?: unknown }): ScopedCredentialDeps<D> =>
  credentialCreateTarget(deps, input, message => new CustomCredentialValidationError(message));

const duplicateLabel = (label: string) => new CustomCredentialDuplicateLabelError(`a custom credential labeled '${label}' already exists in this workspace`);

/**
 * A project row whose label this site already uses would be hidden here by the site row (site rows
 * override), so the save would look lost: refused as the same duplicate as within one store.
 */
async function assertLabelFreeOnSite(deps: CustomCredentialReadDeps, input: { target: ScopedCredentialDeps<unknown>; workspaceId: UUID; label: string }): Promise<void> {
  if (input.target.scope !== "project") return;
  const site = await deps.repo.listByWorkspace({ workspaceId: input.workspaceId });
  if (site.some((row) => row.label === input.label)) throw duplicateLabel(input.label);
}

/**
 * Translates a failed insert/update of row `id` into the domain duplicate-label error, else rethrows.
 * @throws {CustomCredentialDuplicateLabelError} The store refused `label` as taken.
 * @throws The original error otherwise.
 */
async function throwSaveError(deps: CustomCredentialReadDeps, input: { err: unknown; target: ScopedCredentialDeps<unknown>; id: UUID; label: string }): Promise<never> {
  const { err, target, id, label } = input;
  // Unattached project rows are hidden from the normal reader. Check metadata only to distinguish
  // a duplicate label from a CAS conflict; never attach or open the existing credential.
  const inventory = credentialDeletionRepo({ repo: deps.repo }).project;
  const hiddenDuplicate = target.scope === "project" && err instanceof VaultError && err.code === "conflict"
    && (await inventory!.repo.listByWorkspace({ workspaceId: target.workspaceId })).some(row => row.label === label && row.id !== id);
  // The storage kernel recognizes the label's UNIQUE (workspace_id, …, label) index on any database.
  if (isUniqueViolation(err) || hiddenDuplicate) throw target.scope === "project" ? new CustomCredentialDuplicateLabelError(`Your project already has a key named '${label}'. Use it here, or pick another name.`) : duplicateLabel(label);
  throw err;
}

/**
 * Validates, seals, and inserts a new credential set. `id` is minted here (`deps.idGen`), not
 * caller-supplied.
 *
 * @throws {CustomCredentialValidationError} `label`/`category`/`baseUrl`/`connection` fails shape
 *   validation.
 * @throws {CustomCredentialDuplicateLabelError} `(workspaceId, label)` already exists.
 * @throws {CustomCredentialSecretStoreUnconfiguredError} The site key is unavailable.
 * @complexity O(1) plus one keyring derivation, one seal, and one insert (which may itself throw on
 *   the UNIQUE index, translated here rather than propagated raw).
 */
export async function createCustomCredential(deps: CustomCredentialWriteDeps, input: CreateCustomCredentialInput): Promise<CustomCredentialSummary> {
  const label = validateLabel(input.label);
  const category = validateCategory(input.category);
  const baseUrl = validateBaseUrl(input.baseUrl);
  const additionalHosts = validateAdditionalHosts(input.additionalHosts);
  const connection = validateConnection(input.connection);
  const target = createTarget(deps, input);
  await assertLabelFreeOnSite(deps, { target, workspaceId: input.workspaceId, label });
  const id = deps.idGen.newId();
  const prepared = await customVault(target.deps).prepare({ ...customVaultScope({ workspaceId: target.workspaceId, id }),
    id, expectedRevision: null, provider: null, label,
    meta: { credentialType: "custom", worksFor: validatedWorksFor({ value: input.worksFor === undefined ? [] : input.worksFor }), category, baseUrl, additionalHosts: [...additionalHosts], username: connection.username ?? null },
    payload: { token: connection.token }, hintToken: connection.token });
  const record = customVaultRecord({ row: prepared, expectedRevision: null });
  try { await target.deps.repo.insert(record); }
  catch (err) { return throwSaveError(deps, { err, target, id, label }); }
  return toSummary(record, reportedScope(deps, target));
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
  worksFor?: unknown;
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

/** Constrain one feature service; permission checks remain in routes/tools. */
function customVault(deps: CustomCredentialResolveDeps & Partial<CustomCredentialWriteDeps>, { kind = "vendor" }: { kind?: "vendor" | "custom" } = {}) {
  return createTovuStoreVault({ ...deps, kind,
    storageError: () => new CustomCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage) });
}

/** Validate metadata in its original order before inspecting a replacement connection. */
function updatedMetadata({ input, existing }: {
  input: UpdateCustomCredentialInput; existing: CustomCredentialSetRecord;
}, _options = {}) {
  const label = input.label !== undefined ? validateLabel(input.label) : existing.label;
  const category = input.category !== undefined ? validateCategory(input.category) : existing.category;
  const baseUrl = input.baseUrl !== undefined ? validateBaseUrl(input.baseUrl) : existing.baseUrl;
  const additionalHosts = input.additionalHosts !== undefined ? validateAdditionalHosts(input.additionalHosts) : existing.additionalHosts;
  return { label, category, baseUrl, additionalHosts };
}

/** Blank connection patches preserve both the envelope and its saved username. */
function updatedConnection({ input, existing }: {
  input: UpdateCustomCredentialInput; existing: CustomCredentialSetRecord;
}, _options = {}) {
  const connection = input.connection !== undefined && !isEmptyTokenPatch(input.connection) ? validateConnection(input.connection) : undefined;
  let username = connection ? connection.username : existing.username;
  if (input.username !== undefined) username = validateUsernamePatch(input.username);
  return { connection, username };
}

/** Partial update: blank/omitted connection preserves the envelope, replacing a connection resets
 * its username, and a supplied top-level username wins (null clears). Username is metadata only;
 * removing the old ciphertext fallback makes clear impossible to resurrect, without opening it.
 * @complexity Constant queries/seals plus metadata size; CAS rejects a concurrent replacement.
 */
export async function updateCustomCredential(deps: CustomCredentialWriteDeps, input: UpdateCustomCredentialInput): Promise<CustomCredentialSummary> {
  // Changed where it lives: this site's own row, else the project's attached row.
  const located = await locateById(deps, input);
  if (!located) throw new CustomCredentialNotFoundError(`no custom credential '${input.id}' in this workspace`);
  const { scoped, record: existing } = located;
  const { label, category, baseUrl, additionalHosts } = updatedMetadata({ input, existing });
  const { connection, username } = updatedConnection({ input, existing });
  // A rename gets the same site-label check as a create (`assertLabelFreeOnSite`).
  if (label !== existing.label) await assertLabelFreeOnSite(deps, { target: scoped, workspaceId: input.workspaceId, label });
  const expectedRevision = existing.vaultRecord!.revision;
  const kind = existing.vaultRecord!.kind === "custom" ? "custom" : "vendor";
  const prepared = await customVault(scoped.deps, { kind }).prepare({ ...customVaultScope({ workspaceId: scoped.workspaceId, kind }), id: input.id,
    expectedRevision, provider: null, label,
    meta: { ...existing.vaultRecord!.meta, worksFor: input.worksFor === undefined ? [...(existing.worksFor ?? [])] : validatedWorksFor({ value: input.worksFor }), category, baseUrl, additionalHosts: [...additionalHosts], username: username ?? null },
    ...(connection ? { payload: { token: connection.token }, hintToken: connection.token } : {}) });
  const record = customVaultRecord({ row: prepared, expectedRevision });
  try { await scoped.deps.repo.update(record); }
  catch (err) { return throwSaveError(deps, { err, target: scoped, id: input.id, label }); }
  return toSummary(record, reportedScope(deps, scoped));
}

/**
 * Deletes a credential set. No-op (not an error) if no row exists for `(workspaceId, id)` — matches
 * `CustomCredentialSetRepoPort.delete`'s own idempotent contract and this feature's `DELETE`
 * route's documented 204-always behavior.
 *
 * @complexity O(1).
 */
export async function deleteCustomCredential(deps: CustomCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<void> {
  // A project row is removed only when no other site uses it, with its attachments.
  const located = await locateById({ ...deps, repo: credentialDeletionRepo({ repo: deps.repo }) }, input);
  if (located) await located.scoped.deps.repo.delete({ workspaceId: located.scoped.workspaceId, id: input.id });
}

export interface CustomCredentialResolveDeps {
  repo: CustomCredentialSetRepoPort;
  sealer: SecretSealerPort;
}

/** Select by saved label without opening, then open only that row under its expected ownership.
 * Saved metadata is the authoritative source of allowed origins and username, including clears.
 * @throws CustomCredentialSecretStoreUnconfiguredError on crypto failure.
 * @complexity O(n) metadata selection, n workspace rows, plus one selected envelope open.
 */
export async function resolveCustomCredentialByLabel(
  deps: CustomCredentialResolveDeps,
  input: { workspaceId: UUID; label: string }
): Promise<{ id: UUID; category: CustomCredentialCategoryId; baseUrl: string; additionalHosts: readonly string[]; connection: CustomProviderConnectionInput } | null> {
  // Site row first, else the project's (`credentialScopes`); opened with the store that sealed it.
  const located = (await listEffective(deps, input.workspaceId)).find(({ record }) => record.label === input.label);
  if (!located) return null;
  const opened = await openLocated(located);
  if (!opened) return null;
  // Use metadata from the same read as the payload, so a concurrent origin/username update cannot
  // pair a new token with the old allowlist. Never fall back to an embedded legacy username.
  const { token, meta: current } = opened;
  return { id: located.record.id, category: current.category as CustomCredentialCategoryId, baseUrl: current.baseUrl as string,
    additionalHosts: current.additionalHosts as string[], connection: { token,
      ...(typeof current.username === "string" ? { username: current.username } : {}) } };
}

/** Opens one located row with the store that sealed it: its token and the metadata of that same read.
 * @throws CustomCredentialSecretStoreUnconfiguredError on crypto failure or a payload without a token. */
async function openLocated({ scoped, record }: Located<CustomCredentialResolveDeps>): Promise<{ token: string; meta: Record<string, unknown>; summary: VaultSummary } | null> {
  const kind = record.vaultRecord!.kind === "custom" ? "custom" : "vendor";
  const resolved = await customVault(scoped.deps, { kind }).get({ ...customVaultScope({ ...record, kind }), id: record.id });
  if (!resolved) return null;
  if (typeof resolved.payload?.token !== "string") throw new CustomCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage);
  return { token: resolved.payload.token, meta: resolved.summary.meta, summary: resolved.summary };
}

/** Keep the feature's HTTP validation error contract while reusing Jini's canonical ID parser. */
function validatedWorksFor({ value }: { value: unknown }, _options = {}): string[] {
  try { const ids = normalizeCredentialWorksFor({ value }); for (const id of ids) assertPlainField({ value: id, field: "worksFor" }); return ids; }
  catch (error) { if (error instanceof VaultError) throw new CustomCredentialValidationError("worksFor must be an array of provider IDs"); throw error; }
}
