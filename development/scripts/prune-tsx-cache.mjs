import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const HOUR_MS = 60 * 60 * 1000;
const MAX_AGE_MS = 2 * 24 * HOUR_MS;

/** Bound concurrent filesystem work; disappearing cache files are normal with concurrent launches.
 * Other failures propagate to the non-throwing public boundary. O(n) time/space in items.
 */
async function inBatches({ items, run }, { size = 256 } = {}) {
  const results = [];
  for (let offset = 0; offset < items.length; offset += size) {
    results.push(...await Promise.allSettled(items.slice(offset, offset + size).map(run)));
  }
  const failure = results.find(result => result.status === "rejected" && result.reason?.code !== "ENOENT");
  if (failure) throw failure.reason;
  return results.filter(result => result.status === "fulfilled").map(result => result.value);
}

/** Prune one directory, oldest first. Protected entries count toward the cap but cannot be removed.
 * O(n log n) time/O(n) space for n entries, with bounded stat/unlink batches rather than serial I/O.
 */
async function pruneDirectory({ directory, nowMs, maxEntries }, { filesystem }) {
  const entries = await filesystem.readdir(directory, { withFileTypes: true });
  const files = await inBatches({
    items: entries.filter(entry => entry.isFile() && !entry.name.toLowerCase().endsWith(".pipe")),
    run: async entry => {
      const filePath = path.join(directory, entry.name);
      const stat = await filesystem.lstat(filePath);
      return { filePath, mtimeMs: stat.mtimeMs, isFile: stat.isFile() };
    },
  });
  const safeBefore = nowMs - HOUR_MS;
  const eligible = files.filter(file => file.isFile && file.mtimeMs < safeBefore)
    .sort((left, right) => left.mtimeMs - right.mtimeMs);
  const excess = Math.max(0, entries.length - maxEntries);
  const targets = eligible.filter((file, index) => file.mtimeMs < nowMs - MAX_AGE_MS || index < excess);
  await inBatches({
    items: targets,
    run: async file => {
      // Recheck after the scan: another launcher may have refreshed or replaced this entry.
      const current = await filesystem.lstat(file.filePath);
      if (current.isFile() && current.mtimeMs < safeBefore) await filesystem.unlink(file.filePath);
    },
  });
}

/** Keep tsx's shared dev cache bounded before starting a source process; never reject.
 * Pipes, non-files and writes within the last hour survive even when they exceed the 10k cap.
 * @param {{env?: Record<string, string | undefined>}} input Environment containing the opt-out.
 * @param {{tmpDir?: string, getuid?: () => number | undefined, now?: () => number,
 *   filesystem?: typeof fs, warn?: (message: string) => void, maxEntries?: number}} [options]
 * @returns {Promise<void>} Filesystem/logger errors are swallowed; at most one warning is emitted.
 * @complexity O(n log n) time/O(n) space in cache entries, with at most 256 operations per batch.
 */
export async function pruneTsxCache({ env = process.env }, options = {}) {
  if (env.TOVU_TSX_CACHE_PRUNE === "0") return;
  const { warn = console.warn } = options;
  try {
    await pruneCacheDirectories(options);
  } catch {
    try { warn("tovu dev: tsx cache pruning failed; continuing."); }
    catch { /* A broken logger must not prevent development startup either. */ }
  }
}

/** tsx names its cache `tsx-<euid>`; without a uid (Windows: `tsx-<username>`) every tsx-* directory
 * in the per-user temp dir qualifies. Symlinked directories are skipped. */
async function pruneCacheDirectories({
  tmpDir = os.tmpdir(), getuid = () => process.geteuid?.(), now = Date.now,
  filesystem = fs, maxEntries = 10_000,
}) {
  const uid = getuid();
  const entries = await filesystem.readdir(tmpDir, { withFileTypes: true });
  const directories = entries.filter(entry => entry.isDirectory() && entry.name.startsWith("tsx-")
    && (uid === undefined || entry.name === `tsx-${uid}`))
    .map(entry => path.join(tmpDir, entry.name));
  const nowMs = now();
  await inBatches({ items: directories,
    run: directory => pruneDirectory({ directory, nowMs, maxEntries }, { filesystem }),
  }, { size: 1 });
}

// The synchronous daemon supervisor uses this as a preload, before tsx reads its cache.
if (new URL(import.meta.url).searchParams.has("prune")) await pruneTsxCache({});
