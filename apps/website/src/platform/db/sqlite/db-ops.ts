import { SqliteDbOpsAdapter as InfraSqliteDbOpsAdapter } from "@jini-ai/infra/db/sqlite";

import type { DbOpsPort, RestoreCapability } from "../../../contracts/core/gated-mutations/ports.js";
import { getCurrentWatermark } from "./watermark.js";
import type { ContentDb } from "./content-db.js";

/**
 * @file SPEC-016 C-007 / REQ-19–REQ-21 — the SQLite `DbOpsPort` adapter.
 *
 * Purpose:
 * SQLite-backed sites always have a cheap restore mechanism: a whole-file online backup of
 * `content.db` via `better-sqlite3`'s native backup API (SQLite's Online Backup API), which
 * produces a consistent copy even while the source connection has an open WAL.
 *
 * How it relates to the project:
 * The backup/restore mechanics moved to `@jini-ai/infra/db/sqlite` on 2026-08-11 — they are
 * genuinely product-independent (online backup, copy-then-atomic-rename, WAL/SHM sidecar
 * cleanup, restore-point artifact naming), and the trickiest code in this folder. What stays
 * here is the part that is Tovu's: this product's `DbOpsPort` shape, and where the watermark
 * lives. The infra adapter takes that as an injected `readWatermark` rather than importing
 * `core/gated-mutations`, so the package never learns Tovu's schema.
 *
 * Why this file still exists at all rather than the composition root using the infra class
 * directly: Tovu's `RestoreCapability` union is deliberately wider than the infra one — it also
 * admits `"unavailable"` and `"external"`, which non-SQLite adapters here need. This class is
 * the seam where the narrow SQLite answer widens into Tovu's port, and it is the only place
 * that conversion happens.
 *
 * Architectural role:
 * Infrastructure adapter for `core/gated-mutations`'s `DbOpsPort`. Only this file (and its
 * Postgres sibling) implement the port; domain code depends on the port, never on this adapter.
 */
export class SqliteDbOpsAdapter implements DbOpsPort {
  private readonly inner: InfraSqliteDbOpsAdapter;

  constructor(deps: { db: ContentDb; filePath: string }) {
    this.inner = new InfraSqliteDbOpsAdapter({
      // `$client` is the raw better-sqlite3 handle Drizzle already returns. The package takes the
      // driver connection directly rather than an object with a `$client` property, so Drizzle's
      // naming convention — and Drizzle itself — stays out of its surface entirely.
      connection: deps.db.$client,
      filePath: deps.filePath,
      // Read lazily per capture, not captured at construction — the watermark advances with
      // every gated write, and a restore point must be stamped with its value at capture time
      // (REQ-06), not at wiring time.
      readWatermark: () => getCurrentWatermark({ db: deps.db }).value,
    });
  }

  /**
   * Pure, side-effect-free (REQ-19) — SQLite always reports the same static capability. The
   * infra answer (`cheap`/`file-snapshot`) is a subset of Tovu's wider union, so this widens
   * without converting.
   * @complexity O(1).
   * @overallScore 100
   */
  async getCapabilities(): Promise<{ restorePoint: RestoreCapability }> {
    return this.inner.getCapabilities();
  }

  /**
   * Captures a whole-file online-backup copy of `content.db` (never a partial/logical export,
   * AC-30), stamped with the watermark value at capture time (REQ-06).
   *
   * @complexity O(db size) — a full page-by-page backup copy.
   * @overallScore 100
   */
  async captureRestorePoint(required: {
    scopeId: string;
  }): Promise<{ artifactRef: string; watermarkAtCapture: number }> {
    return this.inner.captureRestorePoint(required);
  }

  /**
   * Closes the "ledger-only" disclosed gap (`features/recovery/gated-hooks.ts`'s
   * `buildRestoreHooks`): physically swaps `content.db` for a previously-captured artifact.
   *
   * Crash-safety and the always-`true` `restartRequired` for a real file-backed adapter are
   * documented on the infra implementation — the short version is that the copy-then-rename is
   * atomic under POSIX rename semantics, and the running process keeps serving from its own
   * descriptor on the now-unlinked old inode until it reopens the path fresh.
   *
   * @complexity O(db size) — one file copy, one rename, two best-effort unlinks.
   */
  async restoreFromArtifact(required: { artifactRef: string }): Promise<{ restartRequired: boolean }> {
    return this.inner.restoreFromArtifact(required);
  }
}
