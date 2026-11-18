import assert from "node:assert/strict";
import type { Server } from "node:http";
import test, { type TestContext } from "node:test";
import express from "express";
import { createToolRegistry, type ToolRegistry } from "@jini-ai/core";
import { createInMemoryEventLog, createRunLifecycle, createToolExecutor } from "@jini-ai/daemon";
import { registerDelegatedToolRoutes, type DelegatedToolsHttpDeps } from "@jini-ai/daemon/http";
import type { ToolFamilyPort } from "@jini-ai/daemon/http";
import { createTestRouteHost } from "@jini-ai/core/contracts/server/testing";
import type { DurableRunStore } from "@jini-ai/chat/server/durable-runs";
import type { ChatRunLedger } from "#src/assistant/persistence/run-ledger";
import { delegatedToolErrorDisclosure } from "#src/assistant/tool-recovery-preset";
import { registerDurableToolGuard } from "../durable-run-routes.js";
import { daemonInitializer, evaluateDaemonExpression } from "./helpers/daemon-source.js";
import { launchMcpBridge, textOf } from "./helpers/mcp-stdio-bridge.js";

const TOKEN = "run-token";
const STALE_TEXT = "This execution attempt no longer owns the answer.";
const FAMILY: ToolFamilyPort = { describeFamily: ({ familyId }) => familyId === "fam"
  ? { members: ["fam.a", "fam.b"], selector: { keys: ["kind"], byValue: { a: "fam.a", b: "fam.b" } } } : undefined };

/** The real Express app of the daemon's delegated route behind Tovu's real durable guard, on a loopback port. Only the
 * durable store is a fake: it records every tool the guard ledgers and answers `outcome`. */
async function hostFixture({ t, outcome }: { t: TestContext; outcome: "allowed" | "stale" }) {
  const registry: ToolRegistry = createToolRegistry({});
  registry.register({ descriptor: { id: "fam.a" }, policy: { authorize: () => "allow" }, handler: async () => ({ content: [{ type: "text", text: "wrote" }] }) });
  registry.register({ descriptor: { id: "fam.b", readOnly: true }, policy: { authorize: () => "allow" }, handler: async () => ({ content: [{ type: "text", text: "read" }] }) });
  const lifecycle = createRunLifecycle({ eventLog: createInMemoryEventLog({}) });
  const guarded: string[] = [];
  const durable = {
    find: async () => ({ message: { runStatus: "running" }, cancelReason: null }),
    guardTool: async ({ toolId }: { toolId: string }) => { guarded.push(toolId); return outcome; },
    completeTool: async () => undefined,
  } as unknown as DurableRunStore;
  const deps = evaluateDaemonExpression<DelegatedToolsHttpDeps>(daemonInitializer("delegatedToolRouteDeps"), {
    lifecycle, toolExecutor: createToolExecutor({ registry }), delegatedToolErrorDisclosure, publishJobRecoveryMessage: () => "",
    resolvePrincipal: () => ({ id: "editor" }),
    siteTools: { registry, families: FAMILY },
  });
  const app = express();
  app.use(express.json());
  registerDurableToolGuard({ app, ledger: { durable } as ChatRunLedger, isRegistered: ({ toolId }) => registry.has({ toolId }),
    isReadOnly: ({ toolId }) => registry.list({}).find(tool => tool.id === toolId)?.readOnly === true, messageIdForAttempt: async () => "answer" }, {});
  registerDelegatedToolRoutes({ app, deps, adapter: createTestRouteHost() });
  const server: Server = await new Promise(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  t.after(() => new Promise<void>(resolve => { server.close(() => resolve()); }));
  const address = server.address();
  assert.ok(address !== null && typeof address === "object");
  const { run } = await lifecycle.start({ contextRef: "editor" });
  const posted: { toolId: string }[] = [];
  const recording: typeof fetch = async (url, init) => {
    if (init?.method === "POST") posted.push(JSON.parse(String(init.body)) as { toolId: string });
    return fetch(url, init);
  };
  const bridge = await launchMcpBridge({ t, launch: { runId: run.id, token: TOKEN, daemonUrl: `http://127.0.0.1:${address.port}`,
    startupToolIds: [], diagnosticToolIds: ["fam.a", "fam.b"], fetchImpl: recording } });
  return { bridge, guarded, posted };
}

const call = (host: Awaited<ReturnType<typeof hostFixture>>, { gateway, toolId, input }: { gateway: string; toolId: string; input: Record<string, unknown> }) =>
  host.bridge.client.callTool({ name: gateway, arguments: { toolId, input } });

test("a stale durable attempt: the family call and the concrete member call end in the same 409 text", { timeout: 10_000 }, async t => {
  const host = await hostFixture({ t, outcome: "stale" });
  const family = await call(host, { gateway: "execute_delegated_tool", toolId: "fam", input: { kind: "a" } });
  const concrete = await call(host, { gateway: "execute_delegated_tool", toolId: "fam.a", input: {} });
  assert.equal(family.isError, true);
  assert.equal(concrete.isError, true);
  assert.ok(textOf(family).includes(STALE_TEXT), textOf(family));
  assert.equal(textOf(family), textOf(concrete));
});

test("a writable member through the full gateway reaches the durable guard once, as the member", { timeout: 10_000 }, async t => {
  const host = await hostFixture({ t, outcome: "allowed" });
  const result = await call(host, { gateway: "execute_delegated_tool", toolId: "fam", input: { kind: "a" } });
  assert.equal(result.isError, undefined, textOf(result));
  assert.ok(textOf(result).includes("wrote"), textOf(result));
  assert.ok(textOf(result).includes("\"fam\" is a group; ran fam.a"), textOf(result));
  assert.deepEqual(host.guarded, ["fam.a"]);
  assert.deepEqual(host.posted.map(body => body.toolId), ["fam", "fam.a"]);
});

test("a writable member through the read-only gateway is refused with the concrete call's text and never ledgered", { timeout: 10_000 }, async t => {
  const host = await hostFixture({ t, outcome: "allowed" });
  const family = await call(host, { gateway: "execute_readonly_delegated_tool", toolId: "fam", input: { kind: "a" } });
  const concrete = await call(host, { gateway: "execute_readonly_delegated_tool", toolId: "fam.a", input: {} });
  assert.equal(family.isError, true);
  assert.equal(textOf(family), textOf(concrete));
  assert.deepEqual(host.guarded, []);
});

test("the 404 round trip itself leaves no ledger row for the family id", { timeout: 10_000 }, async t => {
  const host = await hostFixture({ t, outcome: "allowed" });
  const result = await call(host, { gateway: "execute_delegated_tool", toolId: "fam", input: { q: 1 } });
  assert.equal(result.isError, true);
  assert.ok(textOf(result).includes("\"fam\" is a group of tools, not one tool"), textOf(result));
  assert.deepEqual(host.guarded, []);
  assert.deepEqual(host.posted.map(body => body.toolId), ["fam"]);
});
