import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { DbOpsPort, RestoreCapability } from "../../core/gated-mutations/ports";
import { getCurrentWatermark } from "../../core/gated-mutations/watermark";
import type { ContentDb } from "./content-db";

/**
 * @file SPEC-016 C-007 / REQ-19–REQ-21 — the SQLite `DbOpsPort` adapter.
 *
 * Purpose:
 * SQLite-backed sites always have a cheap restore mechanism: a whole-file online backup of
 * `content.db` via `better-sqlite3`'s native backup API (SQLite's Online Backup API), which
 * produces a consistent copy even while the source connection has an open WAL.
 *
 * How it relates to the project:
 * `ContentDb` (content-db.ts) is widened with `$client` — the raw `better-sqlite3` `Database`
 * instance `drizzle()` already returns at runtime — precisely so this adapter can call `.backup()`
 * directly rather than re-implementing SQLite's backup protocol.
 *
 * Architectural role:
 * Infrastructure adapter for `core/gated-mutations`'s `DbOpsPort`. Only this file (and its
 * Postgres sibling) implement the port; domain code depends on the port, never on this adapter.
 */
export class SqliteDbOpsAdapter implements DbOpsPort {
  private readonly db: ContentDb;
  private readonly filePath: string;

  constructor(deps: { db: ContentDb; filePath: string }) {
    this.db = deps.db;
    this.filePath = deps.filePath;
  }

  /**
   * Pure, side-effect-free (REQ-19) — SQLite always reports the same static capability.
   * @complexity O(1).
   * @overallScore 100
   */
  async getCapabilities(): Promise<{ restorePoint: RestoreCapability }> {
    return { restorePoint: { costClass: "cheap", kind: "file-snapshot" } };
  }

  /**
   * Captures a whole-file online-backup copy of `content.db` (never a partial/logical export,
   * AC-30), stamped with the watermark value at capture time (REQ-06).
   *
   * @complexity O(db size) — a full page-by-page backup copy.
   * @overallScore 100
   */
  async captureRestorePoint(required: { scopeId: string }): Promise<{ artifactRef: string; watermarkAtCapture: number }> {
    const watermarkAtCapture = getCurrentWatermark({ db: this.db }).value;
    const targetDir = this.filePath === ":memory:" ? os.tmpdir() : path.dirname(this.filePath);
    const artifactRef = path.join(
      targetDir,
      `restore-point-${sanitizeForFilename(required.scopeId)}-wm${watermarkAtCapture}-${Date.now()}.db`
    );

    await this.db.$client.backup(artifactRef);

    return { artifactRef, watermarkAtCapture };
  }

  /**
   * Closes the "ledger-only" disclosed gap (`server/gated-mutations-composition.ts`'s
   * `buildRestoreHooks`): physically swaps `content.db` for a previously-captured artifact.
   *
   * Crash-safety: copies the artifact to a same-directory temp file first, then does a single
   * `fs.rename()` — atomic on the same filesystem (POSIX rename semantics). If the process dies
   * before the rename, `content.db` is untouched; the rename itself either fully completes or
   * doesn't happen, never a partial file. The already-running process keeps its own open file
   * descriptor pointing at the now-unlinked old inode (and keeps serving from it, unaware anything
   * changed) until it restarts and reopens `filePath` fresh — this is *why* `restartRequired` is
   * always `true` for this real adapter, not an incidental detail.
   *
   * Stale `-wal`/`-shm` sidecar cleanup is best-effort (`Promise.allSettled`): SQLite's own WAL
   * header carries a salt tied to the specific main-file version it was written against, so even
   * an un-cleaned stale sidecar cannot silently corrupt the swapped-in file on next boot (SQLite
   * detects the mismatch and discards it) — this cleanup exists to avoid ambiguity, not because
   * skipping it would be unsafe.
   *
   * @complexity O(db size) — one file copy, one rename, two best-effort unlinks.
   */
  async restoreFromArtifact(required: { artifactRef: string }): Promise<{ restartRequired: boolean }> {
    if (this.filePath === ":memory:") {
      // TOVU_DB=memory dev mode — no real file to restore into.
      return { restartRequired: false };
    }

    await fs.access(required.artifactRef);

    const dir = path.dirname(this.filePath);
    const tmpPath = path.join(dir, `.${path.basename(this.filePath)}.restoring-${randomBytes(6).toString("hex")}`);
    await fs.copyFile(required.artifactRef, tmpPath);
    await fs.rename(tmpPath, this.filePath);

    await Promise.allSettled([
      fs.rm(`${this.filePath}-wal`, { force: true }),
      fs.rm(`${this.filePath}-shm`, { force: true }),
    ]);

    return { restartRequired: true };
  }
}

/** Keeps a caller-supplied `scopeId` from producing an unsafe/nested filesystem path segment. */
function sanitizeForFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}
