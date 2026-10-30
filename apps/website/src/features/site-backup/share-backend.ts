import { randomUUID } from "node:crypto";
import type { zipFolderFiles } from "@jini-ai/agent-plugins/folder-zip";
import type { prepareShareContent } from "./share-preparation.js";
import type { SiteBackupPushProgress } from "./push-engine.js";
import { SiteBackupPushJobs, type PushJobKey, type PushJobWait } from "./push-jobs.js";
import { buildShareZip, buildStaticSiteZip } from "./share-zip.js";
import { captureStaticSite, type StaticSitePorts } from "./static-copy.js";
import { createSiteShare, isOwnShareFolder, revokeSiteShare, type ShareDelivery } from "./share-service.js";
import { SiteShareRegistry, type SiteShareRecord } from "./share-registry.js";
import { SiteShareRefusal } from "./share-policy.js";

export interface SiteShareBackend {
  readonly registry: SiteShareRegistry;
  create(required: { principalId: string; jobId?: string; signal: AbortSignal; format?: "static" }, optional?: { waitMs?: number }): Promise<unknown>;
  list(required: Record<string, never>, optional?: Record<string, never>): Promise<readonly SiteShareView[]>;
  revoke(required: { shareId: string }, optional?: Record<string, never>): Promise<SiteShareView>;
}
export type SiteShareView = Omit<SiteShareRecord, "token" | "storage"> & { downloadUrl: string };
/** A finished export, with what was left out of it (the share's scope notes) for the exporter only. */
type ExportedShare = SiteShareRecord & { readonly notes?: readonly string[] };

/** Locators/tokens stay in the private registry. The authorized caller receives the verified URL. */
function view(row: SiteShareRecord): SiteShareView {
  const { token: _token, storage: _storage, ...publicFields } = row;
  return { ...publicFields, downloadUrl: `/api/admin/v1/workspaces/${encodeURIComponent(row.site)}/site-shares/${row.shareId}/download` };
}

/** What a create caller sees for one wait: the finished share, a cancellation, or in-flight progress. */
function createOutcome(required: { waited: PushJobWait<ExportedShare>; jobId: string; format?: "static" }, _options = {}): unknown {
  const { waited } = required;
  if (waited.state === "done") return { ...view(waited.result), ...(waited.result.url || required.format === "static" ? {} : { message: "ZIP ready. Download zip only. Connect a deployed Tovu site or S3-compatible storage to get a link." }) };
  if (waited.state === "abandoned") throw new SiteShareRefusal({ code: "CANCELLED", message: "Share export was cancelled." });
  return { jobId: required.jobId, phase: waited.progress.filesTotal ? "archive-or-upload" : "preparing", progress: waited.progress };
}

/** Reuses backup jobs and the common backup plan content. Only one bounded, buffered preparation runs per site at a time. */
export function createSiteShareBackend(required: {
  registry: SiteShareRegistry;
  site: string;
  prepare: (required: { signal: AbortSignal }) => ReturnType<typeof prepareShareContent>;
  zip: typeof zipFolderFiles;
  delivery: (required: { provider?: string; binding?: string }) => Promise<ShareDelivery | undefined>;
  staticSite?: StaticSitePorts;
}, _optional: Record<string, never> = {}): SiteShareBackend {
  const jobs = new SiteBackupPushJobs<ExportedShare>();
  let active: string | null = null;
  /** Prepares, archives and delivers one share under a ten-minute bound; always frees the site's lane. */
  const exportShare = async ({ signal, progress, format }: { signal: AbortSignal; progress: SiteBackupPushProgress; format?: "static" }, _options = {}): Promise<ExportedShare> => {
    try {
      const bounded = AbortSignal.any([signal, AbortSignal.timeout(10 * 60 * 1000)]);
      if (format === "static") {
        if (!required.staticSite) throw new SiteShareRefusal({ code: "UNAVAILABLE", message: "Static exporter is unavailable in this context." });
        const copy = await captureStaticSite(required.staticSite);
        if ("reason" in copy) throw new SiteShareRefusal({ code: "UNAVAILABLE", message: copy.reason });
        const archive = await buildStaticSiteZip({ copy, zip: required.zip }, { signal: bounded, progress });
        return await createSiteShare({ registry: required.registry, site: required.site, name: copy.filename, archive }, { signal: bounded, filename: copy.filename });
      }
      const content = await required.prepare({ signal: bounded });
      // Progress's readonly totals describe the prepared backup; the ZIP collector records its exact files.
      Object.assign(progress, { filesTotal: content.files.length + (content.bufferedFiles?.length ?? 0) + 1, bytesTotal: content.totalBytes });
      const archive = await buildShareZip({ plan: content, zip: required.zip }, { signal: bounded, progress });
      const delivery = await required.delivery({});
      bounded.throwIfAborted();
      const record = await createSiteShare({ registry: required.registry, site: required.site, name: content.site.folderName, archive }, { delivery, signal: bounded });
      // Plugins left out of the archive are told to the exporter, never dropped silently.
      const notes = Object.values(content.scopeNotes);
      return notes.length > 0 ? { ...record, notes } : record;
    } finally { active = null; }
  };
  /** Starts a new export job, refusing a resume of an unknown job and a second export on this site. */
  const startExport = (startRequired: { key: PushJobKey; resumedJobId: string | undefined; format?: "static" }, _options = {}) => {
    const { key } = startRequired;
    if (startRequired.resumedJobId) throw new SiteShareRefusal({ code: "JOB_NOT_FOUND", message: "Share job expired or belongs to another principal. Create a new export." });
    if (active) throw new SiteShareRefusal({ code: "BUSY", message: "Another share export is running for this site. Wait for it to finish." });
    active = key.planId;
    return jobs.start(key, { filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0 }, (signal, progress) => exportShare({ signal, progress, format: startRequired.format }));
  };
  return {
    registry: required.registry,
    async create(input, options = {}) {
      input.signal.throwIfAborted();
      const jobId = input.jobId ?? randomUUID();
      const key = { planId: jobId, principalId: input.principalId, workspaceId: required.site + (input.format === "static" ? "/static" : "") };
      const job = jobs.find(key) ?? startExport({ key, resumedJobId: input.jobId, format: input.format });
      const waited = await jobs.wait(job, { signal: input.signal, budgetMs: options.waitMs ?? 1500 });
      return createOutcome({ waited, jobId, format: input.format });
    },
    list: async () => (await required.registry.list({ site: required.site })).map(view),
    async revoke(input) {
      const row = await required.registry.get({ site: required.site, shareId: input.shareId });
      if (!row) throw new SiteShareRefusal({ code: "NOT_FOUND", message: "Share not found for this site." });
      let delivery: ShareDelivery | undefined;
      // Resolution failure must not prevent revoke's own disable-first/delete-local sequence.
      if (row.storage && !isOwnShareFolder({ storage: row.storage })) {
        try { delivery = await required.delivery({ provider: row.storage.provider, binding: row.storage.binding }); }
        catch { /* revokeSiteShare disables locally before reporting the missing remote store. */ }
      }
      return view(await revokeSiteShare({ registry: required.registry, site: required.site, shareId: input.shareId }, { delivery }));
    },
  };
}
