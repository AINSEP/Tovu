import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, readFileSync, realpathSync, writeFileSync, watch } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PlaywrightWorkerArgs, TestInfo } from "@playwright/test";
import { collectProcessTreePids, listProcessSnapshots, stopProcesses } from "@jini-ai/platform";
import { test as journeyTest, expect } from "../journeys/_fixtures.js";
import { createIsolatedJourneySite, JOURNEY_ADMIN_USER, JOURNEY_ADMIN_PASSWORD, type IsolatedJourneySite } from "./isolated-journey-site.js";
import JourneySiteCleanupReporter from "./journey-site-cleanup-reporter.js";
import { pickFreePort } from "../../scripts/free-port.mjs";
import { pinSessionHeaders } from "./bug-pin-auth.js";

export * from "@playwright/test";
export { JOURNEY_ADMIN_PASSWORD };
/** Live bindings: every pin resolves its own site's origin after fixture setup. */
export let PUBLIC_URL = "";
export let ADMIN_URL = "";
/** Only a repository created by this test is ever published to or deleted. */
export let GITHUB_REPO = "";
export let GITHUB_OWNER = "";
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
type Playwright = PlaywrightWorkerArgs["playwright"];

/** Stop the wrapper and supervised daemon before deleting SQLite files. Escalation is bounded
 * and targets only process groups this test launched; it never searches/kills by port. */
async function stop(child: ChildProcess): Promise<void> {
  if (!child.pid) return;
  const alreadyExited = child.exitCode !== null || child.signalCode !== null;
  const exited = alreadyExited ? Promise.resolve() : new Promise<void>((resolve) => child.once("exit", () => resolve()));
  const signal = (value: NodeJS.Signals) => {
    try { if (process.platform === "win32") child.kill(value); else process.kill(-child.pid!, value); }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      // Darwin's killpg returns EPERM when the group holds only zombies (the leader exited before
      // its children were reaped). Signal the leader directly; stopProcesses below proves the tree.
      if (code === "EPERM") child.kill(value);
      else if (code !== "ESRCH") throw error;
    }
  };
  signal("SIGTERM");
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([exited, new Promise<void>((resolve) => { timer = setTimeout(resolve, 5_000); })]);
  clearTimeout(timer);
  // The API can exit before its supervised daemon finishes. Kill this owned group too.
  signal("SIGKILL");
  await exited;
}

async function waitForUrl({ url, children }: { url: string; children: ChildProcess[] }, _optional = {}): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Pin server exited (${child.exitCode ?? child.signalCode}); see pin-server.log`);
    }
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok) return; } catch { /* boot still in progress */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Pin server did not become ready: ${url}`);
}

/** The config-level sites take ports from 19_100 up at config load, and the media site's daemon
 * binds its reserved port only later. A pin probing the same range took that still-free daemon port
 * as its API port and failed with "port already in use", so pins scan their own range. */
async function pinPorts(): Promise<{ api: number; admin: number; daemon: number }> {
  const selected: number[] = [];
  for (let i = 0; i < 3; i++) {
    // Parallel test-queue lanes scan disjoint ranges (TOVU_JOURNEY_PORT_BASE), or their pin sites collide.
    const firstPort = Number(process.env.TOVU_JOURNEY_PORT_BASE ?? 9_100) + 20_000;
    const port = await pickFreePort({ start: selected.at(-1) === undefined ? firstPort : selected.at(-1)! + 1, span: 1_000 });
    if (port === null) throw new Error("No free port for an isolated pin site");
    selected.push(port);
  }
  return { api: selected[0], admin: selected[1], daemon: selected[2] };
}

/**
 * A bug pin can mutate settings, revoke sessions, exhaust a limiter, install packages, or create
 * rows via an actual agent. A shared DB with guessed DELETE routes cannot reliably undo these.
 * A worker-scoped owner now boots one SQLite site per FILE (workers remain 1), captures its fully
 * seeded DBs/files once, and restores them before each test. API writers drain and close; SQLite's
 * online backup updates the idle daemon's existing files safely. Cached imports, ports, admin
 * bundle and daemon survive, while request handlers/caches/limiters are recreated. Playwright's
 * fresh context clears cookies/storage, then loads only the seed session (or an explicit empty
 * storageState for auth pins). @isolated-site opts boot-sensitive pins into the original cold boot.
 * Teardown stops owned process trees and proves the ENTIRE runtime/site/snapshot deleted per file
 * or isolated pin, even after failure. Existing journey files keep their established fixtures.
 */
interface PinRuntime {
  site: IsolatedJourneySite;
  command(action: "snapshot" | "reset" | "shutdown"): Promise<void>;
  log(): string;
}

async function pinCommand(
  { child, action }: { child: ChildProcess; action: "snapshot" | "reset" | "shutdown" }, _optional = {},
): Promise<void> {
  const id = randomUUID();
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer); child.off("message", message); child.off("exit", exited);
      if (error) reject(error); else resolve();
    };
    const message = (response: { id?: string; ok?: boolean }) => {
      if (response.id === id) finish(response.ok ? undefined : new Error(`Pin ${action} failed; site cannot be reused`));
    };
    const exited = () => finish(new Error(`Pin API exited during ${action}`));
    const timer = setTimeout(() => finish(new Error(`Pin ${action} timed out`)), 90_000);
    child.on("message", message); child.once("exit", exited);
    child.send({ id, action }, (error) => { if (error) finish(error); });
  });
}

async function runPinSite(
  { playwright, pinApi, testInfo, warm, outboundTestOrigins = [], adminPassword = JOURNEY_ADMIN_PASSWORD, themeCaptures = false }: { playwright: Playwright; pinApi: boolean; testInfo: TestInfo; warm: boolean; outboundTestOrigins?: readonly string[]; adminPassword?: string; themeCaptures?: boolean },
  { use }: { use: (runtime: PinRuntime) => Promise<void> },
): Promise<void> {
  const realService = testInfo.tags.includes("@real-service");
  const live = testInfo.tags.includes("@live");
  if (realService && process.env.TOVU_E2E_REAL_SERVICES !== "1") throw new Error("Real-service pins require TOVU_E2E_REAL_SERVICES=1");
  const site = await createIsolatedJourneySite({ suite: `journeys-pins-${randomUUID()}` },
    { ports: await pinPorts(), database: "sqlite", runtime: realService || live ? "local-cli" : "default" });
  PUBLIC_URL = site.apiURL; ADMIN_URL = site.adminURL;
  const isPublishPin = testInfo.titlePath.includes("Bug pin: live-publish-e2e");
  const published = {
    E2E_API_PORT: String(site.ports.api), E2E_AGENT_DAEMON_PORT: String(site.ports.daemon),
    E2E_CAPABILITY_DISCOVERY_CONTENT_DB: path.join(site.siteDir, "content.db"),
    E2E_LIVE_PUBLISH_CONTENT_DB: path.join(site.siteDir, "content.db"), TOVU_CAPABILITY_MANIFEST_ARM: "off",
  };
  const prior = Object.fromEntries(Object.keys(published).map((key) => [key, process.env[key]]));
  let createdRepo: { owner: string; name: string } | undefined;
  const githubToken = process.env.TOVU_E2E_GITHUB_TOKEN;
  const children: ChildProcess[] = [];
  let apiChild: ChildProcess | undefined;
  const command = (action: "snapshot" | "reset" | "shutdown") => pinCommand({ child: apiChild!, action });
  let log = "";
  try {
    Object.assign(process.env, published);
    // The normal journeys boot blanks API keys. Live Gemini sends its explicitly supplied key
    // through the real credential UI instead of inheriting it into the server's environment.
    const manifest = JSON.parse(readFileSync(site.manifestPath, "utf8"));
    manifest.env.TOVU_CAPABILITY_MANIFEST_ARM = "off";
    // Explicit fixture input, never inherited from the operator's environment.
    manifest.env.TOVU_ADMIN_PASSWORD = adminPassword;
    if (themeCaptures) {
      if (warm) throw new Error("theme captures need a cold isolated site");
      // A switchable local boot under THIS runner's sites/ tree, never the checkout's sites/.
      // This enables the real per-theme capture queue without a parallel screenshot seam.
      manifest.apiCwd = site.runtimeDir;
      // macOS cwd resolves /var to /private/var. Match that canonical path so the binding's
      // direct-child check recognizes this runner's sites/ root and enables captures.
      manifest.env.TOVU_SITE_DIR = realpathSync(site.siteDir);
      manifest.env.TOVU_ENABLE_SITE_SWITCHER = "1";
    }
    if (warm) manifest.env.TOVU_E2E_PIN_RESET = "1";
    // Harness data for the `api-site-import` boot, never env: see support/site-import-api.ts.
    if (outboundTestOrigins.length) {
      if (warm) throw new Error("outboundTestOrigins needs a cold isolated site");
      manifest.outboundTestOrigins = outboundTestOrigins;
    }
    // These options lived in retired configs and must apply before the API imports its wiring.
    manifest.env.TOVU_EXPORT_DIR = path.join(site.siteDir, "out", "export");
    if (testInfo.titlePath.includes("Bug pin: static-site-tab")) {
      // Preview/publish pins must stay credential-free, including every descriptor env alias:
      // a runner's real token would turn the expected local refusal into an outbound publish.
      const deploy = JSON.parse(readFileSync(path.join(REPO_ROOT, "content/agent-plugins/deploy/tovu-deploy-targets.json"), "utf8")) as {
        targets: Array<{ id: string; env?: { tokenVars: string[] } }>;
      };
      for (const target of deploy.targets) {
        if (target.id !== "github-pages" && target.id !== "vercel") continue;
        for (const key of target.env?.tokenVars ?? []) manifest.env[key] = "";
      }
    }
    if (testInfo.titlePath.includes("Bug pin: static-site-tab-credentials")) {
      manifest.env.TOVU_EXECUTION_MODE = "hosted-api-only";
    }
    if (testInfo.titlePath.includes("Bug pin: dockerfile-tab-editable")) {
      // Never write/restore the shared checkout's Dockerfile, even after an assertion fails.
      manifest.apiCwd = site.runtimeDir;
      for (const relative of ["Dockerfile", "fly.toml", "apps/website/src/server/inbound/public-http/routes/ops/health.ts"]) {
        const destination = path.join(site.runtimeDir, relative);
        mkdirSync(path.dirname(destination), { recursive: true });
        copyFileSync(path.join(REPO_ROOT, relative), destination);
      }
    }
    writeFileSync(site.manifestPath, JSON.stringify(manifest), { mode: 0o600 });
    for (const target of pinApi ? [warm ? "pin-api" : outboundTestOrigins.length ? "api-site-import" : "api", "admin"] : ["admin"]) {
      const child = spawn(process.execPath, ["--import", "tsx", "development/e2e/support/start-journey-site.mjs", site.manifestPath, target],
        { cwd: REPO_ROOT, env: process.env, detached: process.platform !== "win32", stdio: target === "pin-api" ? ["ignore", "pipe", "pipe", "ipc"] : ["ignore", "pipe", "pipe"] });
      children.push(child);
      if (target === "pin-api") apiChild = child;
      child.stdout!.on("data", (chunk) => { log += `[${target}] ${chunk}`; });
      child.stderr!.on("data", (chunk) => { log += `[${target}] ${chunk}`; });
      child.on("error", (error) => { log += `[${target}] ${error.message}\n`; });
    }
    if (pinApi) await waitForUrl({ url: `${site.apiURL}/readyz`, children });
    await waitForUrl({ url: `${site.adminURL}/admin/`, children });
    if (!pinApi) { await use({ site, command, log: () => log }); return; }
    const api = await playwright.request.newContext({ baseURL: site.adminURL });
    try {
      const response = await api.post("/api/admin/v1/auth/login", { data: { username: JOURNEY_ADMIN_USER, password: adminPassword } });
      expect(response.ok(), `Pin login: ${await response.text()}`).toBe(true);
      await api.storageState({ path: site.storageState });
      const headers = await pinSessionHeaders({ request: api });
      if (isPublishPin) {
        // Explicit test credentials replace the old copy of the owner's database.
        const token = githubToken;
        const prefix = process.env.TOVU_E2E_GITHUB_REPO;
        if (!token || !prefix || !/^[a-zA-Z0-9-]{1,50}$/.test(prefix)) throw new Error("Live publish requires TOVU_E2E_GITHUB_TOKEN and TOVU_E2E_GITHUB_REPO (a 1-50 character repository-name prefix)");
        const name = `${prefix}-${randomUUID().slice(0, 8)}`;
        const created = await fetch("https://api.github.com/user/repos", {
          method: "POST", headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json" },
          body: JSON.stringify({ name, private: false, auto_init: true }), signal: AbortSignal.timeout(30_000),
        });
        expect(created.status, "Create this test's disposable GitHub Pages repository").toBe(201);
        const repository = await created.json() as { name: string; owner: { login: string } };
        createdRepo = { owner: repository.owner.login, name };
        expect(repository.name).toBe(name);
        GITHUB_REPO = name;
        GITHUB_OWNER = repository.owner.login;
        const credential = await api.post("/api/admin/v1/workspaces/workspace-local/system/publish/credentials", {
          headers,
          data: { label: "Journey GitHub Pages", connection: { providerId: "github-pages", token }, isDefault: true },
        });
        expect(credential.ok(), "The explicitly supplied test GitHub token was stored").toBe(true);
      }
      if (realService || live) {
        const saved = await api.put("/api/admin/v1/workspaces/workspace-local/settings/value", {
          headers,
          data: { namespace: "core.execution", key: "mode", scope: "workspace", valueJson: "local-cli" },
        });
        expect(saved.ok(), await saved.text()).toBe(true);
        const agent = await api.put("/api/admin/v1/workspaces/workspace-local/settings/value", {
          headers,
          data: { namespace: "core.execution", key: "localCli.agentId", scope: "workspace", valueJson: "claude" },
        });
        expect(agent.ok(), await agent.text()).toBe(true);
      }
    } finally { await api.dispose(); }
    // A failed baseline has no test to attach the server log to; carry its tail in the error.
    if (warm) await command("snapshot").catch((error: Error) => {
      throw new Error(`${error.message}\n--- pin server log (tail) ---\n${log.split("\n").slice(-60).join("\n")}`, { cause: error });
    });
    await use({ site, command, log: () => log });
  } finally {
    // Capture descendants before stopping their parents: daemon launchers own separate process
    // groups. Jini's existing process-tree stopper proves even those detached descendants exited.
    const owned = collectProcessTreePids(await listProcessSnapshots(), children.flatMap((child) => child.pid ? [child.pid] : []));
    const stopped = await Promise.allSettled(children.map(stop));
    const tree = await stopProcesses(owned);
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    delete process.env[`TOVU_E2E_ISOLATED_${site.suite.replace(/\W/g, "_").toUpperCase()}`];
    PUBLIC_URL = ""; ADMIN_URL = ""; GITHUB_REPO = ""; GITHUB_OWNER = "";
    let remoteCleanupFailure: Error | undefined;
    if (createdRepo) {
      try {
        const removed = await fetch(`https://api.github.com/repos/${encodeURIComponent(createdRepo.owner)}/${encodeURIComponent(createdRepo.name)}`, {
          method: "DELETE", headers: { authorization: `Bearer ${githubToken}`, accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30_000),
        });
        expect(removed.status, `Delete this test's repository ${createdRepo.owner}/${createdRepo.name}`).toBe(204);
      } catch (error) { remoteCleanupFailure = error instanceof Error ? error : new Error(String(error)); }
    }
    expect(tree.remainingPids, "all processes owned by this pin site exited").toEqual([]);
    const failures = stopped.filter((result) => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((result) => (result as PromiseRejectedResult).reason), "Pin servers did not stop; isolated site retained");
    const cleaned = await new JourneySiteCleanupReporter({ site }).onEnd();
    // Evidence attachment must never prevent deletion if the test already timed out.
    try { if (!warm) await testInfo.attach("pin-server.log", { body: log, contentType: "text/plain" }); }
    finally {
      expect(cleaned?.status, "the pin's entire isolated site was deleted").not.toBe("failed");
      if (remoteCleanupFailure) throw remoteCleanupFailure;
    }
  }

}

/** A worker can execute multiple files. The reporter signals completed files; file transitions
 * and worker teardown also close owners after interrupted hooks. Isolated-only files allocate
 * no shared site, and failures in lazy boot still run the same proven cleanup. */
interface PinSites {
  acquire(required: { testInfo: TestInfo }): Promise<PinRuntime>;
  selectFile(required: { file: string }): Promise<void>;
  close(required: { file: string }): Promise<void>;
}

/** Stock themes (paths under `content/themes`) each pin needs installed in its disposable site,
 * keyed by the pin's describe title. Pins that render or explore a shipped theme name it by id. */
const PIN_STOCK_THEMES: Record<string, readonly string[]> = {
  "Bug pin: site-chat-fab-presence": ["static/tovu-theme"],
  "Bug pin: theme-visual": ["static/tovu-theme"],
  "Bug pin: theme-explore-file-switch": ["static/tovu-theme"],
  "Bug pin: theme-explore-narrow-sidebar": ["static/tovu-theme"],
  "Bug pin: theme-liquid-preview": ["templated/storefront", "templated/fashion-modern"],
};

async function configurePin(
  { playwright, site, testInfo }: { playwright: Playwright; site: IsolatedJourneySite; testInfo: TestInfo }, _optional = {},
): Promise<void> {
  const api = await playwright.request.newContext({ baseURL: site.adminURL, storageState: site.storageState,
    extraHTTPHeaders: await pinSessionHeaders({ storageState: site.storageState }) });
  try {
    // Public/theme pins exercise the shipped theme. Enable the public widget through its
    // real settings route, exactly as the old globalSetups did; all credentials remain blank.
    const publicAssistant = path.basename(testInfo.file) === "site-chat.pins.journey.ts";
    const shippedTheme = testInfo.titlePath.some((title) => title === "Bug pin: site-chat-fab-presence" || title === "Bug pin: theme-visual");
    const stockThemes = [...new Set(testInfo.titlePath.flatMap((title) => PIN_STOCK_THEMES[title] ?? []))];
    if (stockThemes.length) {
      // New sites intentionally seed only tovu-starter. Install the pin's required stock themes
      // in its disposable site, then use the real rescan route to refresh boot-time discovery.
      // The existing per-test reset and site teardown own removal of these fixture copies.
      for (const theme of stockThemes) {
        cpSync(path.join(REPO_ROOT, "content/themes", theme), path.join(site.siteDir, "themes", theme), { recursive: true });
      }
      const rescanned = await api.post("/api/admin/v1/workspaces/workspace-local/themes/rescan");
      expect(rescanned.ok(), "Pin setup theme rescan succeeded").toBe(true);
      const available = (await rescanned.json()).availableThemeIds;
      for (const theme of stockThemes) expect(available).toContain(path.basename(theme));
    }
    if (publicAssistant || shippedTheme) {
      for (const [url, data] of [
        ...(publicAssistant ? [["assistant/settings", { publicEnabled: true }]] as const : []),
        ...(shippedTheme ? [["presentation", { activeThemeId: "tovu-theme" }]] as const : []),
      ] as const) {
        const saved = url === "presentation"
          ? await api.patch(`/api/admin/v1/workspaces/workspace-local/${url}`, { data })
          : await api.put(`/api/admin/v1/workspaces/workspace-local/${url}`, { data });
        expect(saved.ok(), `Pin setup ${url}: ${await saved.text()}`).toBe(true);
        const body = await saved.json();
        if (url === "assistant/settings") expect(body.data.publicEnabled).toBe(true);
        else expect(JSON.stringify(body)).toContain('"activeThemeId":"tovu-theme"');
      }
    }
  } finally { await api.dispose(); }
}

export const test = journeyTest.extend<{ pinApi: boolean; outboundTestOrigins: string[]; pinAdminPassword: string; pinThemeCaptures: boolean }, { pinSites: PinSites }>({
  /** `false` serves only the prebuilt admin, so its proxy targets an API port nothing listens on
   * (the old login-api-down config's "Vite up, API deliberately unreachable" shape). */
  pinApi: [true, { option: true }],
  /** Exact loopback origins the site's URL tools may reach (a fixture site). Non-empty boots a cold
   * isolated site through the `api-site-import` target; production boots never receive one. */
  outboundTestOrigins: [[], { option: true }],
  pinAdminPassword: [JOURNEY_ADMIN_PASSWORD, { option: true }],
  pinThemeCaptures: [false, { option: true }],
  pinSites: [async ({ playwright }, use) => {
    const files = new Map<string, { runtime: Promise<PinRuntime>; release: () => void; finished: Promise<void> }>();
    const close = async ({ file }: { file: string }) => {
      const entry = files.get(file);
      if (!entry) return;
      entry.release();
      try { await entry.finished; } finally { files.delete(file); }
    };
    try {
      await use({ close, selectFile: async ({ file }) => {
        for (const previous of [...files.keys()]) if (previous !== file) await close({ file: previous });
      }, acquire: async ({ testInfo }) => {
        let entry = files.get(testInfo.file);
        if (!entry) {
          let ready!: (runtime: PinRuntime) => void;
          let failed!: (error: unknown) => void;
          let release!: () => void;
          const runtime = new Promise<PinRuntime>((resolve, reject) => { ready = resolve; failed = reject; });
          const released = new Promise<void>((resolve) => { release = resolve; });
          const finished = runPinSite({ playwright, pinApi: true, testInfo, warm: true }, {
            use: async (site) => {
              const completion = watch(site.site.runtimeDir, (_event, filename) => {
                if (String(filename) === "file-complete") release();
              });
              completion.unref();
              completion.once("error", release);
              try { ready(site); await released; } finally { completion.close(); }
            },
          });
          void finished.catch(failed);
          entry = { runtime, release, finished };
          files.set(testInfo.file, entry);
        }
        return entry.runtime;
      } });
    } finally {
      const closed = await Promise.allSettled([...files.keys()].map((file) => close({ file })));
      const failed = closed.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failed.length) throw new AggregateError(failed.map((result) => result.reason), "Pin file cleanup failed");
    }
  }, { scope: "worker", timeout: 180_000 }],
  journeySite: [async ({ playwright, pinApi, pinSites, outboundTestOrigins, pinAdminPassword, pinThemeCaptures }, use, testInfo) => {
    await pinSites.selectFile({ file: testInfo.file });
    const cold = testInfo.tags.includes("@isolated-site") || testInfo.tags.includes("@real-service") || testInfo.tags.includes("@live") || !pinApi || outboundTestOrigins.length > 0 || pinAdminPassword !== JOURNEY_ADMIN_PASSWORD || pinThemeCaptures;
    const run = async (runtime: PinRuntime) => {
      const { site } = runtime;
      PUBLIC_URL = site.apiURL; ADMIN_URL = site.adminURL;
      if (!cold) await testInfo.attach("pin-site-owner", { body: Buffer.from(site.runtimeDir), contentType: "text/plain" });
      if (pinApi) await configurePin({ playwright, site, testInfo });
      try { await use(site); }
      finally {
        PUBLIC_URL = ""; ADMIN_URL = "";
        if (!cold) await testInfo.attach("pin-server.log", { body: runtime.log(), contentType: "text/plain" });
      }
    };
    if (cold) await runPinSite({ playwright, pinApi, testInfo, warm: false, outboundTestOrigins, adminPassword: pinAdminPassword, themeCaptures: pinThemeCaptures }, { use: run });
    else {
      const runtime = await pinSites.acquire({ testInfo });
      await runtime.command("reset");
      await run(runtime);
    }
  }, { scope: "test", timeout: 180_000 }],
  baseURL: async ({ journeySite }, use, testInfo) => {
    const publicPin = path.basename(testInfo.file) === "site-chat.pins.journey.ts" || testInfo.titlePath.some((title) => title === "Bug pin: theme-visual");
    await use(publicPin ? journeySite.apiURL : journeySite.adminURL);
  },
  storageState: async ({ journeySite }, use) => { await use(journeySite.storageState); },
});
