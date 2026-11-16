/**
 * @file Source digests for steps whose file text changed in a reviewed edit that changes no behavior
 * (2026-11-15, C3t: the deleted storage facades' imports were repointed; `MigrationStep`/`StorageKernel`
 * type names were rewritten). The ledger checksum in `checksums.ts` is what databases recorded and never
 * changes; `__tests__/checksums.test.ts` compares a step's source with the digest here when there is one,
 * else with its ledger checksum. A NEW step never gets an entry: it is pinned in `checksums.ts` only.
 */
export const MIGRATION_SOURCE_DIGESTS: Readonly<Record<string, string>> = {};
