import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import path from "node:path";
import type { Socket } from "node:net";
import { createSiteRouteDeps } from "../../../apps/website/src/server/runtime/composition/deps.js";
import type { SiteStore } from "../../../apps/website/src/server/runtime/composition/open-site-store.js";
import { createServingApp } from "../../../apps/website/src/server/runtime/composition/serving-app.js";
import { buildBootModules } from "../../../apps/website/src/server/runtime/boot/bootstrap.js";
import { awaitSiteBootReadiness } from "../../../apps/website/src/server/runtime/boot/site-boot-readiness.js";
import { agentDaemonWanted } from "../../../apps/website/src/server/runtime/boot/agent-daemon-wanted.js";
import { runBootLifecycle, type BootModule } from "../../../apps/website/src/server/runtime/lifecycle/boot-lifecycle.js";
import { setReadinessSnapshot } from "../../../apps/website/src/server/runtime/lifecycle/readiness-state.js";
import { ensureAgentDaemonPortResolved } from "../../../apps/website/src/server/runtime/lifecycle/agent-daemon-port.js";
import { registerPluginSdkResolver } from "../../../apps/website/src/server/runtime/boot/plugin-sdk-resolver.js";
import { ensureAgentDaemonToken } from "../../../apps/website/src/assistant/index.js";
import { startAssistantDaemon, shutdownAssistantDaemon } from "../../../apps/website/src/server/inbound/assistant/index.js";
import { readPreviousAssistantDaemon } from "../../../apps/website/src/server/runtime/lifecycle/assistant-daemon-registry.js";
import { pinSiteState } from "./pin-site-state.js";

/** Secret-free summary of a failed pin operation: assertion text authored in this harness, else
 * the error's name/code plus up to five stack frames with the message line dropped. */
export function describePinFailure(error: unknown): string {
  if (!(error instanceof Error)) return typeof error;
  if (error instanceof assert.AssertionError) return error.message;
  const code = (error as { code?: unknown }).code;
  const frames = (error.stack ?? "").split("\n").filter((line) => /^\s+at /.test(line)).slice(0, 5);
  return [`${error.name}${typeof code === "string" ? ` ${code}` : ""}`, ...frames].join("\n");
}

/** Harness-only composition: no reset route is registered in a product server. The parent must
 * supply a private IPC channel and this flag before any application code is imported. Cached
 * imports, listener and idle daemon survive; request-scoped caches/limiters/repos are recreated
 * over the seed after draining requests and stopping every API writer. Actual agent turns and
 * package installs use @isolated-site because a daemon's in-memory runtime cannot be rewound. */
export async function startResettablePinApi(
  { siteDir, runtimeDir, port }: { siteDir: string; runtimeDir: string; port: number },
  _optional = {},
): Promise<void> {
  assert.equal(process.env.TOVU_E2E_PIN_RESET, "1");
  assert.ok(process.send, "Resettable pins require their fixture's private IPC channel");
  assert.notEqual(process.platform, "win32", "Warm pin resets require POSIX daemon suspension");
  ensureAgentDaemonToken({}, {});
  registerPluginSdkResolver();
  await ensureAgentDaemonPortResolved();
  const dbPath = path.join(siteDir, "content.db");
  let store: SiteStore | undefined;
  let modules: BootModule[] = [];
  let serving: ReturnType<typeof createServingApp> | undefined;
  let resetting = true;
  const sockets = new Set<Socket>();
  const responses = new Set<ServerResponse>();
  const server = createServer((req, res) => {
    if (resetting || !serving) { res.writeHead(503); res.end("Pin state is resetting"); return; }
    responses.add(res);
    const done = () => responses.delete(res);
    res.once("finish", done); res.once("close", done);
    serving.app(req, res);
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const open = async () => {
    const deps = await createSiteRouteDeps(dbPath, { onStoreOpened: (opened) => { store = opened; } });
    modules = buildBootModules(deps, { useMemory: false, defaultContentDbPath: () => dbPath });
    const boot = await runBootLifecycle(modules);
    setReadinessSnapshot(boot);
    assert.ok(boot.ok, "Pin composition boot failed");
    await awaitSiteBootReadiness({ deps });
    // Composition has other fire-and-forget seeders too. Settle them before taking a baseline
    // or closing their stores; a snapshot of half-seeded content is not an isolated baseline.
    await Promise.all(Object.entries(deps).filter(([key]) => key.endsWith("Ready")).map(([, value]) => value));
    serving = createServingApp(deps);
    await Promise.all(serving.bootWork);
    resetting = false;
    return deps;
  };
  const close = async () => {
    resetting = true;
    // Context teardown has closed the test's pages; cut lingering SSE/keep-alive connections so
    // their handlers cannot continue writing after the database restore.
    for (const socket of sockets) socket.destroy();
    const deadline = Date.now() + 5_000;
    while (responses.size) {
      assert.ok(Date.now() < deadline, "Pin requests did not drain before reset");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (serving) {
      await serving.outboxDrainer.stop();
      await serving.trashSweeper.stop({});
      await Promise.all(serving.bootWork);
      serving = undefined;
    }
    for (const module of [...modules].reverse()) await module.stop();
    modules = [];
    await store?.close();
    store = undefined;
  };
  const deps = await open();
  const daemonWanted = await agentDaemonWanted(deps);
  if (daemonWanted) startAssistantDaemon({ workspaceId: deps.workspaceId, siteDir }, { registerProcessSignalHandlers: false });
  let operation = Promise.resolve();
  process.on("message", (message: { id?: string; action?: "snapshot" | "reset" | "shutdown" }) => {
    if (!message.id || !["snapshot", "reset", "shutdown"].includes(message.action ?? "")) return;
    operation = operation.then(async () => {
      let daemonPid: number | undefined;
      let paused = false;
      let ok = false;
      try {
        await close();
        if (message.action === "shutdown") {
          shutdownAssistantDaemon();
          server.close();
          process.send?.({ id: message.id, ok: true });
          return;
        }
        if (daemonWanted) {
          const deadline = Date.now() + 60_000;
          let record = await readPreviousAssistantDaemon({ siteDir });
          while (!record && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            record = await readPreviousAssistantDaemon({ siteDir });
          }
          assert.ok(record && record.port === Number(process.env.JINI_AGENT_DAEMON_PORT), "The owned pin daemon never became ready");
          daemonPid = record.pid;
        }
        await pinSiteState({ siteDir, snapshotDir: path.join(runtimeDir, "seed-snapshot"), action: message.action! as "snapshot" | "reset" }, {
          pauseDaemon: () => {
            if (daemonPid) { process.kill(daemonPid, "SIGSTOP"); paused = true; }
          },
        });
        await open();
        ok = true;
      } catch (error) {
        // Errors can contain credential-bearing SQL or provider bodies; return a fixed message.
        // The pin log gets only this harness's own fixed assertion text, or the error's name/code
        // and stack frames (file:line, never the message), so a failed reset is diagnosable.
        process.stderr.write(`[pin-api] ${message.action} failed: ${describePinFailure(error)}\n`);
      } finally {
        if (paused && daemonPid) {
          try { process.kill(daemonPid, "SIGCONT"); } catch { ok = false; }
        }
      }
      process.send?.({ id: message.id, ok });
    });
  });
  const shutdown = () => {
    resetting = true;
    shutdownAssistantDaemon();
    void operation.then(close).finally(() => process.exit(0));
  };
  process.once("disconnect", shutdown);
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  process.once("exit", shutdownAssistantDaemon);
}
