import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
/** Host adapter: Jini owns native process lifecycle; Tovu owns site boot and credential isolation. */
import path from "node:path";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { allocatePort, readLiveDaemonRegistryRecord } from "@jini-ai/sidecar";
import { createNodeDaemonProcessAdapter } from "@jini-ai/sidecar/supervisor/node";
import { listProcessSnapshots, readFlagValue } from "@jini-ai/platform";
import type { SpawnedDaemonProcess } from "@jini-ai/sidecar/supervisor";
import type { LocalSiteProcessPort, LocalSiteProcess } from "#src/platform/site-dir/local-site-supervisor";
import { LocalSiteError, assertLocalSiteName } from "#src/platform/site-dir/local-site-supervisor";
import { readSiteDir } from "#src/platform/site-dir/read-site-dir";
import { resolveCheckoutRoot } from "#src/platform/site-dir/product-root";
import { resolveDevTls, resolveDevTlsCertPaths } from "../boot/dev-tls.js";

/** Allowlist OS necessities, then supply site-scoped values. Never inherit deploy/provider secrets.
 * HOME permits the site's own key resolver and local CLI authentication; no shell env file is loaded.
 * @complexity O(1): the allowlist is fixed regardless of parent environment size.
 */
export function localSiteChildEnv(
  { parent, siteDir, name, port, daemonPort, repoRoot, buildRoot }: { parent: NodeJS.ProcessEnv; siteDir: string; name: string; port: number; daemonPort: number; repoRoot: string; buildRoot: string },
  _optional = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LANG", "LC_ALL"]) {
    if (parent[key] !== undefined) env[key] = parent[key];
  }
  return { ...env, NODE_ENV: "development", PORT: String(port), TOVU_HOST: "127.0.0.1",
    TOVU_SITE: name, TOVU_SITE_DIR: siteDir, TOVU_AGENT_CWD: siteDir,
    TOVU_REPO_ROOT: repoRoot, TOVU_LOCAL_ADMIN_BUILD_ROOT: buildRoot, TOVU_LOCAL_SITE_OWNER_PID: String(process.pid),
    TOVU_ENABLE_SITE_SWITCHER: "0",
    TOVU_API_URL: `http://127.0.0.1:${port}`, JINI_AGENT_DAEMON_PORT: String(daemonPort),
    JINI_AGENT_DAEMON_URL: `http://127.0.0.1:${daemonPort}`,
    ...(parent.TOVU_DISABLE_DEV_TLS === undefined ? {} : { TOVU_DISABLE_DEV_TLS: parent.TOVU_DISABLE_DEV_TLS }),
  };
}

function localResponseOk(url: string, ca?: Buffer): Promise<boolean> {
  return new Promise((resolve) => {
    const receive = (res: import("node:http").IncomingMessage) => { res.resume(); resolve(res.statusCode === 200); };
    const request = url.startsWith("https:")
      ? httpsGet(url, { ca, servername: "localhost", timeout: 1500 }, receive)
      : httpGet(url, { timeout: 1500 }, receive);
    request.once("timeout", () => { request.destroy(); resolve(false); });
    request.once("error", () => resolve(false));
  });
}

/** Bind native effects without starting any child. @complexity O(1) assembly; tree-stop O(processes). */
export function createLocalSiteProcessPort(
  { switcherBase }: { switcherBase: string }, { env = process.env }: { env?: NodeJS.ProcessEnv } = {},
): LocalSiteProcessPort {
  const repoRoot = resolveCheckoutRoot();
  const tls = resolveDevTls(resolveDevTlsCertPaths(repoRoot), { env });
  const scheme = tls.active ? "https" : "http";
  let buildRoot: string | undefined;
  const registry = { readLive: async () => null, write: async () => {}, removeIfCurrent: async () => {} };
  return {
    async isPortFree({ port }) {
      try { await allocatePort({}, { port, host: "127.0.0.1" }); } catch { return false; }
      try { await allocatePort({}, { port, host: "::1" }); }
      catch (error) {
        // Missing IPv6 says nothing about a port on our IPv4 listener; a collision still refuses.
        return /EADDRNOTAVAIL|EAFNOSUPPORT/.test(error instanceof Error ? error.message : "");
      }
      return true;
    },
    async dispose() { if (buildRoot) await rm(buildRoot, { recursive: true, force: true }); },
    schedule({ run, delayMs }) { const timer = setTimeout(run, delayMs); timer.unref(); return () => clearTimeout(timer); },
    async launch({ name, port, daemonPort }): Promise<LocalSiteProcess> {
      assertLocalSiteName({ name });
      const siteDir = path.join(switcherBase, "sites", name);
      // Realpath containment is checked by the directory owner before either boot or Trash.
      const { assertManagedSiteDirectory } = await import("#src/platform/site-dir/site-trash");
      assertManagedSiteDirectory({ base: switcherBase, name });
      readSiteDir({ dir: siteDir });
      buildRoot ??= mkdtempSync(path.join(os.tmpdir(), "tovu-local-sites-"));
      const childEnv = localSiteChildEnv({ parent: env, name, siteDir, port, daemonPort, repoRoot, buildRoot });
      childEnv.TOVU_API_URL = `${scheme}://localhost:${port}`;
      // Match packaged journeys: a supplied production admin bundle can be shared without rebuilding.
      if (env.TOVU_ADMIN_DIST) childEnv.TOVU_ADMIN_DIST = env.TOVU_ADMIN_DIST;
      const compiled = import.meta.filename.endsWith(".js");
      const entry = path.join(repoRoot, "apps/website/src/platform/site-dir/local-site-child.ts");
      const compiledEntry = fileURLToPath(new URL("../../../platform/site-dir/local-site-child.js", import.meta.url));
      const adapter = createNodeDaemonProcessAdapter({ command: process.execPath,
        args: compiled ? [compiledEntry] : ["--import", "tsx", entry], cwd: repoRoot, env: childEnv, registry }, {});
      const child = adapter.spawnDaemonProcess();
      if (child.pid === undefined) throw new LocalSiteError("SITE_START_FAILED");
      let exited = false;
      const listeners = new Set<() => void>();
      child.on({ event: "exit", listener: () => { exited = true; for (const listener of listeners) listener(); } });
      child.on({ event: "error", listener: () => { exited = true; for (const listener of listeners) listener(); } });
      let daemon: SpawnedDaemonProcess | undefined;
      async function discoverDaemon() {
        const record = await readLiveDaemonRegistryRecord({ registryPath: path.join(siteDir, "ops/assistant-daemon.json") });
        const pid = record?.port === daemonPort ? record.pid : daemon?.pid;
        if (pid === undefined) return;
        const live = (await listProcessSnapshots()).find((item) => item.pid === pid);
        const owner = live ? readFlagValue(live.command.trim().split(/\s+/), "--local-site-api-pid") : null;
        if (!live?.command.includes("agent-daemon-server") || owner !== String(child.pid)) { daemon = undefined; return; }
        daemon = { pid, on() {}, kill(_required, { signal = "SIGTERM" } = {}) {
          try { process.kill(pid, signal); return true; } catch { return false; }
        } };
      }
      return {
        pid: child.pid,
        onExit({ listener }) { listeners.add(listener); if (exited) listener(); },
        async ready() {
          await discoverDaemon();
          if (exited) return false;
          return (await localResponseOk(`${scheme}://127.0.0.1:${port}/readyz`, tls.credentials?.cert)) &&
            (await localResponseOk(`${scheme}://127.0.0.1:${port}/admin/`, tls.credentials?.cert));
        },
        async terminate() {
          try { await discoverDaemon(); } catch { /* Tree teardown must still run when discovery fails. */ }
          // A daemon detaches into its own group. Keep its identity even after API crash/reparenting.
          await adapter.terminateProcess({ child });
          await discoverDaemon();
          if (daemon) await adapter.terminateProcess({ child: daemon });
        },
        killNow() {
          void adapter.terminateProcess({ child }).catch(() => {});
          if (daemon) void adapter.terminateProcess({ child: daemon }).catch(() => {});
        },
      };
    },
  };
}
