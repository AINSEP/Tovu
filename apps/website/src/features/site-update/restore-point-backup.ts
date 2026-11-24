/**
 * @file Backup, data restore and migration readiness for a site update, all over the site's own restore-point
 * mechanism (`DbOpsPort`, the same one the site-backup feature captures its database snapshot through). The
 * restore point is the backup id, so a rollback can put the data back exactly as the update found it.
 */
import type { DbOpsPort } from "@jini-ai/core/contracts/site/gated-mutations-ports";
import type { MigrationReadinessPort, SiteBackupPort, SiteDataRestorePort } from "@jini-ai/devops/deploy";

/** The restore-point scope an update captures under, so an orphaned point is recognisable as an update's. */
const UPDATE_SCOPE_ID = "site-update";

export interface RestorePointBackupRequired {
  dbOps: Pick<DbOpsPort, "getCapabilities" | "captureRestorePoint" | "restoreFromArtifact">;
}

/**
 * @returns The three ports an update needs from the database. `readiness` blocks when this database cannot take
 *   a cheap file snapshot, because then there would be no backup to roll the data back to.
 * @complexity O(1) calls; the capture itself is O(database size).
 */
export function createRestorePointBackup({ dbOps }: RestorePointBackupRequired, _optional = {}): { backup: SiteBackupPort; readiness: MigrationReadinessPort; data: SiteDataRestorePort } {
  return {
    backup: { createBackup: async () => ({ backupId: (await dbOps.captureRestorePoint({ scopeId: UPDATE_SCOPE_ID })).artifactRef }) },
    readiness: {
      check: async () => {
        const { restorePoint } = await dbOps.getCapabilities();
        if (restorePoint.costClass === "cheap" && restorePoint.kind === "file-snapshot") return { status: "ok" };
        return { status: "blocked", reason: "This site's database cannot be backed up automatically, so it cannot be updated from here. Nothing was changed." };
      },
    },
    data: { restore: async ({ backupId }) => { await dbOps.restoreFromArtifact({ artifactRef: backupId }); } },
  };
}
