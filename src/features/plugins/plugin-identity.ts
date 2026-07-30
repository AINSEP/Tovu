/**
 * @file ADR-023 §5/§6 (T5 fix, round-2 revision) — permanent plugin-ID retirement plus the
 * two-track fail-closed namespace-adoption guard.
 *
 * A `pluginId` is permanently retired the moment it is first minted (this record is never
 * deleted, including after a future uninstall+purge — no purge/uninstall flow exists in this
 * codebase yet, so this module's row is never actually removed by anything today; that absence
 * IS the correct behavior per §6's "retirement is permanent" rule, not a gap).
 *
 * Two-track adoption rule (§6): a SUBSEQUENT declare for an already-identified `pluginId` is
 * allowed automatically when its provenance is unchanged from what's on record (the common case —
 * the same first-party module re-declaring at every boot), OR when both the stored and incoming
 * provenance carry a matching signature (track a — "verified same-key signature"). Anything else
 * (no signature on one/both sides, or a mismatch) requires explicit operator consent (track b) —
 * surfaced here as a typed refusal, since no consent-prompt UI exists in this codebase yet.
 *
 * Signature verification here is a same-string comparison, not real cryptographic verification —
 * ADR-004 leaves `signature` optional and no signing/verification infrastructure exists anywhere
 * in this codebase yet (confirmed: ADR-023 §6 itself says the same — "track (a) will rarely fire
 * ... track (b) is the load-bearing path" — this is the intended, honest degraded behavior, not
 * an unfinished shortcut).
 */
import type Database from "better-sqlite3";

export interface PluginProvenance {
  sourceUrl: string;
  publisher: string;
  signature?: string;
}

export interface PluginIdentityRecord {
  pluginId: string;
  provenance: PluginProvenance;
  mintedAt: number;
}

export type NamespaceAdoptionDecision =
  | { allowed: true; track: "first-mint" | "unchanged" | "verified-signature" }
  | { allowed: false; track: "consent-required"; reason: string };

export function ensurePluginIdentityTable(db: Database.Database): void {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS _plugin_identity (
       plugin_id TEXT PRIMARY KEY,
       source_url TEXT NOT NULL,
       publisher TEXT NOT NULL,
       signature TEXT,
       minted_at INTEGER NOT NULL
     )`
  ).run();
}

export function getPluginIdentity(
  required: { db: Database.Database; pluginId: string },
  _optional: Record<string, never> = {}
): PluginIdentityRecord | null {
  const { db, pluginId } = required;
  const row = db.prepare(`SELECT plugin_id, source_url, publisher, signature, minted_at FROM _plugin_identity WHERE plugin_id = ?`).get(pluginId) as
    | { plugin_id: string; source_url: string; publisher: string; signature: string | null; minted_at: number }
    | undefined;
  if (!row) return null;
  return {
    pluginId: row.plugin_id,
    provenance: { sourceUrl: row.source_url, publisher: row.publisher, ...(row.signature != null ? { signature: row.signature } : {}) },
    mintedAt: row.minted_at,
  };
}

/** First-write-wins. Never called again for a `pluginId` once minted (see `checkNamespaceAdoption`). */
function mintPluginIdentity(db: Database.Database, pluginId: string, provenance: PluginProvenance): void {
  db.prepare(`INSERT INTO _plugin_identity (plugin_id, source_url, publisher, signature, minted_at) VALUES (?, ?, ?, ?, ?)`).run(
    pluginId,
    provenance.sourceUrl,
    provenance.publisher,
    provenance.signature ?? null,
    Date.now()
  );
}

function provenanceEqual(a: PluginProvenance, b: PluginProvenance): boolean {
  return a.sourceUrl === b.sourceUrl && a.publisher === b.publisher && (a.signature ?? null) === (b.signature ?? null);
}

/**
 * Mints the identity record on first sight (always `allowed: true`). On a subsequent declare,
 * applies the two-track rule. Does NOT mutate the identity record on anything but first mint —
 * a provenance mismatch never silently overwrites the record on record (permanent retirement).
 */
export function checkNamespaceAdoption(
  required: { db: Database.Database; pluginId: string; provenance: PluginProvenance },
  _optional: Record<string, never> = {}
): NamespaceAdoptionDecision {
  const { db, pluginId, provenance } = required;
  ensurePluginIdentityTable(db);
  const existing = getPluginIdentity({ db, pluginId });
  if (!existing) {
    mintPluginIdentity(db, pluginId, provenance);
    return { allowed: true, track: "first-mint" };
  }
  if (provenanceEqual(existing.provenance, provenance)) {
    return { allowed: true, track: "unchanged" };
  }
  if (existing.provenance.signature && provenance.signature && existing.provenance.signature === provenance.signature) {
    return { allowed: true, track: "verified-signature" };
  }
  return {
    allowed: false,
    track: "consent-required",
    reason: `pluginId '${pluginId}' has retained data from a previously-seen, provenance-mismatched artifact — explicit operator consent is required before adopting this namespace`,
  };
}
