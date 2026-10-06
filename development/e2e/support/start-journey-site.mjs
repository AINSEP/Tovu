import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Run inside Playwright's webServer process. Clear owner site/DB/daemon overrides BEFORE loading
// any application code; retain HOME/PATH and Claude's authentication for the real Local CLI.
const [manifestPath, target] = process.argv.slice(2);
if (!manifestPath || !["api", "admin"].includes(target)) throw new Error("Expected boot.json and api|admin");
const { site, env } = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const key of Object.keys(process.env)) {
  if (/^(TOVU_|JINI_|VITE_TOVU_)/.test(key)) delete process.env[key];
}
Object.assign(process.env, env);
// A Claude-driven coordinator can otherwise make Claude reject this independent assistant run
// as a nested interactive session. These are invocation markers, not authentication settings.
delete process.env.CLAUDECODE;
delete process.env.CLAUDE_CODE_ENTRYPOINT;
const repoRoot = path.resolve(import.meta.dirname, "../../..");
if (target === "api") {
  process.chdir(repoRoot);
  await import(pathToFileURL(path.join(repoRoot, "apps/website/src/index.ts")).href);
} else {
  const adminRoot = path.join(repoRoot, "apps/admin");
  const vite = path.join(adminRoot, "node_modules/vite/bin/vite.js");
  process.chdir(adminRoot);
  process.argv = [process.execPath, vite, "--host", "127.0.0.1", "--port", String(site.ports.admin), "--strictPort"];
  await import(pathToFileURL(vite).href);
}
