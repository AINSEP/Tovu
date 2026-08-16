import type { ClockPort, ISODateTime, UUID } from "@jini-ai/cms/core";

import type { KeyringPort, SecretSealerPort } from "../../../integrations/ports";
import { buildPublishCredentialAad } from "./aad";
import type {
  PublishConnectionInput,
  PublishCredentialSetRecord,
  PublishCredentialSetRepoPort,
  PublishCredentialSummary,
  PublishProviderId,
} from "./types";

/**
 * @file Two strictly separated operations on `publish_credential_sets`, per this dispatch's brief and
 * Terra's design — never blur the line between them:
 *
 * - {@link describeCredential}/{@link listPublishCredentials} — read model only. Never decrypts, never
 *   touches `sealer`/`keyring` at all, so neither can fail on a misconfigured master secret. This is
 *   what the GET route, the read-only agent tool, and any other "is X configured" caller must use.
 * - {@link resolveForPublish} — the ONLY function in this module that decrypts. Never called from
 *   preview, never called from anything agent-facing (mirrors `site-credential-store.ts`'s own
 *   `resolveSiteAssistantApiKey` split, one level stricter: that one function name signals "decrypts"
 *   loudly enough that a future caller cannot reach for it by accident the way a generically-named
 *   `getCredential` might invite).
 *
 * Plus the three write operations ({@link createPublishCredential}, {@link updatePublishCredential},
 * {@link deletePublishCredential}) — validate-then-write, mirroring `setSiteAssistantCredential`'s
 * shape. `connection`, when supplied, is ALWAYS resealed as a fresh ciphertext (never a re-wrap of the
 * old one) under a fresh AAD bound to that row's own `(workspaceId, providerId, id)` — see
 * `./aad.ts`'s `buildPublishCredentialAad`.
 */

const MAX_LABEL_LENGTH = 200;
const PROVIDER_IDS: ReadonlySet<PublishProviderId> = new Set(["github-pages", "vercel", "netlify", "cloudflare-pages"]);

/** Type-predicate wrapper around `PROVIDER_IDS.has()` — `Set<T>.has()` alone does not narrow its
 *  argument's static type, so `validateConnection` below would otherwise see `providerId` as a plain
 *  `string` even after the runtime membership check. */
function isPublishProviderId(value: string): value is PublishProviderId {
  return PROVIDER_IDS.has(value as PublishProviderId);
}

export class PublishCredentialValidationError extends Error {}

/** A `(workspaceId, providerId, label)` collision — the route maps this to `409 DUPLICATE_LABEL`. */
export class PublishCredentialDuplicateLabelError extends Error {}

/** Thrown when `sealer.seal()`/`keyring.activeKey()` fails while writing a connection — the realistic
 *  cause is a missing master secret (`TOVU_INTEGRATIONS_ROOT_KEY`), same fail-closed contract
 *  `SiteAssistantSecretStoreUnconfiguredError` documents for the sibling ADR-058 table. */
export class PublishCredentialSecretStoreUnconfiguredError extends Error {}

function toSummary(record: PublishCredentialSetRecord): PublishCredentialSummary {
  return {
    id: record.id,
    providerId: record.providerId,
    label: record.label,
    configured: true,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export interface PublishCredentialReadDeps {
  repo: PublishCredentialSetRepoPort;
}

/**
 * The read model for ONE credential set. Pure DB read — no sealer, no keyring, cannot fail on a
 * misconfigured master secret. Returns `null` if no row exists for `(workspaceId, id)` (not an error —
 * the caller decides whether that is a 404).
 *
 * @complexity O(1) — one `findById` lookup.
 * @overallScore 100
 */
export async function describeCredential(
  deps: PublishCredentialReadDeps,
  input: { workspaceId: UUID; id: UUID }
): Promise<PublishCredentialSummary | null> {
  const record = await deps.repo.findById(input);
  return record ? toSummary(record) : null;
}

/**
 * The read model for EVERY credential set a workspace has saved — what `GET .../publish/credentials`
 * returns. Same "never decrypts" contract as {@link describeCredential}.
 *
 * @complexity O(n) in the workspace's own (small — see `PublishCredentialSetRepoPort.listByWorkspace`'s
 *   own doc) credential-set count. One repo read, one array map, no per-row I/O.
 * @overallScore 100
 */
export async function listPublishCredentials(deps: PublishCredentialReadDeps, input: { workspaceId: UUID }): Promise<PublishCredentialSummary[]> {
  const records = await deps.repo.listByWorkspace(input);
  return records.map(toSummary);
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
  return raw;
}

function requireNonEmptyString(raw: unknown, field: string, providerId: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new PublishCredentialValidationError(`'${field}' (non-empty string) is required for provider '${providerId}'`);
  }
  return raw;
}

function optionalString(raw: unknown, field: string): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new PublishCredentialValidationError(`'${field}' must be a non-empty string when provided`);
  }
  return raw;
}

/**
 * Validates a caller-supplied `connection` against its own provider's required/optional shape (see
 * `types.ts`'s per-variant doc comments for exactly which fields are hard-required). Never throws a
 * raw shape error — every rejection is a {@link PublishCredentialValidationError}.
 *
 * @complexity O(1) — fixed-shape field reads, no iteration.
 * @overallScore 100
 */
function validateConnection(raw: unknown): PublishConnectionInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PublishCredentialValidationError("connection must be an object");
  }
  const value = raw as Record<string, unknown>;
  const providerId = value.providerId;
  if (typeof providerId !== "string" || !isPublishProviderId(providerId)) {
    throw new PublishCredentialValidationError(`connection.providerId must be one of: ${[...PROVIDER_IDS].join(", ")}`);
  }
  const token = requireNonEmptyString(value.token, "token", providerId);

  if (providerId === "github-pages") {
    const owner = requireNonEmptyString(value.owner, "owner", providerId);
    const repo = requireNonEmptyString(value.repo, "repo", providerId);
    return { providerId, token, owner, repo };
  }
  if (providerId === "vercel") {
    const teamId = optionalString(value.teamId, "teamId");
    return { providerId, token, ...(teamId !== undefined ? { teamId } : {}) };
  }
  if (providerId === "netlify") {
    const siteId = optionalString(value.siteId, "siteId");
    return { providerId, token, ...(siteId !== undefined ? { siteId } : {}) };
  }
  // providerId === "cloudflare-pages" — accountId is HARD required, never publishable without it
  // (Cloudflare Pages has no account-scope-free API surface — see `types.ts`'s own doc comment).
  const accountId = requireNonEmptyString(value.accountId, "accountId", providerId);
  const projectName = optionalString(value.projectName, "projectName");
  return { providerId, token, accountId, ...(projectName !== undefined ? { projectName } : {}) };
}

/** Wraps `sealer.seal()`/`keyring.activeKey()` failure into the fail-closed
 *  {@link PublishCredentialSecretStoreUnconfiguredError} contract — never falls through to a
 *  plaintext write. */
async function sealConnection(
  deps: PublishCredentialWriteDeps,
  input: { workspaceId: UUID; providerId: PublishProviderId; id: UUID; connection: PublishConnectionInput }
) {
  try {
    const activeKey = await deps.keyring.activeKey();
    const aad = buildPublishCredentialAad({ workspaceId: input.workspaceId, providerId: input.providerId, id: input.id });
    return await deps.sealer.seal({ plaintext: JSON.stringify(input.connection), key: activeKey, aad });
  } catch (err) {
    throw new PublishCredentialSecretStoreUnconfiguredError(
      `publish credential secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** True iff `err` is the underlying SQLite driver's "UNIQUE constraint failed" error — same
 *  detection shape `forms/repo.sqlite.ts`/`integrations/repo.sqlite.ts`/`media-repo.sqlite.ts` already
 *  use elsewhere in this codebase for the identical problem (better-sqlite3 has no typed
 *  constraint-violation error class, only a `code` string and a message substring). */
export function isUniqueLabelViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return code === "SQLITE_CONSTRAINT_UNIQUE" || err.message.includes("UNIQUE constraint failed");
}

export interface CreatePublishCredentialInput {
  workspaceId: UUID;
  label: unknown;
  connection: unknown;
}

/**
 * Validates, seals, and inserts a new credential set. `id` is minted here (`deps.idGen`), not
 * caller-supplied — matches this table's own "caller cannot choose an existing row's identity" shape.
 *
 * @throws {PublishCredentialValidationError} `label`/`connection` fails shape validation.
 * @throws {PublishCredentialDuplicateLabelError} `(workspaceId, providerId, label)` already exists.
 * @throws {PublishCredentialSecretStoreUnconfiguredError} The master secret is unavailable.
 * @complexity O(1) — one keyring derivation, one seal, one insert (which may itself throw on the
 *   UNIQUE index, translated here rather than propagated raw).
 * @overallScore 100
 */
export async function createPublishCredential(deps: PublishCredentialWriteDeps, input: CreatePublishCredentialInput): Promise<PublishCredentialSummary> {
  const label = validateLabel(input.label);
  const connection = validateConnection(input.connection);
  const id = deps.idGen.newId();
  const now = deps.clock.nowIso();

  const sealed = await sealConnection(deps, { workspaceId: input.workspaceId, providerId: connection.providerId, id, connection });
  const record: PublishCredentialSetRecord = {
    workspaceId: input.workspaceId,
    id,
    providerId: connection.providerId,
    label,
    sealed,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await deps.repo.insert(record);
  } catch (err) {
    if (isUniqueLabelViolation(err)) {
      throw new PublishCredentialDuplicateLabelError(`a '${connection.providerId}' credential labeled '${label}' already exists in this workspace`);
    }
    throw err;
  }
  return toSummary(record);
}

export class PublishCredentialNotFoundError extends Error {}

export interface UpdatePublishCredentialInput {
  workspaceId: UUID;
  id: UUID;
  /** Omitted = leave the label unchanged. */
  label?: unknown;
  /** Omitted = leave the stored connection (and its provider) untouched — this route's own
   *  "connection omitted => keep the stored secret untouched" contract. Supplying a NEW connection
   *  may change `providerId`; the AAD is rebuilt for the (possibly new) provider either way, since
   *  `id` (the third AAD component) never changes across an update. */
  connection?: unknown;
}

/**
 * Validate-then-write for an existing credential set. Mirrors `setSiteAssistantCredential`'s
 * "omitted field is left alone" contract exactly.
 *
 * @throws {PublishCredentialNotFoundError} No row exists for `(workspaceId, id)`.
 * @throws {PublishCredentialValidationError} A supplied `label`/`connection` fails validation.
 * @throws {PublishCredentialDuplicateLabelError} The (possibly renamed) `(providerId, label)` collides
 *   with a different row.
 * @throws {PublishCredentialSecretStoreUnconfiguredError} A new `connection` was supplied but the
 *   master secret is unavailable.
 * @complexity O(1) — one read, at most one seal, one update.
 * @overallScore 100
 */
export async function updatePublishCredential(deps: PublishCredentialWriteDeps, input: UpdatePublishCredentialInput): Promise<PublishCredentialSummary> {
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  if (!existing) {
    throw new PublishCredentialNotFoundError(`no publish credential '${input.id}' in this workspace`);
  }

  const label = input.label !== undefined ? validateLabel(input.label) : existing.label;
  const now: ISODateTime = deps.clock.nowIso();

  let providerId = existing.providerId;
  let sealed = existing.sealed;
  if (input.connection !== undefined) {
    const connection = validateConnection(input.connection);
    providerId = connection.providerId;
    sealed = await sealConnection(deps, { workspaceId: input.workspaceId, providerId, id: input.id, connection });
  }

  const record: PublishCredentialSetRecord = {
    workspaceId: input.workspaceId,
    id: input.id,
    providerId,
    label,
    sealed,
    createdAt: existing.createdAt,
    updatedAt: now,
  };

  try {
    await deps.repo.update(record);
  } catch (err) {
    if (isUniqueLabelViolation(err)) {
      throw new PublishCredentialDuplicateLabelError(`a '${providerId}' credential labeled '${label}' already exists in this workspace`);
    }
    throw err;
  }
  return toSummary(record);
}

/**
 * Deletes a credential set. No-op (not an error) if no row exists for `(workspaceId, id)` — matches
 * `PublishCredentialSetRepoPort.delete`'s own idempotent contract and this feature's `DELETE`
 * route's documented 204-always behavior.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export async function deletePublishCredential(deps: PublishCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<void> {
  await deps.repo.delete(input);
}

/**
 * The ONLY decrypting read in this module — see this file's header. Resolves a credential set's full
 * `PublishConnectionInput`, ready for a real publish call. Distinguishes "no such row"
 * (`null`, a normal, expected outcome — a caller-supplied id that does not exist) from a genuine
 * decrypt failure (thrown — a tampered/corrupt row or a missing master secret, both real operator-
 * visible problems that must not be swallowed into a silent `null` the way the SITE assistant's own
 * `resolveSiteAssistantApiKey` deliberately does for its own, lower-stakes, degrade-not-500 contract;
 * a publish credential resolves for a human-triggered write with real external effect, so a decrypt
 * failure here should surface, not degrade).
 *
 * @throws Whatever `SecretSealerPort.open()` throws (bad AAD, tampered ciphertext, wrong key) or
 *   `KeyringPort` throws for a missing master secret.
 * @complexity O(1) — one repo read, one decrypt, one `JSON.parse`.
 * @overallScore 100
 */
export async function resolveForPublish(
  deps: { repo: PublishCredentialSetRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID; id: UUID }
): Promise<{ providerId: PublishProviderId; label: string; connection: PublishConnectionInput } | null> {
  const record = await deps.repo.findById(input);
  if (!record) return null;

  const aad = buildPublishCredentialAad({ workspaceId: record.workspaceId, providerId: record.providerId, id: record.id });
  const plaintext = await deps.sealer.open({ sealed: record.sealed, aad });
  const connection = JSON.parse(plaintext) as PublishConnectionInput;
  return { providerId: record.providerId, label: record.label, connection };
}
