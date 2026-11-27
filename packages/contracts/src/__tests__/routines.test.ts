import assert from "node:assert/strict";
import test from "node:test";

import { isRoutineReconcileMessage, parseRoutineBeacon, parseRoutineRunMarker, ROUTINES_RELEASE_ENABLED, routineUserTurnId } from "../routines.js";

test("the routine rollout remains opt-in", () => {
  assert.equal(ROUTINES_RELEASE_ENABLED, false);
});

test("wake reconciliation accepts only the exact private IPC message", () => {
  const wake = { type: "routines.reconcile", reason: "wake" };
  assert.equal(isRoutineReconcileMessage(wake), true);
  for (const invalid of [null, "wake", Object.assign([], wake), { ...wake, siteId: "other" },
    { ...wake, type: "routines.run" }, { ...wake, reason: "startup" }]) {
    assert.equal(isRoutineReconcileMessage(invalid), false);
  }
});

test("routine startup beacons reject malformed data and retain the committed count and timestamp", () => {
  const beacon = { v: 1, enabled: 0, updatedAt: 1_730_000_000_000 };
  const json = JSON.stringify(beacon);
  assert.deepEqual(parseRoutineBeacon({ text: json.padEnd(4096) }), beacon);
  assert.equal(parseRoutineBeacon({ text: json.padEnd(4097) }), null);
  for (const text of ["{", "null", "7", JSON.stringify({ ...beacon, v: 2 }),
    JSON.stringify({ ...beacon, enabled: 1.5 }), JSON.stringify({ ...beacon, enabled: -1 }),
    JSON.stringify({ ...beacon, updatedAt: 2 ** 53 })]) {
    assert.equal(parseRoutineBeacon({ text }), null, text);
  }
});

test("the routine beacon wire limit counts UTF-8 bytes, not JavaScript characters", () => {
  const beacon = { v: 1, enabled: 2, updatedAt: 42 };
  const text = JSON.stringify({ ...beacon, note: "x".repeat(1950) + "é".repeat(1100) });
  assert.ok(text.length < 4096 && Buffer.byteLength(text, "utf8") > 4096);
  assert.equal(parseRoutineBeacon({ text }), null);
});

test("routine markers reject extra, missing or invalid fields without accepting a partial marker", () => {
  const marker = { routineId: "daily", runId: "run-37", catchUp: true, slotAt: 1_730_000_000_000 };
  assert.deepEqual(parseRoutineRunMarker({ value: marker }), marker);
  assert.deepEqual(parseRoutineRunMarker({ value: { ...marker, slotAt: null } }), { ...marker, slotAt: null });
  for (const value of [null, "run-37", Object.assign([], marker), { ...marker, extra: 1 },
    { routineId: "daily", runId: "run-37", catchUp: true }, { ...marker, routineId: 1 },
    { ...marker, routineId: "" }, { ...marker, runId: 37 }, { ...marker, runId: "" },
    { ...marker, catchUp: 1 }, { ...marker, slotAt: "1730000000000" },
    { ...marker, slotAt: Infinity }]) {
    assert.equal(parseRoutineRunMarker({ value }), null);
  }
});

test("routine turns have different durable ids for scheduled and run-now attempts", () => {
  assert.equal(routineUserTurnId({ marker: { runId: "run-37", slotAt: 0 } }), "routine-run-37-user-0");
  assert.equal(routineUserTurnId({ marker: { runId: "run-37", slotAt: null } }), "routine-run-37-user-now");
});
