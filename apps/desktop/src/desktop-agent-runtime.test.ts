/** Coupling audit #5: the desktop executor and picker use the app's owned Jini runtime. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createNativeAgentRuntime, AGENT_DEFS, type NativeAgentRuntime } from "@jini-ai/agent-runtime";
import { createRunLifecycle, createInMemoryEventLog, type createAgentExecutor } from "@jini-ai/daemon";
import { createDesktopAgentRuntime, resolveDesktopTurnAccess } from "./desktop-agent.ts";
import { assistantCliPermissions } from "../../website/src/contracts/headless/assistant-subagents-policy.ts";
import { startDesktopChat } from "./desktop-chat-main.ts";
import { AGENT_INVENTORY_IPC, type ChatIpcMain } from "./workspace-chat-ipc.ts";

test("desktop turn access defaults on locally and passes host exclusions to the login reader", async () => {
  const hostEnv = { PATH: "/desktop-only", TOVU_ROOT_KEY: "private" };
  const parityEnv = { PATH: "/operator/bin" };
  let loginReads = 0;
  const access = await resolveDesktopTurnAccess({ addressee: null, hostEnv }, {
    readLoginShellEnvironment: async (required, optional) => {
      loginReads++;
      assert.equal(required.baseEnv, hostEnv);
      assert.deepEqual(required.excludedPrefixes, ["TOVU_", "JINI_"]);
      assert.deepEqual(required.excludedKeys, ["DATABASE_URL"]);
      assert.deepEqual(required.excludedSuffixes, ["_ROOT_KEY"]);
      assert.deepEqual(optional, {});
      return parityEnv;
    },
  });
  assert.deepEqual(access, {
    nativeCapabilities: assistantCliPermissions({ enabled: true }).capabilities,
    nativeToolAccess: true,
    parityEnv,
  });
  assert.equal(access.parityEnv, parityEnv);
  assert.equal(loginReads, 1);
});

test("desktop turn access re-reads boolean grants with the captured addressee each turn", async () => {
  const addressee = { siteDir: "/sites/active", name: "Active site" };
  let enabled = false;
  let settingReads = 0;
  let loginReads = 0;
  const options = {
    readFullCliAccess: async (required: { addressee: typeof addressee | null }, optional = {}) => {
      settingReads++;
      assert.equal(required.addressee, addressee);
      assert.deepEqual(optional, {});
      return enabled;
    },
    readLoginShellEnvironment: async () => { loginReads++; return { PATH: "/operator/bin" }; },
  };
  for (const grant of [false, true, false]) {
    enabled = grant;
    const access = await resolveDesktopTurnAccess({ addressee, hostEnv: {} }, options);
    assert.deepEqual(access.nativeCapabilities, assistantCliPermissions({ enabled: grant }).capabilities);
    assert.equal(access.nativeToolAccess, grant);
    assert.deepEqual(access.parityEnv, grant ? { PATH: "/operator/bin" } : undefined);
  }
  assert.equal(settingReads, 3);
  assert.equal(loginReads, 1);
});

test("desktop turn access preserves granular overrides without reading a disabled login environment", async () => {
  const settings = assistantCliPermissions({ enabled: false, capabilities: { shell: true } });
  const access = await resolveDesktopTurnAccess({ addressee: null, hostEnv: {} }, {
    readFullCliAccess: async ({ addressee }) => {
      assert.equal(addressee, null);
      return settings;
    },
    readLoginShellEnvironment: async () => assert.fail("disabled login environment must not be read"),
  });
  assert.deepEqual(access, { nativeCapabilities: settings.capabilities, nativeToolAccess: true, parityEnv: undefined });
});

test("desktop turn access derives the native grant from capabilities rather than the master default", async () => {
  const settings = assistantCliPermissions({ enabled: false });
  settings.enabled = true;
  const access = await resolveDesktopTurnAccess({ addressee: null, hostEnv: {} }, {
    readFullCliAccess: async () => settings,
    readLoginShellEnvironment: async () => assert.fail("all capabilities are disabled"),
  });
  assert.deepEqual(access, { nativeCapabilities: settings.capabilities, nativeToolAccess: false, parityEnv: undefined });
});

test("desktop turn access skips settings and login reads when the host denies full CLI access", async () => {
  const denied = {
    nativeCapabilities: assistantCliPermissions({ enabled: false }).capabilities,
    nativeToolAccess: false,
    parityEnv: undefined,
  };
  for (const hostEnv of [{ TOVU_HOSTED: "1" }, { TOVU_AGENT_FULL_CLI_ACCESS: "0" }]) {
    assert.deepEqual(await resolveDesktopTurnAccess({ addressee: null, hostEnv }, {
      readFullCliAccess: async () => assert.fail("host lock must skip settings"),
      readLoginShellEnvironment: async () => assert.fail("host lock must skip login environment"),
    }), denied);
  }
  assert.deepEqual(await resolveDesktopTurnAccess({ addressee: null, hostEnv: { TOVU_HOSTED: "1" } }), denied);
});

test("a desktop turn uses declared host facts while a packaged local runtime keeps CLI access", async () => {
  const hostEnv = { NODE_ENV: "production", ELECTRON_RUN_AS_NODE: "1", TOVU_DESKTOP_OWNER_PID: "42" };
  const denied = await resolveDesktopTurnAccess({ addressee: null, hostEnv,
    hostSignals: { hosted: false, nativeToolsRestricted: true, labels: [] },
  }, {
    readFullCliAccess: async () => assert.fail("a declared restriction must precede settings"),
    readLoginShellEnvironment: async () => assert.fail("a declared restriction must precede login reads"),
  });
  assert.equal(denied.nativeToolAccess, false);
  const local = await resolveDesktopTurnAccess({ addressee: null, hostEnv,
    hostSignals: { hosted: false, nativeToolsRestricted: false, labels: [] },
  }, { readLoginShellEnvironment: async () => ({ PATH: "/local/bin" }) });
  assert.equal(local.nativeToolAccess, true);
});

test("desktop turn access propagates a settings read failure without reading the login environment", async () => {
  const failure = new Error("settings unavailable");
  await assert.rejects(resolveDesktopTurnAccess({ addressee: null, hostEnv: {} }, {
    readFullCliAccess: async () => { throw failure; },
    readLoginShellEnvironment: async () => assert.fail("settings failure must stop access resolution"),
  }), error => error === failure);
});

test("desktop turn access propagates a login environment read failure", async () => {
  const failure = new Error("login environment unavailable");
  await assert.rejects(resolveDesktopTurnAccess({ addressee: null, hostEnv: {} }, {
    readFullCliAccess: async () => true,
    readLoginShellEnvironment: async () => { throw failure; },
  }), error => error === failure);
});

test("desktop executor binds launch, state, environment and policies to the supplied runtime", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-executor-runtime-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const runtime = createNativeAgentRuntime({ env: { PATH: "/desktop-only", CODEX_DISABLE_PLUGINS: "1", PI_GRACEFUL_SHUTDOWN_MS: "1234" } });
  t.after(() => runtime.dispose({}));
  let created = 0;
  let executorOptions: Parameters<typeof createAgentExecutor>[1];
  const run = async () => {};
  const chat = await createDesktopAgentRuntime({ workDir: dir, buildTools: () => [], agentRuntime: runtime }, {
    mcpServeScript: "/fixture/jini-mcp.js",
    createAgentExecutor: (_required, options) => {
      created++;
      executorOptions = options;
      return { run };
    },
  });
  t.after(() => chat.close());
  assert.equal(created, 1);
  assert.ok(executorOptions);
  assert.equal(executorOptions.runtimeState, runtime.state);
  assert.equal(executorOptions.hostEnv, runtime.hostEnv);
  assert.equal(executorOptions.getAgentDef, runtime.getAgentDef);
  assert.equal(executorOptions.resolveAgentLaunch, runtime.resolveAgentLaunch);
  assert.equal(executorOptions.codexDisablePlugins, true);
  assert.equal(executorOptions.piGracefulShutdownMs, 1234);
  assert.equal(new URL(chat.daemonUrl).hostname, "127.0.0.1");
});

test("desktop chat detection and executor receive the same app runtime across list and rescan", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-owned-runtime-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const runtime = createNativeAgentRuntime({ env: {} });
  t.after(() => runtime.dispose({}));
  const launches: string[] = [];
  const probes: string[] = [];
  const owned: NativeAgentRuntime = {
    ...runtime,
    resolveAgentLaunch: ({ def }: Parameters<typeof runtime.resolveAgentLaunch>[0]) => {
      launches.push(def.id);
      return {
        configuredOverridePath: null, pathResolvedPath: "/fixture/agent", selectedPath: "/fixture/agent",
        launchPath: "/fixture/agent", launchKind: "selected", childPathPrepend: [], diagnostic: null,
      };
    },
    probeAgentModels: async ({ def }: Parameters<typeof runtime.probeAgentModels>[0]) => {
      probes.push(def.id);
      return { models: [{ id: "desktop-model", label: "Desktop model" }], source: "live" };
    },
  };
  const handlers = new Map<string, Parameters<ChatIpcMain["handle"]>[1]>();
  const chat = await startDesktopChat({
    agentRuntime: owned,
    ipcMain: { handle: (channel, listener) => { handlers.set(channel, listener); } },
    userDataDir: dir, projectsPath: path.join(dir, "projects.json"),
    revealPath: async () => {}, pickDirectory: async () => null,
    broadcast: () => {}, readSiteName: () => "Fixture site",
  }, {
    createDesktopAgentRuntime: async (required) => {
      assert.equal(required.agentRuntime, owned);
      return {
        lifecycle: createRunLifecycle({ eventLog: createInMemoryEventLog({}) }),
        daemonUrl: "http://127.0.0.1:4319", addresseeOf: () => null,
        toolIds: () => [], startTurn: async () => ({ runId: "fixture-run" }), close: async () => {},
      };
    },
  });
  t.after(() => chat.close());
  const event = { sender: { send: () => {}, isDestroyed: () => false } };
  const list = handlers.get(AGENT_INVENTORY_IPC.list)!;
  const rescan = handlers.get(AGENT_INVENTORY_IPC.rescan)!;
  const first = await list(event) as { id: string; available: boolean; models: unknown }[];
  assert.ok(first.length > 0);
  assert.ok(first.every(row => AGENT_DEFS.some(def => def.id === row.id)));
  assert.ok(first.every(row => row.available));
  assert.deepEqual(first[0]!.models, [{ id: "desktop-model", label: "Desktop model" }]);
  assert.deepEqual(launches, first.map(row => row.id));
  assert.deepEqual(probes, launches);
  assert.equal(await list(event), first);
  assert.equal(launches.length, first.length);
  assert.deepEqual(await rescan(event), first);
  assert.equal(launches.length, first.length * 2);
  assert.deepEqual(probes, launches);
});

test('desktop owner setting and environment control the same provider grant and scoped cwd on each turn', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-full-cli-'));
  const siteDir = path.join(dir, 'site');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const runtime = createNativeAgentRuntime({ env: {} });
  t.after(() => runtime.dispose({}));
  let enabled = false; let loginReads = 0;
  const captured: {
    cliParity?: boolean; nativeToolAccess?: boolean; cwd: string; disallowedTools?: readonly string[];
    nativeCapabilities?: Record<string, boolean>; env?: NodeJS.ProcessEnv;
  }[] = [];
  const chat = await createDesktopAgentRuntime({ workDir: dir, buildTools: () => [], agentRuntime: runtime }, {
    readFullCliAccess: async () => enabled,
    readLoginShellEnvironment: async () => { loginReads++; return { PATH: '/operator/bin' }; },
    createAgentExecutor: ({ lifecycle }) => ({ run: async (required, options = {}) => {
      captured.push({ ...required, ...options });
      await lifecycle.finish({ runId: required.runId, status: 'succeeded', code: 0, signal: null, resumable: false });
    } }),
  });
  t.after(() => chat.close());
  for (const grant of [false, true, false]) {
    enabled = grant;
    const { runId } = await chat.startTurn({ prompt: 'Use Task', agentId: 'codex' }, { addressee: { siteDir, name: 'site' } });
    await chat.lifecycle.waitForTerminal({ runId });
    const input = captured.at(-1)!;
    assert.equal(input.cliParity, grant); assert.equal(input.nativeToolAccess, grant);
    assert.deepEqual(input.nativeCapabilities, assistantCliPermissions({ enabled: grant }).capabilities);
    assert.deepEqual(input.env, grant ? { PATH: '/operator/bin' } : undefined);
    for (const tool of ['Bash', 'Edit', 'Write', 'Task', 'Workflow']) assert.equal(input.disallowedTools?.includes(tool), !grant);
    assert.equal(input.cwd, grant ? siteDir : dir);
  }
  assert.equal(loginReads, 1);
});
