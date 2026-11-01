import childProcess from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, statfs } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { SHARE_LIMITS, SHARE_VERSION_MISMATCH_MESSAGE, IMPORT_SCHEMA_MISMATCH_EXIT_CODE, IMPORT_REFUSAL_EXIT_CODE, SiteShareRefusal, type ShareDatabaseProjection } from "#src/features/site-backup/share-policy";

/** The slice of a forked helper this module drives: its failure/exit events and a kill switch. */
export interface ImportWorkerChild {
  once(event: "error", listener: (error: Error) => void): unknown;
  once(event: "close", listener: (code: number | null) => void): unknown;
  kill(signal: NodeJS.Signals): unknown;
}

/** Host ports, defaulted at this composition edge; tests substitute the space probe, limits and helper. */
export interface RebuildImportDatabaseOptions {
  signal?: AbortSignal;
  limits?: Pick<typeof SHARE_LIMITS, "maxExpandedBytes">;
  statfs?: (root: string) => Promise<{ bavail: number; bsize: number }>;
  fork?: (modulePath: string, args: string[], options: childProcess.ForkOptions) => ImportWorkerChild;
}

/** The helper entrypoint beside `moduleUrl` and the Node flags it needs (heap ceiling; tsx in source mode). */
export function importWorkerLaunch({ moduleUrl }: { moduleUrl: string }): { helper: string; execArgv: string[] } {
  const sourceMode = moduleUrl.endsWith(".ts");
  const helper = fileURLToPath(new URL(sourceMode ? "./import-database/repo.sqlite.ts" : "./import-database/repo.sqlite.js", moduleUrl));
  return { helper, execArgv: [...(sourceMode ? ["--import", "tsx"] : []), "--max-old-space-size=512"] };
}

/** Maps the helper's private exit contract to the refusal the person sees.
 * Only the trusted helper's typed refusals have a message file; native errors stay private.
 * Reads at most refusal.txt from the private staging root; O(message bytes).
 * @throws SiteShareRefusal INVALID_DATABASE for any non-zero exit.
 */
async function requireWorkerSuccess(required: { code: number | null; root: string }, _optional = {}): Promise<void> {
  if (required.code === 0) return;
  const message = required.code === IMPORT_REFUSAL_EXIT_CODE ? `Import database refused: ${await readFile(path.join(required.root, "refusal.txt"), "utf8")}`
    : required.code === IMPORT_SCHEMA_MISMATCH_EXIT_CODE ? SHARE_VERSION_MISMATCH_MESSAGE : "Import database has unsupported schema, invalid references or unsafe data.";
  throw new SiteShareRefusal({ code: "INVALID_DATABASE", message });
}

/** Read hostile SQLite only in a disposable helper with a deadline and heap ceiling.
 * IPC carries no DB bytes or secrets. Input/output paths are minted here, never supplied by tools.
 * The helper runs trusted source only and reuses A's sanitizer after checking schema objects.
 * @complexity O(database bytes) memory/disk, capped at 300 MiB; one helper per import lane.
 */
export async function rebuildImportDatabase(required: { snapshot: Buffer; moduleUrl: string; omittedMediaIds?: readonly string[] }, optional: RebuildImportDatabaseOptions = {}): Promise<ShareDatabaseProjection> {
  const { limits = SHARE_LIMITS, statfs: readSpace = statfs, fork = childProcess.fork } = optional;
  optional.signal?.throwIfAborted();
  if (required.snapshot.length > limits.maxExpandedBytes) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Import database exceeds 300 MiB." });
  const root = await mkdtemp(path.join(tmpdir(), "tovu-import-db-"));
  try {
    const space = await readSpace(root);
    if (space.bavail * space.bsize < required.snapshot.length * 3 + 16 * 1024 * 1024) throw new SiteShareRefusal({ code: "INSUFFICIENT_STORAGE", message: "Not enough private staging space to verify this database." });
    await writeFile(path.join(root, "input.db"), required.snapshot, { flag: "wx", mode: 0o600 });
    await writeFile(path.join(root, "omitted-media.json"), JSON.stringify(required.omittedMediaIds ?? []), { flag: "wx", mode: 0o600 });
    const { helper, execArgv } = importWorkerLaunch({ moduleUrl: required.moduleUrl });
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = fork(helper, [root], {
        execArgv,
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
        else resolve(code);
      });
    });
    await requireWorkerSuccess({ code, root });
    const output = path.join(root, "output.db");
    const bytes = await readFile(output);
    if (bytes.length > limits.maxExpandedBytes) throw new SiteShareRefusal({ code: "LIMIT_EXCEEDED", message: "Rebuilt import database exceeds 300 MiB." });
    const media = JSON.parse(await readFile(path.join(root, "media.json"), "utf8")) as ShareDatabaseProjection["media"];
    const documents = JSON.parse(await readFile(path.join(root, "documents.json"), "utf8")) as NonNullable<ShareDatabaseProjection["documents"]>;
    const notices = JSON.parse(await readFile(path.join(root, "notices.json"), "utf8")) as string[];
    return { bytes, media, documents, notices };
  } finally { await rm(root, { recursive: true, force: true }); }
}
