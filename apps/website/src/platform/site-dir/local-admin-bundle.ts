import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { redactLocalText } from "../server-logs/redact-local-text.js";
import { createRedactedOutputSink } from "../server-logs/console-tee.js";
import { withFileLock } from "@jini-ai/platform/fs";
import { isProcessAlive } from "@jini-ai/platform/process";

const LOCAL_ADMIN_RUNTIME = /^tovu-local-sites-([1-9]\d*)-[A-Za-z0-9]{6}$/;

/** A PID must positively prove death; invalid IDs and permission errors preserve the tree.
 * @complexity O(1), one native liveness probe.
 */
function hasDeadLocalAdminOwner({ name }: { name: string }, _optional = {}): boolean {
  const owner = LOCAL_ADMIN_RUNTIME.exec(name);
  if (!owner) return false;
  const pid = Number(owner[1]);
  return Number.isSafeInteger(pid) && !isProcessAlive(pid);
}

/** Inspect without following a link; only absence is safe to treat as missing. @complexity O(1). */
async function localBuildInfo({ filePath }: { filePath: string }, _optional = {}) {
  try { return await lstat(filePath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Reclaim a dead host's tree while respecting any surviving builder's Jini lock.
 * Symlinked directories/locks are preserved; recursive rm unlinks nested links without traversal.
 * @throws On unexpected filesystem errors; the caller reports them and continues preparation.
 * @complexity O(files in the stale build) removal, O(tree depth) filesystem traversal space.
 */
async function reclaimLocalAdminBuild({ dir }: { dir: string }, _optional = {}): Promise<void> {
  const original = await localBuildInfo({ filePath: dir });
  if (!original?.isDirectory()) return;
  const buildDir = path.join(dir, "admin-build");
  const buildInfo = await localBuildInfo({ filePath: buildDir });
  if (buildInfo && !buildInfo.isDirectory()) return;
  const remove = async () => {
    const current = await localBuildInfo({ filePath: dir });
    // Another cleaner or replacement must not turn a stale decision into removal of a new tree.
    if (current?.isDirectory() && current.ino === original.ino && current.dev === original.dev) {
      await rm(dir, { recursive: true, force: true });
    }
  };
  if (!buildInfo) { await remove(); return; }
  const lockPath = path.join(buildDir, "build.lock");
  const lockInfo = await localBuildInfo({ filePath: lockPath });
  if (lockInfo && !lockInfo.isFile()) return;
  // No age-based eviction: a live child may still be finishing after its host died.
  await withFileLock({ lockPath, run: remove }, { timeoutMs: 100, pollMs: 1, staleMs: Infinity });
}

/** Sweep only this temp root's PID-owned local-admin runtimes; never the active directory.
 * Legacy names without ownership evidence are retained because their host could still be alive.
 * Cleanup is best effort (e.g. Windows can refuse removal of files still open elsewhere).
 * @complexity O(siblings + files removed) time, O(siblings + traversal depth) space.
 */
async function cleanupLocalAdminBuilds(
  { runtimeDir, tempRoot }: { runtimeDir: string; tempRoot: string }, _optional = {},
): Promise<void> {
  const active = path.resolve(runtimeDir);
  const parent = path.resolve(tempRoot);
  if (path.dirname(active) !== parent || !LOCAL_ADMIN_RUNTIME.test(path.basename(active))) return;
  if (!(await localBuildInfo({ filePath: parent }))?.isDirectory()) return;
  if (!(await localBuildInfo({ filePath: active }))?.isDirectory()) return;
  const stale = (await readdir(parent, { withFileTypes: true })).filter(entry =>
    entry.isDirectory() && entry.name !== path.basename(active) && hasDeadLocalAdminOwner({ name: entry.name }));
  for (const entry of stale) {
    await reclaimLocalAdminBuild({ dir: path.join(parent, entry.name) }).catch(error => {
      if (error instanceof Error && error.name === "FileLockTimeoutError") return;
      console.warn(redactLocalText({ text: `tovu local sites: could not reclaim an unused admin build: ${String(error)}` }));
    });
  }
}

type AdminBuild = (required: { repoRoot: string; output: string; env: NodeJS.ProcessEnv }) => Promise<void>;
const ADMIN_BUILD_BACKSTOP_MS = 900_000;
/** Runs Vite with bounded, redacted child diagnostics; rejects spawn, inactivity and nonzero exit.
 * @complexity O(n) output framing time, with bounded line storage in each sink.
 */
export function buildAdmin({ repoRoot, output, env }: Parameters<AdminBuild>[0],
  { spawnBuild = spawn, stdout = process.stdout, stderr = process.stderr }:
  { spawnBuild?: typeof spawn; stdout?: NodeJS.WritableStream; stderr?: NodeJS.WritableStream } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawnBuild(process.execPath, [path.join(repoRoot, "apps/admin/node_modules/vite/bin/vite.js"),
      "build", "--outDir", output], { cwd: path.join(repoRoot, "apps/admin"), env, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.pipe(createRedactedOutputSink({ sink: stdout,
      redact: text => redactLocalText({ text }) }));
    child.stderr?.pipe(createRedactedOutputSink({ sink: stderr,
      redact: text => redactLocalText({ text }) }));
    const stop = (reason: string) => () => {
      cleanup();
      reject(new Error(`Journey admin build did not finish: ${reason}`));
      child.kill("SIGKILL");
    };
    const idle = stop("no output for 120000 ms");
    let timer = setTimeout(idle, 120_000);
    // Loaded machines can take minutes while Vite still progresses. Bound silence, not total work —
    // except a generous backstop shared with readiness, while lock waiters follow the builder.
    const backstop = setTimeout(stop(`still running after ${ADMIN_BUILD_BACKSTOP_MS} ms`), ADMIN_BUILD_BACKSTOP_MS);
    const progress = () => { clearTimeout(timer); timer = setTimeout(idle, 120_000); };
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(backstop);
      child.stdout?.removeListener("data", progress);
      child.stderr?.removeListener("data", progress);
    };
    child.stdout?.on("data", progress);
    child.stderr?.on("data", progress);
    child.once("error", () => { cleanup(); reject(new Error("Journey admin build failed to spawn")); });
    child.once("close", (code, signal) => { cleanup(); if (code === 0) resolve(); else reject(new Error(`Journey admin build failed (code ${code ?? "none"}, signal ${signal ?? "none"})`)); });
  });
}

/** One production admin build in the runner-owned temp tree. All boot processes share this
 * directory/lock, including worker respawns; no stale checkout dist and no Vite watcher/HMR or
 * per-site dependency optimizer. The existing cleanup reporter proves the build/lock gone too.
 * Jini's lock reclaims a dead builder, so stopping a starting site cannot wedge later starts.
 */
export async function journeyAdminBundle(
  { runtimeDir, repoRoot }: { runtimeDir: string; repoRoot: string },
  { env: launchEnv = process.env, build = buildAdmin, lock = withFileLock, tempRoot = os.tmpdir() }: {
    env?: NodeJS.ProcessEnv; build?: AdminBuild; lock?: typeof withFileLock; tempRoot?: string;
  } = {},
): Promise<string> {
  const root = path.join(runtimeDir, "admin-build");
  const output = path.join(root, "dist");
  await cleanupLocalAdminBuilds({ runtimeDir, tempRoot }).catch(error => {
    console.warn(redactLocalText({ text: `tovu local sites: could not inspect unused admin builds: ${String(error)}` }));
  });
  await mkdir(root, { recursive: true });
  // The builder bounds inactivity; a contender must not impose a shorter total-work deadline.
  return lock({ lockPath: path.join(root, "build.lock"), run: async () => {
    if (await readFile(path.join(root, "ready"), "utf8").catch(() => "")) return output;
    const env: NodeJS.ProcessEnv = { ...launchEnv, NODE_ENV: "production" };
    // A shared bundle must resolve public links against its serving origin, not the API port of
    // whichever site won the build lock. The static admin proxy forwards these public routes.
    delete env.VITE_TOVU_SITE_URL;
    try {
      await build({ repoRoot, output, env });
      await writeFile(path.join(root, "ready"), "ready");
    } catch (error) {
      await writeFile(path.join(root, "failed"), "failed");
      throw error;
    }
    return output;
  } }, { timeoutMs: Infinity, staleMs: Infinity });
}

/** Wait for the shared Vite build before spending HTTP readiness attempts. The builder owns the
 * inactivity watchdog; child exit also ends this wait. No wait for hosts supplying a built bundle.
 * The shared backstop also bounds child startup before a builder can create its lock.
 * @param required Shared runtime directory and child liveness port.
 * @param optional Polling delay and monotonic clock ports; no process is launched here.
 * @returns Once the bundle is ready or the child has exited.
 * @throws When preparation exceeds the build backstop.
 * @complexity O(p) filesystem checks for p polls, O(1) storage.
 */
export async function waitForLocalAdminBuild(
  { runtimeDir, exited }: { runtimeDir: string; exited: () => boolean },
  { sleep = () => new Promise<void>(resolve => setTimeout(resolve, 500)), monotonicMs = () => performance.now() }:
  { sleep?: () => Promise<void>; monotonicMs?: () => number } = {},
): Promise<void> {
  const root = path.join(runtimeDir, "admin-build");
  const started = monotonicMs();
  // Lock absence can mean the child has not started yet; only completion proves readiness.
  while (!exited() && !existsSync(path.join(root, "ready"))) {
    if (monotonicMs() - started >= ADMIN_BUILD_BACKSTOP_MS) {
      throw new Error(`Journey admin preparation did not finish after ${ADMIN_BUILD_BACKSTOP_MS} ms`);
    }
    await sleep();
  }
}
