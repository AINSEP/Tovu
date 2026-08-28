import type { RestoreCapability } from "../../../contracts/core/gated-mutations/ports.js";

/**
 * @file SPEC-016 C-007 / REQ-19–REQ-21 — Postgres restore-capability evaluation (pure logic only).
 *
 * Purpose:
 * Evaluates what restore mechanism a Postgres-backed site actually has available, from static
 * tooling/config facts. This is deliberately evaluation-only — no live `pg` client, no actual
 * `pg_dump`/blue-green execution — per `implementation-outline.md`'s "Postgres adapter deferred"
 * note (see this package's `test-certification.md` Known Gaps). A future `PostgresDbOpsAdapter`
 * implementing `DbOpsPort` would call this function from its own `getCapabilities()`.
 *
 * Architectural role:
 * Infrastructure (evaluation logic). No I/O — every input is a caller-supplied static fact.
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
