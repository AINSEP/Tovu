import childProcess from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, statfs } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { SHARE_LIMITS, SiteShareRefusal, type ShareDatabaseProjection } from "#src/features/site-backup/share-policy";

/** Read hostile SQLite only in a disposable helper with a deadline and heap ceiling.
 * IPC carries no DB bytes or secrets. Input/output paths are minted here, never supplied by tools.
 * The helper runs trusted source only and reuses A's sanitizer after checking schema objects.
 * @complexity O(database bytes) memory/disk, capped at 300 MiB; one helper per import lane.
 */
export async function rebuildImportDatabase(required: { snapshot: Buffer }, optional: { signal?: AbortSignal } = {}): Promise<ShareDatabaseProjection> {
  optional.signal?.throwIfAborted();
  if (required.snapshot.length > SHARE_LIMITS.maxExpandedBytes) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Import database exceeds 300 MiB." });
  const root = await mkdtemp(path.join(tmpdir(), "tovu-import-db-"));
  try {
    const space = await statfs(root);
    if (space.bavail * space.bsize < required.snapshot.length * 3 + 16 * 1024 * 1024) throw new SiteShareRefusal({ code: "INSUFFICIENT_STORAGE", message: "Not enough private staging space to verify this database." });
    await writeFile(path.join(root, "input.db"), required.snapshot, { flag: "wx", mode: 0o600 });
    const sourceMode = import.meta.url.endsWith(".ts");
    const helper = fileURLToPath(new URL(sourceMode ? "./import-database-worker.ts" : "./import-database-worker.js", import.meta.url));
    await new Promise<void>((resolve, reject) => {
      const child = childProcess.fork(helper, [root], {
        execArgv: [...(sourceMode ? ["--import", "tsx"] : []), "--max-old-space-size=512"],
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        // No inherited deployment credentials, startup injection or archived executable input.
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TMPDIR: root, TMP: root, TEMP: root,
          HOME: root, USERPROFILE: root, TOVU_DESKTOP_USER_DATA_DIR: path.join(root, "profile"),
          XDG_DATA_HOME: path.join(root, "data"), XDG_CONFIG_HOME: path.join(root, "config"), APPDATA: path.join(root, "appdata"),
        },
      });
      let reason: unknown;
      const abort = () => { reason = new SiteShareRefusal({ code: "CANCELLED", message: "Import database verification was cancelled." }); child.kill("SIGKILL"); };
      const timer = setTimeout(() => { reason = new SiteShareRefusal({ code: "DATABASE_TIMEOUT", message: "Import database verification exceeded 90 seconds." }); child.kill("SIGKILL"); }, 90_000);
      optional.signal?.addEventListener("abort", abort, { once: true });
      if (optional.signal?.aborted) abort();
      child.once("error", error => { reason = error; });
      child.once("close", code => {
        clearTimeout(timer); optional.signal?.removeEventListener("abort", abort);
        if (reason) reject(reason);
        else if (code !== 0) reject(new SiteShareRefusal({ code: "INVALID_DATABASE", message: "Import database has unsupported schema, invalid references or unsafe data." }));
        else resolve();
      });
    });
    const output = path.join(root, "output.db");
    const bytes = await readFile(output);
    if (bytes.length > SHARE_LIMITS.maxExpandedBytes) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Rebuilt import database exceeds 300 MiB." });
    const media = JSON.parse(await readFile(path.join(root, "media.json"), "utf8")) as ShareDatabaseProjection["media"];
    return { bytes, media };
  } finally { await rm(root, { recursive: true, force: true }); }
}
