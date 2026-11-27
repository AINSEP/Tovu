import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithDaemonParkRecovery } from "../daemon-demand-fetch.js";
import { ensureAssistantDaemonReady, isAssistantDaemonReady, resetAssistantDaemonSingletonForTests, startAssistantDaemon } from "../daemon-supervisor.js";
import { EventEmitter } from "node:events";

/** Wire parity only: the replay decision itself is tested in `@jini-ai/sidecar`
 * (`daemon-park-recovery.test.ts`). These prove the Tovu binding reads Tovu's header names. */
test("only an identified pre-dispatch park refusal can replay a request", async () => {
  const refusals: Record<string, string>[] = [{}, { "x-tovu-daemon-parked": "1" }, { "x-tovu-daemon-parked": "1", "x-tovu-daemon-pid": "invalid" }];
  for (const headers of refusals) {
    let sends = 0;
    const response = await fetchWithDaemonParkRecovery({ send: async () => { sends++; return new Response(null, { status: 503, headers }); } }, {
      ensureReady: async () => { assert.fail("generic unavailability must never replay a request"); },
    });
    assert.equal(sends, 1); assert.equal(response.status, 503);
  }
});

test("repeated park refusals stay bounded and refresh the endpoint after waking", async () => {
  const origins: string[] = []; let origin = "old"; let wakes = 0;
  const response = await fetchWithDaemonParkRecovery({ send: async () => {
    origins.push(origin);
    return new Response(null, { status: 503, headers: { "x-tovu-daemon-parked": "1", "x-tovu-daemon-pid": "800" } });
  } }, {
    onParked: ({ pid }) => { assert.equal(pid, 800); },
    ensureReady: async () => { wakes++; origin = "new"; },
  });
  assert.equal(response.status, 503); assert.equal(wakes, 1);
  assert.deepEqual(origins, ["old", "new"]);
});

test("a passive park refusal updates the real supervisor without waking or replaying", { timeout: 2000 }, async t => {
  resetAssistantDaemonSingletonForTests();
  t.after(resetAssistantDaemonSingletonForTests);
  const child = Object.assign(new EventEmitter(), { pid: 800, kill: () => assert.fail("a park notice must not kill the child") });
  let spawns = 0;
  startAssistantDaemon({ workspaceId: "parked-site", siteDir: "/unused" }, {
    parentIpc: false, registerProcessSignalHandlers: false, refreshPort: async () => {},
    readDiscovery: async () => ({ pid: 800, url: "http://127.0.0.1:4513" }),
    spawnDaemonProcess: () => { spawns++; return child; },
  });
  await ensureAssistantDaemonReady({}, {});
  assert.equal(isAssistantDaemonReady(), true);

  for (const [pid, stillReady] of [[801, true], [800, false]] as const) {
    const refusal = new Response("parked before dispatch", { status: 503, headers: { "x-tovu-daemon-parked": "1", "x-tovu-daemon-pid": String(pid) } });
    let sends = 0;
    const returned = await fetchWithDaemonParkRecovery({ send: async () => { sends++; return refusal; } }, { passive: true });
    assert.equal(returned, refusal);
    assert.equal(await returned.text(), "parked before dispatch");
    assert.equal(sends, 1);
    assert.equal(spawns, 1);
    assert.equal(isAssistantDaemonReady(), stillReady);
  }
  child.emit("exit", 88, null);
});
