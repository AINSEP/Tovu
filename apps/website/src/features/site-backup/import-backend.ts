import type { Tracker } from "@jini-ai/diagnostics/observability";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import type { HttpClientPort } from "#src/platform/http/index";
import { createSite, type CreateSiteResult } from "#src/platform/site-dir/site-registry";
import { resolveNewSiteAdminPassword } from "#src/platform/site-dir/new-site-owner";
import type { SitesWorkspace } from "#src/platform/site-dir/sites-home";
import type { SiteImportRegistry, SiteImportRecord } from "./import-registry.js";
import { SHARE_LIMITS, SiteShareRefusal, type ShareDatabaseSanitizer } from "./share-policy.js";
import { verifySiteImport } from "./import-verifier.js";
import { restoreStagedImport, stageVerifiedImport } from "./import-restore.js";
import {
  consumeUpload, deadlineSignal, downloadShareArchive, importSiteSlug, parseImportInput, reconcileInterruptedImports, refusal,
  requireFreeSpace, requireOwnerSetup, requireStagingBudget, siteImportView, startImportedSite,
  type ParsedSiteImportInput, type SiteImportSource, type SiteImportView,
} from "./import-backend-steps.js";

export type { SiteImportSource, SiteImportView } from "./import-backend-steps.js";
export interface SiteImportBackend {
  upload(required: { principalId: string; archive: Buffer }, optional?: Record<string, never>): Promise<{ uploadId: string }>;
  importBackup(required: { principalId: string; source: SiteImportSource; displayName?: string; requestId?: string }, optional?: { signal?: AbortSignal }): Promise<SiteImportView>;
  completeOwner(required: { principalId: string; importId: string; adminPassword: unknown }, optional?: { signal?: AbortSignal }): Promise<SiteImportView>;
  list(required: { principalId: string }, optional?: Record<string, never>): Promise<SiteImportView[]>;
  get(required: { principalId: string; importId: string }, optional?: Record<string, never>): SiteImportView;
}


/** Source union is enforced at every remote boundary; server paths are never accepted. */
export function parseSiteImportInput(required: { input: unknown }, _options: Record<string, never> = {}): ParsedSiteImportInput {
  return parseImportInput(required);
}

/** Shared HTTP/tool application service. All effects enter as ports; CMS policy stays here.
 * Pending owner setup stores sanitized bytes privately without creating any site directory.
 * @complexity O(archive bytes + registry history), with one buffered job and four staged payloads.
 */
export function createSiteImportBackend(required: {
  registry: SiteImportRegistry; workspace: SitesWorkspace; reader: AgentPluginArchiveReaderPort; http: HttpClientPort;
  sanitize: ShareDatabaseSanitizer; schema: { index: number; tag: string };
  startSite: (required: { name: string }) => Promise<{ adminUrl: string | null; status: string }>;
  tracker?: Tracker;
  setupBase?: string;
  creationOptions?: Parameters<typeof createSite>[1];
}, optional: {
  createSite?: typeof createSite;
  report?: (required: { importId: string; status: string }) => void;
} = {}): SiteImportBackend {
  const { registry, workspace } = required;
  const view = (row: SiteImportRecord): SiteImportView => siteImportView({ row }, { setupBase: required.setupBase });
  const put = (row: SiteImportRecord) => { registry.put({ row }); optional.report?.({ importId: row.importId, status: row.status }); };
  let active = false;
  const exclusive = async <T>(run: () => Promise<T>): Promise<T> => {
    if (active) refusal("BUSY", "Another import is running. Retry after it finishes.");
    active = true;
    try { return await registry.exclusive({ run: async () => { await reconcileInterruptedImports({ registry, workspace, put }); return run(); } }); } finally { active = false; }
  };

  /** Reads or downloads the archive; records the consumed upload before reading so it is always removed. */
  const fetchArchive = async (input: { parsed: ParsedSiteImportInput; principalId: string; importId: string; signal: AbortSignal; consumed: (uploadId: string) => void }): Promise<Buffer> => {
    const { source } = input.parsed;
    if ("url" in source) return downloadShareArchive({ http: required.http, url: source.url, signal: input.signal });
    const uploadId = consumeUpload({ registry, uploadId: source.uploadId, principalId: input.principalId, importId: input.importId });
    input.consumed(uploadId);
    return fs.readFileSync(registry.uploadPath({ uploadId }));
  };

  /** Verify, stage and mark the row pending owner setup; any failure removes the stage and records why. */
  const verifyAndStage = async (input: { row: SiteImportRecord; parsed: ParsedSiteImportInput; signal: AbortSignal }): Promise<SiteImportView> => {
    let consumedUpload: string | undefined;
    let row = input.row;
    try {
      input.signal.throwIfAborted();
      const archive = await fetchArchive({ parsed: input.parsed, principalId: input.row.principalId, importId: input.row.importId, signal: input.signal, consumed: uploadId => { consumedUpload = uploadId; } });
      const verified = await verifySiteImport({ archive, reader: required.reader, sanitize: required.sanitize, schema: required.schema }, { signal: input.signal });
      input.signal.throwIfAborted();
      stageVerifiedImport({ root: registry.stagePath(input.row), verified });
      row = { ...row, displayName: input.parsed.displayName ?? verified.name, status: "needs-owner" };
      put(row);
      return view(row);
    } catch (error) {
      fs.rmSync(registry.stagePath(row), { recursive: true, force: true });
      put({ ...row, status: "failed", error: error instanceof SiteShareRefusal ? error.message : "Archive verification failed. No site was created." });
      throw error;
    } finally { if (consumedUpload) fs.rmSync(registry.uploadPath({ uploadId: consumedUpload }), { force: true }); }
  };

  /** Creates the site from the stage; a failure rolls the row back to failed and removes the stage. */
  const createImportedSite = async (input: { row: SiteImportRecord; adminPassword: string; signal: AbortSignal }): Promise<{ row: SiteImportRecord; created: CreateSiteResult }> => {
    const { signal } = input;
    let row = input.row;
    try {
      const created = await (optional.createSite ?? createSite)({ name: importSiteSlug(row), displayName: row.displayName, adminPassword: input.adminPassword }, { ...required.creationOptions, workspace, collisionSafe: true,
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
      return { row, created };
    } catch (error) {
      fs.rmSync(registry.stagePath(row), { recursive: true, force: true });
      put({ ...row, newSiteId: null, newSiteName: null, status: "failed", error: "Site creation failed and was rolled back. Import the archive again." });
      throw error;
    }
  };

  const backend: SiteImportBackend = {
    async upload(input) {
      return exclusive(async () => {
        requireStagingBudget({ registry });
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
        if ("url" in parsed.source) requireStagingBudget({ registry });
        const row: SiteImportRecord = { importId: randomUUID(), principalId: input.principalId, requestId: parsed.requestId, source: parsed.source, displayName: parsed.displayName ?? "Imported site", newSiteId: null, newSiteName: null, status: "verifying", createdAt: new Date().toISOString(), expiresAt: Date.now() + 3600_000 };
        put(row);
        return verifyAndStage({ row, parsed, signal: deadlineSignal({ timeoutMs: 5 * 60_000 }, options) });
      });
    },
    async completeOwner(input, options = {}) {
      const signal = deadlineSignal({ timeoutMs: 120_000 }, options);
      return exclusive(async () => {
        registry.expire({});
        const pending = registry.get(input);
        if (pending.status === "ready") return view(pending);
        requireOwnerSetup({ row: pending, adminPassword: input.adminPassword });
        const adminPassword = resolveNewSiteAdminPassword({ adminPassword: input.adminPassword });
        const home = workspace.home({});
        requireFreeSpace({ dir: fs.existsSync(home) ? home : path.dirname(home), message: "Import requires 900 MiB of free space on the sites-home volume." });
        signal.throwIfAborted();
        const creating: SiteImportRecord = { ...pending, status: "creating" }; put(creating);
        const { row: allocated, created } = await createImportedSite({ row: creating, adminPassword, signal });
        // Owner and restore are committed. A supervisor failure must not repeat site creation.
        const ready: SiteImportRecord = { ...allocated, newSiteId: created.siteId, newSiteName: created.name, status: "ready" };
        put(ready);
        required.tracker?.capture({ name: "site_imported", userId: ready.principalId, properties: { targetSiteId: created.siteId, operationId: ready.importId, eventId: `import:${ready.importId}`, source: "admin" } });
        fs.rmSync(registry.stagePath(ready), { recursive: true, force: true });
        const started = await startImportedSite({ row: ready, name: created.name, startSite: required.startSite });
        put(started);
        return view(started);
      });
    },
    async list(input) { return exclusive(async () => { registry.expire({}); return registry.list(input).map(view); }); },
    get(input) { return view(registry.get(input)); },
  };
  return backend;
}
