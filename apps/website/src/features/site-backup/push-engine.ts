import { createHash } from "node:crypto";

import type { BackupTreeEntry, CredentialedRepositoryTarget, ProviderCallFailure, SourceControlProvider } from "../source-control/provider-module.js";
import type { SiteBackupPlan } from "./plan-store.js";
import { buildSiteBackupManifest, readPlannedFile, SITE_BACKUP_DATABASE_PATH, SITE_BACKUP_MANIFEST_PATH } from "./sources.js";

/**
 * @file Uploads a planned backup's content for `site_backup_push`: the in-memory database snapshot,
 * each disk file re-read and refused if it changed since the plan, then the manifest built from what
 * was uploaded. The result is the folder's tree entries, in plan order, for ONE commit.
 *
 * Built for large sites (a 212 MiB, 1510-file backup failed live on 2026-10-06):
 * - {@link SITE_BACKUP_UPLOAD_CONCURRENCY} files at a time, each read from disk only when a worker
 *   takes it, so at most that many files are in memory, never the whole site;
 * - a small UTF-8 file goes inline in the host's tree request when the provider accepts that
 *   (`backupInlineTextMaxBytes`), which saves one write request per file against the host's rate
 *   limits;
 * - identical content is uploaded once;
 * - a failure stops every worker from taking another file and names the file that failed. Transient
 *   host errors are retried inside the provider, so a failure that reaches here is final.
 */

/** Files uploaded at a time: a few overlapping requests hide per-request latency, and stay far
 *  below a host's concurrent-request limit (GitHub: 100). */
export const SITE_BACKUP_UPLOAD_CONCURRENCY = 4;

/** Inline text is held until the commit, so it is bounded; past this, files go up as blobs. */
const INLINE_TEXT_BUDGET_BYTES = 64 * 1024 * 1024;

export interface PushFailure {
  readonly ok: false;
  readonly code: string;
  readonly message: string;
}

/** How far a push has got, updated in place as files go up. The manifest is not counted. */
export interface SiteBackupPushProgress {
  filesDone: number;
  readonly filesTotal: number;
  bytesDone: number;
  readonly bytesTotal: number;
}

export interface UploadPlannedContentInput {
  readonly provider: SourceControlProvider;
  readonly target: CredentialedRepositoryTarget;
  readonly plan: SiteBackupPlan;
  /** Aborted: no worker takes another file, and the upload reports `CANCELLED`. */
  readonly signal: AbortSignal;
  readonly progress: SiteBackupPushProgress;
  /** Maps a provider failure to the tool's code, logging its server-only detail. */
  readonly toRefusal: (failure: ProviderCallFailure) => PushFailure;
  readonly concurrency?: number;
}

export const CANCELLED: PushFailure = { ok: false, code: "CANCELLED", message: "the push was stopped before anything was committed" };

/** The progress a plan starts from. @complexity O(1). */
export function initialPushProgress(plan: SiteBackupPlan): SiteBackupPushProgress {
  return { filesDone: 0, filesTotal: plan.files.length + (plan.database ? 1 : 0), bytesDone: 0, bytesTotal: plan.totalBytes };
}

/** One file to upload: its path and how to get its bytes when a worker takes it. */
interface PendingFile {
  readonly path: string;
  load(): Promise<{ ok: true; bytes: Uint8Array } | PushFailure>;
}

/** The bytes, as text, when they are valid UTF-8 without a NUL — else `null`. The BOM is kept. */
function asUtf8Text(content: Uint8Array): string | null {
  if (content.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(content);
  } catch {
    return null;
  }
}

/** Turns file content into tree entries: inline text when the provider takes it, else an uploaded
 *  blob — once per distinct content, even when two workers meet the same bytes at once. */
class EntryBuilder {
  private readonly uploads = new Map<string, Promise<{ ok: true; blobSha: string } | PushFailure>>();
  private inlineBytes = 0;
  constructor(private readonly input: UploadPlannedContentInput) {}

  /** @complexity O(bytes) to hash and decode; at most one upload per distinct content. */
  async entryFor(path: string, content: Uint8Array): Promise<BackupTreeEntry | PushFailure> {
    const sha256 = createHash("sha256").update(content).digest("hex");
    const text = this.inlineText(content);
    if (text !== null) return { path, text, bytes: content.byteLength, sha256 };
    let pending = this.uploads.get(sha256);
    if (pending === undefined) {
      pending = this.upload(path, content);
      this.uploads.set(sha256, pending);
    }
    const uploaded = await pending;
    if (!uploaded.ok) return { ok: false, code: uploaded.code, message: `uploading '${path}' failed: ${uploaded.message}` };
    return { path, blobSha: uploaded.blobSha, bytes: content.byteLength, sha256 };
  }

  private inlineText(content: Uint8Array): string | null {
    const max = this.input.provider.backupInlineTextMaxBytes;
    if (max === undefined || content.byteLength > max || this.inlineBytes + content.byteLength > INLINE_TEXT_BUDGET_BYTES) return null;
    const text = asUtf8Text(content);
    if (text !== null) this.inlineBytes += content.byteLength;
    return text;
  }

  private async upload(path: string, content: Uint8Array): Promise<{ ok: true; blobSha: string } | PushFailure> {
    const uploaded = await this.input.provider.uploadBackupBlob(this.input.target, { path, content });
    return uploaded.ok ? { ok: true, blobSha: uploaded.blob.blobSha } : this.input.toRefusal(uploaded);
  }
}

/** The plan's files in order: the database snapshot first, then each disk file, re-read at upload. */
function pendingFiles(plan: SiteBackupPlan): PendingFile[] {
  const database = plan.database;
  const fromDisk = plan.files.map((file): PendingFile => ({
    path: file.path,
    load: async () => {
      const read = await readPlannedFile(file);
      return read.ok ? { ok: true, bytes: read.bytes } : { ok: false, code: "PLAN_STALE", message: read.message };
    },
  }));
  if (!database) return fromDisk;
  return [{ path: SITE_BACKUP_DATABASE_PATH, load: async () => ({ ok: true, bytes: database.bytes }) }, ...fromDisk];
}

/**
 * Runs `work` over `count` indexes with at most `concurrency` in flight; the first failure (or an
 * abort) stops every worker from taking another index.
 *
 * @complexity O(count) calls of `work`.
 */
async function runBounded(count: number, concurrency: number, signal: AbortSignal, work: (index: number) => Promise<PushFailure | null>): Promise<PushFailure | null> {
  let next = 0;
  let failure: PushFailure | null = null;
  const worker = async (): Promise<void> => {
    while (failure === null && !signal.aborted && next < count) {
      const outcome = await work(next++);
      if (outcome !== null && failure === null) failure = outcome;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, count)) }, worker));
  return failure ?? (signal.aborted ? CANCELLED : null);
}

/**
 * Uploads the plan's content and returns the folder's entries, the manifest last.
 *
 * @complexity O(total bytes); one upload per distinct non-inline content.
 */
export async function uploadPlannedContent(input: UploadPlannedContentInput): Promise<{ ok: true; entries: BackupTreeEntry[] } | PushFailure> {
  const { plan, progress } = input;
  const builder = new EntryBuilder(input);
  const files = pendingFiles(plan);
  const entries: BackupTreeEntry[] = new Array(files.length);
  const failure = await runBounded(files.length, input.concurrency ?? SITE_BACKUP_UPLOAD_CONCURRENCY, input.signal, async (index) => {
    const file = files[index]!;
    const loaded = await file.load();
    if (!loaded.ok) return loaded;
    const entry = await builder.entryFor(file.path, loaded.bytes);
    if ("ok" in entry) return entry;
    entries[index] = entry;
    progress.filesDone += 1;
    progress.bytesDone += entry.bytes;
    return null;
  });
  if (failure !== null) return failure;

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
  const manifestEntry = await builder.entryFor(SITE_BACKUP_MANIFEST_PATH, Buffer.from(manifest, "utf8"));
  if ("ok" in manifestEntry) return manifestEntry;
  return { ok: true, entries: [...entries, manifestEntry] };
}
