/**
 * @file Backup, data restore and migration readiness for a site update, all over the site's own restore-point
 * mechanism (`DbOpsPort`, the same one the site-backup feature captures its database snapshot through). The
 * restore point is kept host-private under an opaque backup id, so a rollback can put the data back exactly as
 * the update found it while the runner and the operator only ever see the id.
 */
import type { DbOpsPort } from "@jini-ai/core/contracts/site/gated-mutations-ports";
import type { IdGenerator } from "@jini-ai/core/primitives";
import type { MigrationReadiness, MigrationReadinessPort, SiteBackupPort, SiteDataRestorePort, SiteUpdateCallOptions } from "@jini-ai/devops/deploy";

/** The restore-point scope an update captures under, so an orphaned point is recognisable as an update's. */
const UPDATE_SCOPE_ID = "site-update";

export interface RestorePointBackupRequired {
  dbOps: Pick<DbOpsPort, "getCapabilities" | "captureRestorePoint" | "restoreFromArtifact">;
  /** Keeps `artifactRef` host-private and returns the opaque id the update runner carries instead. */
  registerBackup(required: { artifactRef: string; fromVersion: string }, optional?: SiteUpdateCallOptions): Promise<{ backupId: string }>;
  /** The restore point behind `backupId`, or null when this host holds no such backup. */
  resolveBackup(required: { backupId: string }, optional?: SiteUpdateCallOptions): Promise<{ artifactRef: string } | null>;
  /** Rehearses the staged candidate on a copy of the restore point (see `candidate-readiness.ts`). */
  checkCandidate(required: { artifactRef: string; fromVersion: string; toVersion: string }, optional?: SiteUpdateCallOptions): Promise<MigrationReadiness>;
}

const blocked = (reason: string): MigrationReadiness => ({ status: "blocked", reason });
const NO_SNAPSHOT = "This site's database cannot be backed up automatically, so it cannot be updated from here. Nothing was changed.";
const NO_BACKUP = "The backup this update needs could not be found, so the new version was not tried or installed. Nothing was changed.";

/**
 * @returns The three ports an update needs from the database. `readiness` blocks when this database cannot take
 *   a cheap file snapshot, because then there would be no backup to roll the data back to; it also blocks without
 *   the update's own backup, or unless the candidate rehearsal on that backup passes.
 * @complexity O(1) calls; the capture itself is O(database size).
 */
export function createRestorePointBackup(required: RestorePointBackupRequired, _optional = {}): { backup: SiteBackupPort; readiness: MigrationReadinessPort; data: SiteDataRestorePort } {
  const { dbOps, registerBackup, resolveBackup, checkCandidate } = required;
  return {
    backup: {
      createBackup: async ({ fromVersion }, optional) => {
        const { artifactRef } = await dbOps.captureRestorePoint({ scopeId: UPDATE_SCOPE_ID });
        return registerBackup({ artifactRef, fromVersion }, optional);
      },
    },
    readiness: {
      check: async ({ toVersion }, optional) => {
        const { restorePoint } = await dbOps.getCapabilities();
        if (restorePoint.costClass !== "cheap" || restorePoint.kind !== "file-snapshot") return blocked(NO_SNAPSHOT);
        // Snapshot capability answers whether a backup can be made, not whether the next release can boot.
        const { backupId, fromVersion, signal } = optional ?? {};
        const backup = backupId && fromVersion ? await resolveBackup({ backupId }, { signal }) : null;
        if (!backup || !fromVersion) return blocked(NO_BACKUP);
        return checkCandidate({ artifactRef: backup.artifactRef, fromVersion, toVersion }, { signal });
      },
    },
    data: {
      restore: async ({ backupId }) => {
        const backup = await resolveBackup({ backupId });
        if (!backup) throw new Error("The backup this update took cannot be found, so the data was not put back.");
        await dbOps.restoreFromArtifact({ artifactRef: backup.artifactRef });
      },
    },
  };
}

/**
 * @returns A process-local backup registry whose ids are fresh opaque tokens, never the restore point's path.
 *   It does not survive a restart: the update supervisor owns the durable hand-off a relaunch reads.
 * @complexity O(1) per call.
 */
export function createUpdateBackupRegistry({ ids }: { ids: Pick<IdGenerator, "newId"> }, _optional = {}): Pick<RestorePointBackupRequired, "registerBackup" | "resolveBackup"> {
  const kept = new Map<string, string>();
  return {
    registerBackup: async ({ artifactRef }) => {
      const backupId = `update-backup-${ids.newId()}`;
      kept.set(backupId, artifactRef);
      return { backupId };
    },
    resolveBackup: async ({ backupId }) => {
      const artifactRef = kept.get(backupId);
      return artifactRef === undefined ? null : { artifactRef };
    },
  };
}
