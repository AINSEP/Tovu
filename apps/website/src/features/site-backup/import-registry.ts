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
  get(required: { importId: string; principalId: string }, _options: Record<string, never> = {}): SiteImportRecord {
    const read = this.store(required.importId, ".json").read({});
    if (read.state === "unreadable") throw new SiteShareRefusal({ code: "REGISTRY_UNREADABLE", message: "Import record is unreadable; it was left untouched." });
    const row = read.state === "ok" ? read.value as SiteImportRecord : undefined;
    if (!row || row.principalId !== required.principalId) throw new SiteShareRefusal({ code: "NOT_FOUND", message: "Import not found." });
    return row;
  }
  put(required: { row: SiteImportRecord }, _options: Record<string, never> = {}): void {
    this.store(required.row.importId, ".json").write({ value: required.row });
    fs.chmodSync(this.file(required.row.importId, ".json"), 0o600);
  }
  list(required: { principalId?: string }, _options: Record<string, never> = {}): SiteImportRecord[] {
    return fs.readdirSync(this.directory).filter(name => ID.test(name.replace(/\.json$/, "")) && name.endsWith(".json")).flatMap(name => {
      const id = name.slice(0, -5), read = this.store(id, ".json").read({});
      if (read.state === "unreadable") throw new SiteShareRefusal({ code: "REGISTRY_UNREADABLE", message: "Import history is unreadable; it was left untouched." });
      const row = read.state === "ok" ? read.value as SiteImportRecord : undefined;
      return row && (required.principalId === undefined || row.principalId === required.principalId) ? [row] : [];
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  uploadPath(required: { uploadId: string }, _options: Record<string, never> = {}): string { return this.file(required.uploadId, ".upload.zip"); }
  stagePath(required: { importId: string }, _options: Record<string, never> = {}): string { return this.file(required.importId, ".stage"); }
  saveUpload(required: { row: SiteImportUpload }, _options: Record<string, never> = {}): void { this.store(required.row.uploadId, ".upload.json").write({ value: required.row }); }
  getUpload(required: { uploadId: string; principalId: string }, _options: Record<string, never> = {}): SiteImportUpload {
    const read = this.store(required.uploadId, ".upload.json").read({});
    const row = read.state === "ok" ? read.value as SiteImportUpload : undefined;
    if (!row || row.principalId !== required.principalId || row.createdAt + 3600_000 < Date.now()) throw new SiteShareRefusal({ code: "NOT_FOUND", message: "Upload not found or expired. Upload the ZIP again." });
    return row;
  }
  /** One process-wide/disk-backed transfer lane bounds buffered memory and cross-process retries. */
  async exclusive<T>(required: { run: () => Promise<T> }, _options: Record<string, never> = {}): Promise<T> {
    return withFileLock({ lockPath: path.join(this.directory, ".import.lock"), run: required.run }, { staleMs: Infinity });
  }
  /** Expired payloads are disposable; retain history with a named failure rather than dead setup. */
  expire(_required: Record<string, never>, _options: Record<string, never> = {}): void {
    for (const filename of fs.readdirSync(this.directory)) {
      if (filename.endsWith(".upload.json")) {
        const id = filename.slice(0, -12);
        if (!ID.test(id)) continue;
        const read = this.store(id, ".upload.json").read({});
        if (read.state !== "ok" || (read.value as SiteImportUpload).createdAt + 3600_000 >= Date.now()) continue;
        fs.rmSync(this.uploadPath({ uploadId: id }), { force: true });
        fs.rmSync(this.file(id, ".upload.json"), { force: true });
      } else if (filename.endsWith(".json") && ID.test(filename.slice(0, -5))) {
        const read = this.store(filename.slice(0, -5), ".json").read({});
        if (read.state !== "ok") continue;
        const row = read.value as SiteImportRecord;
        if (row.status === "needs-owner" && row.expiresAt < Date.now()) {
          fs.rmSync(this.stagePath(row), { recursive: true, force: true });
          this.put({ row: { ...row, status: "failed", error: "Owner setup expired. Import the archive again." } });
        }
      }
    }
  }
}
