/**
 * `prestart` for the root `npm start`: builds whatever a fresh clone or unzipped copy is missing —
 * and rebuilds whatever is stale — before `development/scripts/start.mjs` runs
 * (npm-start-just-works-plan-2026-09-24 Slices 2-3; `start.mjs` is what now loads `.env`, ensures a
 * root key, and picks a port before importing the compiled `dist/src/index.js` in-process), so "npm
 * install, then npm start" is the whole setup, on every subsequent boot too.
 *
 * A checkout ships none of the three build outputs `npm start` serves — `dist/` (the server),
 * `apps/admin/dist` (the admin SPA at /admin) and `apps/site-chat/dist` (the public chat script) —
 * because all three are gitignored. Without this, `npm start` in a fresh copy crashed on the
 * missing `dist/src/index.js`, or started and answered /admin with "Admin shell not built".
 *
 * Slice 3: a build from an older commit is now REBUILT automatically instead of only warned about.
 * This only became safe once prestart started calling `build:server`/`build:local` directly — the
 * same command chains `build` wraps, minus `check-no-linked-jini.mjs`'s guard. That guard exists so
 * a developer machine with Jini npm-linked (this repo's own dev machine) can't accidentally ship a
 * release dist built against unpublished Jini APIs; `npm start`'s own dist is never a release
 * artifact (nothing serves a release from a local checkout's `dist/`), so bypassing the guard here
 * is safe, and REQUIRED — an automatic rebuild through the guarded `build` would simply refuse to
 * run on this exact machine, defeating the whole feature. Any new release script must still call the
 * guarded `build`, never `build:server` directly.
 *
 * The server's own freshness comes from `dist/runtime-manifest.json`'s `tovuSha` (already written by
 * `emit-dist-package-json.mjs`, part of the `build:server` chain). Each app has no such manifest, so
 * this file writes its own build stamp — `apps/<app>/dist/.tovu-build-sha`, one line, the commit sha
 * the app was last built from — after every successful app build, and reads it back next run.
 *
 * The Dockerfile and the desktop app never run `npm start` (both call `node dist/src/index.js`
 * directly, after their own builds), so this only affects people typing `npm start`.
 */
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APPS = [
  { name: "admin", builtMarker: "apps/admin/dist/index.html" },
  { name: "site-chat", builtMarker: "apps/site-chat/dist/site-assistant.js" },
];

/**
 * Decides which npm commands must run before the server can start.
 *
 * @param {object} input
 * @param {(relPath: string) => boolean} input.has whether a repo-relative path exists.
 * @param {string | null} input.builtSha `tovuSha` from `dist/runtime-manifest.json`, or null.
 * @param {string | null} input.headSha the checkout's `git rev-parse HEAD`, or null without git.
 * @param {Record<string, string | null>} input.builtStamps each app's own build stamp (the commit
 *   sha its `dist/` was last built from, read from `apps/<app>/dist/.tovu-build-sha`), keyed by app
 *   name (`"admin"`, `"site-chat"`) — absent or `null` means "built, but never stamped" (an app dist
 *   left by a pre-Slice-3 `prepare-start.mjs`, or any other reason the stamp file is missing).
 * @returns {{ steps: Array<{ label: string, args: string[], app?: string }> }} `steps` in run order
 *   (server, then each app's install if needed and build), each `args` being the arguments to `npm`.
 *   A step for an app build also carries `app` (its name) so the caller knows which stamp file to
 *   write on success; the server step does not, since its own freshness marker
 *   (`dist/runtime-manifest.json`'s `tovuSha`) is already written by the build chain itself.
 *   `headSha === null` (no `.git`, e.g. an unzipped copy) means staleness can never be determined,
 *   so nothing already built is ever rebuilt for that reason — only genuinely missing output is.
 * @complexity O(1): a fixed number of `has` checks, one per app.
 */
export function planStartSteps(input) {
  const { has, builtSha, headSha, builtStamps } = input;
  const steps = [];

  // The manifest, not dist/src/index.js: `tsc` emits JS even when it reports errors, so a failed
  // build leaves an entry file behind. The manifest is written only after tsc succeeded.
  const serverBuilt = has("dist/runtime-manifest.json");
  // The legacy "unknown" sentinel (`emit-dist-package-json.mjs`'s own fallback when neither
  // `TOVU_BUILD_SHA` nor `git rev-parse HEAD` is available) is deliberately never treated as stale —
  // rebuilding on every boot when the sha can't be verified would defeat the point of skipping a
  // build that is, for all this function can tell, still correct.
  const serverStale = serverBuilt && builtSha != null && headSha != null && builtSha !== "unknown" && builtSha !== headSha;
  if (!serverBuilt || serverStale) steps.push({ label: serverBuilt ? "the server (rebuilding stale dist)" : "the server", args: ["run", "build:server"] });

  for (const app of APPS) {
    const built = has(app.builtMarker);
    const stamp = builtStamps?.[app.name] ?? null;
    const stale = built && headSha != null && stamp !== headSha;
    if (built && !stale) continue;

    const prefix = ["--prefix", `apps/${app.name}`];
    if (!has(`apps/${app.name}/node_modules`)) steps.push({ label: `${app.name} dependencies`, args: [...prefix, "install"] });
    steps.push({ label: stale ? `${app.name} (rebuilding stale dist)` : app.name, args: [...prefix, "run", "build:local"], app: app.name });
  }

  return { steps };
}

function readBuiltSha(repoRoot) {
  try {
    return JSON.parse(readFileSync(path.join(repoRoot, "dist", "runtime-manifest.json"), "utf8")).tovuSha ?? null;
  } catch {
    return null;
  }
}

function readHeadSha(repoRoot) {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null; // an unzipped copy has no .git
  }
}

/** Reads back the build stamp `main()` writes after a successful app build (see its own header),
 *  or `null` when absent — a dist built before Slice 3 existed, or any other reason the stamp file
 *  is missing. Trimmed: `writeFileSync` below always appends a trailing newline. */
function readBuiltStamp(repoRoot, appName) {
  try {
    return readFileSync(path.join(repoRoot, "apps", appName, "dist", ".tovu-build-sha"), "utf8").trim();
  } catch {
    return null;
  }
}

/** One line per app dist, the commit it was just built from — `planStartSteps`'s `builtStamps` input
 *  on the NEXT run. Silently skipped when `headSha` is `null` (no `.git`): an unzipped copy can't
 *  produce a meaningful stamp, and `planStartSteps` already never treats a `null`-headSha checkout as
 *  stale, so a missing stamp there is harmless. */
function writeBuiltStamp(repoRoot, appName, headSha) {
  if (headSha == null) return;
  writeFileSync(path.join(repoRoot, "apps", appName, "dist", ".tovu-build-sha"), `${headSha}\n`, "utf8");
}

/**
 * Runs prestart's build plan. Per npm-start-just-works-plan-2026-09-24 Slice 3: child output is
 * piped to a log file rather than inherited — the owner's own ask was "essentially one clean line"
 * out of `npm start`, and a fresh multi-minute build otherwise dumps `tsc`/`vite`'s full, noisy
 * output straight into that one clean boot. Only ONE progress line prints, up front, when any step
 * is needed at all. On failure, the last 30 lines of the log are printed (enough to see the actual
 * error without replaying the whole build) alongside the log's full path.
 *
 * @complexity O(1) planning; runtime dominated by the spawned `npm` build commands themselves.
 */
function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const headSha = readHeadSha(repoRoot);
  const plan = planStartSteps({
    has: (rel) => existsSync(path.join(repoRoot, rel)),
    builtSha: readBuiltSha(repoRoot),
    headSha,
    builtStamps: { admin: readBuiltStamp(repoRoot, "admin"), "site-chat": readBuiltStamp(repoRoot, "site-chat") },
  });

  if (plan.steps.length === 0) return;

  console.log("tovu: first start, building what's missing. This takes a few minutes, once.");

  const logPath = path.join(repoRoot, "node_modules", ".cache", "tovu", "start-build.log");
  mkdirSync(path.dirname(logPath), { recursive: true });
  writeFileSync(logPath, `tovu: prestart build log, ${new Date().toISOString()}\n`, "utf8");

  for (const step of plan.steps) {
    writeFileSync(logPath, `\n=== ${step.label}: npm ${step.args.join(" ")} ===\n`, { encoding: "utf8", flag: "a" });
    // `shell` on Windows only: npm is `npm.cmd` there, which spawn cannot run directly.
    const result = spawnSync("npm", step.args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" });
    writeFileSync(logPath, (result.stdout ?? "") + (result.stderr ?? ""), { encoding: "utf8", flag: "a" });

    if (result.status !== 0) {
      const tail = readFileSync(logPath, "utf8").trimEnd().split("\n").slice(-30).join("\n");
      console.error(tail);
      console.error(`\ntovu: \`npm ${step.args.join(" ")}\` failed. Full log: ${logPath}. Fix the error, then run \`npm start\` again.`);
      process.exit(result.status ?? 1);
    }

    if (step.app) writeBuiltStamp(repoRoot, step.app, headSha);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
