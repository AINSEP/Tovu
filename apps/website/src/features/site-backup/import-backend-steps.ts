import fs from "node:fs";
import type { HttpClientPort } from "#src/platform/http/index";
import { assertPortableSiteName, reconcileSiteCreation } from "#src/platform/site-dir/index";
import type { SitesWorkspace } from "#src/platform/site-dir/index";
import type { SiteImportRegistry, SiteImportRecord } from "./import-registry.js";
import { SHARE_LIMITS, SiteShareRefusal } from "./share-policy.js";

/**
 * @file The import backend's individual steps: input parsing, the private staging budget, the
 * share download, upload consumption, interrupted-creation recovery and the public row view.
 * Each takes its ports explicitly; `import-backend.ts` sequences them under the import lock.
 */

export type SiteImportSource = { url: string } | { uploadId: string };
export interface SiteImportView {
  importId: string; source: SiteImportSource; newSiteId: string | null; newSiteName: string | null;
  state: SiteImportRecord["status"]; status: SiteImportRecord["status"]; createdAt: string;
  warnings?: readonly string[];
  setupUrl?: string; adminUrl?: string | null; error?: string; instructions: string;
}
export interface ParsedSiteImportInput { source: SiteImportSource; displayName?: string; requestId?: string }

export function refusal(code: string, message: string): never { throw new SiteShareRefusal({ code, message }); }

const INPUT_KEYS = ["url", "uploadId", "displayName", "requestId"];
const REQUEST_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const UPLOAD_ID = /^[a-f0-9-]{36}$/;
const ARCHIVE_CONTENT_TYPES = ["application/zip", "application/x-zip-compressed", "application/octet-stream"];

/** Source union is enforced at every remote boundary; server paths are never accepted. */
export function parseImportInput(required: { input: unknown }): ParsedSiteImportInput {
  const input = requireSourceShape(required.input);
  if (input.displayName !== undefined && !isDisplayName(input.displayName)) refusal("INVALID_INPUT", "displayName must be 1..200 characters.");
  if (input.requestId !== undefined && (typeof input.requestId !== "string" || !REQUEST_ID.test(input.requestId))) refusal("INVALID_INPUT", "requestId must be 1..128 letters, digits, dashes or underscores.");
  const source = input.url !== undefined ? parseUrlSource({ url: input.url }) : parseUploadSource({ uploadId: input.uploadId });
  return { source, ...(input.displayName !== undefined ? { displayName: input.displayName as string } : {}), ...(input.requestId !== undefined ? { requestId: input.requestId as string } : {}) };
}

function requireSourceShape(value: unknown): Record<string, unknown> {
  const input = value as Record<string, unknown>;
  const invalidRecord = !input || typeof input !== "object" || Array.isArray(input);
  if (invalidRecord || Object.keys(input).some(key => !INPUT_KEYS.includes(key)) ||
      (input.url !== undefined) === (input.uploadId !== undefined)) refusal("INVALID_INPUT", "Provide exactly one source: url or uploadId; optional displayName and requestId only.");
  return input;
}

function isDisplayName(value: unknown): boolean {
  return typeof value === "string" && Boolean(value.trim()) && value.length <= 200;
}

function parseUrlSource(required: { url: unknown }): SiteImportSource {
  if (typeof required.url !== "string" || required.url.length > 4096) refusal("INVALID_INPUT", "url must be an HTTPS share URL.");
  let url: URL;
  try { url = new URL(required.url); } catch { refusal("INVALID_INPUT", "url must be an HTTPS share URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) refusal("INVALID_INPUT", "Import URLs require HTTPS without credentials or fragments.");
  return { url: url.href };
}

function parseUploadSource(required: { uploadId: unknown }): SiteImportSource {
  if (typeof required.uploadId !== "string" || !UPLOAD_ID.test(required.uploadId)) refusal("INVALID_INPUT", "uploadId must come from the authenticated ZIP upload endpoint.");
  return { uploadId: required.uploadId };
}

/** Refuses when the volume holding `dir` has less than three expanded-archive caps free. */
export function requireFreeSpace(required: { dir: string; message: string }): void {
  const space = fs.statfsSync(required.dir);
  if (space.bavail * space.bsize < SHARE_LIMITS.maxExpandedBytes * 3) refusal("INSUFFICIENT_STORAGE", required.message);
}

/** At most four private payloads (uploads or stages) and 900 MiB free before retaining more bytes. */
export function requireStagingBudget(required: { registry: SiteImportRegistry }): void {
  required.registry.expire({});
  const payloads = fs.readdirSync(required.registry.directory).filter(name => name.endsWith(".upload.zip") || name.endsWith(".stage"));
  if (payloads.length >= 4) refusal("BUSY", "Four imports are staged. Complete owner setup or wait for expiry before uploading another.");
  requireFreeSpace({ dir: required.registry.directory, message: "Import requires 900 MiB of free private staging space." });
}

/** The caller's signal (when given) combined with this step's own deadline. */
export function deadlineSignal(required: { timeoutMs: number }, optional: { signal?: AbortSignal } = {}): AbortSignal {
  return AbortSignal.any([...(optional.signal ? [optional.signal] : []), AbortSignal.timeout(required.timeoutMs)]);
}

/** Marks one unconsumed upload as consumed by `importId` and returns its id. */
export function consumeUpload(required: { registry: SiteImportRegistry; uploadId: string; principalId: string; importId: string }): string {
  const upload = required.registry.getUpload({ uploadId: required.uploadId, principalId: required.principalId });
  if (upload.consumedBy) refusal("UPLOAD_USED", "This upload was already imported. Use the original requestId or upload again for a separate site.");
  required.registry.saveUpload({ row: { ...upload, consumedBy: required.importId } });
  return upload.uploadId;
}

/**
 * Downloads a share archive through the guarded HTTP port: a bounded identity GET whose body must
 * be complete and labelled ZIP or binary.
 * @complexity O(archive bytes), at most 300 MiB.
 */
export async function downloadShareArchive(required: { http: HttpClientPort; url: string; signal: AbortSignal }): Promise<Buffer> {
  const response = await required.http.send({ method: "GET", url: required.url, headers: { Accept: "application/zip", "Accept-Encoding": "identity" }, idleTimeoutMs: 30_000, totalDeadlineMs: 120_000, maxResponseBytes: SHARE_LIMITS.maxArchiveBytes, signal: required.signal });
  if (response.status !== 200 || !response.bodyBytes || response.bodyBytesTruncated !== false) refusal("DOWNLOAD_FAILED", "Share download failed or exceeded the 300 MiB archive cap.");
  const contentType = Object.entries(response.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1]?.split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType || !ARCHIVE_CONTENT_TYPES.includes(contentType)) refusal("INVALID_CONTENT_TYPE", "Share download must have a ZIP or binary Content-Type.");
  return Buffer.from(response.bodyBytes);
}

/**
 * Only the lock holder may classify a verifying or creating row as interrupted, never a concurrent
 * reader: both statuses exist only while the import lock is held, so the holder finding one means
 * the previous holder crashed. A verifying row failed; a creating row with an allocation is
 * reconciled against the workspace, one without it failed. Either way its stage is discarded.
 */
export async function reconcileInterruptedImports(required: { registry: SiteImportRegistry; workspace: SitesWorkspace; put: (row: SiteImportRecord) => void }): Promise<void> {
  for (const row of required.registry.list({})) {
    if (row.status === "verifying") required.put({ ...row, status: "failed", error: "Archive verification was interrupted. Import the archive again." });
    else if (row.status === "creating") required.put(await reconcileCreatingRow({ row, workspace: required.workspace }));
    else continue;
    fs.rmSync(required.registry.stagePath(row), { recursive: true, force: true });
  }
}

/** The settled row for an interrupted creation: kept when the workspace has the site, else failed. */
async function reconcileCreatingRow(required: { row: SiteImportRecord; workspace: SitesWorkspace }): Promise<SiteImportRecord> {
  const { row } = required;
  const status = row.creation ? await reconcileSiteCreation({ allocation: row.creation, workspace: required.workspace }) : "failed";
  return { ...row, status, ...(status === "failed" ? { newSiteId: null, newSiteName: null, error: "Site creation was interrupted and rolled back. Import the archive again." } : {}) };
}

/** A folder-safe site name from the display name; non-Latin names fall back to `imported-site`.
 * @throws {ValidationError} Windows device names or trailing dots/spaces, before or after slugification.
 * @complexity O(display name length), no I/O.
 */
export function importSiteSlug(required: { displayName: string }, _optional = {}): string {
  assertPortableSiteName({ name: required.displayName });
  const slug = required.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "imported-site";
  assertPortableSiteName({ name: slug });
  return slug;
}

/** The owner-setup gate: only a pending import, and never without a new password. */
export function requireOwnerSetup(required: { row: SiteImportRecord; adminPassword: unknown }): void {
  if (required.row.status !== "needs-owner") refusal("INVALID_STATE", "This import is not awaiting owner setup. Import the archive again if it failed or expired.");
  if (required.adminPassword === undefined || required.adminPassword === "tovu-dev") refusal("INVALID_PASSWORD", "Choose a new owner password; the development default cannot be used for an import.");
}

/** Owner and restore are committed; a start failure is recorded, never retried as a new site. */
export async function startImportedSite(required: { row: SiteImportRecord; name: string; startSite: (required: { name: string }) => Promise<{ adminUrl: string | null }> }): Promise<SiteImportRecord> {
  try {
    const started = await required.startSite({ name: required.name });
    return { ...required.row, adminUrl: started.adminUrl, ...(started.adminUrl ? {} : { error: "Site created; start it from Sites to open admin." }) };
  } catch { return { ...required.row, error: "Site created with its owner. Start it from Sites to open admin." }; }
}

/** The public view of a stored import row. */
export function siteImportView(required: { row: SiteImportRecord }, optional: { setupBase?: string }): SiteImportView {
  const { row } = required;
  const pending = row.status === "needs-owner";
  return {
    importId: row.importId, source: row.source,
    newSiteId: row.newSiteId, newSiteName: row.newSiteName, state: row.status, status: row.status, createdAt: row.createdAt,
    ...(pending ? { setupUrl: (optional.setupBase ?? "/api/admin/v1/site-imports") + "/" + row.importId + "/owner" } : {}),
    adminUrl: row.adminUrl, error: row.error,
    instructions: pending ? "Open setupUrl while signed in as the importing principal and choose a new owner password privately. The site is unavailable until setup completes." : "Open adminUrl when available. Imported extensions remain quarantined and need explicit review before activation.",
  };
}
