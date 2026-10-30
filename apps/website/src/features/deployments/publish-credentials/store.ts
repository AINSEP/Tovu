import { CredentialInputError, CREDENTIAL_MESSAGES, assertCredentialFreeField, normalizeCredentialToken } from '../../../contracts/core/credential-token.js';
import type { Clock as ClockPort, UUID } from "@jini-ai/core/primitives";

import { isUniqueViolation } from "@jini-ai/db/kernel";
import type { StorageKernel } from "@jini-ai/db/kernel";
import { parseTovuStoreMeta } from "#src/platform/secrets/vault-kinds";
import type { KeyringPort, SecretSealerPort } from "../../webhooks/index.js";
import { VaultError, matchingCredentialProviderIds, selectCredentialForProvider, normalizeCredentialWorksFor, type VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import { credentialVault, credentialScope, credentialHint } from "../../vendor-credentials/index.js";
import type { VendorCredentialSetRecord, VendorCredentialSetRepoPort } from "../../vendor-credentials/index.js";
import { credentialDeletionRepo, credentialCreateTarget, credentialScopes, type ScopedCredentialDeps } from "../../vendor-credentials/index.js";
import type { DeployTargetCredentialSpec, DeployTargetFieldSpec, DeployTargetRegistry } from "../deploy-targets/types.js";
import type { PublishConnectionInput, PublishCredentialScope, PublishCredentialSummary, PublishProviderId } from "./types.js";

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

/** Deploy descriptors adapt into Jini's compatibility and selection policy. Required companion
 * fields exclude token-only custom keys before any default is selected. No I/O; O(hosts).
 */
export function publishHostsForCredential({ credential, registry }: {
  credential: Pick<VaultSummary, "kind" | "provider" | "label" | "meta">; registry: DeployTargetRegistry;
}, _options = {}): string[] {
  return matchingCredentialProviderIds({ credential, providers: registry.list().flatMap(({ descriptor }) => {
    if (!moduleAcceptsCredential({ credential, registry, targetId: descriptor.id })) return [];
    const spec = descriptor.credential;
    return spec ? [{ id: descriptor.id, vendorId: spec.vendorId,
      acceptsCustomToken: !spec.fields.some(field => field.required && field.name !== spec.tokenField) }] : [];
  }) });
}

/** Only narrow eligibility here; the existing Jini matcher still owns worksFor/default selection.
 * No persisted metadata changes, so an old vendor grant cannot silently acquire a new capability. */
function moduleAcceptsCredential({ credential, registry, targetId }: {
  credential: Pick<VaultSummary, "meta">; registry: DeployTargetRegistry; targetId: string;
}, _options = {}): boolean {
  const accepts = registry.get(targetId)?.module.acceptsCredential;
  if (!accepts) return true;
  const worksFor = credential.meta.worksFor;
  if (!Array.isArray(worksFor) || !worksFor.every(id => typeof id === "string")) return false;
  return accepts({ worksFor });
}

/** An explicit id is found in either store. Otherwise the first store (in `inventory` order: this
 * site's, then the project's) holding any compatible row decides alone (owner 2026-10-25: a site row
 * overrides), so an ambiguous site stays ambiguous instead of silently using a project key.
 * @complexity O(rows × compatibility IDs).
 */
function selectPublishCredential({ registry, credentials, provider, id }: {
  registry: DeployTargetRegistry; credentials: readonly VaultSummary[];
  provider: NonNullable<ReturnType<typeof providerContract>>; id?: string;
}, _options = {}): VaultSummary | null {
  const eligible = credentials.filter(credential => moduleAcceptsCredential({ credential, registry, targetId: provider.id }));
  if (id !== undefined) return selectCredentialForProvider({ credentials: eligible, provider, id });
  const decides = eligible.find(row => selectCredentialForProvider({ credentials: [row], provider, id: row.id }));
  return selectCredentialForProvider({ credentials: eligible.filter(row => row.workspaceId === decides?.workspaceId), provider });
}
/** Compatibility edits invalidate only hosts whose eligibility changed, through the existing cache
 * port. Catalog adaptation and custom token shape rules are shared with runtime matching.
 * @complexity O(hosts × compatibility IDs); no credential reads, opens or provider requests.
 */
export function invalidatePublishCredentialCompatibility({ workspaceId, registry, cache, before, after }: {
  workspaceId: string; registry: DeployTargetRegistry;
  cache: { delete(input: { workspaceId: string; target: string }): void };
  before?: { credentialType: "vendor" | "custom"; worksFor: string[] };
  after?: { credentialType: "vendor" | "custom"; worksFor: string[] };
}, _options = {}): void {
  const hosts = (value: typeof before) => value ? publishHostsForCredential({ registry,
    credential: { kind: "vendor", provider: null, label: "", meta: { credentialType: value.credentialType, worksFor: value.worksFor } } }) : [];
  const previous = new Set(hosts(before));
  const next = new Set(hosts(after));
  for (const target of new Set([...previous, ...next])) if (previous.has(target) !== next.has(target)) cache.delete({ workspaceId, target });
}

function providerContract({ registry, providerId }: { registry: DeployTargetRegistry; providerId: string }, _options = {}) {
  const spec = registry.get(providerId)?.descriptor.credential;
  return spec ? { id: providerId, vendorId: spec.vendorId,
    acceptsCustomToken: !spec.fields.some(field => field.required && field.name !== spec.tokenField) } : null;
}
function vaultSummary({ summary, providerId, publishHosts = [], defaultFor = [] }: {
  summary: VaultSummary; providerId: PublishProviderId; publishHosts?: string[]; defaultFor?: string[];
}, _options = {}): PublishCredentialSummary {
  const tokenHint = credentialHint({ record: summary });
  return { id: summary.id, providerId, vendorId: summary.provider ?? providerId, label: summary.label, configured: true,
    credentialType: summary.meta.credentialType as "vendor" | "custom", worksFor: [...summary.meta.worksFor as string[]],
    publishHosts, defaultFor, isDefault: defaultFor.includes(providerId), tokenTail: tokenHint?.last4 ?? "", tokenHint,
    accountLabel: typeof summary.meta.accountLabel === "string" ? summary.meta.accountLabel : null,
    createdAt: summary.createdAt, updatedAt: summary.updatedAt };
}
function vault(deps: PublishCredentialReadDeps & Partial<PublishCredentialWriteDeps>, _options = {}) {
  return credentialVault({ ...deps, sealer: deps.sealer!, storageError: () => new PublishCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage) });
}
export interface PublishCredentialReadDeps {
  repo: VendorCredentialSetRepoPort;
  sealer?: SecretSealerPort;
  loadDeployTargets(workspaceId: string): Promise<DeployTargetRegistry>;
}

/** The store a listed row came from: rows carry their own store's workspace id. */
function scopeOfRow<D extends PublishCredentialReadDeps>(deps: D, input: { workspaceId: string; row: { workspaceId: string } }): ScopedCredentialDeps<D> {
  const scopes = credentialScopes(deps, input.workspaceId);
  return scopes.find(scoped => scoped.workspaceId === input.row.workspaceId) ?? scopes[0]!;
}

/** The vendor row with this id, from the first store holding it (ids are unique across both). @complexity O(scopes). */
async function locateById<D extends PublishCredentialReadDeps>(deps: D, input: { workspaceId: string; id: string }): Promise<{ scoped: ScopedCredentialDeps<D>; existing: VendorCredentialSetRecord } | null> {
  for (const scoped of credentialScopes(deps, input.workspaceId)) {
    const existing = await scoped.deps.repo.findById({ workspaceId: scoped.workspaceId, id: input.id });
    if (existing) return { scoped, existing };
  }
  return null;
}

/** A site row overrides the project row it would collide with: custom keys share one label space,
 *  vendor keys one per vendor (the vault's own unique-label scopes). */
const labelKey = (row: VaultSummary): string => row.meta.credentialType === "custom" ? `custom\0${row.label}` : `vendor\0${row.provider}\0${row.label}`;

/** Every row this site can publish with: its own, then the project's whose label no site row claims.
 * @complexity O(rows); one inventory per store, no row is opened.
 */
async function inventory({ deps, workspaceId }: { deps: PublishCredentialReadDeps; workspaceId: string }, _options = {}): Promise<VaultSummary[]> {
  const rows: VaultSummary[] = [];
  const claimed = new Set<string>();
  for (const scoped of credentialScopes(deps, workspaceId)) {
    const own = await storeInventory({ deps: scoped.deps, workspaceId: scoped.workspaceId });
    rows.push(...own.filter(row => !claimed.has(labelKey(row))));
    for (const row of own) claimed.add(labelKey(row));
  }
  return rows;
}

/** One authorized, metadata-only inventory of one store for both subtypes. No secret is opened, and an
 * injected port cannot widen the workspace/owner/binding. Jini parses every canonical row before matching.
 * @complexity O(rows + metadata); two scoped reads during rollout, no per-row queries.
 */
async function storeInventory({ deps, workspaceId }: { deps: PublishCredentialReadDeps; workspaceId: string }, _options = {}): Promise<VaultSummary[]> {
  const service = vault(deps);
  const unified = await service.list(credentialScope({ workspaceId, kind: "vendor" }));
  const legacy = await service.list(credentialScope({ workspaceId, kind: "custom" }));
  return [...unified, ...legacy]
    .filter(row => {
      if (row.workspaceId !== workspaceId || (row.kind !== "vendor" && row.kind !== "custom")) return false;
      return row.ownerKey === "tovu" && row.principalId === null && row.binding === null && row.configured;
    });
}

/** Safe publish inventory; empty compatibility stays editable on vendor cards. Display host
 * fallback is used only for editing, never for runtime eligibility. Defaults are selected per host.
 * @complexity O(rows × hosts), one metadata inventory and one catalog load.
 */
export async function listPublishCredentials(deps: PublishCredentialReadDeps, input: { workspaceId: UUID }): Promise<PublishCredentialSummary[]> {
  const registry = await deps.loadDeployTargets(input.workspaceId);
  const rows = await inventory({ deps, workspaceId: input.workspaceId });
  const defaults = new Map<string, string>();
  for (const { descriptor } of registry.list()) {
    const provider = providerContract({ registry, providerId: descriptor.id });
    const selected = provider && selectPublishCredential({ registry, credentials: rows, provider });
    if (selected) defaults.set(descriptor.id, selected.id);
  }
  return rows.flatMap(row => {
    const publishHosts = publishHostsForCredential({ credential: row, registry });
    const providerId = publishHosts[0] ?? (row.meta.credentialType === "vendor"
      ? registry.list().find(target => target.descriptor.credential?.vendorId === row.provider)?.descriptor.id : undefined);
    if (providerId === undefined) return [];
    const defaultFor = [...defaults].filter(([, id]) => id === row.id).map(([host]) => host);
    const summary = vaultSummary({ summary: row, providerId, publishHosts, defaultFor });
    return [{ ...summary, vendorId: row.provider ?? registry.get(providerId)!.descriptor.credential!.vendorId, ...reportedScope({ deps, workspaceId: input.workspaceId, row }) }];
  });
}

/** The summary's `scope`, only where a project store is attached (a site-only server's output is unchanged). */
function reportedScope({ deps, workspaceId, row }: { deps: PublishCredentialReadDeps; workspaceId: string; row: VaultSummary }, _options = {}): { scope?: PublishCredentialScope } {
  return deps.repo.project ? { scope: scopeOfRow(deps, { workspaceId, row }).scope } : {};
}

/** Metadata-only ID projection; custom keys keep their existing custom edit/permission boundary. */
export async function describeCredential(deps: PublishCredentialReadDeps, input: { workspaceId: UUID; id: UUID }): Promise<PublishCredentialSummary | null> {
  return (await listPublishCredentials(deps, input)).find(row => row.id === input.id) ?? null;
}

/** Configuration requires a compatible selected candidate, not merely a provider-group default.
 * An explicit id must select that authorized row; no secret is opened.
 * @complexity O(rows × compatibility IDs), one metadata inventory per store and one catalog load. */
export async function hasDefaultForPublish(deps: PublishCredentialReadDeps, input: { workspaceId: UUID; providerId: PublishProviderId; id?: UUID }): Promise<boolean> {
  const registry = await deps.loadDeployTargets(input.workspaceId);
  const provider = providerContract({ registry, providerId: input.providerId });
  return provider !== null && selectPublishCredential({ registry, credentials: await inventory({ deps, workspaceId: input.workspaceId }), provider, id: input.id }) !== null;
}

function validatedWorksFor({ value }: { value: unknown }, _options = {}): string[] {
  try { const ids = normalizeCredentialWorksFor({ value }); for (const id of ids) { assertPlainField({ value: id, field: "worksFor" }); } return ids; }
  catch (error) { if (error instanceof VaultError) { throw new PublishCredentialValidationError("worksFor must be an array of provider IDs"); } throw error; }
}

/** A provider move retargets the old host/vendor compatibility, preserving unrelated IDs.
 * Explicit compatibility edits win, including an empty list. No I/O; O(compatibility IDs).
 */
function updatedWorksFor({ value, row, provider, host }: {
  value: unknown; row: Pick<VaultSummary, "provider" | "meta">; provider: string; host: string;
}, _options = {}): string[] {
  if (value !== undefined) return validatedWorksFor({ value });
  const previous = parseTovuStoreMeta({ kind: "vendor", meta: row.meta, provider: row.provider }).worksFor as string[];
  if (provider === row.provider) return previous;
  return validatedWorksFor({ value: previous.map(id => id === row.provider?.toLowerCase() || id === host.toLowerCase() ? provider : id) });
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
  // A blank optional form field (e.g. an optional zone id left empty) means "not provided", not an
  // invalid value: secure forms send every field, so rejecting "" blocked saving a valid credential.
  if (typeof raw === "string" && raw.trim() === "") return undefined;
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
  catch (err) { if (err instanceof CredentialInputError) { throw new PublishCredentialValidationError(err.message); } throw err; }
}
function assertPlainField(required: { value: string; field: string }): void {
  try { assertCredentialFreeField(required); }
  catch (err) { if (err instanceof CredentialInputError) { throw new PublishCredentialValidationError(err.message); } throw err; }
}

function validateConnection(raw: unknown, registry: DeployTargetRegistry): ValidatedConnection {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PublishCredentialValidationError("connection must be an object");
  }
  const value = raw as Record<string, unknown>;
  const { providerId, spec } = connectionCredentialSpec({ value, registry });

  const fields: Record<string, string> = {};
  const ordered = [...spec.fields.filter(field => field.required), ...spec.fields.filter(field => !field.required)];
  for (const field of ordered) {
    const normalized = validatedConnectionField({ value: value[field.name], field, spec, providerId });
    if (normalized !== undefined) fields[field.name] = normalized;
  }
  if (fields[spec.tokenField] === undefined) normalizeSecret({ value: undefined, field: spec.tokenField });
  return { connection: { providerId, ...fields }, spec };
}

function connectionCredentialSpec({ value, registry }: {
  value: Record<string, unknown>; registry: DeployTargetRegistry;
}, _options = {}): { providerId: string; spec: DeployTargetCredentialSpec } {
  const providerId = value.providerId;
  const spec = typeof providerId === "string" ? registry.get(providerId)?.descriptor.credential : undefined;
  if (typeof providerId !== "string" || spec === undefined) {
    const known = registry.list().flatMap((target) => (target.descriptor.credential !== undefined ? [target.descriptor.id] : []));
    throw new PublishCredentialValidationError(`connection.providerId must be one of: ${known.join(", ")}`);
  }

  return { providerId, spec };
}

function isSecretField({ field, spec }: {
  field: DeployTargetFieldSpec; spec: DeployTargetCredentialSpec;
}, _options = {}): boolean {
  return Boolean(field.secret || field.name === spec.tokenField);
}

function validatedConnectionField({ value, field, spec, providerId }: {
  value: unknown; field: DeployTargetFieldSpec; spec: DeployTargetCredentialSpec; providerId: string;
}, _options = {}): string | undefined {
  const secret = isSecretField({ field, spec });
  if (secret && (field.required || value !== undefined)) return normalizeSecret({ value, field: field.name });
  const normalized = field.required ? requireNonEmptyString(value, field.name, providerId) : optionalString(value, field.name);
  if (!secret && normalized !== undefined) assertPlainField({ value: normalized, field: field.name });
  return normalized;
}

export interface CreatePublishCredentialInput {
  workspaceId: UUID;
  label: unknown;
  connection: unknown;
  /** `true` makes this the vendor's default connection (clearing any previous one — see
   *  `VendorCredentialSetRepoPort`'s own header). Omitted auto-defaults the vendor's FIRST saved
   *  connection; explicit `false` opts out. Jini owns atomic auto-defaulting. */
  isDefault?: unknown;
  worksFor?: unknown;
  /** `"site"` = a site-owned key. Omitted (or `"project"`) = the project store when one is
   *  attached, visible to attached sites only; this site's vault otherwise. */
  scope?: unknown;
}

/**
 * A project row whose vendor and label this site already uses would be hidden here by the site row
 * (site rows override), so the save would look lost: refused as the same duplicate as within one store.
 */
async function assertLabelFreeOnSite({ deps, target, workspaceId, vendorId, label, providerId }: { deps: PublishCredentialReadDeps;
  target: ScopedCredentialDeps<unknown>; workspaceId: string; vendorId: string; label: string; providerId: string }, _options = {}): Promise<void> {
  if (target.scope !== "project") return;
  if ((await deps.repo.listByVendor({ workspaceId, vendorId })).some(row => row.label === label)) {
    throw new PublishCredentialDuplicateLabelError(`a '${providerId}' credential labeled '${label}' already exists in this workspace`);
  }
}

/** Label conflicts keep the feature's error contract; stale CAS failures stay conflicts.
 * @complexity One vault write; on conflict, O(vendor rows) metadata lookup without opening secrets. */
async function saveConnection({ deps, target, input, providerId }: { deps: PublishCredentialWriteDeps; target: ScopedCredentialDeps<PublishCredentialWriteDeps>;
  input: Parameters<ReturnType<typeof vault>["put"]>[0]; providerId: PublishProviderId }, _options = {}): Promise<VaultSummary> {
  try { return await vault(target.deps).put(input); }
  catch (error) {
    // Unattached project rows are hidden from normal reads. Use only deletion metadata to
    // distinguish a duplicate label from a CAS conflict; never attach or open the existing key.
    const labelRepo = target.scope === "project" ? credentialDeletionRepo({ repo: deps.repo }).project!.repo : target.deps.repo;
    // The storage kernel recognizes UNIQUE (workspace_id, vendor_id, label) via SQLite's
    // code/message or Postgres SQLSTATE 23505.
    const duplicate = isUniqueViolation(error) || error instanceof VaultError && error.code === "conflict" &&
      (await labelRepo.listByVendor({ workspaceId: input.workspaceId, vendorId: input.provider! })).some(row => row.id !== input.id && row.label === input.label);
    if (duplicate) throw new PublishCredentialDuplicateLabelError(input.workspaceId === 'project' ? `Your project already has a key named '${input.label}'. Use it here, or pick another name.` : `a '${providerId}' credential labeled '${input.label}' already exists in this workspace`);
    throw error;
  }
}

/** Validate before the vault write. Jini atomically auto-defaults the first vendor credential. */
export async function createPublishCredential(deps: PublishCredentialWriteDeps, input: CreatePublishCredentialInput): Promise<PublishCredentialSummary> {
  const label = validateLabel(input.label);
  const registry = await deps.loadDeployTargets(input.workspaceId);
  const validated = validateConnection(input.connection, registry);
  const isDefault = optionalBoolean(input.isDefault, "isDefault");
  const { providerId, ...fields } = validated.connection;
  // Project-first (`vendor-credentials/project-scope.ts`); "site" = only for this site.
  const target = credentialCreateTarget(deps, input, message => new PublishCredentialValidationError(message));
  await assertLabelFreeOnSite({ deps, target, workspaceId: input.workspaceId, vendorId: validated.spec.vendorId, label, providerId });
  const summary = await saveConnection({ deps, target, providerId, input: {
    ...credentialScope({ workspaceId: target.workspaceId, kind: "vendor" }), id: deps.idGen.newId(), expectedRevision: null,
    provider: validated.spec.vendorId, label, meta: { credentialType: "vendor", worksFor: validatedWorksFor({ value: input.worksFor === undefined ? registry.get(providerId)?.module.defaultCredentialWorksFor ?? [validated.spec.vendorId] : input.worksFor }), accountLabel: null }, payload: { vendorId: validated.spec.vendorId, ...fields },
    hintToken: fields[validated.spec.tokenField], ...(isDefault === undefined ? {} : { isDefault }),
  } });
  // The project read view deliberately hides this new row until it is attached; use put's result.
  const publishHosts = publishHostsForCredential({ credential: summary, registry });
  return { ...vaultSummary({ summary, providerId, publishHosts, defaultFor: summary.isDefault ? publishHosts : [] }), ...reportedScope({ deps, workspaceId: input.workspaceId, row: summary }) };
}

export interface UpdatePublishCredentialInput {
  workspaceId: UUID;
  id: UUID;
  /** Omitted = leave the label unchanged. */
  label?: unknown;
  /** Omitted = leave the stored connection (and its vendor) untouched — this route's own
   *  "connection omitted => keep the stored secret untouched" contract. Supplying a NEW connection
   *  may change the host and vendor. A provider-only move between token-only hosts retains the
   *  envelope: vault AAD binds the stable identity, not the vendor. Explicit secrets rotate.
   *  On same-vendor updates, null removes an optional secret; blank keeps it. */
  connection?: unknown;
  /** `true` makes this the default connection for its (possibly new — see `connection` above)
   *  vendor, clearing any previous default in the same repo call. Omitted/`false` preserves a
   *  same-vendor default; moves use the destination's default/first-row rule. Use
   *  `createPublishCredential`/another `updatePublishCredential` call with `isDefault: true` to
   *  promote a different row instead. */
  isDefault?: unknown;
  worksFor?: unknown;
}

/** Preserve only a provider change between compatible token-only contracts. Companion-field
 * changes and different secret schemas still require the validated replacement path.
 * @complexity O(k) time/space for k supplied keys; fixed schema checks, no I/O. */
function preservedMove({ raw, registry, host }: { raw: unknown; registry: DeployTargetRegistry; host: PublishProviderId }, _options = {}): { providerId: string; spec: DeployTargetCredentialSpec } | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const values = raw as Record<string, unknown>;
  if (typeof values.providerId !== "string" || values.providerId === host) return undefined;
  const spec = tokenOnlyMoveSpec({ registry, host, providerId: values.providerId });
  if (!spec || !isProviderOnlyMove({ values, spec })) return undefined;
  return { providerId: values.providerId, spec };
}

function tokenOnlyMoveSpec({ registry, host, providerId }: {
  registry: DeployTargetRegistry; host: PublishProviderId; providerId: string;
}, _options = {}): DeployTargetCredentialSpec | undefined {
  const spec = registry.get(providerId)?.descriptor.credential;
  const previous = registry.get(host)?.descriptor.credential;
  if (!spec || !previous || spec.tokenField !== previous.tokenField) return undefined;
  // Token-only = the token is the only REQUIRED field; an optional extra (a host's add-on secret) may
  // be absent, so the retained envelope is still a valid connection for the destination.
  if (![spec, previous].every(candidate => candidate.fields.every(field => field.name === candidate.tokenField || !field.required))) return undefined;
  return spec;
}

function isProviderOnlyMove({ values, spec }: {
  values: Record<string, unknown>; spec: DeployTargetCredentialSpec;
}, _options = {}): boolean {
  return Object.keys(values).every(key => key === "providerId" || key === spec.tokenField) &&
    (values[spec.tokenField] === undefined || values[spec.tokenField] === "");
}

/** Blank secret fields keep their stored value; null explicitly removes an optional secret.
 * Required secrets remain required, and non-secret companion fields still update.
 * @complexity O(fields + sealed payload bytes), at most one existing connection open.
 */
async function updatedConnection({ deps, input, existing, registry, host }: { deps: PublishCredentialWriteDeps; input: UpdatePublishCredentialInput;
  existing: VendorCredentialSetRecord; registry: DeployTargetRegistry; host: PublishProviderId }, _options = {}): Promise<ValidatedConnection> {
  const raw = input.connection;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return validateConnection(raw, registry);
  const values = raw as Record<string, unknown>;
  const { spec } = connectionCredentialSpec({ value: values, registry });
  if (spec.vendorId !== existing.vendorId) return validateConnection(raw, registry);
  const blankSecrets = spec.fields.filter(field => isSecretField({ field, spec }) && (values[field.name] === "" || values[field.name] === undefined));
  const clearedSecrets = spec.fields.filter(field => isSecretField({ field, spec }) && !field.required && field.name !== spec.tokenField && values[field.name] === null);
  if (blankSecrets.length === 0 && clearedSecrets.length === 0) return validateConnection(raw, registry);
  const stored = await decryptRecord(deps, existing, host);
  const merged = { ...stored, ...values };
  for (const field of blankSecrets) merged[field.name] = stored[field.name];
  for (const field of clearedSecrets) delete merged[field.name];
  return validateConnection(merged, registry);
}

/** Omitted connections retain their sealed envelope/hints and never require a site key.
 * Provider moves retarget the old compatibility IDs unless the caller supplies worksFor.
 * Reject labels that would hide a project row behind a site's row before writing.
 */
export async function updatePublishCredential(deps: PublishCredentialWriteDeps, input: UpdatePublishCredentialInput): Promise<PublishCredentialSummary> {
  // Changed where it lives: this site's own row, else the project's (shared by every site).
  const located = await locateById(deps, input);
  const registry = await deps.loadDeployTargets(input.workspaceId);
  const host = located ? registry.list().find(target => target.descriptor.credential?.vendorId === located.existing.vendorId)?.descriptor.id : undefined;
  if (!located || host === undefined) throw new PublishCredentialNotFoundError(`no publish credential '${input.id}' in this workspace`);
  const { scoped, existing } = located;
  const label = input.label !== undefined ? validateLabel(input.label) : existing.label;
  const requestedDefault = optionalBoolean(input.isDefault, "isDefault");
  const row = await scoped.deps.repo.vault!.find({ workspaceId: scoped.workspaceId, id: input.id });
  if (!row) throw new PublishCredentialNotFoundError(`no publish credential '${input.id}' in this workspace`);
  const { providerId, accountLabel, ...changes } = await connectionChanges({ deps: scoped.deps, input, existing, registry, host, row });
  await assertLabelFreeOnSite({ deps, target: scoped, workspaceId: input.workspaceId, vendorId: changes.provider, label, providerId });
  const summary = await saveConnection({ deps, target: scoped, providerId, input: { ...credentialScope({ workspaceId: scoped.workspaceId, kind: "vendor" }), id: input.id,
    expectedRevision: row.revision, label, ...changes,
    meta: { ...row.meta, worksFor: updatedWorksFor({ value: input.worksFor, row, provider: changes.provider, host }), accountLabel },
    ...(requestedDefault === true ? { isDefault: true } : {}) } });
  return (await describeCredential(deps, { workspaceId: input.workspaceId, id: summary.id }))!;
}

async function connectionChanges({ deps, input, existing, registry, host, row }: {
  deps: PublishCredentialWriteDeps; input: UpdatePublishCredentialInput; existing: VendorCredentialSetRecord;
  registry: DeployTargetRegistry; host: PublishProviderId; row: Pick<VaultSummary, "meta">;
}, _options = {}) {
  const move = preservedMove({ raw: input.connection, registry, host });
  if (input.connection !== undefined && !move) {
    const validated = await updatedConnection({ deps, input, existing, registry, host });
    const { providerId, ...fields } = validated.connection;
    return { providerId, provider: validated.spec.vendorId, accountLabel: null,
      payload: { vendorId: validated.spec.vendorId, ...fields }, hintToken: fields[validated.spec.tokenField] };
  }
  // Payload omission preserves ciphertext/hints; the vault atomically promotes/selects defaults.
  const providerId = move?.providerId ?? host;
  const provider = move?.spec.vendorId ?? existing.vendorId;
  return { providerId, provider, accountLabel: provider === existing.vendorId ? row.meta.accountLabel : null };
}

/** The store holding vendor row `id`: this site's, else the project's when one is attached (ids are
 *  unique across both). Never opens a row. @complexity At most one lookup. */
async function ownerOf<R extends Pick<VendorCredentialSetRepoPort, "findById" | "project">>(repo: R, input: { workspaceId: string; id: string }): Promise<{ repo: R | VendorCredentialSetRepoPort; workspaceId: string }> {
  const project = repo.project;
  if (!project || await repo.findById(input)) return { repo, workspaceId: input.workspaceId };
  return { repo: project.repo, workspaceId: project.workspaceId };
}

/** The vendor row with this id from whichever store holds it — this site's or the project's. */
export async function findPublishCredentialRecord(deps: { repo: Pick<VendorCredentialSetRepoPort, "findById" | "project"> },
  input: { workspaceId: UUID; id: UUID }): Promise<VendorCredentialSetRecord | null> {
  const owner = await ownerOf(deps.repo, input);
  return owner.repo.findById({ workspaceId: owner.workspaceId, id: input.id });
}

/** Legacy rows were folded by 0012. Delete only the vault row; reboot has no source to recopy.
 *  A project row is removed only when no other site uses it; its attachments are removed with it. */
export async function deletePublishCredential(deps: {
  repo: Pick<VendorCredentialSetRepoPort, "delete" | "findById" | "project">;
  transaction?: Pick<StorageKernel<unknown>, "transaction">;
}, input: { workspaceId: UUID; id: UUID }): Promise<void> {
  const owner = await ownerOf(credentialDeletionRepo({ repo: deps.repo }), input);
  await owner.repo.delete({ workspaceId: owner.workspaceId, id: input.id });
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

/** Resolve exactly one compatible row. Recheck metadata from the same read as its payload so
 * concurrent compatibility edits cannot pair an ineligible secret with an old selection.
 * @throws PublishCredentialSecretStoreUnconfiguredError on crypto or payload failure.
 * @complexity O(rows × hosts + payload), one metadata inventory and one selected open.
 */
export async function resolveForPublish(deps: PublishCredentialResolveDeps,
  input: { workspaceId: UUID; id: UUID; providerId?: PublishProviderId },
): Promise<{ providerId: PublishProviderId; vendorId: string; label: string; isDefault: boolean; connection: PublishConnectionInput } | null> {
  const registry = await deps.loadDeployTargets(input.workspaceId);
  const rows = await inventory({ deps, workspaceId: input.workspaceId });
  return resolveFromInventory({ deps, input, registry, rows });
}

/** Open the selected credential through Jini using one already-authorized inventory.
 * Both resolution entrypoints share compatibility rechecks and connection projection.
 * @throws PublishCredentialSecretStoreUnconfiguredError on crypto or payload failure.
 * @complexity O(rows × compatibility IDs + payload); one selected row read/open, no list reads.
 */
async function resolveFromInventory({ deps, input, registry, rows }: {
  deps: PublishCredentialResolveDeps; input: { workspaceId: UUID; id: UUID; providerId?: PublishProviderId };
  registry: DeployTargetRegistry; rows: VaultSummary[];
}, _options = {}): ReturnType<typeof resolveForPublish> {
  const candidate = rows.find(row => row.id === input.id);
  const providerId = selectedCandidateProviderId({ explicitId: input.providerId, candidate, registry });
  if (!candidate || !providerId) return null;
  const provider = providerContract({ registry, providerId });
  if (!provider || !selectPublishCredential({ registry, credentials: rows, provider, id: input.id })) return null;
  const resolved = await openPublishVaultRecord({ deps, input, candidate });
  if (!resolved || !selectPublishCredential({ registry, credentials: [resolved.summary], provider, id: input.id })) return null;
  const connection = publishConnectionFromPayload({ providerId, spec: registry.get(providerId)!.descriptor.credential!,
    summary: resolved.summary, payload: resolved.payload });
  return { providerId, vendorId: provider.vendorId, label: resolved.summary.label,
    isDefault: selectPublishCredential({ registry, credentials: rows, provider })?.id === input.id, connection };
}

function selectedCandidateProviderId({ explicitId, candidate, registry }: {
  explicitId: string | undefined; candidate: VaultSummary | undefined; registry: DeployTargetRegistry;
}, _options = {}): string | undefined {
  if (explicitId !== undefined) return explicitId;
  if (!candidate) return undefined;
  return publishHostsForCredential({ credential: candidate, registry })[0];
}

/** Crypto faults retain the established typed refusal and never echo payloads. */
async function openPublishVaultRecord({ deps, input, candidate }: {
  deps: PublishCredentialResolveDeps; input: { workspaceId: UUID; id: UUID }; candidate: VaultSummary;
}, _options = {}) {
  // Opened with the store that sealed it: this site's, or the project's (`credentialScopes`).
  const scoped = scopeOfRow(deps, { workspaceId: input.workspaceId, row: candidate });
  try { return await vault(scoped.deps).get({ ...credentialScope({ workspaceId: scoped.workspaceId, kind: candidate.kind === "custom" ? "custom" : "vendor" }), id: input.id }); }
  catch { throw new PublishCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage); }
}

function publishConnectionFromPayload({ providerId, spec, summary, payload }: {
  providerId: string; spec: DeployTargetCredentialSpec; summary: VaultSummary; payload: unknown;
}, _options = {}): PublishConnectionInput {
  if (!payload) throw new PublishCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage);
  const { vendorId: _vendorId, ...fields } = payload as Record<string, string>;
  const connection = summary.meta.credentialType === "custom" ? { providerId, [spec.tokenField]: fields.token! } : { ...fields, providerId };
  if (typeof connection[spec.tokenField] !== "string" || !connection[spec.tokenField]!.trim()) throw new PublishCredentialSecretStoreUnconfiguredError(CREDENTIAL_MESSAGES.storage);
  return connection;
}

/** The same selection policy serves implicit publishing, readiness and explicit-ID resolution.
 * @complexity O(rows × compatibility IDs + payload); one two-kind inventory and one selected open.
 */
export async function resolveDefaultForPublish(deps: PublishCredentialResolveDeps,
  input: { workspaceId: UUID; providerId: PublishProviderId },
): Promise<{ id: UUID; label: string; connection: PublishConnectionInput } | null> {
  const registry = await deps.loadDeployTargets(input.workspaceId);
  const provider = providerContract({ registry, providerId: input.providerId });
  if (!provider) return null;
  const rows = await inventory({ deps, workspaceId: input.workspaceId });
  const selected = selectPublishCredential({ registry, credentials: rows, provider });
  if (!selected) return null;
  const resolved = await resolveFromInventory({ deps, input: { ...input, id: selected.id }, registry, rows });
  return resolved ? { id: selected.id, label: resolved.label, connection: resolved.connection } : null;
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
 * Written where the row lives: this site's vault, else the project's.
 *
 * @complexity O(1) — one lookup and one repo write (a no-op, not an error, if the row vanished meanwhile).
 */
export async function healAccountLabel(deps: { repo: VendorCredentialSetRepoPort }, input: { workspaceId: UUID; id: UUID; accountLabel: string }): Promise<void> {
  const owner = await ownerOf(deps.repo, input);
  await owner.repo.updateAccountLabel({ ...input, workspaceId: owner.workspaceId });
}
