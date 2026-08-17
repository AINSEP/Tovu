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
 *   `getCredential` might invite). Two legitimate callers exist today, both server-side, human-gated,
 *   never agent-facing: a real publish attempt (`static-publish/adapter.ts`'s `publishStaticSite`,
 *   via `PublishCredentialSource.resolve()`), and — 2026-08-16, this dispatch's Defect B fix —
 *   `static-publish/verify.ts`'s `verifyPublishCredentialById`, which decrypts ONE row to check it
 *   against its real provider (the "ready means a row exists, not a working credential" fix) and
 *   caches only a closed-enum verdict (`valid`/`invalid`/`unreachable`) plus a short message, never
 *   the decrypted connection itself. A third caller would need the same justification: server-side,
 *   never reachable from an agent tool, and never returning the decrypted value past its own scope.
 *

 * Plus the three write operations ({@link createPublishCredential}, {@link updatePublishCredential},
 * {@link deletePublishCredential}) — validate-then-write, mirroring `setSiteAssistantCredential`'s
 * shape. `connection`, when supplied, is ALWAYS resealed as a fresh ciphertext (never a re-wrap of the
 * old one) under a fresh AAD bound to that row's own `(workspaceId, providerId, id)` — see
 * `./aad.ts`'s `buildPublishCredentialAad`.
 *
 * Contract v2 Correction B (2026-08-15): {@link resolveDefaultForPublish} is the provider-scoped
 * sibling of `resolveForPublish` — it resolves the group's DEFAULT row for `(workspaceId,
 * providerId)` instead of requiring a caller-supplied `id`, which is what a real publish attempt
 * actually has (a target, never a specific saved connection's id). The write functions below decide
 * `isDefault` before calling into `PublishCredentialSetRepoPort` (see that port's own header for which
 * half of the invariant belongs to the repo): a provider's first-ever saved connection auto-defaults;
 * `isDefault: true` on create/update always wins; omitted/`false` never removes the CURRENT default
 * without a replacement (this module never produces a "zero defaults while rows exist" state — see
 * `decideCreateDefault`/`decideUpdateDefault`'s own doc comments).
 *
 * `accountLabel` (migration `0044`, 2026-08-16): {@link createPublishCredential} always starts a new
 * row at `accountLabel: null`, and {@link updatePublishCredential} resets it to `null` whenever a NEW
 * `connection` is supplied (a label naming the OLD token's account is worse than none once the token
 * itself has changed) — but NEITHER function ever populates a real value by probing a provider.
 * Deliberately: `createPublishCredential`/`updatePublishCredential` are the ONE write path this table
 * shares with an agent-facing caller (`publish-agent-tools.ts`'s `deployment_propose_custom_provider_
 * credential`, scoped to `providerId: "s3-compatible"`), and `static-publish/verify.ts`'s own header
 * is explicit that its provider probe must never run on an agent-reachable path. Putting a network
 * call here would put one on that path too, even though s3-compatible has no reviewed identity field
 * to read — the outbound request itself is the boundary violation, not just what it might return. The
 * real value is written by {@link healAccountLabel} instead, called ONLY from the admin route
 * (`server/routes/admin/system/publish-credentials.ts`) after its existing human-gated
 * `verifyPublishCredentialById` call succeeds with an `accountLabel` — the identical "human-gated
 * caller only" boundary `verify.ts` already documents for itself. This is a deliberate asymmetry with
 * `features/source-control/store.ts`'s own sibling column, which DOES probe inline in `create`/
 * `update` — that table has no agent-facing write path to protect (see its own header), so the same
 * objection does not apply there.
 */

const MAX_LABEL_LENGTH = 200;
const PROVIDER_IDS: ReadonlySet<PublishProviderId> = new Set(["github-pages", "vercel", "netlify", "cloudflare-pages", "s3-compatible"]);

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
    isDefault: record.isDefault,
    accountLabel: record.accountLabel,
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

  // s3-compatible has NO `token` field at all (spec `custom-publish-provider-contract.md` §4a/§4b —
  // it authenticates with an access-key/secret-key PAIR, not a single bearer token), so it branches
  // BEFORE the generic `token` requirement below, which every other provider in this union shares.
  if (providerId === "s3-compatible") {
    const region = requireNonEmptyString(value.region, "region", providerId);
    const bucket = requireNonEmptyString(value.bucket, "bucket", providerId);
    const accessKeyId = requireNonEmptyString(value.accessKeyId, "accessKeyId", providerId);
    const secretAccessKey = requireNonEmptyString(value.secretAccessKey, "secretAccessKey", providerId);
    const publicUrl = requireNonEmptyString(value.publicUrl, "publicUrl", providerId);
    const endpoint = optionalString(value.endpoint, "endpoint");
    return { providerId, region, bucket, accessKeyId, secretAccessKey, publicUrl, ...(endpoint !== undefined ? { endpoint } : {}) };
  }

  const token = requireNonEmptyString(value.token, "token", providerId);

  if (providerId === "github-pages") {
    // No owner/repo here — see `types.ts`'s `GitHubPagesConnectionInput` doc for why those are
    // publish-TARGET fields, never credential fields.
    return { providerId, token };
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
  /** `true` makes this the provider's default connection (clearing any previous one — see
   *  `PublishCredentialSetRepoPort`'s own header). Omitted/`false` still auto-defaults if this turns
   *  out to be the provider's FIRST saved connection — see {@link decideCreateDefault}. */
  isDefault?: unknown;
}

/**
 * Decides whether a newly-created row should be the group's default: always `true` for a provider's
 * first-ever saved connection (a saved connection that can never resolve because nothing is marked
 * default would be a silently-broken feature, not a safe default), otherwise exactly the caller's own
 * request.
 *
 * @complexity O(1) — one length check.
 * @overallScore 100
 */
function decideCreateDefault(existingForProvider: readonly unknown[], requested: boolean | undefined): boolean {
  return existingForProvider.length === 0 || requested === true;
}

/**
 * Validates, seals, and inserts a new credential set. `id` is minted here (`deps.idGen`), not
 * caller-supplied — matches this table's own "caller cannot choose an existing row's identity" shape.
 *
 * @throws {PublishCredentialValidationError} `label`/`connection`/`isDefault` fails shape validation.
 * @throws {PublishCredentialDuplicateLabelError} `(workspaceId, providerId, label)` already exists.
 * @throws {PublishCredentialSecretStoreUnconfiguredError} The master secret is unavailable.
 * @complexity O(n) in the provider's own (small) existing-connection count, to decide default
 *   auto-assignment, plus one keyring derivation, one seal, and one insert (which may itself throw on
 *   the UNIQUE index, translated here rather than propagated raw).
 * @overallScore 100
 */
export async function createPublishCredential(deps: PublishCredentialWriteDeps, input: CreatePublishCredentialInput): Promise<PublishCredentialSummary> {
  const label = validateLabel(input.label);
  const connection = validateConnection(input.connection);
  const requestedDefault = optionalBoolean(input.isDefault, "isDefault");
  const id = deps.idGen.newId();
  const now = deps.clock.nowIso();

  const existingForProvider = await deps.repo.listByProvider({ workspaceId: input.workspaceId, providerId: connection.providerId });
  const isDefault = decideCreateDefault(existingForProvider, requestedDefault);

  const sealed = await sealConnection(deps, { workspaceId: input.workspaceId, providerId: connection.providerId, id, connection });
  const record: PublishCredentialSetRecord = {
    workspaceId: input.workspaceId,
    id,
    providerId: connection.providerId,
    label,
    sealed,
    isDefault,
    // Always starts unknown — see this file's own header for why create/update never probe a
    // provider themselves. Healed later by `healAccountLabel`, via the admin route's post-save verify.
    accountLabel: null,
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
  /** `true` makes this the default connection for its (possibly new — see `connection` above)
   *  provider, clearing any previous default in the same repo call. Omitted/`false` leaves default
   *  status UNCHANGED — this route never un-defaults the current default without a replacement; use
   *  `createPublishCredential`/another `updatePublishCredential` call with `isDefault: true` to
   *  promote a different row instead. */
  isDefault?: unknown;
}

/**
 * Validate-then-write for an existing credential set. Mirrors `setSiteAssistantCredential`'s
 * "omitted field is left alone" contract exactly.
 *
 * @throws {PublishCredentialNotFoundError} No row exists for `(workspaceId, id)`.
 * @throws {PublishCredentialValidationError} A supplied `label`/`connection`/`isDefault` fails
 *   validation.
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
  const requestedDefault = optionalBoolean(input.isDefault, "isDefault");
  const now: ISODateTime = deps.clock.nowIso();

  let providerId = existing.providerId;
  let sealed = existing.sealed;
  // Reset (never carried over) whenever a NEW connection is resealed — see this file's own header:
  // an accountLabel naming the OLD token's account must not survive that token being replaced, even
  // though this function itself never re-probes to learn the new one (that happens later, via
  // healAccountLabel, after the admin route's post-save verify — see that function's own doc).
  let accountLabel = existing.accountLabel;
  if (input.connection !== undefined) {
    const connection = validateConnection(input.connection);
    providerId = connection.providerId;
    sealed = await sealConnection(deps, { workspaceId: input.workspaceId, providerId, id: input.id, connection });
    accountLabel = null;
  }
  const providerChanged = providerId !== existing.providerId;

  // `requestedDefault === true` always wins (see this function's own doc). Otherwise: if the provider
  // did NOT change, default status is left exactly as it already was for this row (never a false
  // "un-default with no replacement" — see `UpdatePublishCredentialInput.isDefault`'s own doc for why).
  //
  // If the provider DID change, `existing.isDefault` must NOT simply carry over — it answered "was I
  // the default for the OLD provider," which says nothing about the NEW one, and blindly copying it
  // silently clobbered whatever the new provider's real default already was (Terra audit finding #4,
  // 2026-08-16 fix — confirmed by direct probe against this exact function, worse than reported: not
  // only did the OLD provider group end up with rows but no default, an UNREQUESTED `isDefault: true`
  // on the new provider also silently stole default status away from an unrelated, working credential
  // the human never touched). A provider change is treated the same way a brand-new row is —
  // {@link decideCreateDefault}'s own "first in the (new) group, or explicitly requested" rule reused
  // verbatim, so a solo credential moved onto a provider with nothing else configured still becomes its
  // default (matching `createPublishCredential`'s own behavior for a first row), but never displaces an
  // existing one without an explicit `isDefault: true`.
  const isDefault =
    requestedDefault === true
      ? true
      : providerChanged
        ? decideCreateDefault(await deps.repo.listByProvider({ workspaceId: input.workspaceId, providerId }), undefined)
        : existing.isDefault;

  const record: PublishCredentialSetRecord = {
    workspaceId: input.workspaceId,
    id: input.id,
    providerId,
    label,
    sealed,
    isDefault,
    accountLabel,
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

  // The OTHER half of the same finding: if this row WAS the OLD provider's default and just left that
  // group, the old group may now have rows but no default at all — the same "a provider group with any
  // rows always has exactly one default" invariant `PublishCredentialSetRepoPort.delete`'s own promotion
  // step already maintains for a REMOVED row. A provider change is, from the old group's point of view,
  // exactly that: this row just left it. Reuses `delete()`'s own tie-break rule (most-recently-updated
  // wins) rather than inventing a second one — this is the one case `updatePublishCredential` must
  // promote a DIFFERENT row than the one it just wrote, so it cannot be folded into the single
  // `deps.repo.update(record)` call above.
  if (providerChanged && existing.isDefault) {
    const remainingInOldGroup = await deps.repo.listByProvider({ workspaceId: input.workspaceId, providerId: existing.providerId });
    if (remainingInOldGroup.length > 0) {
      const promoted = remainingInOldGroup.reduce((latest, row) => (row.updatedAt > latest.updatedAt ? row : latest));
      await deps.repo.update({ ...promoted, isDefault: true });
    }
  }

  return toSummary(record);
}

/**
 * Deletes a credential set. No-op (not an error) if no row exists for `(workspaceId, id)` — matches
 * `PublishCredentialSetRepoPort.delete`'s own idempotent contract and this feature's `DELETE`
 * route's documented 204-always behavior. If the deleted row was its provider's default,
 * `PublishCredentialSetRepoPort.delete` itself promotes the group's next candidate — see that port's
 * own header; this function does not need to know that happened.
 *
 * @complexity O(1) at this layer (the repo's own promotion work is O(n) in the small provider group).
 * @overallScore 100
 */
export async function deletePublishCredential(deps: PublishCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<void> {
  await deps.repo.delete(input);
}

/** Shared decrypt step for {@link resolveForPublish}/{@link resolveDefaultForPublish} — the exact
 *  same AAD-derive-then-open-then-parse sequence, extracted so the two resolution paths (by id, by
 *  provider default) cannot drift onto two different decrypt procedures. */
async function decryptRecord(sealer: SecretSealerPort, record: PublishCredentialSetRecord): Promise<PublishConnectionInput> {
  const aad = buildPublishCredentialAad({ workspaceId: record.workspaceId, providerId: record.providerId, id: record.id });
  const plaintext = await sealer.open({ sealed: record.sealed, aad });
  return JSON.parse(plaintext) as PublishConnectionInput;
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
  const connection = await decryptRecord(deps.sealer, record);
  return { providerId: record.providerId, label: record.label, connection };
}

/**
 * Contract v2 Correction B — the provider-scoped sibling of {@link resolveForPublish}: resolves the
 * DEFAULT credential set for `(workspaceId, providerId)` instead of a caller-supplied `id`. This is
 * what a real publish attempt actually has (a target provider, never a specific saved connection's
 * id) — see `store.ts`'s file header and `PublishCredentialSetRepoPort.findDefaultByProvider`'s own
 * doc for why "no default" (`null`) is the only "not configured" outcome this function can produce;
 * it never refuses with an "ambiguous, multiple saved" error the way an earlier design did, because
 * the write path's own invariant guarantees at most one default per provider.
 *
 * Same "no such row" (`null`) vs. genuine decrypt failure (thrown) distinction as `resolveForPublish` —
 * see that function's own doc for the full reasoning.
 *
 * @throws Whatever `SecretSealerPort.open()` throws (bad AAD, tampered ciphertext, wrong key) or
 *   `KeyringPort` throws for a missing master secret.
 * @complexity O(1) — one repo read, one decrypt, one `JSON.parse`.
 * @overallScore 100
 */
export async function resolveDefaultForPublish(
  deps: { repo: PublishCredentialSetRepoPort; sealer: SecretSealerPort },
  input: { workspaceId: UUID; providerId: PublishProviderId }
): Promise<{ id: UUID; label: string; connection: PublishConnectionInput } | null> {
  const record = await deps.repo.findDefaultByProvider(input);
  if (!record) return null;
  const connection = await decryptRecord(deps.sealer, record);
  return { id: record.id, label: record.label, connection };
}

/**
 * Persists a freshly-verified account label onto an existing row — see this file's own header for
 * why {@link createPublishCredential}/{@link updatePublishCredential} never do this themselves. The
 * ONE intended caller is the admin credential-CRUD route (`server/routes/admin/system/publish-
 * credentials.ts`), immediately after its own `verifyPublishCredentialById` call returns a `"valid"`
 * result carrying an `accountLabel` — the same human-gated boundary `static-publish/verify.ts`'s own
 * header enforces for that call. Never call this with an EMPTY/absent label to "clear" one: a failed
 * or inconclusive re-verify (`"invalid"`/`"unreachable"`, or `"valid"` for a provider with no
 * reviewed field) carries no `accountLabel` at all and must leave a previously-healed value alone —
 * the caller's own `result.accountLabel !== undefined` check is what enforces that, not this function.
 *
 * A targeted single-column write ({@link PublishCredentialSetRepoPort.updateAccountLabel}), not a
 * full-row replace — never touches `sealed`, `isDefault`, or `updatedAt`.
 *
 * @complexity O(1) — one repo write, no read first (the repo's own `updateAccountLabel` is a no-op,
 *   not an error, if the row vanished between the verify and this call).
 * @overallScore 100
 */
export async function healAccountLabel(deps: PublishCredentialReadDeps, input: { workspaceId: UUID; id: UUID; accountLabel: string }): Promise<void> {
  await deps.repo.updateAccountLabel(input);
}
