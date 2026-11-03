import assert from "node:assert/strict";
import test from "node:test";

import { createNoopObservabilityPort } from "#src/platform/observability/index";
import { createHttpRunDaemonClient } from "../assistant-run-finalizer.js";

const TOKEN_ENV = "TOVU_AGENT_DAEMON_TOKEN";
const observability = createNoopObservabilityPort({});

test('a finished watch releases its pinned endpoint and capability while other principals stay pinned', async () => {
  let url = 'http://127.0.0.1:4200';
  const { calls, fetch } = recordingFetch(() => new Response(null, { status: 200 }));
  const client = createHttpRunDaemonClient({ observability }, { currentUrl: () => url, fetch });
  const first = { runId: 'shared-id', principalId: 'first' };
  const second = { runId: 'shared-id', principalId: 'second' };
  await client.runStatus(first, {});
  await client.runStatus(second, {});
  url = 'http://127.0.0.1:4300';
  await client.openEvents(first, {});
  assert.equal(calls.at(-1)?.url, 'http://127.0.0.1:4200/api/runs/shared-id/events', 'active watches keep their owning endpoint');
  assert.ok(client.release, 'the finalizer needs a release port for completed watches');
  client.release(first, {});
  client.release(first, {});
  await client.openEvents(first, {});
  assert.equal(calls.at(-1)?.url, 'http://127.0.0.1:4300/api/runs/shared-id/events');
  await client.openEvents(second, {});
  assert.equal(calls.at(-1)?.url, 'http://127.0.0.1:4200/api/runs/shared-id/events', 'releasing one principal must preserve the other watch');
  client.release(second, {});
});

test('a late status response cannot retain a retired daemon after its watch times out', async () => {
  let finish!: (response: Response) => void;
  const held = new Promise<Response>(resolve => { finish = resolve; });
  let url = 'http://127.0.0.1:4200';
  const { calls, fetch } = recordingFetch(address => address.endsWith('/events') ? new Response('') : held);
  const client = createHttpRunDaemonClient({ observability }, { currentUrl: () => url, fetch });
  const run = { runId: 'late-probe', principalId: 'owner' };
  const abort = new AbortController();
  const pending = client.runStatus(run, { signal: abort.signal });
  await new Promise<void>(resolve => setImmediate(resolve));
  abort.abort();
  client.release?.(run, {});
  url = 'http://127.0.0.1:4300';
  finish(new Response(null, { status: 200 }));
  await pending;
  await client.openEvents(run, {});
  assert.equal(calls.at(-1)?.url, 'http://127.0.0.1:4300/api/runs/late-probe/events');
});

/**
 * @file `createHttpRunDaemonClient` — the HTTP adapter the run finalizer uses to reach the agent
 * daemon. Every case injects `fetch`, so the request shapes (URL, verb, headers, body) and the
 * prior-daemon/current-daemon origin choice are asserted exactly, with no socket.
 */

test("a durable launch racing park wakes and keeps the same attempt identity", async () => {
  let sends = 0; let ready = 0;
  const calls: string[] = [];
  const client = createHttpRunDaemonClient({ observability }, {
    ensureReady: async () => { ready++; }, onParked: ({ pid }) => { assert.equal(pid, 800); },
    currentUrl: () => "http://127.0.0.1:4200",
    fetch: async (_url, init) => {
      calls.push(String(init?.body));
      return ++sends === 1
        ? Response.json({ code: "AGENT_DAEMON_PARKED" }, { status: 503, headers: { "x-tovu-daemon-parked": "1", "x-tovu-daemon-pid": "800" } })
        : new Response(null, { status: 202 });
    },
  });
  await client.launch!({ run: { runId: "attempt-1", principalId: "owner" } as never, request: { contextRef: "ctx" } }, {});
  assert.equal(ready, 2); assert.equal(sends, 2); assert.equal(calls[0], calls[1]);
  assert.equal(JSON.parse(calls[1]!).idempotencyKey, "attempt-1");
});

test("a durable mutation reset never replays the launch", async () => {
  let sends = 0;
  const client = createHttpRunDaemonClient({ observability }, {
    ensureReady: async () => {}, fetch: async () => { sends++; throw new TypeError("reset", { cause: { code: "ECONNRESET" } }); },
  });
  await assert.rejects(client.launch!({ run: { runId: "attempt-1", principalId: "owner" } as never, request: { contextRef: "ctx" } }, {}), /reset/);
  assert.equal(sends, 1);
});

interface Call { url: string; method: string; headers: Record<string, string>; body?: string }

function recordingFetch(answer: (url: string) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, ...(init.body ? { body: String(init.body) } : {}) });
    return answer(url);
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

function withToken(t: import("node:test").TestContext, value: string | undefined): void {
  const saved = process.env[TOKEN_ENV];
  if (value === undefined) delete process.env[TOKEN_ENV];
  else process.env[TOKEN_ENV] = value;
  t.after(() => { if (saved === undefined) delete process.env[TOKEN_ENV]; else process.env[TOKEN_ENV] = saved; });
}

test("launch POSTs the continuation to the current daemon with the run id as idempotency key and the bearer token", async (t) => {
  withToken(t, "tok-launch");
  const { calls, fetch } = recordingFetch(() => new Response("accepted", { status: 202 }));
  const client = createHttpRunDaemonClient({ observability }, { ensureReady: async () => {}, currentUrl: () => "http://127.0.0.1:4200", fetch });
  await client.launch!({ run: { runId: "run-9", principalId: "owner" } as never, request: { contextRef: "ctx-1", agentId: "agent-a" } }, {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "http://127.0.0.1:4200/api/runs");
  assert.equal(calls[0]!.method, "POST");
  assert.equal(calls[0]!.headers.Authorization, "Bearer tok-launch");
  assert.equal(calls[0]!.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[0]!.body!), { contextRef: "ctx-1", agentId: "agent-a", runId: "run-9", idempotencyKey: "run-9" });
});

test("launch surfaces a daemon refusal as an error naming the status; no token means no Authorization header", async (t) => {
  withToken(t, undefined);
  const { calls, fetch } = recordingFetch(() => new Response(null, { status: 409 }));
  const client = createHttpRunDaemonClient({ observability }, { ensureReady: async () => {}, currentUrl: () => "http://127.0.0.1:4200", fetch });
  await assert.rejects(client.launch!({ run: { runId: "run-9", principalId: "owner" } as never, request: { contextRef: "ctx-1" } }, {}), { message: "continuation rejected (409)" });
  assert.equal("Authorization" in calls[0]!.headers, false);
});

test("cancel fences the run on the daemon that still owns it: the replayed current origin once adopted, else the live prior daemon", async () => {
  const { calls, fetch } = recordingFetch((url) => new Response(null, { status: url.endsWith("/api/runs/run%2F1") && url.includes(":4300") ? 200 : 404 }));
  const client = createHttpRunDaemonClient({ observability }, {
    previousDaemon: async () => ({ url: "http://127.0.0.1:4100", pid: 1 }),
    isAlive: () => true,
    currentUrl: () => "http://127.0.0.1:4300",
    fetch,
  });
  const run = { runId: "run/1", principalId: "owner" };
  await client.cancel!(run, {});
  // The prior daemon answers 404 and the current one 200, so the run is adopted on the current origin.
  assert.equal(await client.runStatus(run, {}), 200);
  await client.cancel!(run, {});
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), [
    "POST http://127.0.0.1:4100/api/runs/run%2F1/cancel",
    "GET http://127.0.0.1:4100/api/runs/run%2F1",
    "GET http://127.0.0.1:4300/api/runs/run%2F1",
    "POST http://127.0.0.1:4300/api/runs/run%2F1/cancel",
  ]);
  assert.deepEqual(JSON.parse(calls[0]!.body!), { reason: "recovery-fence" });
});

test("runStatus: a current daemon that also lacks the run reports its status and forgets any adoption", async () => {
  const { calls, fetch } = recordingFetch(() => new Response(null, { status: 404 }));
  const client = createHttpRunDaemonClient({ observability }, {
    previousDaemon: async () => ({ url: "http://127.0.0.1:4100", pid: 1 }),
    isAlive: () => true,
    currentUrl: () => "http://127.0.0.1:4300",
    fetch,
  });
  assert.equal(await client.runStatus({ runId: "r", principalId: "owner" }, {}), 404);
  await client.openEvents({ runId: "r", principalId: "owner" }, {});
  assert.deepEqual(calls.map((call) => call.url), [
    "http://127.0.0.1:4100/api/runs/r",
    "http://127.0.0.1:4300/api/runs/r",
    "http://127.0.0.1:4100/api/runs/r/events",
  ]);
});

test("runStatus: an unreachable prior daemon is null there, and an aborted probe never moves on to the current daemon", async () => {
  const { calls, fetch } = recordingFetch(() => { throw new Error("ECONNREFUSED"); });
  const client = createHttpRunDaemonClient({ observability }, {
    previousDaemon: async () => ({ url: "http://127.0.0.1:4100", pid: 1 }),
    isAlive: () => true,
    currentUrl: () => "http://127.0.0.1:4300",
    fetch,
  });
  const aborted = new AbortController();
  aborted.abort();
  assert.equal(await client.runStatus({ runId: "r", principalId: "owner" }, { signal: aborted.signal }), null);
  assert.deepEqual(calls.map((call) => call.url), ["http://127.0.0.1:4100/api/runs/r"]);
  assert.equal(await client.runStatus({ runId: "r", principalId: "owner" }, {}), null);
  assert.deepEqual(calls.map((call) => call.url), ["http://127.0.0.1:4100/api/runs/r", "http://127.0.0.1:4100/api/runs/r", "http://127.0.0.1:4300/api/runs/r"]);
});

test("with no prior-daemon discovery the current daemon is the only origin, and its status is returned as-is", async () => {
  const { calls, fetch } = recordingFetch(() => new Response(null, { status: 404 }));
  const client = createHttpRunDaemonClient({ observability }, { ensureReady: async () => {}, currentUrl: () => "http://127.0.0.1:4300", fetch });
  assert.equal(await client.runStatus({ runId: "r", principalId: "owner" }, {}), 404);
  assert.deepEqual(calls.map((call) => call.url), ["http://127.0.0.1:4300/api/runs/r"]);
});

test("a recorded prior daemon whose process is gone (default liveness probe) is skipped for the current daemon", async () => {
  const { calls, fetch } = recordingFetch(() => new Response(null, { status: 200 }));
  // pid 2**30 is far above any Linux/macOS pid_max, so the real liveness probe reports it dead.
  const client = createHttpRunDaemonClient({ observability }, {
    previousDaemon: async () => ({ url: "http://127.0.0.1:4100", pid: 2 ** 30 }),
    currentUrl: () => "http://127.0.0.1:4300",
    fetch,
  });
  assert.equal(await client.runStatus({ runId: "r", principalId: "owner" }, {}), 200);
  assert.deepEqual(calls.map((call) => call.url), ["http://127.0.0.1:4300/api/runs/r"]);
});


test("first durable launch waits for readiness and dispatches the accepted identity exactly once", async () => {
  let ready!: () => void;
  const started = new Promise<void>((resolve) => { ready = resolve; });
  const { calls, fetch } = recordingFetch(() => new Response(null, { status: 201 }));
  const client = createHttpRunDaemonClient({ observability }, {
    ensureReady: () => started, currentUrl: () => "http://127.0.0.1:4200", fetch,
  });
  const pending = client.launch!({ run: { runId: "accepted-1", principalId: "owner" } as never, request: { contextRef: "{}" } }, {});
  assert.equal(calls.length, 0);
  ready(); await pending;
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0]!.body!).idempotencyKey, "accepted-1");
});
