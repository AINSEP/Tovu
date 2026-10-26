import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { Writable } from "node:stream";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { journeyAdminBundle } from "./journey-admin-bundle.mjs";

// Run inside Playwright's webServer process. Clear owner site/DB/daemon overrides BEFORE loading
// any application code; retain HOME/PATH and Claude's authentication for the real Local CLI.
const [manifestPath, target] = process.argv.slice(2);
if (!manifestPath || !["api", "pin-api", "api-site-import", "api-with-site-chat", "admin", "packaged", "soak"].includes(target)) throw new Error("Expected boot.json and api|pin-api|api-site-import|admin|packaged|soak");
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
const adminDist = ["packaged", "soak"].includes(target) ? undefined : await journeyAdminBundle({ runtimeDir: adminBuildOwner, repoRoot });
if (adminDist) process.env.TOVU_ADMIN_DIST = adminDist;
if (!["packaged", "soak"].includes(target)) process.env.TOVU_SITE_CHAT_DIST = path.join(adminBuildOwner, "site-chat-dist");
if (target === "soak") {
  await startSoakSite({ site, repoRoot });
} else if (target === "packaged") {
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
    // Use the same three configs/order as site-chat's build:local script. React alone leaves
    // readiness false and silently serves the eager fallback instead of exercising the loader.
    for (const config of ["vite.config.ts", "vite.lazy.config.ts", "vite.vanilla.config.ts"]) {
      const built = spawnSync(process.execPath, ["apps/site-chat/node_modules/vite/bin/vite.js", "build", "apps/site-chat", "--config", `apps/site-chat/${config}`, "--outDir", process.env.TOVU_SITE_CHAT_DIST],
        // The journey env's NODE_ENV=development makes plugin-react emit jsxDEV calls, while the
        // bundle's own `define` resolves React to its production build, whose jsxDEV is undefined
        // ("jsxDEV is not a function"). Build as the shipped bundle is built: production.
        { cwd: repoRoot, env: { ...process.env, NODE_ENV: "production" }, stdio: "inherit" });
      if (built.status !== 0) throw new Error(`journeys site-chat ${config} build failed (${built.status ?? built.signal})`);
    }
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

/** Real compiled init/serve; only the serve child exposes a private inspector, never an HTTP GC hook.
 * The existing server handle owns shutdown. Inspector data stays in the mode-0600 scratch file.
 * @complexity O(1) harness work plus the existing CLI lifecycle.
 */
async function startSoakSite({ site, repoRoot }, _options = {}) {
  const { initSiteDir } = await import("../../../apps/desktop/src/site-dir-store.ts");
  const { startTovuServer } = await import("../../../apps/desktop/src/tovu-server.ts");
  await initSiteDir({ repoRoot, dir: site.siteDir, cliMode: "compiled", baseEnv: process.env,
    adminPassword: env.TOVU_ADMIN_PASSWORD,
    spawnFn: (command, args, options) => spawn(command, [...args, "--with-sample-content"], { ...options, cwd: site.runtimeDir }),
  });
  let inspectorOutput = "";
  let server;
  try {
    server = await startTovuServer({ repoRoot, siteDir: site.siteDir, port: site.ports.api,
      cliMode: "compiled", baseEnv: process.env, readyTimeoutMs: 180_000,
      desktopCredential: { username: env.TOVU_ADMIN_USER, password: env.TOVU_ADMIN_PASSWORD },
      // Inspector stderr includes a capability URL; keep it out of Playwright/CI diagnostics.
      mirror: { stdout: process.stdout, stderr: new Writable({ write(_chunk, _encoding, done) { done(); } }) },
      spawnFn: (command, args, options) => {
        const child = spawn(command, ["--expose-gc", "--inspect=127.0.0.1:0", ...args], { ...options, cwd: site.runtimeDir });
        child.stderr.on("data", chunk => { inspectorOutput = (inspectorOutput + chunk.toString()).slice(-8192); });
        return child;
      },
    });
    const inspectorURL = inspectorOutput.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/)?.[0];
    if (!inspectorURL) throw new Error("Missing serve inspector");
    writeFileSync(path.join(site.runtimeDir, "soak-server.json"), JSON.stringify({ pid: server.pid, inspectorURL, workspaceId: server.workspaceId }), { mode: 0o600 });
  } catch {
    await server?.stop();
    throw new Error("Soak compiled init/serve instrumentation failed (private diagnostics withheld)");
  }
  let stopping = false;
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, async () => {
    stopping = true;
    await server.stop();
    process.exit(0);
  });
  server.onExit(() => { if (!stopping) process.exit(1); });
}
