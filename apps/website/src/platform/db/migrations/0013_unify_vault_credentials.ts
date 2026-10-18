import { sql } from "kysely";
import type { StorageKernel } from "../kernel/port.js";
import type { MigrationStep } from "./step.js";

/** Data only: the runner owns transaction, backup and ledger. Existing coalesced provider indexes
 * already isolate custom rows' NULL-provider group. The kind CHECK retains dead value 'custom'
 * as schema debt; removing it requires a separate, justified DDL migration.
 * No crypto/envelope reads here. Boot alone opens and reseals the pinned historical custom AAD.
 */
export const UNIFY_VAULT_CREDENTIALS_ID = "0013_unify_vault_credentials";

// Frozen 2026-10-17 deploy-targets + source-control catalog. Never import a live plugin registry
// or Jini's evolving suggestion function into a checksummed migration.
const CATALOG = [
  { id: "github-pages", vendorId: "github" },
  { id: "cloudflare-pages", vendorId: "cloudflare" },
  { id: "vercel", vendorId: "vercel" },
  { id: "netlify", vendorId: "netlify" },
  { id: "s3-compatible", vendorId: "s3-compatible" },
  { id: "github", vendorId: "github" },
] as const;

type Meta = Record<string, unknown>;
type Row = { workspace_id: string; id: string; kind: "vendor" | "custom"; provider: string | null;
  label: string; revision: number; meta: string | Meta };

/** Exact spelling modulo case only; conflicting vendor identities are never guessed.
 * @complexity O(catalog size), frozen constant space.
 */
function inferredWorksFor({ label }: { label: string }, _options = {}): string[] {
  const identity = label.toLowerCase();
  const matches = CATALOG.filter(entry => entry.id === identity || entry.vendorId === identity);
  return matches.length && new Set(matches.map(entry => entry.vendorId)).size === 1 ? [identity] : [];
}

/** Convert metadata without touching timestamps, defaults, IDs, providers or opaque envelopes.
 * Preserve pre-0012 lineage when it still needs boot normalization; normalized custom vault rows
 * instead pin precisely the old custom-kind vault AAD. Re-entry skips already canonical rows.
 * @complexity O(rows × frozen catalog), O(rows + metadata) memory; one metadata scan and CAS/update.
 */
async function up(kernel: StorageKernel<unknown>): Promise<void> {
  const rows = await kernel.query<Row>(sql`SELECT workspace_id,id,kind,provider,label,revision,meta
    FROM secrets_vault WHERE kind IN ('vendor','custom') ORDER BY workspace_id,id`);
  for (const row of rows) {
    const meta: Meta = typeof row.meta === "string" ? JSON.parse(row.meta) : row.meta;
    if (row.kind === "vendor" && (meta.credentialType === "vendor" || meta.credentialType === "custom") && Array.isArray(meta.worksFor)) continue;
    const updated: Meta = { ...meta, credentialType: row.kind,
      worksFor: row.kind === "vendor" ? (row.provider === null ? [] : [row.provider]) : inferredWorksFor({ label: row.label }) };
    if (row.kind === "custom" && meta.legacyAad === undefined) {
      const legacy = { table: "secrets_vault_custom_v1", workspaceId: row.workspace_id, id: row.id,
        principalId: null, provider: null, serverId: null, aadVersion: 1 };
      updated.legacyAad = legacy;
      updated.migration = { ...legacy, mappedId: row.id, mappedLabel: row.label,
        // Retain previous provenance without letting it override the pinned historical identity.
        ...(meta.migration === undefined ? {} : { previous: meta.migration }) };
    }
    const changed = await kernel.query<{ id: string }>(sql`UPDATE secrets_vault SET kind='vendor',
      meta=${JSON.stringify(updated)},revision=revision+1
      WHERE workspace_id=${row.workspace_id} AND id=${row.id} AND revision=${row.revision} RETURNING id`);
    if (changed.length !== 1) throw new Error("credential unification revision conflict");
  }
}

/** Kept unregistered until the coordinator explicitly activates the reviewed rollout patch. */
export function unifyVaultCredentials({ checksum }: { checksum: string }, _options = {}): MigrationStep {
  return { id: UNIFY_VAULT_CREDENTIALS_ID, checksum, up };
}
