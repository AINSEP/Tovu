import { isDeepStrictEqual } from "node:util";
import type { LegacyOwnerEntry, LegacyOwnerSnapshot } from "@jini-ai/server/owner-store";
import type { SecretsVaultService, VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import type { ProjectKeyTransaction } from "#src/features/project-keys/attachments";

/** @file The one explicit legacy import: owner-store entries (from owner.db or a passphrase backup)
 * become project keys. It never touches a site, never attaches a key, never deletes or rewrites the
 * source, and never changes a default: every row is saved non-default (`isDefault: false` opts out of
 * the vault's first-row rule), so neither a project default nor a site's effective selection moves.
 */

export type LegacyImportStatus = "new" | "imported" | "already-imported" | "conflict" | "unsupported";
export type LegacyImportReason = "different-secret" | "label-taken" | "kind" | "owner";
export interface LegacyImportItem {
  id: string; label: string; kind: string; provider: string | null; status: LegacyImportStatus; reason?: LegacyImportReason;
}
export interface LegacyImportPending { entryId: string; site: string; reason: "keeps-copy" | "revoked-copy" }
// A type alias, not an interface: the CLI reply carries it as Record<string, unknown>.
export type LegacyImportReport = { applied: boolean; items: LegacyImportItem[]; pending: LegacyImportPending[] };
export const EMPTY_IMPORT: LegacyImportReport = Object.freeze({ applied: false, items: [], pending: [] }) as LegacyImportReport;

/** Owner-store kinds project.db's schema admits (`0001_project_credential_kinds`). The legacy store
 * could also hold site-assistant and database-destination rows; the project CHECK rejects both, so
 * they are refused by name here rather than failing (or vanishing) inside the write.
 */
const PROJECT_KINDS: ReadonlySet<string> = new Set(["vendor", "source-control", "publish-peer", "media-provider"]);

interface ProjectTarget { vault: SecretsVaultService; workspaceId: string; transaction: ProjectKeyTransaction; rows: VaultSummary[] }

/** Plan every entry (always a dry run first), then, only with `apply`, write the `new` ones in one
 * project transaction. An existing id counts as already imported only when kind, binding, provider,
 * label, metadata and the decrypted payload all match; otherwise it is a conflict and stays as it is.
 * @param required The validated legacy snapshot and the opened project vault with its current rows.
 * @param optional apply: write the plan; default false (dry run).
 * @returns Per-entry outcomes plus every recorded site destination, reported pending (sites keep copies).
 * @throws Vault errors from the write; the transaction rolls back every row.
 * @complexity O(n * r) for n entries against r project rows, plus one decrypt per id match.
 * @example const report = await importLegacyKeys({ snapshot, target }, { apply: false });
 */
export async function importLegacyKeys({ snapshot, target }: { snapshot: LegacyOwnerSnapshot; target: ProjectTarget },
  { apply = false }: { apply?: boolean } = {}): Promise<LegacyImportReport> {
  const planned: { entry: LegacyOwnerEntry; item: LegacyImportItem }[] = [];
  for (const entry of snapshot.entries) planned.push({ entry, item: await planEntry({ entry, target }) });
  const fresh = planned.filter(({ item }) => item.status === "new");
  if (apply && fresh.length > 0) {
    await target.transaction({ run: async () => {
      for (const { entry } of fresh) await target.vault.put({ id: entry.id, kind: entry.kind, ownerKey: "tovu", binding: entry.binding,
        provider: entry.provider, label: entry.label, meta: entry.meta, payload: entry.payload, isDefault: false,
        expectedRevision: null, workspaceId: target.workspaceId, principalId: null });
    } });
  }
  const applied = apply && fresh.length > 0;
  const items = planned.map(({ item }) => applied && item.status === "new" ? { ...item, status: "imported" as const } : item);
  return { applied, items, pending: pendingSites({ snapshot }) };
}

/** One entry's outcome. Refusals are explicit and named; nothing is silently dropped. */
async function planEntry({ entry, target }: { entry: LegacyOwnerEntry; target: ProjectTarget }): Promise<LegacyImportItem> {
  const item = { id: entry.id, label: entry.label, kind: entry.kind, provider: entry.provider };
  if (!PROJECT_KINDS.has(entry.kind)) return { ...item, status: "unsupported", reason: "kind" };
  // Project rows are host-owned (CHECK owner_key = 'tovu'); a plugin-owned legacy row cannot move.
  if (entry.ownerKey !== "tovu") return { ...item, status: "unsupported", reason: "owner" };
  const existing = target.rows.find(row => row.id === entry.id);
  if (existing) return await sameKey({ entry, existing, target }) ? { ...item, status: "already-imported" } : { ...item, status: "conflict", reason: "different-secret" };
  if (target.rows.some(row => labelTaken({ entry, row }))) return { ...item, status: "conflict", reason: "label-taken" };
  return { ...item, status: "new" };
}

/** Same identity, metadata and decrypted payload: importing again would change nothing. */
async function sameKey({ entry, existing, target }: { entry: LegacyOwnerEntry; existing: VaultSummary; target: ProjectTarget }): Promise<boolean> {
  const identity = [existing.kind, existing.binding, existing.provider, existing.label];
  if (!isDeepStrictEqual(identity, [entry.kind, entry.binding, entry.provider, entry.label]) || !isDeepStrictEqual(existing.meta, entry.meta)) return false;
  const stored = await target.vault.get({ id: existing.id, kind: existing.kind, ownerKey: "tovu", binding: existing.binding,
    workspaceId: target.workspaceId, principalId: null });
  return isDeepStrictEqual(stored?.payload ?? null, entry.payload);
}

/** Conservative superset of the project's unique indexes: same kind and same name, or (media) the
 * same provider. A dry run reports it instead of letting the write's rollback fail every row.
 */
function labelTaken({ entry, row }: { entry: LegacyOwnerEntry; row: VaultSummary }): boolean {
  if (row.kind !== entry.kind) return false;
  return row.label === entry.label || (entry.kind === "media-provider" && row.provider === entry.provider);
}

/** Every recorded destination of an entry in this snapshot: active grants keep their copy, and a
 * revoked copy whose cleanup never finished may still sit on that site.
 */
function pendingSites({ snapshot }: { snapshot: LegacyOwnerSnapshot }): LegacyImportPending[] {
  const ids = new Set(snapshot.entries.map(entry => entry.id));
  return [
    ...snapshot.grants.filter(row => ids.has(row.entryId)).map(row => ({ entryId: row.entryId, site: row.consumerId, reason: "keeps-copy" as const })),
    ...snapshot.revocations.filter(row => ids.has(row.entryId)).map(row => ({ entryId: row.entryId, site: row.consumerId, reason: "revoked-copy" as const })),
  ];
}
