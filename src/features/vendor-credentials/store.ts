import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SecretSealerPort } from "../../webhooks/index.js";
import { buildVendorCredentialAad } from "./aad.js";
import type {
  VendorConnectionInput,
  VendorCredentialSetRecord,
  VendorCredentialSetRepoPort,
  VendorCredentialSetSummary,
  VendorId,
} from "./types.js";

/**
 * @file Validate-then-seal-then-write CRUD over `vendor_credential_sets`, structurally mirroring
 * `../deployments/publish-credentials/store.ts` and `../source-control/store.ts` — see either
 * file's own header for the design this one copies; this header only documents where the merged
 * table's write path differs from BOTH of its predecessors.
 *
 * {@link describeCredential}/{@link listVendorCredentials} — read model only, never touch
 * `sealer`/`keyring` at all, so neither can fail on a misconfigured master secret.
 *
 * {@link createVendorCredential}/{@link updateVendorCredential}/{@link deleteVendorCredential} —
 * validate-then-write. `connection`, when supplied, is ALWAYS resealed as a fresh ciphertext (never
 * a re-wrap of the old one) under a fresh AAD bound to that row's own `(workspaceId, vendorId, id)` —
 * see `./aad.ts`'s `buildVendorCredentialAad`.
 *
 * `isDefault` invariant: a vendor's first-ever saved connection auto-defaults; `isDefault: true` on
 * create/update always wins; omitted/`false` never removes the CURRENT default without a
 * replacement — same contract both predecessor stores document for their own write paths.
 *
 * `tokenTail`: unlike `accountLabel`, this is NOT NULL and needs no network probe — it is derived
 * synchronously from the SAME plaintext `connection` object being sealed, on every create and every
 * connection-changing update. See `../../db/schema.ts`'s `vendorCredentialSets.tokenTail` doc for
 * which field is the "primary secret" per vendor.
 *
 * `accountLabel`: probed INLINE, at save time, for `github` only — the SAME choice
 * `source-control/store.ts` makes and the SAME reason: this table has no existing agent-facing
 * write path to protect the way `publish-credentials/store.ts`'s create/update is shared with
 * `deployment_propose_custom_provider_credential` (that tool still writes through the OLD
 * `publish_credential_sets` table as of this pass — see this file's own module doc in `index.ts` for
 * the not-yet-cut-over inventory). If a future agent-facing write path is added against THIS store,
 * revisit this choice the same way `publish-credentials/store.ts`'s own header explains its own
 * asymmetry with `source-control/store.ts`.
 *
 * `decryptRecord` below is written hardened from the start (typed `VendorCredentialSecretStore
 * UnconfiguredError`, never a raw `Error` escaping to an uncaught rejection) — both predecessor
 * stores had to learn this the hard way, live, on 2026-08-16 (`650b92f6`, `4cd31179`): a raw decrypt
 * failure with no route-level try/catch took down the WHOLE server/daemon process, not just the one
 * request. This store starts where those two ended up, not where they started.
 *
 * ## Why `probeAccountLabel`'s GitHub-login extractor is INJECTED, not imported (2026-08-17 SCC cut)
 *
 * This module used to value-import `extractGitHubLogin` (`../deployments/static-publish/index`) and
 * call it by name from {@link probeAccountLabel}. That closed a real cycle once `deployments`/
 * `static-publish` tried to convert to the tool-contribution registry: `assistant`'s own
 * `REAL_VENDOR_CREDENTIAL_PORT` wiring reaches `features/vendor-credentials` unconditionally (for
 * `list`/`create`/`update`/`providerToVendor` — genuinely load-bearing), which reached (via THIS
 * file, not `dual-read.ts`) back into `features/deployments` — see
 * `ADS-memory/reports/architecture/2026-08-17-vendor-credentials-cycle-design-options.md` for the
 * sibling edge this same session already cut in `dual-read.ts` (Option B); this file's own
 * `extractGitHubLogin` import was a second, previously-undocumented edge closing the identical class
 * of cycle one file over, found only once `deployments`/`static-publish` actually attempted
 * conversion on top of the `dual-read.ts` fix (see `features/deployments/tool-registrations.ts`'s and
 * `publish-agent-tools.ts`'s own trailing comments for the confirmed `check:architecture --list`
 * traces). `extractGitHubLogin` below is typed with a LOCALLY-declared structural signature
 * ({@link ExtractGitHubLogin}), not the imported function's own type — the exact same technique
 * `dual-read.ts` uses for `resolveLegacyPublish`/`resolveLegacySourceControl` and
 * `features/deployments/publish-agent-tools.ts` uses for its own `VendorCredentialPort`, both one hop
 * away on this same chain. Unlike `dual-read.ts`'s two functions (zero real callers at the time of
 * that fix), `createVendorCredential`/`updateVendorCredential` DO have a real production caller
 * today — `server/routes/admin/system/vendor-credentials.ts`'s `registerAdminVendorCredentialsRoutes`
 * — so this deps field is REQUIRED (no `?`), not left for a future wiring pass: a composition root
 * that forgets it gets a compile error, not a silent `probeAccountLabel` no-op. That route file wires
 * the real `extractGitHubLogin` in from `server/`, which — same reasoning `dual-read.ts`'s header
 * gives for its own deferred wiring — does not sit downstream of `deployments`'s/`static-publish`'s
 * own `registerToolContributor` edge. Wiring the real function back in from `assistant` instead would
 * silently reintroduce the exact cycle this cut removes.
 */

const MAX_LABEL_LENGTH = 200;
const VENDOR_IDS: ReadonlySet<VendorId> = new Set(["github", "gitlab", "bitbucket", "vercel", "netlify", "cloudflare", "s3-compatible"]);

/** Type-predicate wrapper around `VENDOR_IDS.has()` — same narrowing reasoning both predecessor
 *  stores' own `isPublishProviderId`/`isSourceControlProviderId` document. */
function isVendorId(value: string): value is VendorId {
  return VENDOR_IDS.has(value as VendorId);
}

export class VendorCredentialValidationError extends Error {}

/** A `(workspaceId, vendorId, label)` collision — the route maps this to `409 DUPLICATE_LABEL`. */
export class VendorCredentialDuplicateLabelError extends Error {}

/** Thrown when `sealer.seal()`/`keyring.activeKey()` fails while writing a connection, or when
 *  `decryptRecord` fails while reading one — the realistic cause is a missing master secret
 *  (`TOVU_INTEGRATIONS_ROOT_KEY`), same fail-closed contract both predecessor tables' own
 *  `*SecretStoreUnconfiguredError` classes document. */
export class VendorCredentialSecretStoreUnconfiguredError extends Error {}

export class VendorCredentialNotFoundError extends Error {}

function toSummary(record: VendorCredentialSetRecord): VendorCredentialSetSummary {
  return {
    id: record.id,
    vendorId: record.vendorId,
    label: record.label,
    configured: true,
    isDefault: record.isDefault,
    tokenTail: record.tokenTail,
    accountLabel: record.accountLabel,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export interface VendorCredentialReadDeps {
  repo: VendorCredentialSetRepoPort;
}

/**
 * The read model for ONE credential set. Pure DB read — no sealer, no keyring, cannot fail on a
 * misconfigured master secret. Returns `null` if no row exists for `(workspaceId, id)`.
 *
 * @complexity O(1) — one `findById` lookup.
 */
export async function describeCredential(deps: VendorCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<VendorCredentialSetSummary | null> {
  const record = await deps.repo.findById(input);
  return record ? toSummary(record) : null;
}

/**
 * The read model for EVERY credential set a workspace has saved — what a future
 * `GET .../vendor-credentials` route returns. Same "never decrypts" contract as
 * {@link describeCredential}.
 *
 * @complexity O(n) in the workspace's own (small) credential-set count.
 */
export async function listVendorCredentials(deps: VendorCredentialReadDeps, input: { workspaceId: UUID }): Promise<VendorCredentialSetSummary[]> {
  const records = await deps.repo.listByWorkspace(input);
  return records.map(toSummary);
}

/** Locally-declared structural stand-in for `static-publish/verify.ts`'s `extractGitHubLogin` — same
 *  shape, deliberately NOT that function's own imported type (see this file's header, "Why
 *  `probeAccountLabel`'s GitHub-login extractor is INJECTED, not imported"). A caller passing the
 *  real `extractGitHubLogin` satisfies this structurally with no adapter needed. */
type ExtractGitHubLogin = (body: unknown) => string | undefined;

export interface VendorCredentialWriteDeps extends VendorCredentialReadDeps {
  sealer: SecretSealerPort;
  keyring: KeyringPort;
  clock: ClockPort;
  idGen: { newId(): string };
  /** Injected by tests (mirrors `source-control/store.ts`'s own `fetchFn`); defaults to global
   *  `fetch`. Used only by {@link probeAccountLabel}. */
  fetchFn?: typeof fetch;
  /** Injected rather than imported — see this file's header ("Why `probeAccountLabel`'s GitHub-login
   *  extractor is INJECTED, not imported"). A real caller passes `static-publish/verify.ts`'s own
   *  `extractGitHubLogin` unchanged; this module never imports it by name. Required (no `?`): unlike
   *  `dual-read.ts`'s injected legacy resolvers, this one has a real production caller today, so a
   *  composition root that forgets it fails to compile rather than silently degrading the github
   *  account-label probe to always-null. */
  extractGitHubLogin: ExtractGitHubLogin;
}

function validateLabel(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new VendorCredentialValidationError("label must be a non-empty string");
  }
  if (raw.length > MAX_LABEL_LENGTH) {
    throw new VendorCredentialValidationError(`label must be ${MAX_LABEL_LENGTH} characters or fewer`);
  }
  return raw;
}

function requireNonEmptyString(raw: unknown, field: string, vendorId: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new VendorCredentialValidationError(`'${field}' (non-empty string) is required for vendor '${vendorId}'`);
  }
  return raw;
}

function optionalString(raw: unknown, field: string): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new VendorCredentialValidationError(`'${field}' must be a non-empty string when provided`);
  }
  return raw;
}

function optionalBoolean(raw: unknown, field: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "boolean") {
    throw new VendorCredentialValidationError(`'${field}' must be a boolean when provided`);
  }
  return raw;
}

/** Every vendor whose connection is `{token}` plus nothing else — the two smallest variants,
 *  factored out so `validateConnection`'s own per-vendor dispatch has one branch, not two
 *  near-identical ones. */
function validateBareTokenConnection(vendorId: "github" | "gitlab", value: Record<string, unknown>): VendorConnectionInput {
  return { vendorId, token: requireNonEmptyString(value.token, "token", vendorId) };
}

function validateBitbucketConnection(value: Record<string, unknown>): VendorConnectionInput {
  const token = requireNonEmptyString(value.token, "token", "bitbucket");
  const username = requireNonEmptyString(value.username, "username", "bitbucket");
  return { vendorId: "bitbucket", token, username };
}

function validateVercelConnection(value: Record<string, unknown>): VendorConnectionInput {
  const token = requireNonEmptyString(value.token, "token", "vercel");
  const teamId = optionalString(value.teamId, "teamId");
  return { vendorId: "vercel", token, ...(teamId !== undefined ? { teamId } : {}) };
}

function validateNetlifyConnection(value: Record<string, unknown>): VendorConnectionInput {
  const token = requireNonEmptyString(value.token, "token", "netlify");
  const siteId = optionalString(value.siteId, "siteId");
  return { vendorId: "netlify", token, ...(siteId !== undefined ? { siteId } : {}) };
}

/** `accountId` is HARD required — see `types.ts`'s `CloudflareVendorConnectionInput` doc. */
function validateCloudflareConnection(value: Record<string, unknown>): VendorConnectionInput {
  const token = requireNonEmptyString(value.token, "token", "cloudflare");
  const accountId = requireNonEmptyString(value.accountId, "accountId", "cloudflare");
  const projectName = optionalString(value.projectName, "projectName");
  return { vendorId: "cloudflare", token, accountId, ...(projectName !== undefined ? { projectName } : {}) };
}

/** No `token` field — see `types.ts`'s `S3CompatibleVendorConnectionInput` doc for why this vendor
 *  authenticates with an access-key/secret-key PAIR instead. */
function validateS3CompatibleConnection(value: Record<string, unknown>): VendorConnectionInput {
  const region = requireNonEmptyString(value.region, "region", "s3-compatible");
  const bucket = requireNonEmptyString(value.bucket, "bucket", "s3-compatible");
  const accessKeyId = requireNonEmptyString(value.accessKeyId, "accessKeyId", "s3-compatible");
  const secretAccessKey = requireNonEmptyString(value.secretAccessKey, "secretAccessKey", "s3-compatible");
  const publicUrl = requireNonEmptyString(value.publicUrl, "publicUrl", "s3-compatible");
  const endpoint = optionalString(value.endpoint, "endpoint");
  return { vendorId: "s3-compatible", region, bucket, accessKeyId, secretAccessKey, publicUrl, ...(endpoint !== undefined ? { endpoint } : {}) };
}

/**
 * Validates a caller-supplied `connection` against its own vendor's required/optional shape — see
 * `types.ts`'s per-variant doc comments. Mirrors `publish-credentials/store.ts`'s
 * `validateConnection` in spirit, widened to all seven vendors and split into one small validator
 * per vendor (above) so this dispatcher's own cyclomatic complexity stays proportional to "which
 * vendor" rather than also carrying each vendor's own field-shape logic inline.
 *
 * @complexity O(1) — one vendor-id switch, then a fixed-shape field read per branch, no iteration.
 */
function validateConnection(raw: unknown): VendorConnectionInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new VendorCredentialValidationError("connection must be an object");
  }
  const value = raw as Record<string, unknown>;
  const vendorId = value.vendorId;
  if (typeof vendorId !== "string" || !isVendorId(vendorId)) {
    throw new VendorCredentialValidationError(`connection.vendorId must be one of: ${[...VENDOR_IDS].join(", ")}`);
  }

  switch (vendorId) {
    case "github":
    case "gitlab":
      return validateBareTokenConnection(vendorId, value);
    case "bitbucket":
      return validateBitbucketConnection(value);
    case "vercel":
      return validateVercelConnection(value);
    case "netlify":
      return validateNetlifyConnection(value);
    case "cloudflare":
      return validateCloudflareConnection(value);
    case "s3-compatible":
      return validateS3CompatibleConnection(value);
  }
}

/** Extracts the last 4 characters of `connection`'s primary secret — `secretAccessKey` for
 *  `s3-compatible`, `token` for every other vendor. See `../../db/schema.ts`'s
 *  `vendorCredentialSets.tokenTail` doc.
 *
 * @complexity O(1).
 */
function deriveTokenTail(connection: VendorConnectionInput): string {
  const field = connection.vendorId === "s3-compatible" ? connection.secretAccessKey : connection.token;
  return field.slice(-4);
}

/** Same order of magnitude as `static-publish/verify.ts`'s own `VERIFY_TIMEOUT_MS` — a human is
 *  waiting on a form submit, not a background job. */
const ACCOUNT_LABEL_PROBE_TIMEOUT_MS = 10_000;

/**
 * Best-effort "who does this token belong to" probe, run inline at save time — see this file's own
 * header for why THIS table's `create`/`update` may do this today. NEVER throws: a network failure,
 * timeout, or non-2xx response degrades to `null` rather than failing the save. `github` reuses
 * `static-publish/verify.ts`'s reviewed `extractGitHubLogin` against `GET /user` (injected as
 * `extractLogin` — see this file's header for why); every other vendor returns `null`
 * unconditionally, with no request made — no reviewed single-field identity extractor exists for
 * gitlab/bitbucket/vercel/netlify/cloudflare/s3-compatible (same "never guess an unreviewed response
 * shape" discipline both predecessor stores document).
 *
 * Takes the whole `connection` (not a bare token) so a vendor with no `token` field at all
 * (`s3-compatible`) never needs a placeholder value threaded through just to satisfy this
 * function's signature — the early return below makes that field access unreachable for it.
 *
 * @complexity O(1) — one bounded HTTP request (skipped entirely for every vendor but github).
 */
async function probeAccountLabel(connection: VendorConnectionInput, fetchFn: typeof fetch, extractLogin: ExtractGitHubLogin): Promise<string | null> {
  if (connection.vendorId !== "github") return null;
  try {
    const resp = await fetchFn("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${connection.token}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(ACCOUNT_LABEL_PROBE_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const body: unknown = await resp.json();
    return extractLogin(body) ?? null;
  } catch {
    return null;
  }
}

/** Wraps `sealer.seal()`/`keyring.activeKey()` failure into the fail-closed
 *  {@link VendorCredentialSecretStoreUnconfiguredError} contract — never falls through to a
 *  plaintext write. */
async function sealConnection(
  deps: VendorCredentialWriteDeps,
  input: { workspaceId: UUID; vendorId: VendorId; id: UUID; connection: VendorConnectionInput }
) {
  try {
    const activeKey = await deps.keyring.activeKey();
    const aad = buildVendorCredentialAad({ workspaceId: input.workspaceId, vendorId: input.vendorId, id: input.id });
    return await deps.sealer.seal({ plaintext: JSON.stringify(input.connection), key: activeKey, aad });
  } catch (err) {
    throw new VendorCredentialSecretStoreUnconfiguredError(`vendor credential secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** True iff `err` is the underlying SQLite driver's "UNIQUE constraint failed" error — same
 *  detection shape both predecessor stores' own `isUniqueLabelViolation` use. */
export function isUniqueLabelViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || err.message.includes("UNIQUE constraint failed");
}

export interface CreateVendorCredentialInput {
  workspaceId: UUID;
  label: unknown;
  connection: unknown;
  /** `true` makes this the vendor's default connection. Omitted/`false` still auto-defaults if this
   *  turns out to be the vendor's FIRST saved connection — see {@link decideCreateDefault}. */
  isDefault?: unknown;
}

/** Always `true` for a vendor's first-ever saved connection, otherwise exactly the caller's own
 *  request. Same reasoning both predecessor stores' own `decideCreateDefault` document.
 *
 * @complexity O(1). */
function decideCreateDefault(existingForVendor: readonly unknown[], requested: boolean | undefined): boolean {
  return existingForVendor.length === 0 || requested === true;
}

/**
 * Validates, seals, and inserts a new credential set.
 *
 * @throws {VendorCredentialValidationError} `label`/`connection`/`isDefault` fails shape validation.
 * @throws {VendorCredentialDuplicateLabelError} `(workspaceId, vendorId, label)` already exists.
 * @throws {VendorCredentialSecretStoreUnconfiguredError} The master secret is unavailable.
 * @complexity O(n) in the vendor's own (small) existing-connection count, plus one keyring
 *   derivation, one seal, one best-effort probe (github only), and one insert.
 */
export async function createVendorCredential(deps: VendorCredentialWriteDeps, input: CreateVendorCredentialInput): Promise<VendorCredentialSetSummary> {
  const label = validateLabel(input.label);
  const connection = validateConnection(input.connection);
  const requestedDefault = optionalBoolean(input.isDefault, "isDefault");
  const id = deps.idGen.newId();
  const now = deps.clock.nowIso();

  const existingForVendor = await deps.repo.listByVendor({ workspaceId: input.workspaceId, vendorId: connection.vendorId });
  const isDefault = decideCreateDefault(existingForVendor, requestedDefault);

  const sealed = await sealConnection(deps, { workspaceId: input.workspaceId, vendorId: connection.vendorId, id, connection });
  const tokenTail = deriveTokenTail(connection);
  const accountLabel = await probeAccountLabel(connection, deps.fetchFn ?? fetch, deps.extractGitHubLogin);

  const record: VendorCredentialSetRecord = {
    workspaceId: input.workspaceId,
    id,
    vendorId: connection.vendorId,
    label,
    sealed,
    tokenTail,
    isDefault,
    accountLabel,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await deps.repo.insert(record);
  } catch (err) {
    if (isUniqueLabelViolation(err)) {
      throw new VendorCredentialDuplicateLabelError(`a '${connection.vendorId}' credential labeled '${label}' already exists in this workspace`);
    }
    throw err;
  }
  return toSummary(record);
}

export interface UpdateVendorCredentialInput {
  workspaceId: UUID;
  id: UUID;
  /** Omitted = leave the label unchanged. */
  label?: unknown;
  /** Omitted = leave the stored connection (and its vendor) untouched. */
  connection?: unknown;
  /** `true` makes this the default connection for its (possibly new) vendor, clearing any previous
   *  default in the same repo call. Omitted/`false` leaves default status UNCHANGED. */
  isDefault?: unknown;
}

/**
 * Validate-then-write for an existing credential set. Mirrors `publish-credentials/store.ts`'s
 * `updatePublishCredential` exactly, including its vendor-change default-promotion fix — see that
 * function's own doc for the full reasoning (a vendor change must not silently steal default status
 * from the new group, nor leave the old group defaultless).
 *
 * @throws {VendorCredentialNotFoundError} No row exists for `(workspaceId, id)`.
 * @throws {VendorCredentialValidationError} A supplied `label`/`connection`/`isDefault` fails
 *   validation.
 * @throws {VendorCredentialDuplicateLabelError} The (possibly renamed) `(vendorId, label)` collides
 *   with a different row.
 * @throws {VendorCredentialSecretStoreUnconfiguredError} A new `connection` was supplied but the
 *   master secret is unavailable.
 * @complexity O(1) — one read, at most one seal/probe, one update, and (only on a vendor change that
 *   demotes a stale default) one more read + update of the promoted row.
 */
export async function updateVendorCredential(deps: VendorCredentialWriteDeps, input: UpdateVendorCredentialInput): Promise<VendorCredentialSetSummary> {
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) {
    throw new VendorCredentialNotFoundError(`no vendor credential '${input.id}' in this workspace`);
  }

  const label = input.label !== undefined ? validateLabel(input.label) : existing.label;
  const requestedDefault = optionalBoolean(input.isDefault, "isDefault");
  const now: ISODateTime = deps.clock.nowIso();

  let vendorId = existing.vendorId;
  let sealed = existing.sealed;
  let tokenTail = existing.tokenTail;
  let accountLabel = existing.accountLabel;
  if (input.connection !== undefined) {
    const connection = validateConnection(input.connection);
    vendorId = connection.vendorId;
    sealed = await sealConnection(deps, { workspaceId: input.workspaceId, vendorId, id: input.id, connection });
    tokenTail = deriveTokenTail(connection);
    accountLabel = await probeAccountLabel(connection, deps.fetchFn ?? fetch, deps.extractGitHubLogin);
  }
  const vendorChanged = vendorId !== existing.vendorId;

  const isDefault =
    requestedDefault === true
      ? true
      : vendorChanged
        ? decideCreateDefault(await deps.repo.listByVendor({ workspaceId: input.workspaceId, vendorId }), undefined)
        : existing.isDefault;

  const record: VendorCredentialSetRecord = {
    workspaceId: input.workspaceId,
    id: input.id,
    vendorId,
    label,
    sealed,
    tokenTail,
    isDefault,
    accountLabel,
    createdAt: existing.createdAt,
    updatedAt: now,
  };

  try {
    await deps.repo.update(record);
  } catch (err) {
    if (isUniqueLabelViolation(err)) {
      throw new VendorCredentialDuplicateLabelError(`a '${vendorId}' credential labeled '${label}' already exists in this workspace`);
    }
    throw err;
  }

  // Same "the OTHER half of the same finding" promotion `publish-credentials/store.ts`'s own
  // `updatePublishCredential` performs — see that function's own doc for the full reasoning.
  if (vendorChanged && existing.isDefault) {
    const remainingInOldGroup = await deps.repo.listByVendor({ workspaceId: input.workspaceId, vendorId: existing.vendorId });
    if (remainingInOldGroup.length > 0) {
      const promoted = remainingInOldGroup.reduce((latest, row) => (row.updatedAt > latest.updatedAt ? row : latest));
      await deps.repo.update({ ...promoted, isDefault: true });
    }
  }

  return toSummary(record);
}

/**
 * Deletes a credential set. No-op (not an error) if no row exists for `(workspaceId, id)`.
 *
 * @complexity O(1) at this layer.
 */
export async function deleteVendorCredential(deps: VendorCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<void> {
  await deps.repo.delete(input);
}

/** Shared decrypt step for {@link resolveForVendor}/{@link resolveDefaultForVendor} — see this
 *  file's own header for why this is written hardened from the start rather than learning the
 *  lesson live the way both predecessor stores had to. */
async function decryptRecord(sealer: SecretSealerPort, record: VendorCredentialSetRecord): Promise<VendorConnectionInput> {
  const aad = buildVendorCredentialAad({ workspaceId: record.workspaceId, vendorId: record.vendorId, id: record.id });
  try {
    const plaintext = await sealer.open({ sealed: record.sealed, aad });
    return JSON.parse(plaintext) as VendorConnectionInput;
  } catch (err) {
    throw new VendorCredentialSecretStoreUnconfiguredError(
      `vendor credential could not be decrypted (secret store unconfigured, or the stored row is corrupted): ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * The ONLY decrypting read by id. Distinguishes "no such row" (`null`) from a genuine decrypt
 * failure (thrown) — same reasoning `publish-credentials/store.ts`'s `resolveForPublish` documents.
 *
 * @throws {VendorCredentialSecretStoreUnconfiguredError} `decryptRecord` failed.
 * @complexity O(1) — one repo read, one decrypt, one `JSON.parse`.
 */
export async function resolveForVendor(
  deps: { repo: VendorCredentialSetRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID; id: UUID }
): Promise<{ vendorId: VendorId; label: string; connection: VendorConnectionInput } | null> {
  const record = await deps.repo.findById(input);
  if (!record) return null;
  const connection = await decryptRecord(deps.sealer, record);
  return { vendorId: record.vendorId, label: record.label, connection };
}

/**
 * The provider-scoped sibling of {@link resolveForVendor}: resolves the DEFAULT credential set for
 * `(workspaceId, vendorId)` — what a real publish/commit attempt actually has (a target vendor,
 * never a specific saved connection's id).
 *
 * @throws {VendorCredentialSecretStoreUnconfiguredError} `decryptRecord` failed.
 * @complexity O(1) — one repo read, one decrypt, one `JSON.parse`.
 */
export async function resolveDefaultForVendor(
  deps: { repo: VendorCredentialSetRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID; vendorId: VendorId }
): Promise<{ id: UUID; label: string; connection: VendorConnectionInput } | null> {
  const record = await deps.repo.findDefaultByVendor(input);
  if (!record) return null;
  const connection = await decryptRecord(deps.sealer, record);
  return { id: record.id, label: record.label, connection };
}

/**
 * Persists a freshly-verified account label onto an existing row — a targeted single-column write
 * ({@link VendorCredentialSetRepoPort.updateAccountLabel}), not a full-row replace. Mirrors
 * `publish-credentials/store.ts`'s `healAccountLabel` exactly, for the same reserved-for-a-future
 * human-gated-verify-route reason (this store's own inline `probeAccountLabel` already covers the
 * save-time case for `github`; this exists for whoever builds a re-verify action later).
 *
 * @complexity O(1).
 */
export async function healAccountLabel(deps: VendorCredentialReadDeps, input: { workspaceId: UUID; id: UUID; accountLabel: string }): Promise<void> {
  await deps.repo.updateAccountLabel(input);
}
