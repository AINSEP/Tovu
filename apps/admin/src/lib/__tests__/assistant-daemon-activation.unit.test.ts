import assert from "node:assert/strict";
import { test } from "vitest";
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
  const binding = prepareAssistantPageBinding({ bridge: { ready: attached.promise, bindToken: () => token } }, {
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

test("the page-stream adapter preserves native reconnect after a parked stream cleanly ends", () => {
  const tab = fakeBrowserOrigin().tab(); const native = new StreamFake("/api/frontend-sessions/stream");
  const source = openTabEventSource({ url: native.url }, { open: () => native, ports: tab.ports, activity: createStreamActivity({}) });
  const frames: unknown[] = [];
  source.addEventListener("message", event => frames.push(JSON.parse((event as MessageEvent).data)));
  // Native EventSource reports EOF as an error while reconnecting, then reopens the same source.
  native.readyState = 0; native.emit("error");
  assert.equal(native.closed, false); assert.equal(source.readyState, 0);
  native.readyState = 1; native.emit("open"); native.emit("message", '{"type":"attached","bindToken":"reconnected"}');
  assert.deepEqual(frames, [{ type: "attached", bindToken: "reconnected" }]);
  source.close();
});
