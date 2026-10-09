import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { withFileLock } from "@jini-ai/platform/fs";

type AdminBuild = (required: { repoRoot: string; output: string; env: NodeJS.ProcessEnv }) => Promise<void>;
function buildAdmin({ repoRoot, output, env }: Parameters<AdminBuild>[0]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(repoRoot, "apps/admin/node_modules/vite/bin/vite.js"),
      "build", "--outDir", output], { cwd: path.join(repoRoot, "apps/admin"), env, stdio: "inherit" });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Journey admin build did not finish")); }, 120_000);
    child.once("error", () => { clearTimeout(timer); reject(new Error("Journey admin build failed")); });
    child.once("exit", (code) => { clearTimeout(timer); if (code === 0) resolve(); else reject(new Error("Journey admin build failed")); });
  });
}

/** One production admin build in the runner-owned temp tree. All boot processes share this
 * directory/lock, including worker respawns; no stale checkout dist and no Vite watcher/HMR or
 * per-site dependency optimizer. The existing cleanup reporter proves the build/lock gone too.
 * Jini's lock reclaims a dead builder, so stopping a starting site cannot wedge later starts.
 */
export async function journeyAdminBundle(
  { runtimeDir, repoRoot }: { runtimeDir: string; repoRoot: string },
  { env: launchEnv = process.env, build = buildAdmin }: { env?: NodeJS.ProcessEnv; build?: AdminBuild } = {},
): Promise<string> {
  const root = path.join(runtimeDir, "admin-build");
  const output = path.join(root, "dist");
  await mkdir(root, { recursive: true });
  return withFileLock({ lockPath: path.join(root, "build.lock"), run: async () => {
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
  } }, { timeoutMs: 125_000, staleMs: Infinity });
}
