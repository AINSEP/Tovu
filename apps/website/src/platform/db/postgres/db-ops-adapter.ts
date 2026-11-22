import type { DbOpsPort, RestoreCapability } from "#src/contracts/core/gated-mutations/ports";

/**
 * @file `DbOpsPort` for a site stored on Postgres/PGlite (R1 plan R1f, `pgOnlyServices`): restore
 * points are NOT available yet. It reports that through the capability (`costClass: "unavailable"`,
 * from {@link evaluatePostgresRestoreCapability} with no dump tooling configured) and refuses a
 * capture or restore with {@link RestorePointsUnavailableError}, so a gated mutation that needs a
 * restore point stops before it changes anything instead of pretending to have one.
 *
 * Deliberately NOT a whole-data-dir copy for PGlite: `kernel.backupTo` exists, but restoring it
 * means stopping the owner process and every socket client — the R1g StorageOps work.
 */

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

/** A restore point was asked of a store that cannot take or restore one. */
export class RestorePointsUnavailableError extends Error {
  constructor({ action }: { action: "capture" | "restore" }) {
    super(`restore points are not available on this site's storage (Postgres/PGlite); cannot ${action} one`);
    this.name = "RestorePointsUnavailableError";
  }
}

export class PostgresDbOpsAdapter implements DbOpsPort {
  async getCapabilities(): Promise<{ restorePoint: RestoreCapability }> {
    return {
      restorePoint: evaluatePostgresRestoreCapability({
        pgDumpBinaryPath: null,
        credentialsPresent: true,
        targetParametersValid: false,
        externalPitrConfigured: false,
      }),
    };
  }

  async captureRestorePoint(): Promise<{ artifactRef: string; watermarkAtCapture: number }> {
    throw new RestorePointsUnavailableError({ action: "capture" });
  }

  async restoreFromArtifact(): Promise<{ restartRequired: boolean }> {
    throw new RestorePointsUnavailableError({ action: "restore" });
  }
}
