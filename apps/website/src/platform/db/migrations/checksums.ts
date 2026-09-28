/**
 * @file Pinned checksums, one per migration id (ADR-066 §3). The runner records these and compares
 * them with the ledger; `__tests__/checksums.test.ts` re-derives each from the step's sources, so an
 * edit to a shipped step goes red instead of silently differing between databases.
 *
 * - `0000_legacy_baseline`: sha256 of the frozen drizzle chain's (tag, file hash) list and the
 *   Postgres baseline statements (`legacyBaselineChecksum()`).
 * - Every later step: sha256 of its `NNNN_name.ts` source with comments removed and whitespace
 *   collapsed (the test's `sourceChecksum`). Pinned, not computed at runtime: dev runs the `.ts`
 *   through tsx and production runs tsc output, which would hash differently.
 *
 * Add new ids with `UPDATE_MIGRATION_CHECKSUMS=1`; the updater never changes an existing one.
 */
export const MIGRATION_CHECKSUMS: Readonly<Record<string, string>> = {
  "0000_legacy_baseline": "2dc785cd1a16b371ac1cc8f6798c688d3c2e0a9a489c54535ef1cf8ca324e714",
};
