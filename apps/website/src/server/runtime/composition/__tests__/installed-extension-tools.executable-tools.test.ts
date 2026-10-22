/**
 * @file The composition root's installed-extension pass registers executable Agent Plugin tools
 * (C4b): onto the process registry it is handed, gated per call by the plugin's live activation
 * record, asking through the process's own confirmation transport, and skipped or logged (never
 * thrown) when its ports are missing or its loader fails, like the other families.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { createToolExecutor } from "@jini-ai/daemon";
import { createToolRegistry, type ToolRegistration, type ToolRegistry } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/core/primitives";
import { createIssuedTokenMemories } from "@jini-ai/agent-plugins/lifecycle/tools";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";

import { createTempSiteLayoutFixture, testSiteLayoutContext } from "#src/__tests__/fixtures/site-layout-context";
import { InMemoryPostRepo } from "#src/features/post/repo.memory";
import { agentPluginActivations } from "#src/features/agent-plugins/activation-effects";
import type { AgentPluginExecutableToolHost } from "#src/features/agent-plugins/executable-tools/register";
import { acmeTools, allowAll, fakeConnections, fakeHttp, startConfirmingCall, PLUGIN, WORKSPACE } from "#src/features/agent-plugins/executable-tools/__tests__/fixtures";
import { registerInstalledExtensionTools } from "../installed-extension-tools.js";

const READ = "p_acme_office__read_rows";
const WRITE = "p_acme_office__append_rows";
const input = { connectionRef: "conn-1", table: "Leads", values: ["a"] };
const layout = createTempSiteLayoutFixture({});
after(() => layout.cleanup());

function hostWith(loadContributions: AgentPluginExecutableToolHost["loadContributions"]): AgentPluginExecutableToolHost {
  return {
    loadContributions, connections: fakeConnections({ accountId: "alice" }).connections, http: fakeHttp().http,
    limiter: { check: async () => ({ allowed: true }) }, state: () => ({ get: async () => null }),
    apiOrigins: async () => ["https://api.acme.test"], issuedTokens: createIssuedTokenMemories(),
  };
}

const surfaces = () => ({ surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) });

/** Runs the real registrar with the executable-tool ports given; the other families find nothing installed. */
async function register(extra: { agentPluginTools?: AgentPluginExecutableToolHost; surfaces?: ReturnType<typeof surfaces>; executablePluginToolRegistry?: ToolRegistry }) {
  const installed: ToolRegistration[] = [];
  await registerInstalledExtensionTools(
    { register: (registration: ToolRegistration) => void installed.push(registration) },
    testSiteLayoutContext({
      ...layout.deps, authorize: allowAll, workspaceId: WORKSPACE, postRepo: new InMemoryPostRepo([]),
      pluginActivationRepo: new InMemoryPluginActivationRepo({ initialRows: [] }), discoverPlugins: async () => [], ...extra,
    }),
    "[executable-tools-test]",
  );
  return installed;
}

const loadAcme: AgentPluginExecutableToolHost["loadContributions"] = async () => ({ items: acmeTools([]), refusals: [] });
const workspaceRoot = () => layout.deps.agentPluginLayout.forWorkspace(WORKSPACE).root;

test("executable plugin tools land on the process registry and are gated by the live activation record per call", async () => {
  const registry = createToolRegistry({});
  const installed = await register({ agentPluginTools: hostWith(loadAcme), surfaces: surfaces(), executablePluginToolRegistry: registry });
  assert.deepEqual(registry.list({}).map((descriptor) => descriptor.id).filter((id) => id.startsWith("p_")).sort(), [WRITE, READ].sort());
  assert.ok(!installed.some((registration) => registration.descriptor.id.startsWith("p_")), "not the installed-family registry");
  const executor = createToolExecutor({ registry });
  const run = () => executor.execute({ toolId: READ, principal: { id: "owner" }, run: { id: "run" }, input });
  assert.equal((await run()).status, "completed", "no activation record reads as active");
  await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: workspaceRoot(), pluginId: PLUGIN, enabled: false, actor: "test" });
  try {
    assert.equal((await run()).status, "denied", "switched off after boot: denied on the next call");
  } finally {
    await agentPluginActivations.setAgentPluginActivation({ workspaceRoot: workspaceRoot(), pluginId: PLUGIN, enabled: true, actor: "test" });
  }
});

test("a write tool asks through the process's confirmation transport, with the plugin's disclosed rows", async () => {
  const registry = createToolRegistry({});
  const transport = surfaces();
  await register({ agentPluginTools: hostWith(loadAcme), surfaces: transport, executablePluginToolRegistry: registry });
  const call = await startConfirmingCall({ executor: createToolExecutor({ registry }), surfaces: transport }, WRITE, input);
  assert.deepEqual(call.rows.slice(0, 1), [["Tool", WRITE]]);
  assert.ok(call.rows.length > 2, `the card discloses more than Tool and Input: ${JSON.stringify(call.rows)}`);
  assert.equal(call.answer("cancel").ok, true, "the card's exchange lives on the transport the composition was given");
  assert.equal((await call.pending).status, "completed");
});

for (const missing of ["agentPluginTools", "surfaces", "executablePluginToolRegistry"] as const) {
  test(`without ${missing} the executable family is skipped`, async () => {
    const registry = createToolRegistry({});
    let loads = 0;
    const ports = { agentPluginTools: hostWith(async (...args) => { loads += 1; return loadAcme(...args); }), surfaces: surfaces(), executablePluginToolRegistry: registry };
    const { [missing]: _omitted, ...rest } = ports;
    await register(rest);
    assert.equal(loads, 0);
    assert.deepEqual(registry.list({}).filter((descriptor) => descriptor.id.startsWith("p_")), []);
  });
}

test("loader refusals are logged with the registrar's prefix and the valid tools still register", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const registry = createToolRegistry({});
  await register({ agentPluginTools: hostWith(async () => ({ items: acmeTools([]), refusals: ["acme-office: tools/broken.mjs refused"] })), surfaces: surfaces(), executablePluginToolRegistry: registry });
  assert.ok(warn.mock.calls.some((call) => call.arguments[0] === "[executable-tools-test] acme-office: tools/broken.mjs refused"));
  assert.ok(registry.list({}).some((descriptor) => descriptor.id === READ), "the plugin's valid tools still register");
});

test("a loader failure is logged and never thrown; the pass continues without the family", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const registry = createToolRegistry({});
  await register({ agentPluginTools: hostWith(async () => { throw new Error("contributions unreadable"); }), surfaces: surfaces(), executablePluginToolRegistry: registry });
  assert.ok(warn.mock.calls.some((call) => call.arguments[0] === "[executable-tools-test] executable agent-plugin tools could not be registered, continuing without them — contributions unreadable"));
  assert.deepEqual(registry.list({}).filter((descriptor) => descriptor.id.startsWith("p_")), []);
});

test("every family that fails is logged once with the registrar's prefix, a non-Error reason verbatim, and the pass never throws", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const installed: ToolRegistration[] = [];
  // Every layout read fails: both the agent-plugin and the skill family lose their install roots.
  const brokenLayout = new Proxy({}, { get: () => { throw new Error("layout unreadable"); } });
  await registerInstalledExtensionTools(
    { register: (registration: ToolRegistration) => void installed.push(registration) },
    testSiteLayoutContext({
      ...layout.deps, agentPluginLayout: brokenLayout as never, skillLayout: brokenLayout as never, authorize: allowAll, workspaceId: WORKSPACE, postRepo: new InMemoryPostRepo([]),
      pluginActivationRepo: new InMemoryPluginActivationRepo({ initialRows: [] }),
      discoverPlugins: async () => { throw "discovery offline"; },
    }),
    "[families-test]",
  );
  const lines = warn.mock.calls.map((call) => call.arguments[0]);
  assert.ok(lines.includes("[families-test] agent-plugin tools could not be registered, continuing without them — layout unreadable"), String(lines));
  assert.ok(lines.includes("[families-test] skill tools could not be registered, continuing without them — layout unreadable"), String(lines));
  assert.ok(lines.includes("[families-test] plugin capability tools could not be registered, continuing without them — discovery offline"), String(lines));
  assert.deepEqual(installed, []);
});
