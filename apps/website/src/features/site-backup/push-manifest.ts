import type { PushFailure } from "@jini-ai/devops/backup/upload";
import type { uploadBackupPlan } from "@jini-ai/devops/backup/site/push-content";
import { SITE_BACKUP_DATABASE_PATH } from "@jini-ai/devops/backup/site/sources";
import type { SiteBackupPlan } from "./plan-content.js";
import { buildSiteBackupManifest, readPlannedFile, SITE_BACKUP_MANIFEST_PATH } from "./sources.js";

/** @file This host's half of a repository push: the exact database and manifest paths, the plan's re-read, the manifest body
 * (Tovu build version, schema, watermark and scope notes) and the cancellation copy. Jini's `push-content` owns the upload
 * order (database first, deferred disk files, manifest last) and the commit. */

export const CANCELLED: PushFailure = { ok: false, code: "CANCELLED", message: "the push was stopped before anything was committed" };

type UploadPolicy = Pick<Parameters<typeof uploadBackupPlan>[0], "databasePath" | "readPlannedFile" | "buildManifest" | "cancelled">;

/** The host values `uploadBackupPlan` needs for one plan. @complexity O(1) to bind; the manifest costs O(files) when built. */
export function backupPushUploadPolicy({ plan }: { plan: SiteBackupPlan }, _optional: Record<string, never> = {}): UploadPolicy {
  return {
    databasePath: SITE_BACKUP_DATABASE_PATH,
    readPlannedFile: ({ file }, _options = {}) => readPlannedFile(file),
    cancelled: CANCELLED,
    buildManifest: ({ entries }, _options = {}) => {
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
