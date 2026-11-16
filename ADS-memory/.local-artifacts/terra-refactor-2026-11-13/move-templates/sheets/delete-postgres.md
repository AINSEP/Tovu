id: DL-postgres-1   (template T-DELETE, fold with moved body; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton: delete-postgres.gen.md)
feature: website/platform/db/postgres
kind_check: KIND-SUSPECT confirmed. `db-ops.ts` is not dead: it is 1 pure function + 1 config interface with one prod caller in the SAME folder (`db-ops-adapter.ts:2`, `PostgresDbOpsAdapter.getCapabilities()`) and one integration test. It cannot go to Jini: it returns Tovu's `RestoreCapability` (`contracts/core/gated-mutations/ports.ts:19`, a Tovu contract; no Jini twin: `rg evaluatePostgresRestoreCapability|PostgresRestoreToolingConfig packages` prints nothing). Taken as DELETE in the moved_bodies form: the function and interface move verbatim into their one caller's file, `db-ops-adapter.ts`, and `db-ops.ts` is deleted. Alternative (not taken): mark the row STAY; the fold is cheap and removes a file whose header still calls the adapter "future".
untangle_overlap: none (no *.repoint.tsv row on db-ops.ts, db-ops-adapter.ts or the integration test)
blocked: no
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra  JINI_CLONE=/Users/la/Programming/jini-terra-base

tovu_file: apps/website/src/platform/db/postgres/db-ops.ts | blob f0ae79da921710771458470be800b9ee5e194085
non_reexport_statements: 2 (PostgresRestoreToolingConfig, evaluatePostgresRestoreCapability) -> moved_bodies M1
why_dead: dead-cluster fold: its only prod caller is db-ops-adapter.ts in the same folder; the body moves there
tovu_file_after: delete
file_after: -
moved_bodies:
  - M1 PostgresRestoreToolingConfig + evaluatePostgresRestoreCapability -> apps/website/src/platform/db/postgres/db-ops-adapter.ts | blob 5ae6ffdffc21e22de73a60de382294ef9f7886b5 | before: "/** A restore point was asked of a store that cannot take or restore one. */" | exported? yes (both; the integration test imports the function) | text: block MOVED TEXT below, followed by one blank line
  - destination import edits: db-ops-adapter.ts: delete the line "import { evaluatePostgresRestoreCapability } from \"./db-ops.js\";" (line 2; the function is now local). Line 1 already imports `RestoreCapability`.
MOVED TEXT (db-ops.ts lines 16-51 verbatim, preceded by the file header's why reworded as a declaration doc: the "@file" tag and the "Purpose:"/"Architectural role:" labels go, "A future `PostgresDbOpsAdapter` implementing `DbOpsPort` would call this function from its own `getCapabilities()`." becomes "{@link PostgresDbOpsAdapter} below calls it from its `getCapabilities()`."):
```ts
/**
 * SPEC-016 C-007 / REQ-19–REQ-21 — Postgres restore-capability evaluation (pure logic only).
 *
 * Evaluates what restore mechanism a Postgres-backed site actually has available, from static
 * tooling/config facts. This is deliberately evaluation-only — no live `pg` client, no actual
 * `pg_dump`/blue-green execution — per `implementation-outline.md`'s "Postgres adapter deferred"
 * note (see this package's `test-certification.md` Known Gaps). {@link PostgresDbOpsAdapter}
 * below calls it from its `getCapabilities()`. No I/O — every input is a caller-supplied static fact.
 */
export interface PostgresRestoreToolingConfig {
  /** Resolved path to a working `pg_dump` binary, or `null` if none is configured. */
  pgDumpBinaryPath: string | null;
  /** Whether database credentials for a dump/blue-green run are present. */
  credentialsPresent: boolean;
  /** Whether the dump/blue-green target parameters (host, resolved binary, etc.) are structurally valid. */
  targetParametersValid: boolean;
  /** Whether an externally-managed PITR/backup system is configured for this site instead. */
  externalPitrConfigured: boolean;
}

/**
 * Priority: a functioning dump/blue-green mechanism (`kind: "logical-dump"`, `costClass:
 * "expensive"`) beats an external PITR system, which itself beats "nothing configured" — both of
 * the latter report `costClass: "unavailable"` (AC-29/AC-36/AC-37), since neither gives this
 * gated-mutation gateway a restore point it can trigger and observe directly.
 *
 * A `pgDumpBinaryPath` that is present but non-functional (unresolvable/structurally invalid,
 * `targetParametersValid: false`) is treated identically to never having been configured at all
 * (AC-36) — a broken tool is not a capability.
 *
 * @complexity O(1), pure.
 * @overallScore 100
 */
export function evaluatePostgresRestoreCapability(config: PostgresRestoreToolingConfig): RestoreCapability {
  const dumpToolingReady =
    config.pgDumpBinaryPath != null && config.credentialsPresent && config.targetParametersValid;

  if (dumpToolingReady) {
    return { costClass: "expensive", kind: "logical-dump" };
  }
  if (config.externalPitrConfigured) {
    return { costClass: "unavailable", kind: "external" };
  }
  return { costClass: "unavailable", kind: "logical-dump" };
}
```
  (The signature stays `(config)`: a verbatim move changes no shape; it is already a single object argument. Converting it to `(required, optional = {})` is out of scope for a fold.)
census:                                    # python3 scripts/census.py {TOVU_CLONE} apps/website/src/platform/db/postgres/db-ops.ts -> 2 hits
  - apps/website/src/platform/db/postgres/db-ops-adapter.ts:2 | static | "./db-ops.js"
  - apps/website/src/contracts/core/gated-mutations/__tests__/integration/db-ops.integration.test.ts:11 | static | "#src/platform/db/postgres/db-ops"
reach_check:
  - rg -n --no-heading -e "postgres/db-ops(\.js|\.ts|\")" -e "\./db-ops\.js" apps/website/src/platform/db/postgres apps/website/src/contracts .dependency-cruiser.mjs   -> before: the 2 census lines, db-ops.integration.test.ts:63 (comment), .dependency-cruiser.mjs:113 (comment). After: nothing except the new comment texts below (which say db-ops-adapter.ts).
importers:
  - apps/website/src/contracts/core/gated-mutations/__tests__/integration/db-ops.integration.test.ts:11 | "import { evaluatePostgresRestoreCapability } from \"#src/platform/db/postgres/db-ops\";" -> "import { evaluatePostgresRestoreCapability } from \"#src/platform/db/postgres/db-ops-adapter\";"
folds: -
comment_refs:
  - apps/website/src/contracts/core/gated-mutations/__tests__/integration/db-ops.integration.test.ts:63 | " * // src/platform/db/postgres/db-ops.ts (pure evaluation logic only — no live pg client here yet)" -> " * // src/platform/db/postgres/db-ops-adapter.ts (pure evaluation logic only — no live pg client here yet)"
  - .dependency-cruiser.mjs:113 | blob fbc250fbc803e453692a4e60108594dc10201c49 | "      // (`db/sqlite/*`, `db/postgres/db-ops.ts`, or — post Job 2 — the post reverters via" -> "      // (`db/sqlite/*`, `db/postgres/db-ops-adapter.ts`, or — post Job 2 — the post reverters via"   (then `node --check .dependency-cruiser.mjs`)
path_literals: -
tests:
  - apps/website/src/contracts/core/gated-mutations/__tests__/integration/db-ops.integration.test.ts | blob e6606656268b394783394d1ba7a0cc031d42f620 | repoint import (line 11) + comment line 63; assertions untouched
relocations: -
why_moves:
  - "SPEC-016 C-007 / REQ-19–REQ-21 — Postgres restore-capability evaluation" -> db-ops-adapter.ts, above `export interface PostgresRestoreToolingConfig` (part of MOVED TEXT)
baselines: - (no *.json/*.yml hit)
jini_commit: -
untangle_followup: -
tovu_msg: "refactor(db): fold the Postgres restore-capability evaluation into its adapter"
Commit paths (4): deleted db-ops.ts, db-ops-adapter.ts, db-ops.integration.test.ts, .dependency-cruiser.mjs
Cloud run owes: Tovu typecheck; db-ops.integration.test.ts; store-bound-services.integration.test.ts; dependency-cruiser run. No RED test, no behaviour change.
est_executor_tokens: ~25k Sonnet
