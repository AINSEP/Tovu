/**
 * `prestart` for the root `npm start`: builds whatever a fresh clone or unzipped copy is missing
 * before `node dist/src/index.js` runs, so "npm install, then npm start" is the whole setup.
 *
 * A checkout ships none of the three build outputs `npm start` serves — `dist/` (the server),
 * `apps/admin/dist` (the admin SPA at /admin) and `apps/site-chat/dist` (the public chat script) —
 * because all three are gitignored. Without this, `npm start` in a fresh copy crashed on the
 * missing `dist/src/index.js`, or started and answered /admin with "Admin shell not built".
 *
 * Builds only what is MISSING, never rebuilds what exists: on a developer machine with Jini
 * npm-linked, `npm run build` is deliberately blocked (`check-no-linked-jini.mjs`), so an automatic
 * rebuild on every new commit would stop `npm start` from working at all there. A `dist/` built
 * from a different commit gets a one-line warning with the fix instead.
 *
 * The Dockerfile and the desktop app never run `npm start` (both call `node dist/src/index.js`
 * directly, after their own builds), so this only affects people typing `npm start`.
 */
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
 * @returns {{ steps: Array<{ label: string, args: string[] }>, staleWarning: string | null }}
 *   `steps` in run order (server, then each app's install if needed and build), each `args` being
 *   the arguments to `npm`. `staleWarning` is set only when both shas are known and differ.
 * @complexity O(1): a fixed number of `has` checks.
 */
export function planStartSteps(input) {
  const steps = [];
  // The manifest, not dist/src/index.js: `tsc` emits JS even when it reports errors, so a failed
  // build leaves an entry file behind. The manifest is written only after tsc succeeded.
  const serverBuilt = input.has("dist/runtime-manifest.json");
  if (!serverBuilt) steps.push({ label: "the server", args: ["run", "build"] });

  for (const app of APPS) {
    if (input.has(app.builtMarker)) continue;
    const prefix = ["--prefix", `apps/${app.name}`];
    if (!input.has(`apps/${app.name}/node_modules`)) steps.push({ label: `${app.name} dependencies`, args: [...prefix, "install"] });
    steps.push({ label: app.name, args: [...prefix, "run", "build"] });
  }

  const { builtSha, headSha } = input;
  const stale = serverBuilt && builtSha && headSha && builtSha !== "unknown" && builtSha !== headSha;
  const staleWarning = stale
    ? `tovu: dist/ was built from commit ${builtSha.slice(0, 7)}, but this checkout is at ${headSha.slice(0, 7)}. ` +
      "If the server fails to start, run `npm run build` first."
    : null;

  return { steps, staleWarning };
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

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const plan = planStartSteps({
    has: (rel) => existsSync(path.join(repoRoot, rel)),
    builtSha: readBuiltSha(repoRoot),
    headSha: readHeadSha(repoRoot),
  });

  if (plan.staleWarning) console.warn(plan.staleWarning);
  if (plan.steps.length > 0) console.log("tovu: first start, building what's missing. This takes a few minutes, once.");

  for (const step of plan.steps) {
    console.log(`\ntovu: building ${step.label} (npm ${step.args.join(" ")})`);
    // `shell` on Windows only: npm is `npm.cmd` there, which spawn cannot run directly.
    const result = spawnSync("npm", step.args, { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
    if (result.status !== 0) {
      console.error(`\ntovu: \`npm ${step.args.join(" ")}\` failed. Fix the error above, then run \`npm start\` again.`);
      process.exit(result.status ?? 1);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
