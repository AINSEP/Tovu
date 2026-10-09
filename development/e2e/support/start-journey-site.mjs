import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { journeyAdminBundle } from "./journey-admin-bundle.mjs";

// Run inside Playwright's webServer process. Clear owner site/DB/daemon overrides BEFORE loading
// any application code; retain HOME/PATH and Claude's authentication for the real Local CLI.
const [manifestPath, target] = process.argv.slice(2);
if (!manifestPath || !["api", "pin-api", "api-site-import", "api-with-site-chat", "admin", "packaged"].includes(target)) throw new Error("Expected boot.json and api|pin-api|api-site-import|admin|packaged");
// `outboundTestOrigins`: harness-written, read only by the `api-site-import` target below.
const { site, env, apiCwd, outboundTestOrigins } = JSON.parse(readFileSync(manifestPath, "utf8"));
// Capture the runner's shared build owner before clearing inherited site overrides below.
const adminBuildOwner = process.env.TOVU_E2E_ISOLATED_JOURNEYS
  ? JSON.parse(process.env.TOVU_E2E_ISOLATED_JOURNEYS).runtimeDir : site.runtimeDir;
for (const key of Object.keys(process.env)) {
  if (/^(TOVU_|JINI_|VITE_TOVU_)/.test(key)) delete process.env[key];
}
// A Finder-launched app has no NODE_ENV; its child env (boot.json) deliberately omits one.
if (target === "packaged") delete process.env.NODE_ENV;
Object.assign(process.env, env);
// A Claude-driven coordinator can otherwise make Claude reject this independent assistant run
// as a nested interactive session. These are invocation markers, not authentication settings.
delete process.env.CLAUDECODE;
delete process.env.CLAUDE_CODE_ENTRYPOINT;
const repoRoot = path.resolve(import.meta.dirname, "../../..");
const adminDist = target === "packaged" ? undefined : await journeyAdminBundle({ runtimeDir: adminBuildOwner, repoRoot });
if (adminDist) process.env.TOVU_ADMIN_DIST = adminDist;
if (target !== "packaged") process.env.TOVU_SITE_CHAT_DIST = path.join(adminBuildOwner, "site-chat-dist");
if (target === "packaged") {
  // The released app's own server: `init` then `serve`, from a cwd outside the repo like Finder's.
  const { executablePath, cliEntry } = site.packaged;
  const cwd = site.runtimeDir;
  // Packaged journeys exercise sample pages; production creation remains blank by default.
  const init = spawnSync(executablePath, [cliEntry, "init", site.siteDir, "--with-sample-content"], { cwd, env: process.env, stdio: "inherit" });
  if (init.status !== 0) throw new Error(`packaged tovu init failed (status ${init.status}, signal ${init.signal})`);
  const serve = spawn(executablePath, [cliEntry, "serve", site.siteDir, "--port", String(site.ports.api)], { cwd, env: process.env, stdio: "inherit" });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => serve.kill(signal));
  serve.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
} else if (target === "api" || target === "pin-api" || target === "api-site-import" || target === "api-with-site-chat") {
  if (target === "api-with-site-chat") {
    // The migrated public-widget pins test build output. Build once before any test can start,
    // matching the old site-assistant config; no Jini package/dist build is performed.
    const built = spawnSync(process.execPath, ["apps/site-chat/node_modules/vite/bin/vite.js", "build", "apps/site-chat", "--config", "apps/site-chat/vite.config.ts", "--outDir", process.env.TOVU_SITE_CHAT_DIST],
      // The journey env's NODE_ENV=development makes plugin-react emit jsxDEV calls, while the
      // bundle's own `define` resolves React to its production build, whose jsxDEV is undefined
      // ("jsxDEV is not a function"). Build as the shipped bundle is built: production.
      { cwd: repoRoot, env: { ...process.env, NODE_ENV: "production" }, stdio: "inherit" });
    if (built.status !== 0) throw new Error(`journeys site-chat build failed (${built.status ?? built.signal})`);
  }
  // Dockerfile pins use a disposable cwd because the real route resolves process.cwd().
  process.chdir(apiCwd ?? repoRoot);
  if (target === "pin-api") {
    const { startResettablePinApi } = await import("./resettable-pin-api.ts");
    await startResettablePinApi({ siteDir: site.siteDir, runtimeDir: site.runtimeDir, port: site.ports.api });
  } else if (target === "api-site-import") {
    // The only boot that opens the guarded URL tools to a loopback fixture origin; see site-import-api.ts.
    const { startSiteImportApi } = await import("./site-import-api.ts");
    await startSiteImportApi({ port: site.ports.api, outboundTestOrigins: outboundTestOrigins ?? [] });
  } else await import(pathToFileURL(path.join(repoRoot, "apps/website/src/index.ts")).href);
} else {
  const adminRoot = path.join(repoRoot, "apps/admin");
  const { preview } = await import(pathToFileURL(path.join(adminRoot, "node_modules/vite/dist/node/index.js")).href);
  const { destroyClientWhenUpstreamCloses } = await import(pathToFileURL(path.join(adminRoot, "dev-proxy-upstream-close.ts")).href);
  process.chdir(adminRoot);
  // Vite preview serves only the prebuilt files: no module transforms, dependency optimizer,
  // source watchers or HMR. Retain the real configure hook's SSE cleanup/API-down 503 contract.
  const previewServer = await preview({ root: adminRoot, build: { outDir: adminDist }, preview: {
    host: "127.0.0.1", port: site.ports.admin, strictPort: true,
    proxy: { "^/(?!admin(?:/|$))": { target: site.apiURL, changeOrigin: false, configure: destroyClientWhenUpstreamCloses } },
  } });
  const server = previewServer.httpServer;
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
    server.close(); server.closeAllConnections();
  });
}
