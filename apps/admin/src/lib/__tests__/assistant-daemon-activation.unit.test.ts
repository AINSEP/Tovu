import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { createFrontendSessionBridge } from "@jini-ai/chat/browser/frontend-session-bridge";
import { activateAssistantDaemon, prepareAssistantPageBinding } from "../assistant-daemon-activation";
import { openTabEventSource } from "../tab-event-source";
import { createStreamActivity } from "../stream-activity";
import { fakeBrowserOrigin, StreamFake } from "./browser-stream.fakes";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("first send awaits daemon activation and bridge readiness, then reads the current bind token", async () => {
  const attached = deferred<{ sessionId: string; bindToken: string }>();
  let token: string | undefined;
  let activated = 0;
  const binding = prepareAssistantPageBinding({ bridge: { rebind: () => attached.promise, bindToken: () => token } }, {
    activate: async () => { activated++; },
  });
  let done = false; void binding.then(() => { done = true; });
  await Promise.resolve(); assert.equal(activated, 1); assert.equal(done, false);
  token = "bind-current";
  attached.resolve({ sessionId: "tab", bindToken: "bind-old" });
  assert.equal(await binding, "bind-current", "read bindToken() after ready, never the frozen run input or resolved token");
});

test("dock pre-warm uses the session-authenticated activation endpoint", async () => {
  let seen: { url: unknown; init?: RequestInit } | undefined;
  await activateAssistantDaemon({}, { request: (async (url, init) => {
    seen = { url, init }; return new Response(null, { status: 204 });
  }) as typeof fetch });
  assert.equal(seen?.url, "/api/frontend-sessions/activate");
  assert.equal(seen?.init?.method, "POST");
  assert.equal(seen?.init?.credentials, "same-origin");
});

test("wake rebinds a previously parked bridge", async () => {
  const tab = fakeBrowserOrigin().tab(); const sources: StreamFake[] = [];
  const bridge = createFrontendSessionBridge({ baseUrl: "", fetch: vi.fn() as typeof fetch,
    openStream: ({ url }) => openTabEventSource({ url }, { ports: tab.ports, activity: createStreamActivity({}),
      open: value => { const source = new StreamFake(value); sources.push(source); return source; },
    }),
  });
  try {
    sources[0]!.emit("message", '{"type":"attached","sessionId":"old","bindToken":"old"}');
    await bridge.ready;
    sources[0]!.emit("parked", "{}");
    assert.equal(sources[0]!.closed, true);
    tab.hide(); tab.advance(60_000); tab.show();
    assert.equal(sources.length, 1, "visibility must not wake a parked daemon");
    const awake = deferred<void>();
    const waiting = prepareAssistantPageBinding({ bridge }, { activate: () => awake.promise });
    await Promise.resolve();
    assert.equal(sources.length, 1, "reopen only after authenticated activation succeeds");
    awake.resolve();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(sources.length, 2);
    sources[1]!.emit("message", '{"type":"attached","sessionId":"new","bindToken":"fresh"}');
    assert.equal(await waiting, "fresh");
  } finally { bridge.close(); }
});

test("send waits for the current bind and honors cancellation", async () => {
  const sources: StreamFake[] = [];
  const bridge = createFrontendSessionBridge({ baseUrl: "", fetch: vi.fn() as typeof fetch,
    openStream: ({ url }) => { const source = new StreamFake(url); sources.push(source); return source; },
  });
  try {
    sources[0]!.emit("message", '{"type":"attached","sessionId":"old","bindToken":"old"}');
    await bridge.ready; sources[0]!.emit("error");
    const stop = new AbortController();
    const reason = new DOMException("stopped", "AbortError");
    const waiting = prepareAssistantPageBinding({ bridge, signal: stop.signal }, { activate: async () => {} });
    let settled = false; void waiting.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(settled, false, "first readiness cannot satisfy the new attachment wait");
    const rejected = assert.rejects(waiting, error => error === reason);
    stop.abort(reason); await rejected;
    sources[1]!.emit("message", '{"type":"attached","sessionId":"new","bindToken":"fresh"}');
    assert.equal(await prepareAssistantPageBinding({ bridge }, { activate: async () => {} }), "fresh");
  } finally { bridge.close(); }
});

test("a required attachment without a live token fails instead of accepting undefined", async () => {
  await assert.rejects(prepareAssistantPageBinding({ bridge: {
    rebind: async () => ({ sessionId: "old", bindToken: "stale" }), bindToken: () => undefined,
  } }, { activate: async () => {} }), /not attached/);
});

test("attachment gets at most five seconds after activation and cancellation before wake does not reopen", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const rebind = vi.fn(async () => ({ sessionId: "s", bindToken: "fresh" }));
  const wake = deferred<void>();
  try {
    const waiting = prepareAssistantPageBinding({ bridge: { rebind, bindToken: () => "fresh" } }, { activate: () => wake.promise });
    assert.equal(timeout.mock.calls.length, 0);
    wake.resolve(); assert.equal(await waiting, "fresh");
    assert.deepEqual(timeout.mock.calls, [[5_000]]);
    assert.ok(rebind.mock.calls.length === 1);
    const stop = new AbortController(); stop.abort(new Error("stopped"));
    await assert.rejects(prepareAssistantPageBinding({ bridge: { rebind, bindToken: () => "fresh" }, signal: stop.signal }, {
      activate: async () => {},
    }), /stopped/);
    assert.equal(rebind.mock.calls.length, 1);
  } finally { timeout.mockRestore(); }
});
