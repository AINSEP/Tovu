import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithDaemonParkRecovery } from "../daemon-demand-fetch.js";

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
