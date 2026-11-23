import { tidyImportDatabases } from "./import-database.js";
import type { Tracker } from "@jini-ai/diagnostics/observability";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentPluginArchiveReaderPort } from "@jini-ai/agent-plugins/lifecycle";
import type { HttpClientPort } from "#src/platform/http/index";
import type { CreateSitePort } from "#src/platform/site-dir/index";
import type { CreateSiteResult } from "@jini-ai/core/contracts/site/platform-site-dir";
import { resolveNewSiteAdminPassword } from "#src/platform/site-dir/index";
import type { SitesWorkspace } from "#src/platform/site-dir/index";
import { importSourceDigest, withoutQuery, type SiteImportRegistry, type SiteImportRecord } from "./import-registry.js";
import { SHARE_LIMITS, SiteShareRefusal, type ShareDatabaseSanitizer } from "./share-policy.js";
import { verifySiteImport } from "./import-verifier.js";
import { stageVerifiedImport, stagedImportWarnings } from "./import-restore.js";
import {
  consumeUpload, deadlineSignal, downloadShareArchive, importSiteSlug, parseImportInput, reconcileInterruptedImports, refusal,
  requireFreeSpace, requireOwnerSetup, requireStagingBudget, siteImportView, startImportedSite,
  type ParsedSiteImportInput, type SiteImportSource, type SiteImportView,
} from "./import-backend-steps.js";

export type { SiteImportSource, SiteImportView } from "./import-backend-steps.js";
export interface SiteImportBackend {
  upload(required: { principalId: string; archive: Buffer }, optional?: Record<string, never>): Promise<{ uploadId: string }>;
  importBackup(required: { principalId: string; source: SiteImportSource; displayName?: string; requestId?: string }, optional?: { signal?: AbortSignal }): Promise<SiteImportView>;
  completeOwner(required: { principalId: string; importId: string; adminPassword: unknown; savedKeysPassword?: unknown }, optional?: { signal?: AbortSignal }): Promise<SiteImportView>;
  list(required: { principalId: string }, optional?: Record<string, never>): Promise<SiteImportView[]>;
  get(required: { principalId: string; importId: string }, optional?: Record<string, never>): SiteImportView;
  /** Settles interrupted imports and removes expired or orphaned payloads, with no import to start. */
  tidy(required: Record<string, never>, optional?: Record<string, never>): Promise<void>;
}


/** Source union is enforced at every remote boundary; server paths are never accepted. */
export function parseSiteImportInput(required: { input: unknown }, _options: Record<string, never> = {}): ParsedSiteImportInput {
  return parseImportInput(required);
}

type ImportBackendRequired = {
  registry: SiteImportRegistry; workspace: SitesWorkspace; reader: AgentPluginArchiveReaderPort; http: HttpClientPort;
  sanitize: ShareDatabaseSanitizer; schema: { index: number; tag: string };
  startSite: (required: { name: string }) => Promise<{ adminUrl: string | null; status: string }>;
  tracker?: Tracker;
  createSite: CreateSitePort;
  restoreStagedImport: (required: { root: string; dir: string; dbPath: string; siteId: string }, optional?: { pluginSourceRoot?: string; savedKeysPassword?: string; signal?: AbortSignal }) => Promise<void>;
  setupBase?: string;
  creationOptions?: Parameters<CreateSitePort>[1];
};
type ImportBackendOptional = {
  createSite?: CreateSitePort;
  report?: (required: { importId: string; status: string }) => void;
};

/** The ports and bookkeeping every import step shares; `exclusive` allows one import at a time. */
type ImportBackendContext = {
  required: ImportBackendRequired; optional: ImportBackendOptional; registry: SiteImportRegistry; workspace: SitesWorkspace;
  view: (row: SiteImportRecord) => SiteImportView; put: (row: SiteImportRecord) => void;
  exclusive: <T>(input: { run: () => Promise<T> }, optional?: Record<string, never>) => Promise<T>;
};

function createImportContext({ required, optional }: { required: ImportBackendRequired; optional: ImportBackendOptional }): ImportBackendContext {
  const { registry, workspace } = required;
  const view = (row: SiteImportRecord): SiteImportView => {
    const warnings = stagedImportWarnings({ root: registry.stagePath(row) });
    return { ...siteImportView({ row }, { setupBase: required.setupBase }), ...(warnings.length ? { warnings } : {}) };
  };
  const put = (row: SiteImportRecord) => { registry.put({ row }); optional.report?.({ importId: row.importId, status: row.status }); };
  let active = false;
  const exclusive = async <T>({ run }: { run: () => Promise<T> }, _optional: Record<string, never> = {}): Promise<T> => {
    if (active) refusal({ code: "BUSY", message: "Another import is running. Retry after it finishes." });
    active = true;
    try { return await registry.exclusive({ run: async () => { await reconcileInterruptedImports({ registry, workspace, put }); return run(); } }); } finally { active = false; }
  };
  return { required, optional, registry, workspace, view, put, exclusive };
}

/** Reads or downloads the archive; records the consumed upload before reading so it is always removed. */
async function fetchArchive({ ctx, input }: { ctx: ImportBackendContext; input: { parsed: ParsedSiteImportInput; principalId: string; importId: string; signal: AbortSignal; consumed: (required: { uploadId: string }, optional?: Record<string, never>) => void } }): Promise<Buffer> {
  const { source } = input.parsed;
  if ("url" in source) { input.signal.throwIfAborted(); return downloadShareArchive({ http: ctx.required.http, url: source.url, signal: input.signal }); }
  const uploadId = consumeUpload({ registry: ctx.registry, uploadId: source.uploadId, principalId: input.principalId, importId: input.importId });
  input.consumed({ uploadId });
  input.signal.throwIfAborted();
  return fs.readFileSync(ctx.registry.uploadPath({ uploadId }));
}


/** Verify, stage and mark the row pending owner setup; any failure removes the stage and records why. */
async function verifyAndStage({ ctx, input }: { ctx: ImportBackendContext; input: { row: SiteImportRecord; parsed: ParsedSiteImportInput; signal: AbortSignal } }): Promise<SiteImportView> {
  let consumedUpload: string | undefined;
  let row = input.row;
  try {
    const archive = await fetchArchive({ ctx, input: { parsed: input.parsed, principalId: input.row.principalId, importId: input.row.importId, signal: input.signal, consumed: ({ uploadId }, _optional = {}) => { consumedUpload = uploadId; } } });
    const verified = await verifySiteImport({ archive, reader: ctx.required.reader, sanitize: ctx.required.sanitize, schema: ctx.required.schema }, { signal: input.signal });
    input.signal.throwIfAborted();
    stageVerifiedImport({ root: ctx.registry.stagePath(input.row), verified });
    row = { ...row, displayName: input.parsed.displayName ?? verified.name, status: "needs-owner", hasEncryptedKeys: Boolean(verified.encryptedKeys), credentialWarnings: verified.credentialWarnings ?? [], warnings: stagedImportWarnings({ root: ctx.registry.stagePath(row) }) };
    ctx.put(row);
    return ctx.view(row);
  } catch (error) {
    fs.rmSync(ctx.registry.stagePath(row), { recursive: true, force: true });
    ctx.put({ ...row, status: "failed", error: error instanceof SiteShareRefusal ? error.message : "Archive verification failed. No site was created." });
    throw error;
  } finally { if (consumedUpload) fs.rmSync(ctx.registry.uploadPath({ uploadId: consumedUpload }), { force: true }); }
}


/** Creates the site from the stage; a failure rolls the row back to failed and removes the stage. */
async function createImportedSite({ ctx, input }: { ctx: ImportBackendContext; input: { row: SiteImportRecord; adminPassword: string; savedKeysPassword?: string; signal: AbortSignal } }): Promise<{ row: SiteImportRecord; created: CreateSiteResult }> {
  const { signal } = input;
  let row = input.row;
  try {
    const created = await (ctx.optional.createSite ?? ctx.required.createSite)({ name: importSiteSlug(row), displayName: row.displayName, adminPassword: input.adminPassword }, { ...ctx.required.creationOptions, workspace: ctx.workspace, collisionSafe: true,
      onAllocated: (allocation, _optional = {}) => {
        signal.throwIfAborted();
        // Persist idempotency before shared registration. A ctx.registry failure is still inside
        // createSite's compensation boundary, so a new site's identity never gets lost.
        row = { ...row, creation: allocation, newSiteId: allocation.siteId, newSiteName: allocation.name };
        ctx.put(row);
      },
      beforeRegister: () => { signal.throwIfAborted(); },
      verifiedRestore: { signal, restore: async ({ dir, dbPath, siteId }) => {
        signal.throwIfAborted();
        await ctx.required.restoreStagedImport({ root: ctx.registry.stagePath(row), dir, dbPath, siteId }, { savedKeysPassword: input.savedKeysPassword, signal });
        row = { ...row, warnings: stagedImportWarnings({ root: ctx.registry.stagePath(row) }) };
        ctx.put(row);
      } },
    });
    return { row, created };
  } catch (error) {
    fs.rmSync(ctx.registry.stagePath(row), { recursive: true, force: true });
    ctx.put({ ...row, newSiteId: null, newSiteName: null, status: "failed", error: "Site creation failed and was rolled back. Import the archive again." });
    throw error;
  }
}

async function uploadImportArchive({ ctx, input }: { ctx: ImportBackendContext; input: { principalId: string; archive: Buffer } }): Promise<{ uploadId: string }> {
  return ctx.exclusive({ run: async () => {
    requireStagingBudget({ registry: ctx.registry });
    if (!Buffer.isBuffer(input.archive) || input.archive.length > SHARE_LIMITS.maxArchiveBytes) refusal({ code: "LIMIT_EXCEEDED", message: "Upload exceeds the 300 MiB ZIP cap." });
    const uploadId = randomUUID();
    try {
      fs.writeFileSync(ctx.registry.uploadPath({ uploadId }), input.archive, { flag: "wx", mode: 0o600 });
      ctx.registry.saveUpload({ row: { uploadId, principalId: input.principalId, createdAt: Date.now() } });
      return { uploadId };
    } catch (error) { fs.rmSync(ctx.registry.uploadPath({ uploadId }), { force: true }); throw error; }
  } });
}

function traced<T>({ ctx, name, run }: { ctx: ImportBackendContext; name: string; run: () => Promise<T> }, _optional = {}): Promise<T> {
  return ctx.required.tracker ? ctx.required.tracker.trace({ name, run }) : run();
}

async function startImportFromSource({ ctx, input, options }: { ctx: ImportBackendContext; input: { principalId: string; source: SiteImportSource; displayName?: string; requestId?: string }; options: { signal?: AbortSignal } }): Promise<SiteImportView> {
  const parsed = parseSiteImportInput({ input: { ...input.source, displayName: input.displayName, requestId: input.requestId } });
  return ctx.exclusive({ run: async () => {
    ctx.registry.expire({});
    const existing = parsed.requestId ? ctx.registry.list(input).find(row => row.requestId === parsed.requestId) : undefined;
    if (existing) {
      const sameSource = existing.sourceDigest !== undefined
        ? existing.sourceDigest === importSourceDigest({ source: parsed.source })
        : JSON.stringify(withoutQuery({ source: existing.source })) === JSON.stringify(withoutQuery({ source: parsed.source }));
      if (!sameSource) refusal({ code: "REQUEST_CONFLICT", message: "requestId already belongs to another source." });
      return ctx.view(existing);
    }
    if ("url" in parsed.source) requireStagingBudget({ registry: ctx.registry });
    const row: SiteImportRecord = { importId: randomUUID(), principalId: input.principalId, requestId: parsed.requestId, source: parsed.source, sourceDigest: importSourceDigest({ source: parsed.source }), displayName: parsed.displayName ?? "Imported site", newSiteId: null, newSiteName: null, status: "verifying", createdAt: new Date().toISOString(), expiresAt: Date.now() + 3600_000 };
    ctx.put(row);
    return traced({ ctx, name: "site.import.verify", run: () => verifyAndStage({ ctx, input: { row, parsed, signal: deadlineSignal({ timeoutMs: 5 * 60_000 }, options) } }) });
  } });
}

async function completeImportOwner({ ctx, input, options }: { ctx: ImportBackendContext; input: { principalId: string; importId: string; adminPassword: unknown; savedKeysPassword?: unknown }; options: { signal?: AbortSignal } }): Promise<SiteImportView> {
  const signal = deadlineSignal({ timeoutMs: 120_000 }, options);
  return ctx.exclusive({ run: async () => {
    ctx.registry.expire({});
    const pending = ctx.registry.get(input);
    if (pending.status === "ready") return ctx.view(pending);
    requireOwnerSetup({ row: pending, adminPassword: input.adminPassword });
    const adminPassword = resolveNewSiteAdminPassword({ adminPassword: input.adminPassword });
    if (input.savedKeysPassword !== undefined && (typeof input.savedKeysPassword !== "string" || input.savedKeysPassword.length > 1024)) refusal({ code: "INVALID_INPUT", message: "Saved keys password must be text of at most 1024 characters." });
    const home = ctx.workspace.home({});
    try {
      requireFreeSpace({ dir: fs.existsSync(home) ? home : path.dirname(home), message: "Import requires 900 MiB of free space on the sites-home volume." });
      signal.throwIfAborted();
    } catch (error) {
      // No site exists yet (low space, or the desktop app quitting): the verified copy must not wait out its hour.
      fs.rmSync(ctx.registry.stagePath(pending), { recursive: true, force: true });
      ctx.put({ ...pending, status: "failed", error: signal.aborted ? "The import was stopped. No site was created. Import the archive again." : "There is not enough free disk space. No site was created. Free up space and import the archive again." });
      throw error;
    }
    const creating: SiteImportRecord = { ...pending, status: "creating" }; ctx.put(creating);
    const { row: allocated, created } = await traced({ ctx, name: "site.import.restore", run: () => createImportedSite({ ctx, input: { row: creating, adminPassword, savedKeysPassword: input.savedKeysPassword as string | undefined, signal } }) });
    // Owner and restore are committed. A supervisor failure must not repeat site creation.
    const ready: SiteImportRecord = { ...allocated, newSiteId: created.siteId, newSiteName: created.name, status: "ready" };
    ctx.put(ready);
    void ctx.required.tracker?.capture({ name: "site_imported", userId: ready.principalId }, { properties: { targetSiteId: created.siteId, operationId: ready.importId, eventId: `import:${ready.importId}`, source: "admin" } });
    fs.rmSync(ctx.registry.stagePath(ready), { recursive: true, force: true });
    const started = await startImportedSite({ row: ready, name: created.name, startSite: ctx.required.startSite });
    ctx.put(started);
    return ctx.view(started);
  } });
}

/** Shared HTTP/tool application service. All effects enter as ports; CMS policy stays here.
 * Pending owner setup stores sanitized bytes privately without creating any site directory.
 * @complexity O(archive bytes + registry history), with one buffered job and four staged payloads.
 */
export function createSiteImportBackend(required: ImportBackendRequired, optional: ImportBackendOptional = {}): SiteImportBackend {
  const ctx = createImportContext({ required, optional });
  const { registry } = ctx;
  return {
    upload: (input) => uploadImportArchive({ ctx, input }),
    importBackup: (input, options = {}) => startImportFromSource({ ctx, input, options }),
    completeOwner: (input, options = {}) => completeImportOwner({ ctx, input, options }),
    async list(input) { return ctx.exclusive({ run: async () => { registry.expire({}); return registry.list(input).map(ctx.view); } }); },
    get(input) { return ctx.view(registry.get(input)); },
    async tidy() { await ctx.exclusive({ run: async () => { registry.expire({}); await tidyImportDatabases({}); } }); },
  };
}
