import { uploadPlannedContent, type PendingFile, type PushFailure, type UploadPlannedContentInput } from "@jini-ai/devops/backup/upload";
import type { SiteBackupPushProgress } from "@jini-ai/devops/backup/push-jobs";
import type { SiteBackupPlan } from "./plan-content.js";
import { buildSiteBackupManifest, readPlannedFile, SITE_BACKUP_DATABASE_PATH, SITE_BACKUP_MANIFEST_PATH } from "./sources.js";

export const CANCELLED: PushFailure = { ok: false, code: "CANCELLED", message: "the push was stopped before anything was committed" };

/** The progress a plan starts from. @complexity O(1). */
export function initialPushProgress({ plan }: { plan: SiteBackupPlan }, _optional: Record<string, never> = {}): SiteBackupPushProgress {
  return { filesDone: 0, filesTotal: plan.files.length + (plan.database ? 1 : 0), bytesDone: 0, bytesTotal: plan.totalBytes };
}

/** The plan's files in order: the database snapshot first, then each disk file, re-read at upload. */
function pendingFiles({ plan }: { plan: SiteBackupPlan }, _optional: Record<string, never> = {}): PendingFile[] {
  const database = plan.database;
  const fromDisk = plan.files.map((file): PendingFile => ({
    path: file.path,
    load: async (_required = {}, _optional = {}) => {
      const read = await readPlannedFile(file);
      return read.ok ? { ok: true, bytes: read.bytes } : { ok: false, code: "PLAN_STALE", message: read.message };
    },
  }));
  if (!database) return fromDisk;
  return [{ path: SITE_BACKUP_DATABASE_PATH, load: async (_required = {}, _optional = {}) => ({ ok: true, bytes: database.bytes }) }, ...fromDisk];
}

/** Upload the database and deferred disk files, then the repository-format manifest.
 * @complexity O(total bytes); bounded uploads are owned by the shared engine. */
export function uploadBackupPlan(
  { plan, uploadBlob, signal, progress }: { plan: SiteBackupPlan; uploadBlob: UploadPlannedContentInput["uploadBlob"]; signal: AbortSignal; progress: SiteBackupPushProgress },
  { inlineTextMaxBytes, concurrency }: { inlineTextMaxBytes?: number; concurrency?: number } = {},
) {
  return uploadPlannedContent({
    files: pendingFiles({ plan }), signal, progress, cancelled: CANCELLED, uploadBlob,
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
  }, { inlineTextMaxBytes, concurrency });
}
