import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { PlaywrightTestConfig } from "@playwright/test";
import { pickFreePort } from "../../scripts/free-port.mjs";
import { resolvePackagedDesktopApp } from "../desktop/_app-target.js";

export const JOURNEY_ADMIN_USER = "admin";
export const JOURNEY_ADMIN_PASSWORD = "tovu-journeys";
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

interface SitePorts { api: number; admin: number; daemon: number }
export interface IsolatedJourneySite {
  suite: string;
  ownerPid: number;
  runtimeDir: string;
  siteDir: string;
  apiURL: string;
  adminURL: string;
  ports: SitePorts;
  database: "memory" | "sqlite";
  runtime: "default" | "local-cli";
  storageState: string;
  manifestPath: string;
  /** Set when `TOVU_E2E_PACKAGED_APP` names a released .app: its bundled server replaces source. */
  packaged?: { executablePath: string; payloadRoot: string; cliEntry: string; version: string };
}

/**
 * `TOVU_E2E_PACKAGED_APP=<Tovu.app>` runs the server SHIPPED in that bundle instead of source: the
 * app's own Electron binary as Node (`ELECTRON_RUN_AS_NODE=1`) on its `cliEntry`, `init` then
 * `serve`, the way `apps/desktop/src/tovu-server.ts` spawns it. That server also serves the bundled
 * admin build, so the admin origin IS the API origin (no Vite) and both ports collapse to `api`.
 */
function resolvePackagedServer(): IsolatedJourneySite["packaged"] {
  const appPath = process.env.TOVU_E2E_PACKAGED_APP;
  if (!appPath) return undefined;
  const app = resolvePackagedDesktopApp({ appPath });
  const manifest = JSON.parse(readFileSync(path.join(app.payloadRoot, "dist/runtime-manifest.json"), "utf8")) as { cliEntry: string };
  return { executablePath: app.executablePath, payloadRoot: app.payloadRoot, cliEntry: path.join(app.payloadRoot, manifest.cliEntry), version: app.version };
}

/**
 * The journeys boot, shared by the live chat suite. SQLite is required for real daemon turns:
 * the API and daemon must share principal IDs, attachments, chat messages and the durable ledger.
 * Configs are reloaded in Playwright workers, so inherit the runner's descriptor rather than
 * allocating a second site/port set. No instance or port is allocated until this is called.
 */
export async function createIsolatedJourneySite(
  { suite }: { suite: string },
  { ports, database = "memory", runtime = "default" }: {
    ports?: SitePorts; database?: IsolatedJourneySite["database"]; runtime?: IsolatedJourneySite["runtime"];
  } = {},
): Promise<IsolatedJourneySite> {
  const cacheKey = `TOVU_E2E_ISOLATED_${suite.replace(/\W/g, "_").toUpperCase()}`;
  const cached = process.env[cacheKey];
  if (cached) {
    const site = JSON.parse(cached) as IsolatedJourneySite;
    if (site.ownerPid !== process.pid && site.ownerPid !== process.ppid) {
      throw new Error(`${cacheKey} belongs to another runner; unset it before starting Playwright`);
    }
    if (site.suite !== suite || site.database !== database || site.runtime !== runtime) {
      throw new Error(`${cacheKey} does not match this suite's isolation options`);
    }
    return site;
  }
  if (runtime === "local-cli" && database !== "sqlite") {
    throw new Error("Real Local CLI journeys require a shared SQLite site database");
  }
  // Reuse the desktop's existing dual-loopback free-port scanner. Strict binds below fail if
  // another process takes a probed port; an existing server is never reused.
  const selected: number[] = [];
  if (!ports) {
    for (let i = 0; i < 3; i++) {
      const previous = selected.at(-1);
      const port = await pickFreePort({ start: previous === undefined ? 19_100 : previous + 1, span: 1_000 });
      if (port === null) throw new Error("No free port for isolated journey site");
      selected.push(port);
    }
    ports = { api: selected[0], admin: selected[1], daemon: selected[2] };
  }
  const packaged = resolvePackagedServer();
  if (packaged) ports = { ...ports, admin: ports.api };
  const runtimeDir = mkdtempSync(path.join(os.tmpdir(), `tovu-${suite}-`));
  const siteDir = path.join(runtimeDir, "sites", "journey-site");
  // `tovu init` creates the packaged site dir itself.
  mkdirSync(packaged ? path.dirname(siteDir) : siteDir, { recursive: true });
  const emptySeeds = path.join(runtimeDir, "empty-seeds");
  mkdirSync(emptySeeds);
  const site: IsolatedJourneySite = {
    suite, ownerPid: process.pid, runtimeDir, siteDir, ports, database, runtime,
    apiURL: `http://127.0.0.1:${ports.api}`,
    adminURL: `http://127.0.0.1:${ports.admin}`,
    storageState: path.join(runtimeDir, "storage-state.json"),
    manifestPath: path.join(runtimeDir, "boot.json"),
    ...(packaged ? { packaged } : {}),
  };
  const env: Record<string, string> = {
    NODE_ENV: "development",
    PORT: String(ports.api),
    TOVU_HOST: "127.0.0.1",
    TOVU_DB: database,
    TOVU_CONTENT_DB: path.join(siteDir, "content.db"),
    TOVU_CHAT_DB: path.join(siteDir, "chat.db"),
    TOVU_ADMIN_USER: JOURNEY_ADMIN_USER,
    TOVU_ADMIN_PASSWORD: JOURNEY_ADMIN_PASSWORD,
    TOVU_ADMIN_ASSISTANT: "on",
    TOVU_SITE: "journey-site",
    TOVU_SITE_DIR: siteDir,
    TOVU_AGENT_CWD: siteDir,
    TOVU_SKILLS_DIR: path.join(siteDir, "skills"),
    TOVU_AGENT_PLUGINS_DIR: path.join(siteDir, "agent-plugins"),
    TOVU_PLUGINS_DIR: path.join(siteDir, "plugins"),
    TOVU_MEDIA_UPLOADS_DIR: path.join(siteDir, "uploads"),
    // No stock snapshot (and its owner credentials): use the ordinary first-boot E2E/demo seed.
    TOVU_STOCK_CONTENT_SEED_DIR: emptySeeds,
    TOVU_PLUGIN_LOCAL_INSTALL: "1",
    TOVU_SITE_KEY: "a".repeat(64),
    TOVU_DISABLE_DEV_TLS: "1",
    JINI_AGENT_DAEMON_PORT: String(ports.daemon),
    JINI_AGENT_DAEMON_URL: `http://127.0.0.1:${ports.daemon}`,
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
    GEMINI_API_KEY: "",
    GOOGLE_API_KEY: "",
    TOVU_API_URL: site.apiURL,
    VITE_TOVU_SITE_URL: site.apiURL,
  };
  if (packaged) applyPackagedServerEnv(env, packaged);
  writeFileSync(site.manifestPath, JSON.stringify({ site, env }), { mode: 0o600 });
  process.env[cacheKey] = JSON.stringify(site);
  return site;
}

/**
 * The packaged app's child env (`tovu-server.ts` `buildCliEnv`/`buildServeEnv`): no `NODE_ENV`
 * (a Finder-launched app has none), the site's own SQLite rather than `TOVU_DB`/`TOVU_CONTENT_DB`,
 * `--port` rather than `PORT`, the bundled admin/site-chat builds, and a minted daemon token.
 */
function applyPackagedServerEnv(env: Record<string, string>, packaged: NonNullable<IsolatedJourneySite["packaged"]>): void {
  for (const key of ["NODE_ENV", "PORT", "TOVU_DB", "TOVU_CONTENT_DB"]) delete env[key];
  const { payloadRoot } = packaged;
  Object.assign(env, {
    ELECTRON_RUN_AS_NODE: "1",
    TOVU_ADMIN_DIST: path.join(payloadRoot, "apps/admin/dist"),
    TOVU_SITE_CHAT_DIST: path.join(payloadRoot, "apps/site-chat/dist"),
    TOVU_REPO_ROOT: payloadRoot,
    TOVU_AGENT_DAEMON_TOKEN: randomBytes(32).toString("hex"),
  });
}

/** Playwright owns both processes and shuts them down, including the API's supervised daemon. */
export function isolatedJourneyWebServers(
  { site }: { site: IsolatedJourneySite }, _optional = {},
): NonNullable<PlaywrightTestConfig["webServer"]> {
  const quote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
  const boot = `node --import tsx development/e2e/support/start-journey-site.mjs ${quote(site.manifestPath)}`;
  if (site.packaged) {
    return [{
      command: `${boot} packaged`, cwd: REPO_ROOT, url: `${site.adminURL}/admin/`,
      timeout: 120_000, reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    }];
  }
  return [
    {
      command: `${boot} api`, cwd: REPO_ROOT, url: site.apiURL,
      timeout: 120_000, reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
    {
      command: `${boot} admin`, cwd: REPO_ROOT, url: `${site.adminURL}/admin/`,
      timeout: 120_000, reuseExistingServer: false,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
    },
  ];
}
