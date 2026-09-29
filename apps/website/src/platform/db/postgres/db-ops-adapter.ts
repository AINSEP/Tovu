import type { DbOpsPort, RestoreCapability } from "#src/contracts/core/gated-mutations/ports";
import { evaluatePostgresRestoreCapability } from "./db-ops.js";

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

/** A restore point was asked of a store that cannot take or restore one. */
export class RestorePointsUnavailableError extends Error {
  constructor(action: "capture" | "restore") {
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
    throw new RestorePointsUnavailableError("capture");
  }

  async restoreFromArtifact(): Promise<{ restartRequired: boolean }> {
    throw new RestorePointsUnavailableError("restore");
  }
}
