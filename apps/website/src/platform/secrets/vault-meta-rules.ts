import { VaultError, type VaultJson, type VaultKind, type VaultMeta, type VaultMetaParsers } from "@jini-ai/platform/secrets/credential-sets";
import { assertCredentialFreeField } from "#src/contracts/core/credential-token";
import { CUSTOM_CREDENTIAL_CATEGORIES } from "#src/contracts/core/custom-credential-categories";
import { parseApiConnectionMeta } from "./vault-api-connection-meta.js";

/** Tovu's host rules for vault metadata, run inside Jini's complete-shape parsers by `createTovuVaultKinds`.
 * Every rule is pure and throws on the first problem; callers rely on the order documented per function. */

const NORMALIZATION_STATUSES = ["missing-key", "unopenable", "invalid-meta", "catalog-unavailable", "conflict"];
const MIGRATION_LABEL_FIELDS = ["originalLabel", "mappedLabel"];
const DESCRIPTION_FIELDS = ["host", "port", "database", "user"];
const SUCCESS_RUN_FIELDS = ["copied", "snapshotAt", "tableCount", "rowCount"];
const FAILURE_RUN_FIELDS = ["copied", "snapshotAt", "code", "message"];
const CREDENTIAL_FREE_TEXT_FIELDS = ["baseUrl", "model", "username", "accountLabel"];

function invalidMeta(): VaultError {
  return new VaultError({ code: "invalid-meta" });
}

/** Recovery provenance (`migration`, `normalization`) rides beside ordinary metadata.
 * Legacy AAD markers are deliberately not accepted here.
 * @throws VaultError invalid-meta for a legacy AAD marker, unknown status or non-object migration;
 *   CredentialInputError when a migration label holds a credential.
 * @complexity O(1); fixed field checks, no I/O.
 */
export function assertRecoveryMeta({ meta }: { meta: VaultMeta }, _optional = {}): void {
  if (Object.hasOwn(meta, "legacyAad")) throw invalidMeta();
  const { migration, normalization } = meta;
  if (normalization !== undefined && (typeof normalization !== "string" || !NORMALIZATION_STATUSES.includes(normalization))) throw invalidMeta();
  if (migration !== undefined) assertMigrationProvenance({ migration });
}

function assertMigrationProvenance({ migration }: { migration: VaultJson }, _optional = {}): void {
  if (migration === null || typeof migration !== "object" || Array.isArray(migration)) throw invalidMeta();
  for (const field of MIGRATION_LABEL_FIELDS) {
    const value = migration[field];
    if (typeof value === "string") assertCredentialFreeField({ value, field });
  }
}

/** Dispatch Tovu's api-connection formats or Jini's kind parser, retaining a destination's `savedAt`.
 * @throws VaultError invalid-meta from structural parsing or a non-string `savedAt`; Jini's OAuth error for invalid token metadata.
 * @complexity O(metadata size); one structural parse, no I/O.
 */
export function parseStructuralMeta(
  { kind, meta, provider, base }: { kind: VaultKind; meta: VaultMeta; provider: string | null | undefined; base: VaultMetaParsers },
  _optional = {},
): VaultMeta {
  if (kind === "api-connection") return parseApiConnectionMeta({ meta });
  if (kind !== "database-destination") return base[kind]({ meta, provider });
  // savedAt describes the destination save, not the last metadata patch. Old migrated rows
  // omit it and use createdAt; it must survive later lastRun updates without changing.
  const { savedAt, ...destinationMeta } = meta;
  const parsed = base[kind]({ meta: destinationMeta, provider });
  if (savedAt === undefined) return parsed;
  if (typeof savedAt !== "string") throw invalidMeta();
  parsed.savedAt = savedAt;
  return parsed;
}

/** Host read/write invariants on structurally parsed metadata, including merged lastRun patches.
 * Order: peer binding, destination description and run, custom category, then credential-free text,
 * additional origins and worksFor entries.
 * @throws VaultError for malformed descriptions, peer bindings, run summaries, categories or origins;
 *   CredentialInputError when a plain field holds a credential; TypeError for an unparseable origin.
 * @complexity O(metadata size); fixed field checks, no I/O.
 */
export function assertHostMetaRules({ kind, meta }: { kind: VaultKind; meta: VaultMeta }, _optional = {}): void {
  if (kind === "publish-peer") assertPublishPeerMeta({ meta });
  if (kind === "database-destination") assertDatabaseDestinationMeta({ meta });
  assertCustomCategory({ kind, meta });
  assertCredentialFreeMeta({ meta });
}

function assertPublishPeerMeta({ meta }: { meta: VaultMeta }, _optional = {}): void {
  if (typeof meta.baseUrl !== "string" || typeof meta.remoteWorkspaceId !== "string" || !meta.remoteWorkspaceId) throw invalidMeta();
}

/** No connection URI is metadata: a destination is described only by its four plain fields. */
function assertDatabaseDestinationMeta({ meta }: { meta: VaultMeta }, _optional = {}): void {
  const description = meta.description as VaultMeta | null | undefined;
  if (!description || DESCRIPTION_FIELDS.some(field => typeof description[field] !== "string") ||
    !hasOnlyFields({ record: description, fields: DESCRIPTION_FIELDS })) throw invalidMeta();
  for (const [field, value] of Object.entries(description)) assertCredentialFreeField({ value: value as string, field });
  if (meta.lastRun === null) return;
  assertRunSummary({ run: meta.lastRun as VaultMeta | null | undefined });
}

function assertRunSummary({ run }: { run: VaultMeta | null | undefined }, _optional = {}): void {
  if (!run || typeof run.snapshotAt !== "string" || typeof run.copied !== "boolean") throw invalidMeta();
  let valid: boolean;
  if (run.copied) valid = hasOnlyFields({ record: run, fields: SUCCESS_RUN_FIELDS }) && [run.tableCount, run.rowCount].every(value => isRunCount({ value }));
  else valid = hasOnlyFields({ record: run, fields: FAILURE_RUN_FIELDS }) && typeof run.code === "string" && typeof run.message === "string";
  if (!valid) throw invalidMeta();
}

function hasOnlyFields({ record, fields }: { record: VaultMeta; fields: readonly string[] }, _optional = {}): boolean {
  return Object.keys(record).every(field => fields.includes(field));
}

function isRunCount({ value }: { value: VaultJson | undefined }, _optional = {}): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function assertCustomCategory({ kind, meta }: { kind: VaultKind; meta: VaultMeta }, _optional = {}): void {
  const isCustom = kind === "custom" || (kind === "vendor" && meta.credentialType === "custom");
  if (isCustom && !CUSTOM_CREDENTIAL_CATEGORIES.includes(meta.category as typeof CUSTOM_CREDENTIAL_CATEGORIES[number])) throw invalidMeta();
}

function assertCredentialFreeMeta({ meta }: { meta: VaultMeta }, _optional = {}): void {
  for (const field of CREDENTIAL_FREE_TEXT_FIELDS) {
    const value = meta[field];
    if (typeof value === "string") assertCredentialFreeField({ value, field });
  }
  if (Array.isArray(meta.additionalHosts)) for (const value of meta.additionalHosts) assertCredentialFreeOrigin({ value });
  if (Array.isArray(meta.worksFor)) for (const value of meta.worksFor) {
    assertCredentialFreeField({ value: value as string, field: "worksFor" });
  }
}

/** One additional host: a canonical origin (no path, query or trailing slash) holding no credential.
 * Jini's structural parser already guarantees strings; the type check stays as defence in depth.
 * @throws VaultError invalid-meta for a non-string or non-origin; TypeError for an unparseable URL;
 *   CredentialInputError for a credential-shaped origin.
 * @complexity O(value length); no I/O.
 */
export function assertCredentialFreeOrigin({ value }: { value: VaultJson }, _optional = {}): void {
  if (typeof value !== "string" || new URL(value).origin !== value) throw invalidMeta();
  assertCredentialFreeField({ value, field: "additionalHosts" });
}

/** Re-attach recovery provenance after host policy, only when the input carried it. */
export function withRecoveryMeta(
  { meta, migration, normalization }: { meta: VaultMeta; migration: VaultJson | undefined; normalization: VaultJson | undefined },
  _optional = {},
): VaultMeta {
  return { ...meta, ...(migration === undefined ? {} : { migration }), ...(normalization === undefined ? {} : { normalization }) };
}
