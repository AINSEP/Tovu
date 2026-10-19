import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import type { HttpClientPort } from "#src/platform/http/index";
import { createSite, reconcileSiteCreation, type CreateSiteResult } from "#src/platform/site-dir/site-registry";
import { resolveNewSiteAdminPassword } from "#src/platform/site-dir/new-site-owner";
import type { SitesWorkspace } from "#src/platform/site-dir/sites-home";
import { SiteImportRegistry, type SiteImportRecord } from "./import-registry.js";
import { SHARE_LIMITS, SiteShareRefusal, type ShareDatabaseSanitizer } from "./share-policy.js";
import { verifySiteImport } from "./import-verifier.js";
import { restoreStagedImport, stageVerifiedImport } from "./import-restore.js";

export type SiteImportSource = { url: string } | { uploadId: string };
export interface SiteImportView {
  importId: string; source: SiteImportSource; newSiteId: string | null; newSiteName: string | null;
  state: SiteImportRecord["status"]; status: SiteImportRecord["status"]; createdAt: string;
  setupUrl?: string; adminUrl?: string | null; error?: string; instructions: string;
}
export interface SiteImportBackend {
  upload(required: { principalId: string; archive: Buffer }, optional?: Record<string, never>): Promise<{ uploadId: string }>;
  importBackup(required: { principalId: string; source: SiteImportSource; displayName?: string; requestId?: string }, optional?: { signal?: AbortSignal }): Promise<SiteImportView>;
  completeOwner(required: { principalId: string; importId: string; adminPassword: unknown }, optional?: { signal?: AbortSignal }): Promise<SiteImportView>;
  list(required: { principalId: string }, optional?: Record<string, never>): Promise<SiteImportView[]>;
  get(required: { principalId: string; importId: string }, optional?: Record<string, never>): SiteImportView;
}

function refusal(code: string, message: string): never { throw new SiteShareRefusal({ code, message }); }

/** Source union is enforced at every remote boundary; server paths are never accepted. */
export function parseSiteImportInput(required: { input: unknown }, _options: Record<string, never> = {}): { source: SiteImportSource; displayName?: string; requestId?: string } {
  const input = required.input as Record<string, unknown>;
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !["url", "uploadId", "displayName", "requestId"].includes(key)) ||
      (input.url !== undefined) === (input.uploadId !== undefined)) refusal("INVALID_INPUT", "Provide exactly one source: url or uploadId; optional displayName and requestId only.");
  if (input.displayName !== undefined && (typeof input.displayName !== "string" || !input.displayName.trim() || input.displayName.length > 200)) refusal("INVALID_INPUT", "displayName must be 1..200 characters.");
  if (input.requestId !== undefined && (typeof input.requestId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.requestId))) refusal("INVALID_INPUT", "requestId must be 1..128 letters, digits, dashes or underscores.");
  let source: SiteImportSource;
  if (input.url !== undefined) {
    if (typeof input.url !== "string" || input.url.length > 4096) refusal("INVALID_INPUT", "url must be an HTTPS share URL.");
    let url: URL;
    try { url = new URL(input.url); } catch { refusal("INVALID_INPUT", "url must be an HTTPS share URL."); }
    if (url.protocol !== "https:" || url.username || url.password || url.hash) refusal("INVALID_INPUT", "Import URLs require HTTPS without credentials or fragments.");
    source = { url: url.href };
  } else {
    if (typeof input.uploadId !== "string" || !/^[a-f0-9-]{36}$/.test(input.uploadId)) refusal("INVALID_INPUT", "uploadId must come from the authenticated ZIP upload endpoint.");
    source = { uploadId: input.uploadId };
  }
  return { source, ...(input.displayName !== undefined ? { displayName: input.displayName as string } : {}), ...(input.requestId !== undefined ? { requestId: input.requestId as string } : {}) };
}

/** Shared HTTP/tool application service. All effects enter as ports; CMS policy stays here.
 * Pending owner setup stores sanitized bytes privately without creating any site directory.
 * @complexity O(archive bytes + registry history), with one buffered job and four staged payloads.
 */
export function createSiteImportBackend(required: {
  registry: SiteImportRegistry; workspace: SitesWorkspace; reader: AgentPluginArchiveReaderPort; http: HttpClientPort;
  sanitize: ShareDatabaseSanitizer; schema: { index: number; tag: string };
  startSite: (required: { name: string }) => Promise<{ adminUrl: string | null; status: string }>;
  setupBase?: string;
  creationOptions?: Parameters<typeof createSite>[1];
}, optional: {
  createSite?: typeof createSite;
  report?: (required: { importId: string; status: string }) => void;
} = {}): SiteImportBackend {
  const { registry, workspace } = required;
  const view = (row: SiteImportRecord): SiteImportView => ({
    importId: row.importId, source: row.source,
    newSiteId: row.newSiteId, newSiteName: row.newSiteName, state: row.status, status: row.status, createdAt: row.createdAt,
    ...(row.status === "needs-owner" ? { setupUrl: (required.setupBase ?? "/api/admin/v1/site-imports") + "/" + row.importId + "/owner" } : {}),
    adminUrl: row.adminUrl, error: row.error,
    instructions: row.status === "needs-owner" ? "Open setupUrl while signed in as the importing principal and choose a new owner password privately. The site is unavailable until setup completes." : "Open adminUrl when available. Imported extensions remain quarantined and need explicit review before activation.",
  });
  const put = (row: SiteImportRecord) => { registry.put({ row }); optional.report?.({ importId: row.importId, status: row.status }); };
  const budget = () => {
    registry.expire({});
    const payloads = fs.readdirSync(registry.directory).filter(name => name.endsWith(".upload.zip") || name.endsWith(".stage"));
    if (payloads.length >= 4) refusal("BUSY", "Four imports are staged. Complete owner setup or wait for expiry before uploading another.");
    const space = fs.statfsSync(registry.directory);
    if (space.bavail * space.bsize < SHARE_LIMITS.maxExpandedBytes * 3) refusal("INSUFFICIENT_STORAGE", "Import requires 900 MiB of free private staging space.");
  };
  let active = false;
  const exclusive = async <T>(run: () => Promise<T>): Promise<T> => {
    if (active) refusal("BUSY", "Another import is running. Retry after it finishes.");
    active = true;
    try { return await registry.exclusive({ run: async () => {
      // Only the lock holder may classify a creating row as interrupted, never a concurrent reader.
      for (const row of registry.list({})) {
        if (row.status !== "creating") continue;
        const status = row.creation ? await reconcileSiteCreation({ allocation: row.creation, workspace }) : "failed";
        put({ ...row, status, ...(status === "failed" ? { newSiteId: null, newSiteName: null, error: "Site creation was interrupted and rolled back. Import the archive again." } : {}) });
        fs.rmSync(registry.stagePath(row), { recursive: true, force: true });
      }
      return run();
    } }); } finally { active = false; }
  };
  const backend: SiteImportBackend = {
    async upload(input) {
      return exclusive(async () => {
        budget();
        if (!Buffer.isBuffer(input.archive) || input.archive.length > SHARE_LIMITS.maxArchiveBytes) refusal("LIMIT_EXCEEDED", "Upload exceeds the v1 300 MiB ZIP cap.");
        const uploadId = randomUUID();
        try {
          fs.writeFileSync(registry.uploadPath({ uploadId }), input.archive, { flag: "wx", mode: 0o600 });
          registry.saveUpload({ row: { uploadId, principalId: input.principalId, createdAt: Date.now() } });
          return { uploadId };
        } catch (error) { fs.rmSync(registry.uploadPath({ uploadId }), { force: true }); throw error; }
      });
    },
    async importBackup(input, options = {}) {
      const parsed = parseSiteImportInput({ input: { ...input.source, displayName: input.displayName, requestId: input.requestId } });
      return exclusive(async () => {
        registry.expire({});
        const existing = parsed.requestId ? registry.list(input).find(row => row.requestId === parsed.requestId) : undefined;
        if (existing) {
          if (JSON.stringify(existing.source) !== JSON.stringify(parsed.source)) refusal("REQUEST_CONFLICT", "requestId already belongs to another source.");
          return view(existing);
        }
        if ("url" in parsed.source) budget();
        const importId = randomUUID();
        let row: SiteImportRecord = { importId, principalId: input.principalId, requestId: parsed.requestId, source: parsed.source, displayName: parsed.displayName ?? "Imported site", newSiteId: null, newSiteName: null, status: "verifying", createdAt: new Date().toISOString(), expiresAt: Date.now() + 3600_000 };
        put(row);
        const signal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(5 * 60_000)]);
        let consumedUpload: string | undefined;
        try {
          signal.throwIfAborted();
          let archive: Buffer;
          if ("uploadId" in parsed.source) {
            const upload = registry.getUpload({ uploadId: parsed.source.uploadId, principalId: input.principalId });
            if (upload.consumedBy) refusal("UPLOAD_USED", "This upload was already imported. Use the original requestId or upload again for a separate site.");
            registry.saveUpload({ row: { ...upload, consumedBy: importId } });
            consumedUpload = upload.uploadId;
            archive = fs.readFileSync(registry.uploadPath(upload));
          } else {
            const response = await required.http.send({ method: "GET", url: parsed.source.url, headers: { Accept: "application/zip", "Accept-Encoding": "identity" }, idleTimeoutMs: 30_000, totalDeadlineMs: 120_000, maxResponseBytes: SHARE_LIMITS.maxArchiveBytes, signal });
            if (response.status !== 200 || !response.bodyBytes || response.bodyBytesTruncated !== false) refusal("DOWNLOAD_FAILED", "Share download failed or exceeded the v1 300 MiB archive cap.");
            const contentType = Object.entries(response.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1]?.split(";", 1)[0]?.trim().toLowerCase();
            if (!contentType || !["application/zip", "application/x-zip-compressed", "application/octet-stream"].includes(contentType)) refusal("INVALID_CONTENT_TYPE", "Share download must have a ZIP or binary Content-Type.");
            archive = Buffer.from(response.bodyBytes);
          }
          const verified = await verifySiteImport({ archive, reader: required.reader, sanitize: required.sanitize, schema: required.schema }, { signal });
          signal.throwIfAborted();
          stageVerifiedImport({ root: registry.stagePath(row), verified });
          row = { ...row, displayName: parsed.displayName ?? verified.name, status: "needs-owner" };
          put(row);
          return view(row);
        } catch (error) {
          fs.rmSync(registry.stagePath(row), { recursive: true, force: true });
          put({ ...row, status: "failed", error: error instanceof SiteShareRefusal ? error.message : "Archive verification failed. No site was created." });
          throw error;
        } finally { if (consumedUpload) fs.rmSync(registry.uploadPath({ uploadId: consumedUpload }), { force: true }); }
      });
    },
    async completeOwner(input, options = {}) {
      const signal = AbortSignal.any([...(options.signal ? [options.signal] : []), AbortSignal.timeout(120_000)]);
      return exclusive(async () => {
        registry.expire({});
        let row = registry.get(input);
        if (row.status === "ready") return view(row);
        if (row.status !== "needs-owner") refusal("INVALID_STATE", "This import is not awaiting owner setup. Import the archive again if it failed or expired.");
        if (input.adminPassword === undefined || input.adminPassword === "tovu-dev") refusal("INVALID_PASSWORD", "Choose a new owner password; the development default cannot be used for an import.");
        const adminPassword = resolveNewSiteAdminPassword({ adminPassword: input.adminPassword });
        const home = workspace.home({});
        const space = fs.statfsSync(fs.existsSync(home) ? home : path.dirname(home));
        if (space.bavail * space.bsize < SHARE_LIMITS.maxExpandedBytes * 3) refusal("INSUFFICIENT_STORAGE", "Import requires 900 MiB of free space on the sites-home volume.");
        signal.throwIfAborted();
        row = { ...row, status: "creating" }; put(row);
        let created: CreateSiteResult;
        try {
          const slug = row.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "imported-site";
          created = await (optional.createSite ?? createSite)({ name: slug, displayName: row.displayName, adminPassword }, { ...required.creationOptions, workspace, collisionSafe: true,
            onAllocated: allocation => {
              signal.throwIfAborted();
              // Persist idempotency before shared registration. A registry failure is still inside
              // createSite's compensation boundary, so a new site's identity never gets lost.
              row = { ...row, creation: allocation, newSiteId: allocation.siteId, newSiteName: allocation.name };
              put(row);
            },
            beforeRegister: () => { signal.throwIfAborted(); },
            verifiedRestore: { signal, restore: async ({ dir, dbPath }) => {
              signal.throwIfAborted();
              await restoreStagedImport({ root: registry.stagePath(row), dir, dbPath });
            } },
          });
        } catch (error) {
          fs.rmSync(registry.stagePath(row), { recursive: true, force: true });
          put({ ...row, newSiteId: null, newSiteName: null, status: "failed", error: "Site creation failed and was rolled back. Import the archive again." });
          throw error;
        }
        // Owner and restore are committed. A supervisor failure must not repeat site creation.
        row = { ...row, newSiteId: created.siteId, newSiteName: created.name, status: "ready" };
        put(row);
        fs.rmSync(registry.stagePath(row), { recursive: true, force: true });
        try {
          const started = await required.startSite({ name: created.name });
          row = { ...row, adminUrl: started.adminUrl, ...(started.adminUrl ? {} : { error: "Site created; start it from Sites to open admin." }) };
        } catch { row = { ...row, error: "Site created with its owner. Start it from Sites to open admin." }; }
        put(row);
        return view(row);
      });
    },
    async list(input) { return exclusive(async () => { registry.expire({}); return registry.list(input).map(view); }); },
    get(input) { return view(registry.get(input)); },
  };
  return backend;
}
