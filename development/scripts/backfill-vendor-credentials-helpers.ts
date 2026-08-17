/**
 * @file Pure helpers for `backfill-vendor-credentials.ts`, split into their own side-effect-free
 * module for exactly one reason: that script's own `main()` runs unconditionally at import time
 * (matching `backfill-slug-collision-defaults.ts`'s own established convention — see that script's
 * own test file header for why), so nothing may import the script module directly in-process without
 * also triggering a real `openContentDb()` against the default `infra/content.db` path. A direct
 * unit test of `resolveLabel` needs to import IT without importing `main()`'s side effect along with
 * it — this file is that seam. `backfill-vendor-credentials.ts` re-exports everything here so every
 * other caller keeps importing from one place, unaware this split exists.
 */

export type Origin = "publish" | "source-control";

/** Per-`(workspace_id, vendor_id)` group state the migration script tracks WHILE merging, seeded
 *  from whatever already exists in `vendor_credential_sets` (a prior partial `--apply` run) — both
 *  `takenLabels` and `hasDefault` must be seeded from real target-table state, not just tracked
 *  fresh within one run, for idempotency to hold across runs. */
export interface GroupState {
  readonly takenLabels: Set<string>;
  hasDefault: boolean;
}

/**
 * Resolves a possibly-colliding candidate label against a group's already-taken set. A collision is
 * the expected common case, not an edge case: every row in both `publish_credential_sets`/
 * `source_control_credential_sets` was written by an admin UI that hardcoded the literal label
 * `"default"`, so a workspace with both a `github-pages` publish credential and a `github`
 * source-control credential commonly tries to migrate two rows into the same vendor group both
 * labeled `"default"`, and `vendor_credential_sets` enforces `UNIQUE (workspace_id, vendor_id,
 * label)`.
 *
 * Three tiers, in order: the candidate unchanged; the candidate with an origin suffix appended
 * (`" (Publish)"`/`" (Source Control)"`); and — only if even THAT collides — the origin-suffixed
 * label with the row's own id prefix appended, which is always unique by construction. Tier 3 is
 * unreachable with today's fixed provider-to-vendor mapping (every old provider id within one source
 * table maps to a DISTINCT vendor, so the only possible collision is one row from each of the two
 * source tables landing in the same vendor group — exactly tier 2's case), but is real defensive
 * code: nothing prevents a future mapping change from sending two different old provider ids within
 * the SAME source table to the same vendor.
 *
 * Same output for the same input on every call — this determinism is what keeps the whole migration
 * idempotent across repeated `--apply` runs.
 *
 * @complexity O(1) — at most two `Set.has()` checks.
 */
export function resolveLabel(candidate: string, state: GroupState, origin: Origin, rowId: string): string {
  if (!state.takenLabels.has(candidate)) return candidate;
  const withOrigin = `${candidate} (${origin === "publish" ? "Publish" : "Source Control"})`;
  if (!state.takenLabels.has(withOrigin)) return withOrigin;
  return `${withOrigin} ${rowId.slice(0, 8)}`;
}
