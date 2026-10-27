import { listSites } from "#src/platform/site-dir/site-registry";
import { runningSiteUrl } from "#src/platform/site-dir/site-running";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { format } from "node:util";
/** Host adapter: Jini owns native process lifecycle; Tovu owns site boot and credential isolation. */
import path from "node:path";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import { redactLocalText } from "../../../platform/server-logs/redact-local-text.js";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { allocatePort, readLiveDaemonRegistryRecord } from "@jini-ai/sidecar";
import { createNodeDaemonProcessAdapter } from "@jini-ai/sidecar/supervisor/node";
import { listProcessSnapshots, readFlagValue } from "@jini-ai/platform/process";
import { omitEnvironmentKeys } from "@jini-ai/platform/child-environment";
import type { SpawnedDaemonProcess } from "@jini-ai/sidecar/supervisor";
import type { LocalSiteProcessPort, LocalSiteProcess } from "#src/platform/site-dir/local-site-supervisor";
import { LocalSiteError, assertLocalSiteName } from "#src/platform/site-dir/local-site-supervisor";
import { readSiteDir } from "#src/platform/site-dir/read-site-dir";
import { resolveCheckoutRoot } from "#src/platform/site-dir/product-root";
import { resolveDevTls, resolveDevTlsCertPaths } from "../boot/dev-tls.js";
import { resolveLocalOwnerSignIn } from "../boot/local-owner-signin.js";
import { createLogBuffer, createRotatingLogFileSink } from "#src/platform/server-logs/index";
import { redactSecretShapes } from "#src/contracts/core/secret-redaction";

/** Bind site-child diagnostics to a separate parent-owned file; the child owns server.log.
 * Reuses the existing redactor, bounded buffer and synchronous rotating sink. Native fatal errors
 * bypass console capture, so retain stderr until exit/pipe close, including split writes.
 * @returns A stderr sink, lifecycle observer and breadcrumb writer; no process policy changes.
 * @complexity O(chunk bytes) per write, at most the latest 65536 raw characters retained; redact before
 * taking the 4096-character diagnostic tail so a sliced vendor-token prefix cannot leak its suffix.
 */
export function localSiteProcessLog({ name, siteDir }: { name: string; siteDir: string }, _options = {}) {
  const redact = (text: string) => redactLocalText({ text: redactSecretShapes({ text }).text });
  const buffer = createLogBuffer({ redact });
  const sink = createRotatingLogFileSink({ filePath: path.join(siteDir, "ops/logs/local-site.log") });
  let stderrText = "";
  // A rolling window, never a latch: a native crash's tail comes last, after any verbose startup.
  const retain = (text: string) => { stderrText = (stderrText + text).slice(-65_536); };
  const decoder = new StringDecoder("utf8");
  const record = ({ message, level = "info", includeStderr = false }: { message: string; level?: "info" | "error"; includeStderr?: boolean }, _optional = {}) => {
    const tail = includeStderr ? `; stderr tail=${redact(stderrText).slice(-4096)}` : "";
    const entry = buffer.append({ level, source: "server", message: `[local-site ${name}] ${message}${tail}` });
    sink.write(entry);
    // A full/unwritable site disk must still leave evidence in the serving host's log.
    if (!sink.isHealthy()) console.error(entry.message);
  };
  const stderr = new Writable({
    write(chunk, _encoding, done) {
      retain(decoder.write(chunk));
      done();
    },
    final(done) {
      retain(decoder.end());
      record({ message: "stderr closed", includeStderr: true }); done();
    },
  });
  return { stderr, record, observe({ child }: { child: SpawnedDaemonProcess }, _optional = {}) {
    record({ message: `spawned pid=${child.pid ?? "none"}` });
    child.on({ event: "exit", listener: ({ code, signal }) => {
      record({ level: code === 0 ? "info" : "error", includeStderr: true, message: `pid=${child.pid ?? "none"} exited code=${code ?? "none"} signal=${signal ?? "none"}` });
    } });
    child.on({ event: "error", listener: ({ error }) => {
      record({ level: "error", includeStderr: true, message: `pid=${child.pid ?? "none"} process error=${format(error)}` });
    } });
  } };
}

/** Allowlist OS necessities, then supply site-scoped values. Never inherit deploy/provider secrets.
 * HOME permits the site's own key resolver and local CLI authentication; no shell env file is loaded.
 * Warn when dropping installed-store overrides; bundled product sources are not installed state.
 * @complexity O(n) time/space for the isolated parent copy; the OS allowlist is fixed.
 */
export function localSiteChildEnv(
  { parent, siteDir, name, port, daemonPort, repoRoot, buildRoot }: { parent: NodeJS.ProcessEnv; siteDir: string; name: string; port: number; daemonPort: number; repoRoot: string; buildRoot: string },
  { pathExists, warn = console.warn }: { pathExists?: (path: string) => boolean; warn?: (message: string) => void } = {},
): NodeJS.ProcessEnv {
  const isolated = omitEnvironmentKeys({ env: parent,
    keys: ["TOVU_PLUGINS_DIR", "TOVU_SKILLS_DIR", "TOVU_AGENT_PLUGINS_DIR"],
  }, { caseInsensitive: process.platform === "win32" });
  if (isolated.omitted.length) {
    warn(`tovu local sites: dropped inherited ${isolated.omitted.join(", ")}; spawned sites use their own plugin and skill folders. Set overrides only for a direct single-site run.`);
  }
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "TEMP", "TMP", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "LANG", "LC_ALL"]) {
    if (isolated.env[key] !== undefined) env[key] = isolated.env[key];
  }
  return { ...env, NODE_ENV: "development", PORT: String(port), TOVU_HOST: "127.0.0.1",
    TOVU_SITE: name, TOVU_SITE_DIR: siteDir, TOVU_AGENT_CWD: siteDir,
    TOVU_REPO_ROOT: repoRoot, TOVU_LOCAL_ADMIN_BUILD_ROOT: buildRoot, TOVU_LOCAL_SITE_OWNER_PID: String(process.pid),
    TOVU_ENABLE_SITE_SWITCHER: "0",
    // Carry a proven local capability, never a raw flag from a deployed/misconfigured parent.
    TOVU_DEV_OWNER_SIGNIN: resolveLocalOwnerSignIn({ env: parent }, { pathExists }).enabled ? "1" : "0",
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
  function stateForSite(site: ReturnType<typeof listSites>[number]) {
    const record = site.running;
    return record ? { name: site.name, status: record.port > 0 ? "running" as const : "starting" as const,
      pid: record.pid, port: record.port || null, daemonPort: null, adminUrl: runningSiteUrl({ record }), app: record.app, external: true } : null;
  }
  function existing({ name }: { name: string }) {
    const site = listSites({ cwd: switcherBase, env }).find((entry) => entry.name === name);
    return site ? stateForSite(site) : null;
  }
  return {
    existing,
    listExisting: () => listSites({ cwd: switcherBase, env }).flatMap((site) => { const state = stateForSite(site); return state ? [state] : []; }),
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
      const site = listSites({ cwd: switcherBase, env }).find((entry) => entry.name === name);
      if (!site) throw new LocalSiteError("SITE_NOT_FOUND");
      const siteDir = site.dir;
      // Realpath containment is checked by the directory owner before either boot or Trash.
      // The validated registry owns arbitrary adopted paths; Trash separately requires containment.
      readSiteDir({ dir: siteDir });
      buildRoot ??= mkdtempSync(path.join(os.tmpdir(), "tovu-local-sites-"));
      const childEnv = localSiteChildEnv({ parent: env, name, siteDir, port, daemonPort, repoRoot, buildRoot });
      childEnv.TOVU_API_URL = `${scheme}://localhost:${port}`;
      // Match packaged journeys: a supplied production admin bundle can be shared without rebuilding.
      if (env.TOVU_ADMIN_DIST) childEnv.TOVU_ADMIN_DIST = env.TOVU_ADMIN_DIST;
      const compiled = import.meta.filename.endsWith(".js");
      const entry = path.join(repoRoot, "apps/website/src/platform/site-dir/local-site-child.ts");
      const compiledEntry = fileURLToPath(new URL("../../../platform/site-dir/local-site-child.js", import.meta.url));
      const diagnostics = localSiteProcessLog({ name, siteDir });
      const adapter = createNodeDaemonProcessAdapter({ command: process.execPath,
        args: compiled ? [compiledEntry] : ["--import", "tsx", entry], cwd: repoRoot, env: childEnv, registry }, { stderr: diagnostics.stderr });
      const child = adapter.spawnDaemonProcess();
      diagnostics.observe({ child });
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
          try { await discoverDaemon(); }
          catch (error) {
            diagnostics.record({ level: "error", message: `pid=${child.pid} readiness discovery failed: ${format(error)}` });
            throw error;
          }
          if (exited) return false;
          const apiReady = await localResponseOk(`${scheme}://127.0.0.1:${port}/readyz`, tls.credentials?.cert);
          const adminReady = apiReady && await localResponseOk(`${scheme}://127.0.0.1:${port}/admin/`, tls.credentials?.cert);
          if (!adminReady) diagnostics.record({ message: `pid=${child.pid} readiness failed: readyz=${apiReady}, admin=${apiReady ? adminReady : "not probed"}` });
          return adminReady;
        },
        async terminate() {
          diagnostics.record({ message: `pid=${child.pid} supervisor requested tree termination` });
          try { await discoverDaemon(); } catch { /* Tree teardown must still run when discovery fails. */ }
          // A daemon detaches into its own group. Keep its identity even after API crash/reparenting.
          await adapter.terminateProcess({ child });
          await discoverDaemon();
          if (daemon) await adapter.terminateProcess({ child: daemon });
        },
        killNow() {
          diagnostics.record({ message: `pid=${child.pid} host shutdown requested tree termination` });
          void adapter.terminateProcess({ child }).catch(() => {});
          if (daemon) void adapter.terminateProcess({ child: daemon }).catch(() => {});
        },
      };
    },
  };
}
