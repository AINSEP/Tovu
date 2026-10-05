import { nowIso as clockNowIso } from "@jini-ai/core/primitives";
import type { Clock as ClockPort, ISODateTime, UUID } from "@jini-ai/core/primitives";

import { isUniqueViolation } from "../../../platform/db/kernel/dialect.js";
import type { KeyringPort, SealedSecret, SecretSealerPort } from "../../webhooks/index.js";
import { buildVendorCredentialAad } from "../../vendor-credentials/aad.js";
import type { VendorCredentialSetRecord, VendorCredentialSetRepoPort } from "../../vendor-credentials/types.js";
import type { DeployTargetCredentialSpec, DeployTargetRegistry } from "../deploy-targets/types.js";
import type { PublishConnectionInput, PublishCredentialSummary, PublishProviderId } from "./types.js";

/**
 * @file Publish credentials: the saved connections a deploy host publishes with. Stored in
 * `vendor_credential_sets` (2026-09-29; the legacy `publish_credential_sets` rows are copied there at
 * boot by `vendor-table-backfill.ts` and no longer read). A row belongs to a VENDOR (the account a
 * token authenticates to), a host names its vendor in its deploy-plugin descriptor
 * (`DeployTargetCredentialSpec.vendorId`), and every function here speaks in hosts (`providerId`): it
 * maps to the vendor through this workspace's deploy registry. The sealed blob is
 * `{vendorId, ...fields}`, the same shape `vendor-credentials/store.ts` writes, so a row saved
 * through either store reads the same.
 *
 * Two strictly separated operations, per this dispatch's brief and Terra's design — never blur the
 * line between them:
 *
 * - {@link describeCredential}/{@link listPublishCredentials} — read model only. Never decrypts, never
 *   touches `sealer`/`keyring` at all, so neither can fail on a misconfigured site key. This is
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

function toSummary(record: VendorCredentialSetRecord, providerId: PublishProviderId): PublishCredentialSummary {
  return {
    id: record.id,
    providerId,
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

export interface PublishCredentialReadDeps {
  repo: VendorCredentialSetRepoPort;
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
  return providerId === undefined ? null : toSummary(record, providerId);
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
  return records.flatMap((record) => {
    const providerId = hosts.get(record.vendorId);
    return providerId === undefined ? [] : [toSummary(record, providerId)];
  });
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
    fields[field.name] = requireNonEmptyString(value[field.name], field.name, providerId);
  }
  for (const field of spec.fields.filter((candidate) => !candidate.required)) {
    const optional = optionalString(value[field.name], field.name);
    if (optional !== undefined) fields[field.name] = optional;
  }
  return { connection: { providerId, ...fields }, spec };
}

/** What a validated connection writes: its vendor, the sealed `{vendorId, ...fields}` blob, and the
 *  last 4 characters of its token field (the vendor table's `token_tail`). */
interface SealedConnection {
  readonly vendorId: string;
  readonly sealed: SealedSecret;
  readonly tokenTail: string;
}

/** Seals `{vendorId, ...fields}` under the vendor table's AAD for `(workspaceId, vendorId, id)`.
 *  Wraps `sealer.seal()`/`keyring.activeKey()` failure into the fail-closed
 *  {@link PublishCredentialSecretStoreUnconfiguredError} contract — never falls through to a
 *  plaintext write. */
async function sealConnection(deps: PublishCredentialWriteDeps, input: { workspaceId: UUID; id: UUID; validated: ValidatedConnection }): Promise<SealedConnection> {
  const { providerId: _providerId, ...fields } = input.validated.connection;
  const vendorId = input.validated.spec.vendorId;
  try {
    const activeKey = await deps.keyring.activeKey();
    const aad = buildVendorCredentialAad({ workspaceId: input.workspaceId, vendorId, id: input.id });
    const sealed = await deps.sealer.seal({ plaintext: JSON.stringify({ vendorId, ...fields }), key: activeKey, aad });
    return { vendorId, sealed, tokenTail: (fields[input.validated.spec.tokenField] ?? "").slice(-4) };
  } catch (err) {
    throw new PublishCredentialSecretStoreUnconfiguredError(
      `publish credential secret store is unconfigured: ${err instanceof Error ? err.message : String(err)}`
    );
  }
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
   *  out to be the vendor's FIRST saved connection — see {@link decideCreateDefault}. */
  isDefault?: unknown;
}

/**
 * Decides whether a newly-created row should be the group's default: always `true` for a vendor's
 * first-ever saved connection (a saved connection that can never resolve because nothing is marked
 * default would be a silently-broken feature, not a safe default), otherwise exactly the caller's own
 * request.
 *
 * @complexity O(1) — one length check.
 */
function decideCreateDefault(existingForVendor: readonly unknown[], requested: boolean | undefined): boolean {
  return existingForVendor.length === 0 || requested === true;
}

/** Translates the vendor table's unique-label rejection into the typed error. */
async function writeTranslatingDuplicateLabel(write: () => Promise<void>, providerId: PublishProviderId, label: string): Promise<void> {
  try {
    await write();
  } catch (err) {
    if (isUniqueLabelViolation(err)) {
      throw new PublishCredentialDuplicateLabelError(`a '${providerId}' credential labeled '${label}' already exists in this workspace`);
    }
    throw err;
  }
}

/**
 * Validates, seals, and inserts a new credential set into its host's vendor group. `id` is minted
 * here (`deps.idGen`), not caller-supplied — matches this table's own "caller cannot choose an
 * existing row's identity" shape.
 *
 * @throws {PublishCredentialValidationError} `label`/`connection`/`isDefault` fails shape validation.
 * @throws {PublishCredentialDuplicateLabelError} `(workspaceId, vendor, label)` already exists.
 * @throws {PublishCredentialSecretStoreUnconfiguredError} The site key is unavailable.
 * @complexity O(n) in the vendor's own (small) existing-connection count, to decide default
 *   auto-assignment, plus one keyring derivation, one seal, and one insert.
 */
export async function createPublishCredential(deps: PublishCredentialWriteDeps, input: CreatePublishCredentialInput): Promise<PublishCredentialSummary> {
  const label = validateLabel(input.label);
  const validated = validateConnection(input.connection, await deps.loadDeployTargets(input.workspaceId));
  const requestedDefault = optionalBoolean(input.isDefault, "isDefault");
  const id = deps.idGen.newId();
  const now = clockNowIso({ clock: deps.clock });

  const existingForVendor = await deps.repo.listByVendor({ workspaceId: input.workspaceId, vendorId: validated.spec.vendorId });
  const { vendorId, sealed, tokenTail } = await sealConnection(deps, { workspaceId: input.workspaceId, id, validated });
  const record: VendorCredentialSetRecord = {
    workspaceId: input.workspaceId,
    id,
    vendorId,
    label,
    sealed,
    tokenTail,
    isDefault: decideCreateDefault(existingForVendor, requestedDefault),
    // Always starts unknown — see this file's own header for why create/update never probe a
    // provider themselves. Healed later by `healAccountLabel`, via the admin route's post-save verify.
    accountLabel: null,
    createdAt: now,
    updatedAt: now,
  };

  await writeTranslatingDuplicateLabel(() => deps.repo.insert(record), validated.connection.providerId, label);
  return toSummary(record, validated.connection.providerId);
}

export interface UpdatePublishCredentialInput {
  workspaceId: UUID;
  id: UUID;
  /** Omitted = leave the label unchanged. */
  label?: unknown;
  /** Omitted = leave the stored connection (and its vendor) untouched — this route's own
   *  "connection omitted => keep the stored secret untouched" contract. Supplying a NEW connection
   *  may change the host, and so the vendor; the AAD is rebuilt for the (possibly new) vendor either
   *  way, since `id` (the third AAD component) never changes across an update. */
  connection?: unknown;
  /** `true` makes this the default connection for its (possibly new — see `connection` above)
   *  vendor, clearing any previous default in the same repo call. Omitted/`false` leaves default
   *  status UNCHANGED — this route never un-defaults the current default without a replacement; use
   *  `createPublishCredential`/another `updatePublishCredential` call with `isDefault: true` to
   *  promote a different row instead. */
  isDefault?: unknown;
}

/** The (possibly new) host/vendor/secret fields `updatePublishCredential` writes. `accountLabel` is
 *  reset (never carried over) whenever a NEW connection is resealed — see this file's own header: an
 *  accountLabel naming the OLD token's account must not survive that token being replaced, even though
 *  this function itself never re-probes to learn the new one (that happens later, via
 *  `healAccountLabel`, after the admin route's post-save verify). `existingHost` is the host the kept
 *  row is shown under. */
async function resolveUpdatedConnectionSecrets(
  deps: PublishCredentialWriteDeps,
  input: { workspaceId: UUID; id: UUID; connection?: unknown },
  existing: { record: VendorCredentialSetRecord; host: PublishProviderId },
  registry: DeployTargetRegistry
): Promise<SealedConnection & { providerId: PublishProviderId; accountLabel: string | null }> {
  if (input.connection === undefined) {
    const { vendorId, sealed, tokenTail, accountLabel } = existing.record;
    return { vendorId, sealed, tokenTail, accountLabel, providerId: existing.host };
  }
  const validated = validateConnection(input.connection, registry);
  const resealed = await sealConnection(deps, { workspaceId: input.workspaceId, id: input.id, validated });
  return { ...resealed, accountLabel: null, providerId: validated.connection.providerId };
}

/**
 * `requestedDefault === true` always wins (see `UpdatePublishCredentialInput.isDefault`'s own doc).
 * Otherwise: if the vendor did NOT change, default status is left exactly as it already was for
 * this row (never a false "un-default with no replacement").
 *
 * If the vendor DID change, `existingIsDefault` must NOT simply carry over — it answered "was I
 * the default for the OLD vendor," which says nothing about the NEW one, and blindly copying it
 * silently clobbered whatever the new vendor's real default already was (Terra audit finding #4,
 * 2026-08-16). A vendor change is treated the same way a brand-new row is —
 * {@link decideCreateDefault}'s own "first in the (new) group, or explicitly requested" rule reused
 * verbatim, so a solo credential moved onto a vendor with nothing else configured still becomes its
 * default, but never displaces an existing one without an explicit `isDefault: true`.
 */
async function resolveUpdatedIsDefault(
  deps: PublishCredentialWriteDeps,
  args: { workspaceId: UUID; vendorId: string; requestedDefault: boolean | undefined; vendorChanged: boolean; existingIsDefault: boolean }
): Promise<boolean> {
  if (args.requestedDefault === true) return true;
  if (!args.vendorChanged) return args.existingIsDefault;
  return decideCreateDefault(await deps.repo.listByVendor({ workspaceId: args.workspaceId, vendorId: args.vendorId }), undefined);
}

/**
 * The OTHER half of the Terra finding {@link resolveUpdatedIsDefault} documents: if this row WAS the
 * OLD vendor's default and just left that group, the old group may now have rows but no default at
 * all. Reuses `delete()`'s own tie-break rule (most-recently-updated wins) rather than inventing a
 * second one. A no-op unless BOTH the vendor changed AND this row actually was the old vendor's default.
 */
async function promoteReplacementDefaultInOldGroup(
  deps: PublishCredentialWriteDeps,
  args: { workspaceId: UUID; vendorChanged: boolean; wasDefault: boolean; oldVendorId: string }
): Promise<void> {
  if (!(args.vendorChanged && args.wasDefault)) return;
  const remainingInOldGroup = await deps.repo.listByVendor({ workspaceId: args.workspaceId, vendorId: args.oldVendorId });
  if (remainingInOldGroup.length === 0) return;
  const promoted = remainingInOldGroup.reduce((latest, row) => (row.updatedAt > latest.updatedAt ? row : latest));
  await deps.repo.update({ ...promoted, isDefault: true });
}

/**
 * Validate-then-write for an existing credential set. Mirrors `setSiteAssistantCredential`'s
 * "omitted field is left alone" contract exactly.
 *
 * @throws {PublishCredentialNotFoundError} No publish credential exists for `(workspaceId, id)`.
 * @throws {PublishCredentialValidationError} A supplied `label`/`connection`/`isDefault` fails
 *   validation.
 * @throws {PublishCredentialDuplicateLabelError} The (possibly renamed) `(vendor, label)` collides
 *   with a different row.
 * @throws {PublishCredentialSecretStoreUnconfiguredError} A new `connection` was supplied but the
 *   site key is unavailable.
 * @complexity O(1) — one read, one registry load, at most one seal, one update.
 */
export async function updatePublishCredential(deps: PublishCredentialWriteDeps, input: UpdatePublishCredentialInput): Promise<PublishCredentialSummary> {
  const existing = await deps.repo.findById({ workspaceId: input.workspaceId, id: input.id });
  const registry = await deps.loadDeployTargets(input.workspaceId);
  const existingHost = existing ? hostsByVendor(registry).get(existing.vendorId) : undefined;
  if (!existing || existingHost === undefined) {
    throw new PublishCredentialNotFoundError(`no publish credential '${input.id}' in this workspace`);
  }

  const label = input.label !== undefined ? validateLabel(input.label) : existing.label;
  const requestedDefault = optionalBoolean(input.isDefault, "isDefault");
  const now: ISODateTime = clockNowIso({ clock: deps.clock });

  const { vendorId, sealed, tokenTail, accountLabel, providerId } = await resolveUpdatedConnectionSecrets(deps, input, { record: existing, host: existingHost }, registry);
  const vendorChanged = vendorId !== existing.vendorId;
  const isDefault = await resolveUpdatedIsDefault(deps, { workspaceId: input.workspaceId, vendorId, requestedDefault, vendorChanged, existingIsDefault: existing.isDefault });

  const record: VendorCredentialSetRecord = { ...existing, vendorId, label, sealed, tokenTail, isDefault, accountLabel, updatedAt: now };
  await writeTranslatingDuplicateLabel(() => deps.repo.update(record), providerId, label);
  await promoteReplacementDefaultInOldGroup(deps, { workspaceId: input.workspaceId, vendorChanged, wasDefault: existing.isDefault, oldVendorId: existing.vendorId });

  return toSummary(record, providerId);
}

/**
 * Deletes a credential set. No-op (not an error) if no row exists for `(workspaceId, id)` — matches
 * `VendorCredentialSetRepoPort.delete`'s own idempotent contract and this feature's `DELETE`
 * route's documented 204-always behavior. If the deleted row was its vendor's default, the repo
 * itself promotes the group's next candidate.
 *
 * @complexity O(1) at this layer (the repo's own promotion work is O(n) in the small vendor group).
 */
export async function deletePublishCredential(deps: { repo: VendorCredentialSetRepoPort }, input: { workspaceId: UUID; id: UUID }): Promise<void> {
  await deps.repo.delete(input);
}

/** Shared decrypt step for {@link resolveForPublish}/{@link resolveDefaultForPublish}: opens the
 *  vendor-table blob and re-labels it as `providerId`'s connection.
 *
 *  Wraps ANY failure (bad AAD, tampered ciphertext, wrong key, or — the realistic one — a missing
 *  `TOVU_SITE_KEY` surfacing as a raw `KeyringPort` error) into the SAME typed
 *  {@link PublishCredentialSecretStoreUnconfiguredError} {@link sealConnection} already throws for
 *  the write side, rather than letting a raw `Error` escape — it still throws, still ends the
 *  request, just as a type every caller's HTTP boundary already knows how to map (`publish-
 *  credentials.ts`'s `sendStoreError` → `503 SECRET_STORE_UNCONFIGURED`). Found live (2026-08-16):
 *  a raw `Error` from this call once reached an async Express handler uncaught and took down the
 *  whole server process. */
async function decryptRecord(sealer: SecretSealerPort, record: VendorCredentialSetRecord, providerId: PublishProviderId): Promise<PublishConnectionInput> {
  const aad = buildVendorCredentialAad({ workspaceId: record.workspaceId, vendorId: record.vendorId, id: record.id });
  try {
    const { vendorId: _vendorId, ...fields } = JSON.parse(await sealer.open({ sealed: record.sealed, aad })) as Record<string, string>;
    return { ...fields, providerId };
  } catch (err) {
    throw new PublishCredentialSecretStoreUnconfiguredError(
      `publish credential could not be decrypted (secret store unconfigured, or the stored row is corrupted): ${err instanceof Error ? err.message : String(err)}`
    );
  }
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
  const connection = await decryptRecord(deps.sealer, record, providerId);
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
  const record = await deps.repo.findDefaultByVendor({ workspaceId: input.workspaceId, vendorId: spec.vendorId });
  if (!record) return null;
  const connection = await decryptRecord(deps.sealer, record, input.providerId);
  return { id: record.id, label: record.label, connection };
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
