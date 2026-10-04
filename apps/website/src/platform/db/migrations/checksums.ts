/**
 * @file Pinned checksums, one per migration id (ADR-066 §3). The runner records these and compares
 * them with the ledger; `__tests__/checksums.test.ts` re-derives each from the step's sources, so an
 * edit to a shipped step goes red instead of silently differing between databases.
 *
 * - `0000_legacy_baseline`: sha256 of the frozen drizzle chain's (tag, file hash) list and the
 *   Postgres baseline statements (`legacyBaselineChecksum()`).
 * - Every later step: sha256 of its `NNNN_name.ts` source with comments removed and whitespace
 *   collapsed (the test's `sourceChecksum`). Chat steps are keyed `chat/NNNN_name` (their file under
 *   `chat/`). Pinned, not computed at runtime: dev runs the `.ts`
 *   through tsx and production runs tsc output, which would hash differently.
 *
 * Add new ids with `UPDATE_MIGRATION_CHECKSUMS=1`; the updater never changes an existing one.
 */
export const MIGRATION_CHECKSUMS: Readonly<Record<string, string>> = {
  "0000_legacy_baseline": "2dc785cd1a16b371ac1cc8f6798c688d3c2e0a9a489c54535ef1cf8ca324e714",
  "0001_post_search": "234ca1fdbacd2462582ef55c551f4b5046236384b6e90f799d95fecb944e6795",
  "chat/0000_chat_baseline": "d7673b2b2ac8af992a396b375fa38da8ffbf852285c772016dc47c82d66d17a9",
  "0002_drop_empty_legacy_chat_tables": "1e33d7ab4ba950fcfa5c8fdb86d312a571f5e88c2d043e603970ad2914a7583b",
  "chat/0001_sqlite_chat_tables": "6ab892750dcd9201f17bd05df3f3f69f84a6342d54647984d6c834dd7d5d164f",
  "0003_coercion_json_as_json": "1135e06ed42097731f6ef16c2c4d826b0b23a171640e50df96517136876e99cf",
  "0004_drop_unused_deployment_tables": "315701db702123c69de2b4f56497b191b1245f326fa6fdd2beabc01550838b3c",
  "0005_media_createdby": "81cefae555b8d577076fcc3adb42ff50be82935d4e76ed13042f9475f3346c5a",
  "0006_submission_ip_retention": "46d094a528ef15a53db38f942c1984194e203afaae931da2c1e8ce61d07f89e7",
};
