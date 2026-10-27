import fs from "node:fs";
import path from "node:path";
import { createDurableJsonFile, createNodeDurableJsonPorts, withFileLock } from "@jini-ai/platform/fs";
import type { SiteCreationAllocation } from "#src/platform/site-dir/site-registry";
import { SiteShareRefusal } from "./share-policy.js";

export interface SiteImportRecord {
  importId: string;
  principalId: string;
  requestId?: string;
  source: { url: string } | { uploadId: string };
  newSiteId: string | null;
  newSiteName: string | null;
  displayName: string;
  /** Private write-ahead allocation, supplied only by the existing site lifecycle. */
  creation?: SiteCreationAllocation;
  status: "verifying" | "needs-owner" | "creating" | "ready" | "failed";
  createdAt: string;
  expiresAt: number;
  adminUrl?: string | null;
  error?: string;
}
export interface SiteImportUpload { uploadId: string; principalId: string; createdAt: number; consumedBy?: string }
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
/** A staged upload is claimable for one hour after it is saved. */
const UPLOAD_TTL_MS = 3600_000;
/** The statuses whose import may still own a `<id>.stage` directory. */
const STAGED_STATUSES: ReadonlySet<SiteImportRecord["status"]> = new Set(["verifying", "needs-owner", "creating"]);
/** The import id behind an `<id>.json` history record name; undefined for every other file. */
function recordIdOf(name: string): string | undefined {
  const id = name.slice(0, -5);
  return name.endsWith(".json") && ID.test(id) ? id : undefined;
}

/** CMS import history and private staging. Jini owns atomic JSON replacement and locking.
 * No public list, caller-controlled filesystem path, or source URL in a filename.
 */
export class SiteImportRegistry {
  readonly directory: string;
  constructor(required: { directory: string }, _options: Record<string, never> = {}) {
    this.directory = path.resolve(required.directory);
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.directory, 0o700);
  }
  private file(id: string, suffix: string) {
    if (!ID.test(id)) throw new SiteShareRefusal({ code: "INVALID_INPUT", message: "Invalid import or upload id." });
    return path.join(this.directory, id + suffix);
  }
  private store(id: string, suffix: string) {
    return createDurableJsonFile({ ...createNodeDurableJsonPorts({}), filePath: this.file(id, suffix), notices: { prefix: "Site imports", lockTimeout: () => "Import registry is busy." } });
  }
  /** Reads one history record; an unreadable file is refused (with the caller's wording) and left in place. */
  private readRecord(required: { importId: string; unreadable: string }): SiteImportRecord | undefined {
    const read = this.store(required.importId, ".json").read({});
    if (read.state === "unreadable") throw new SiteShareRefusal({ code: "REGISTRY_UNREADABLE", message: required.unreadable });
    return read.state === "ok" ? read.value as SiteImportRecord : undefined;
  }
  get(required: { importId: string; principalId: string }, _options: Record<string, never> = {}): SiteImportRecord {
    const row = this.readRecord({ importId: required.importId, unreadable: "Import record is unreadable; it was left untouched." });
    if (!row || row.principalId !== required.principalId) throw new SiteShareRefusal({ code: "NOT_FOUND", message: "Import not found." });
    return row;
  }
  put(required: { row: SiteImportRecord }, _options: Record<string, never> = {}): void {
    this.store(required.row.importId, ".json").write({ value: required.row });
    fs.chmodSync(this.file(required.row.importId, ".json"), 0o600);
  }
  list(required: { principalId?: string }, _options: Record<string, never> = {}): SiteImportRecord[] {
    return fs.readdirSync(this.directory).map(recordIdOf).filter(id => id !== undefined).flatMap(importId => {
      const row = this.readRecord({ importId, unreadable: "Import history is unreadable; it was left untouched." });
      return row && (required.principalId === undefined || row.principalId === required.principalId) ? [row] : [];
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  uploadPath(required: { uploadId: string }, _options: Record<string, never> = {}): string { return this.file(required.uploadId, ".upload.zip"); }
  stagePath(required: { importId: string }, _options: Record<string, never> = {}): string { return this.file(required.importId, ".stage"); }
  saveUpload(required: { row: SiteImportUpload }, _options: Record<string, never> = {}): void { this.store(required.row.uploadId, ".upload.json").write({ value: required.row }); }
  getUpload(required: { uploadId: string; principalId: string }, _options: Record<string, never> = {}): SiteImportUpload {
    const read = this.store(required.uploadId, ".upload.json").read({});
    const row = read.state === "ok" ? read.value as SiteImportUpload : undefined;
    if (!row || row.principalId !== required.principalId || row.createdAt + UPLOAD_TTL_MS < Date.now()) throw new SiteShareRefusal({ code: "NOT_FOUND", message: "Upload not found or expired. Upload the ZIP again." });
    return row;
  }
  /** One process-wide/disk-backed transfer lane bounds buffered memory and cross-process retries. */
  async exclusive<T>(required: { run: () => Promise<T> }, _options: Record<string, never> = {}): Promise<T> {
    return withFileLock({ lockPath: path.join(this.directory, ".import.lock"), run: required.run }, { staleMs: Infinity });
  }
  /** Removes an upload (payload, then record) once it is past its one-hour claim window. */
  private expireUpload(required: { id: string }): void {
    if (!ID.test(required.id)) return;
    const read = this.store(required.id, ".upload.json").read({});
    if (read.state !== "ok" || (read.value as SiteImportUpload).createdAt + UPLOAD_TTL_MS >= Date.now()) return;
    fs.rmSync(this.uploadPath({ uploadId: required.id }), { force: true });
    fs.rmSync(this.file(required.id, ".upload.json"), { force: true });
  }
  /** Fails an owner setup past its deadline and discards its stage; history keeps the named failure. */
  private expireOwnerSetup(required: { importId: string }): void {
    const read = this.store(required.importId, ".json").read({});
    if (read.state !== "ok") return;
    const row = read.value as SiteImportRecord;
    if (row.status === "needs-owner" && row.expiresAt < Date.now()) {
      fs.rmSync(this.stagePath(row), { recursive: true, force: true });
      this.put({ row: { ...row, status: "failed", error: "Owner setup expired. Import the archive again." } });
    }
  }
  /** Removes a ZIP whose metadata is missing or unreadable: a crash between the two writes. */
  private removeOrphanUpload(required: { id: string }): void {
    if (!ID.test(required.id) || this.store(required.id, ".upload.json").read({}).state === "ok") return;
    fs.rmSync(this.uploadPath({ uploadId: required.id }), { force: true });
  }
  /** Removes a stage no in-progress record owns; an unreadable record keeps its stage untouched. */
  private removeOrphanStage(required: { importId: string }): void {
    if (!ID.test(required.importId)) return;
    const read = this.store(required.importId, ".json").read({});
    if (read.state === "unreadable") return;
    const status = read.state === "ok" ? (read.value as SiteImportRecord | null)?.status : undefined;
    if (status === undefined || !STAGED_STATUSES.has(status)) fs.rmSync(this.stagePath(required), { recursive: true, force: true });
  }
  /** Expired payloads are disposable; retain history with a named failure rather than dead setup.
   * Crash leftovers (a ZIP without metadata, a stage without a pending record) are removed too, so
   * they never pin the staging budget. Callers hold the import lock: an upload writes its ZIP
   * before its metadata, so an unlocked sweep could remove a payload that is still being saved.
   */
  expire(_required: Record<string, never>, _options: Record<string, never> = {}): void {
    for (const filename of fs.readdirSync(this.directory)) {
      const importId = recordIdOf(filename);
      if (filename.endsWith(".upload.json")) this.expireUpload({ id: filename.slice(0, -12) });
      else if (filename.endsWith(".upload.zip")) this.removeOrphanUpload({ id: filename.slice(0, -11) });
      else if (filename.endsWith(".stage")) this.removeOrphanStage({ importId: filename.slice(0, -6) });
      else if (importId !== undefined) this.expireOwnerSetup({ importId });
    }
  }
}
