import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeDevBundledAgentPlugins } from "./compose-bundled-agent-plugins.mjs";
import { apiWatchArgs } from "./dev-api-watch.mjs";
import { prepareDevSitesHome } from "./dev-sites-home.mjs";
import { loadRepoRootEnvFile } from "./load-repo-root-env.mjs";
import { pruneTsxCache } from "./prune-tsx-cache.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadRepoRootEnvFile(repoRoot);
const selectedSite = await prepareDevSitesHome({ repoRoot });
const sitesHome = selectedSite.env.TOVU_SITES_HOME ?? path.dirname(selectedSite.dir);
await pruneTsxCache({});
// Moved agent plugins live in Jini packages: compose them with Tovu's own into one bundled root the
// API seeds from (compose-bundled-agent-plugins.mjs). The spawned watcher inherits this variable.
process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = composeDevBundledAgentPlugins({ repoRoot, env: process.env });
selectedSite.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR = process.env.TOVU_BUNDLED_AGENT_PLUGINS_DIR;
const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", apiWatchArgs({ sitesHome }), {
  cwd: repoRoot, stdio: "inherit", env: { ...process.env, ...selectedSite.env },
});
child.on("error", () => { console.error("tovu dev: could not start the API watcher"); process.exitCode = 1; });
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 128 + os.constants.signals[signal] : code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, () => { child.kill(signal); });
