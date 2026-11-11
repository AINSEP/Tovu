/**
 * Coupling audit #5: one runtime at Electron's composition root, drained on quit.
 * Execute the actual root declaration and quit handler with DI fakes because importing main.ts
 * requires Electron. This follows main-shutdown-wiring.test.ts's existing VM seam.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createNativeAgentRuntime } from "@jini-ai/agent-runtime";
import { createShutdownTracker, decideBeforeQuit } from "@jini-ai/desktop-host/shutdown";

const source = fs.readFileSync(new URL("./main/index.ts", import.meta.url), "utf8");

test("desktop app creates one runtime outside window/site callbacks", async () => {
  const declarations = source.match(/^const desktopAgentRuntime = createNativeAgentRuntime\(.+\);$/gm) ?? [];
  assert.equal(declarations.length, 1);
  assert.equal((source.match(/createNativeAgentRuntime\(/g) ?? []).length, 1);
  let creations = 0;
  const env = { PATH: "/fixture/desktop", CODEX_DISABLE_PLUGINS: "1" };
  const context = vm.createContext({
    process: { env },
    createNativeAgentRuntime: (input: Parameters<typeof createNativeAgentRuntime>[0]) => {
      creations++;
      assert.equal(input.env, env);
      return createNativeAgentRuntime(input);
    },
  });
  vm.runInContext(declarations[0]!, context);
  const first = vm.runInContext("desktopAgentRuntime", context) as ReturnType<typeof createNativeAgentRuntime>;
  const second = vm.runInContext("desktopAgentRuntime", context);
  assert.equal(first, second);
  assert.equal(creations, 1);
  assert.deepEqual(first.hostEnv, env);
  await first.dispose({});
});

test("quit waits for owned runtime disposal even without sites and disposes once across repeated quits", async () => {
  const start = source.indexOf('\napp.on("before-quit", ');
  assert.notEqual(start, -1);
  const end = source.indexOf("\n});", start);
  assert.notEqual(end, -1);
  let finishDisposal!: () => void;
  const disposal = new Promise<void>((resolve) => { finishDisposal = resolve; });
  let finishProductDisposal!: () => void;
  const productDisposal = new Promise<void>((resolve) => { finishProductDisposal = resolve; });
  let finishMcpClose!: () => void;
  const mcpClose = new Promise<void>((resolve) => { finishMcpClose = resolve; });
  let finishAgentShutdown!: () => void;
  const agentShutdown = new Promise<void>((resolve) => { finishAgentShutdown = resolve; });
  const shutdownOrder: string[] = [];
  let disposals = 0;
  let mcpCloses = 0;
  let importStops = 0;
  let agentShutdowns = 0;
  let lifecycleStops = 0;
  let quitNotifications = 0;
  let prevented = 0;
  let finalQuits = 0;
  let onQuit!: (event: { preventDefault(): void }) => void;
  let finishedQuit!: () => void;
  const quitCompleted = new Promise<void>((resolve) => { finishedQuit = resolve; });
  const event = { preventDefault: () => { prevented++; } };
  const context = vm.createContext({
    lastWindowQuit: { onQuitStarted: () => { quitNotifications++; } },
    stopSiteLifecycle: () => { lifecycleStops++; },
    siteDiscovery: { abortAll: () => {} },
    quitPhase: "idle", openSites: new Map(),
    pendingTeardowns: createShutdownTracker({}), decideBeforeQuit,
    productState: { disposers: [() => { shutdownOrder.push("product-listeners"); }, () => { shutdownOrder.push("product-memory"); }],
      product: { dispose: () => { shutdownOrder.push("product"); return productDisposal; } } },
    desktopAgentRuntime: { dispose: () => { shutdownOrder.push("runtime"); disposals++; return disposal; } },
    desktopMcpHttp: { close: () => { shutdownOrder.push("mcp"); mcpCloses++; return mcpClose; } },
    stopRunningImports: async () => { shutdownOrder.push("imports"); importStops++; },
    desktopAgentService: { shutdown: () => { shutdownOrder.push("agent-service"); agentShutdowns++; return agentShutdown; } },
    siteThemePreviews: { dispose: () => { shutdownOrder.push("previews"); } },
    finalQuitHeldForUpdate: () => false,
    QUIT_DEADLINE_MS: 30_000,
    setTimeout: () => ({ unref: () => {} }), clearTimeout: () => {},
    app: {
      on: (channel: string, listener: typeof onQuit) => {
        assert.equal(channel, "before-quit");
        onQuit = listener;
      },
      quit: () => { shutdownOrder.push("quit"); finalQuits++; onQuit(event); finishedQuit(); },
      exit: () => assert.fail("quit must drain rather than force exit"),
    },
  });
  vm.runInContext(source.slice(start, end + "\n});".length), context);
  onQuit(event);
  onQuit(event);
  assert.equal(prevented, 2);
  assert.equal(quitNotifications, 2, 'each quit attempt revokes pending last-window confirmation');
  assert.equal(disposals, 1);
  assert.equal(lifecycleStops, 2, 'each quit attempt revokes automatic site work before draining');
  assert.deepEqual(shutdownOrder, ["product-listeners", "product-memory", "product", "runtime", "mcp", "imports", "previews"]);
  assert.equal(vm.runInContext("quitPhase", context), "draining");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(finalQuits, 0);
  assert.equal(agentShutdowns, 1);
  // Settle the newly wired resources first so runtime disposal remains the sole final blocker.
  finishAgentShutdown();
  finishMcpClose();
  finishProductDisposal();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(finalQuits, 0, "runtime disposal must still finish after product telemetry has drained");
  finishDisposal();
  await quitCompleted;
  assert.equal(quitNotifications, 3, 'the final quit also notifies the controller');
  assert.equal(finalQuits, 1);
  assert.equal(disposals, 1);
  assert.equal(mcpCloses, 1);
  assert.equal(importStops, 1);
  assert.equal(agentShutdowns, 1);
  assert.equal(prevented, 2);
  assert.equal(lifecycleStops, 3, 'the final reentrant quit also revokes lifecycle work');
  assert.equal(vm.runInContext("quitPhase", context), "drained");
  assert.deepEqual(shutdownOrder, ["product-listeners", "product-memory", "product", "runtime", "mcp", "imports", "previews", "agent-service", "quit"]);
});
