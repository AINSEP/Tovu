import type { PushFailure } from "@jini-ai/devops/backup/upload";
import type { uploadBackupPlan } from "@jini-ai/devops/backup/site/push-content";
import type { SiteBackupPlan } from "./plan-content.js";
import { buildSiteBackupManifest, readPlannedFile, SITE_BACKUP_MANIFEST_PATH } from "./sources.js";
import { SITE_BACKUP_DATABASE_PATH } from "@jini-ai/devops/backup/site/sources";

export const CANCELLED: PushFailure = { ok: false, code: "CANCELLED", message: "the push was stopped before anything was committed" };

export function backupPushUploadPolicy({ plan }: { plan: SiteBackupPlan }, _optional: Record<string, never> = {}): Pick<Parameters<typeof uploadBackupPlan>[0], "databasePath" | "readPlannedFile" | "buildManifest" | "cancelled"> {
  return {
    databasePath: SITE_BACKUP_DATABASE_PATH,
    readPlannedFile: ({ file }) => readPlannedFile(file),
    cancelled: CANCELLED,
    buildManifest: ({ entries }, _optional = {}) => {
      const manifest = buildSiteBackupManifest({
        createdAt: plan.createdAt,
        tovuVersion: plan.tovuVersion,
        schema: plan.schema,
        site: plan.site,
        database: plan.database ? { watermarkAtCapture: plan.database.watermarkAtCapture } : null,
        include: plan.include,
        scopeNotes: plan.scopeNotes,
        files: entries,
      });
      return { path: SITE_BACKUP_MANIFEST_PATH, content: Buffer.from(manifest, "utf8") };
    },
  };
}
