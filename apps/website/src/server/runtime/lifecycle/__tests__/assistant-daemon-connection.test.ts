import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { Serializable } from "node:child_process";
import { ensureToolExecToken } from "#src/assistant/daemon-access";
import { publishDaemonPluginEvent } from "../../composition/modules/assistant-tool-exec.js";
import { createHttpRunDaemonClient } from "../../composition/modules/assistant-run-finalizer.js";
import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { assistantDaemonToken, delegatedAssistantDaemonConnection, previousAssistantDaemonConnection, setAssistantDaemonConnection } from "../assistant-daemon-connection.js";
import { ensureAssistantDaemonReady, isAssistantDaemonReady, resetAssistantDaemonSingletonForTests, shutdownAssistantDaemon, startAssistantDaemon } from "../daemon-supervisor.js";

test("recovery snapshots retain the previous endpoint and site credential together", () => {
  const first = { url: "http://127.0.0.1:1/s/a", pid: 1, token: "first-site" };
  setAssistantDaemonConnection({ connection: first }, {});
  first.token = "mutated-caller";
  assert.equal(assistantDaemonToken({}, {}), "first-site");
  setAssistantDaemonConnection({ connection: { url: "http://127.0.0.1:2/s/a", pid: 2, token: "replacement" } }, {});
  assert.deepEqual(previousAssistantDaemonConnection({}, {}), { url: "http://127.0.0.1:1/s/a", pid: 1, token: "first-site" });
  setAssistantDaemonConnection({ connection: undefined }, {});
  resetAssistantDaemonSingletonForTests();
});

test("late plugin callbacks keep their original scope credential after replacement", async t => {
  const first = { url: "http://127.0.0.1:3300/s/site", pid: 1, token: "first-scope" };
  setAssistantDaemonConnection({ connection: first }, {});
  const captured = delegatedAssistantDaemonConnection({}, {})!;
  setAssistantDaemonConnection({ connection: { ...first, token: "replacement-scope" } }, {});
  const sent: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: URL | string, init: RequestInit) => {
    assert.equal(String(url), `${first.url}/internal/agent-plugin-events`);
    sent.push(new Headers(init.headers).get("authorization") ?? "");
    return new Response(null, { status: 202 });
  });
  try {
    await publishDaemonPluginEvent({ runId: "same", principalId: "same", payload: { type: "agent_plugins" } }, { connection: captured });
    assert.deepEqual(sent, ["Bearer first-scope"]);
  } finally { resetAssistantDaemonSingletonForTests(); }
});

test("recovery probes and streams use the credential belonging to the retained endpoint", async () => {
  const previous = { url: "http://127.0.0.1:3300/s/site", pid: 1, token: "previous-scope" };
  setAssistantDaemonConnection({ connection: { url: "http://127.0.0.1:4400/s/site", pid: 2, token: "replacement" } }, {});
  const sent: string[] = [];
  const client = createHttpRunDaemonClient({ observability: createNoopObservabilityPort({}) }, {
    previousDaemon: async () => previous, isAlive: () => true,
    fetch: async (url, init) => {
      assert.ok(String(url).startsWith(`${previous.url}/api/runs/same`));
      sent.push(new Headers(init?.headers).get("authorization") ?? "");
      return Response.json({ run: { id: "same", state: "running" } });
    },
  });
  try {
    assert.equal(await client.runStatus({ runId: "same", principalId: "same" }), 200);
    await (await client.openEvents({ runId: "same", principalId: "same" })).body?.cancel();
    assert.deepEqual(sent, ["Bearer previous-scope", "Bearer previous-scope"]);
  } finally { resetAssistantDaemonSingletonForTests(); }
});

test("per-scope tool credentials never reuse another scope's process holder", () => {
  const first = { TOVU_TOOL_EXEC_TOKEN: "rpc-a" };
  const second = { TOVU_TOOL_EXEC_TOKEN: "rpc-b" };
  assert.equal(ensureToolExecToken({ env: first, holder: {} }, {}), "rpc-a");
  assert.equal(ensureToolExecToken({ env: second, holder: {} }, {}), "rpc-b");
  assert.deepEqual(first, {}); assert.deepEqual(second, {});
});

class Parent extends EventEmitter {
  connected = true;
  operations: string[] = [];
  send(message: Serializable, callback: (error: Error | null) => void): boolean {
    const request = message as { kind: string; id: string; payload: { operation: string } };
    if (request.kind === "reply") { callback(null); return true; }
    this.operations.push(request.payload.operation);
    queueMicrotask(() => this.emit("message", { jiniIpc: 1, kind: "reply", id: request.id, ok: true,
      payload: { url: "http://127.0.0.1:3300/s/site", token: "scope-token", pid: 999 } }));
    callback(null); return true;
  }
}

test("desktop demand registers a scope and never activates a site-local supervisor", async () => {
  resetAssistantDaemonSingletonForTests();
  ensureToolExecToken({ env: {} }, {});
  const parent = new Parent();
  startAssistantDaemon({ workspaceId: "site", siteDir: "/site", siteApiOrigin: "http://127.0.0.1:3100" }, {
    parentIpc: parent, registerProcessSignalHandlers: false,
    spawnDaemonProcess: () => assert.fail("desktop-mode demand must not spawn a site daemon"),
  });
  try {
    assert.deepEqual(parent.operations, [], "registration is cold");
    await Promise.all([ensureAssistantDaemonReady({}, {}), ensureAssistantDaemonReady({}, {})]);
    assert.deepEqual(parent.operations, ["register"]);
    assert.equal(delegatedAssistantDaemonConnection({}, {})?.token, "scope-token");
    parent.emit("message", { jiniIpc: 1, kind: "request", id: "parked-notice", payload: { operation: "unavailable", pid: 999 } });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(isAssistantDaemonReady(), false, "passive observers stay cold after shared parking");
    assert.equal(delegatedAssistantDaemonConnection({}, {})?.token, "scope-token", "recovery retains the previous capability");
    await shutdownAssistantDaemon();
    assert.deepEqual(parent.operations, ["register", "withdraw"]);
  } finally { resetAssistantDaemonSingletonForTests(); }
});

test("a lost desktop connection falls back to the existing local supervisor", async t => {
  resetAssistantDaemonSingletonForTests(); ensureToolExecToken({ env: {} }, {});
  const parent = new Parent(); parent.connected = false;
  const events = new EventEmitter(); let spawns = 0;
  const warning = t.mock.method(console, "warn", () => {});
  startAssistantDaemon({ workspaceId: "site", siteDir: "/site", siteApiOrigin: "http://127.0.0.1:3100" }, {
    parentIpc: parent, registerProcessSignalHandlers: false, refreshPort: async () => {},
    readDiscovery: async () => ({ pid: 987654321, url: "http://127.0.0.1:4319" }),
    spawnDaemonProcess: () => {
      spawns++;
      return Object.assign(events, { pid: 987654321, kill() { events.emit("exit", 0, null); return true; } });
    },
  });
  try {
    await ensureAssistantDaemonReady({}, {});
    assert.equal(spawns, 1); assert.equal(isAssistantDaemonReady(), true);
    assert.equal(delegatedAssistantDaemonConnection({}, {}), undefined);
    assert.equal(warning.mock.callCount(), 1);
  } finally { await shutdownAssistantDaemon(); resetAssistantDaemonSingletonForTests(); }
});
