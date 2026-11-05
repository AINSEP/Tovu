import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import type { Serializable } from "node:child_process";
import type { Request, Response } from "express";
import { fetchAgentDaemon } from "../../composition/modules/assistant-daemon-client.js";
import { activateAssistantDaemon, prepareAssistantPageBinding } from "../../../../../../admin/src/lib/assistant-daemon-activation.ts";
import { ensureToolExecToken } from "#src/assistant/daemon-access";
import { publishDaemonPluginEvent } from "../../composition/modules/assistant-tool-exec.js";
import { createHttpRunDaemonClient } from "../../composition/modules/assistant-run-finalizer.js";
import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { assistantDaemonToken, delegatedAssistantDaemonConnection, previousAssistantDaemonConnection, setAssistantDaemonConnection } from "../assistant-daemon-connection.js";
import { ensureAssistantDaemonReady, isAssistantDaemonReady, resetAssistantDaemonSingletonForTests, registerSiteIdleStopHook, shutdownAssistantDaemon, startAssistantDaemon } from "../daemon-supervisor.js";
import { clearAssistantDaemonFailure, recordAssistantDaemonFailure } from "../readiness-state.js";

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
  refusalReason?: string;
  operations: string[] = [];
  send(message: Serializable, callback: (error: Error | null) => void): boolean {
    const request = message as { kind: string; id: string; payload: { operation: string } };
    if (request.kind === "reply") { callback(null); return true; }
    this.operations.push(request.payload.operation);
    queueMicrotask(() => this.emit("message", { jiniIpc: 1, kind: "reply", id: request.id, ok: !this.refusalReason,
      ...(this.refusalReason ? { refusalReason: this.refusalReason } : {}),
      payload: this.refusalReason ? undefined : { url: "http://127.0.0.1:3300/s/site", token: "scope-token", pid: 999 } }));
    callback(null); return true;
  }
}

test("desktop refusal reaches the server log and chat response without losing its reason", async t => {
  resetAssistantDaemonSingletonForTests(); ensureToolExecToken({ env: {} }, {});
  const parent = new Parent();
  const reason = "The assistant service still holds an older copy of this site. Restart the site or the app.";
  parent.refusalReason = reason;
  const log = t.mock.method(console, "error", () => {});
  const warning = t.mock.method(console, "warn", () => {});
  let body: unknown; let status: number | undefined;
  const res = { status(code: number) { status = code; return res; }, json(value: unknown) { body = value; return res; } };
  startAssistantDaemon({ workspaceId: "site", siteDir: "/site", siteApiOrigin: "http://127.0.0.1:3100" }, {
    parentIpc: parent, registerProcessSignalHandlers: false,
    spawnDaemonProcess: () => assert.fail("a refusal must not spawn a local daemon"),
  });
  try {
    assert.equal(await fetchAgentDaemon({ method: "POST", originalUrl: "/api/runs" } as Request, res as unknown as Response), null);
    assert.equal(status, 503);
    assert.deepEqual(body, { error: reason, code: "AGENT_DAEMON_UNAVAILABLE" });
    assert.deepEqual(log.mock.calls.map(call => call.arguments[0]), [`[assistant] the agent daemon is not ready: ${reason}`]);
    await assert.rejects(prepareAssistantPageBinding({}, {
      activate: (input, options) => activateAssistantDaemon(input, { ...options,
        request: async () => globalThis.Response.json(body, { status }),
      }),
    }), { message: reason }, "the chat binding must display the server's actual reason");
    await shutdownAssistantDaemon();
    assert.deepEqual(warning.mock.calls.map(call => call.arguments[0]), [
      `[daemon-supervisor] desktop scope withdrawal unavailable: ${reason}`,
    ]);
  } finally { resetAssistantDaemonSingletonForTests(); }
});

test("an activation failure without JSON reports its HTTP status and a recovery action", async () => {
  await assert.rejects(activateAssistantDaemon({}, {
    request: async () => new globalThis.Response("upstream stopped", { status: 502 }),
  }), { message: "The assistant service returned HTTP 502. Restart the site or the app." });
});

test("a latched failure retains its code while exposing the current readiness reason", async t => {
  const reason = "The assistant service lost its connection. Restart the site or the app.";
  const reasonCode = "previous-daemon-crash";
  recordAssistantDaemonFailure(reasonCode);
  t.mock.method(console, "error", () => {});
  let body: unknown;
  const res = { status(code: number) { assert.equal(code, 503); return res; }, json(value: unknown) { body = value; return res; } };
  try {
    await fetchAgentDaemon({ method: "POST", originalUrl: "/api/runs" } as Request, res as unknown as Response, {
      ensureReady: async () => { throw Object.assign(new Error(reason), { refusalReason: reason }); },
    });
    assert.deepEqual(body, { error: reason, code: "AGENT_DAEMON_KNOWN_FAILED", reasonCode });
  } finally { clearAssistantDaemonFailure(); }
});

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


test("inherited stopIfIdle is busy without a serving hook, on rejection, or on malformed results", async () => {
  for (const hook of [undefined, async () => { throw new Error('store offline'); }, async () => ({ idle: true, extra: 'invalid' })]) {
    resetAssistantDaemonSingletonForTests();
    const parent = new Parent();
    const replies: unknown[] = [];
    const send = parent.send.bind(parent);
    parent.send = (message, callback) => {
      if ((message as { kind: string }).kind === 'reply') replies.push(message);
      return send(message, callback);
    };
    startAssistantDaemon({ workspaceId: 'site', siteDir: '/site' }, { parentIpc: parent, registerProcessSignalHandlers: false });
    if (hook) registerSiteIdleStopHook({ stopIfIdle: hook });
    parent.emit('message', { jiniIpc: 1, kind: 'request', id: 'stop', payload: { operation: 'stopIfIdle' } });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(replies, [{ jiniIpc: 1, kind: 'reply', id: 'stop', ok: true, payload: { idle: false } }]);
  }
  resetAssistantDaemonSingletonForTests();
});

test("inherited stopIfIdle calls the serving hook on the existing channel", async () => {
  resetAssistantDaemonSingletonForTests();
  const parent = new Parent();
  let called = 0;
  startAssistantDaemon({ workspaceId: 'site', siteDir: '/site' }, { parentIpc: parent, registerProcessSignalHandlers: false });
  registerSiteIdleStopHook({ stopIfIdle: async () => { called++; return { idle: true }; } });
  parent.emit('message', { jiniIpc: 1, kind: 'request', id: 'stop', payload: { operation: 'stopIfIdle' } });
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(called, 1);
  resetAssistantDaemonSingletonForTests();
});

test('unexpected readiness failures expose plain recovery steps with redacted diagnostic detail', async t => {
  const { awaitDaemonForResponse } = await import('../../composition/modules/assistant-daemon-client.js');
  t.mock.method(console, 'error', () => {});
  let body!: { error: string; detail: string };
  const res = { status: () => res, json(value: typeof body) { body = value; return res; } };
  const secret = 'sk-ant-api03-very-secret-test-token';
  await awaitDaemonForResponse({ res: res as unknown as Response }, {
    ensureReady: async () => { throw new Error(`Connection failed: api_key=${secret} /Users/private/.credentials`); },
  });
  assert.match(body.error, /could not connect.*Retry/);
  assert.doesNotMatch(body.error, /Connection failed|api_key|Users/);
  assert.doesNotMatch(body.detail, new RegExp(secret));
  assert.doesNotMatch(body.detail, /\/Users\/private/);
});
