/** P11 ST-1a.T — the isolated probe's verdict. Fixture readings only; no Electron, no production path. */
import assert from "node:assert/strict";
import test from "node:test";
import { probeVerdict, type ProbeReadings } from "./verdict.ts";

const MiB = 2 ** 20;
const KEPT = { cookie: true, localStorage: true, indexedDb: true };
const EXPECTED = { electronVersion: "43.8.6", platform: "darwin-arm64" };
const GOOD: ProbeReadings = {
  electronVersion: "43.8.6", platform: "darwin-arm64", profileVerified: true, capBytes: 32 * MiB,
  partitions: [{ name: "persist:site-a", cacheBytes: 33 * MiB, codeCacheBytes: 2 * MiB }, { name: "persist:site-b", cacheBytes: 31 * MiB, codeCacheBytes: 2 * MiB }],
  uncappedControlBytes: 120 * MiB,
  survival: { clearCache: KEPT, clearCodeCaches: KEPT, diskCache: KEPT, diskCodeCache: KEPT },
  negativeControlDetectedLoss: true,
};
const verdict = (readings: ProbeReadings) => probeVerdict({ readings, expected: EXPECTED });

test("T-1a.1 cache stays under the switch per partition", () => {
  assert.deepEqual(verdict(GOOD), { cap: "go", clearOps: { clearCache: "go", clearCodeCaches: "go" }, reasons: [] });
});

test("T-1a.2 cookie, Local Storage and IndexedDB survive each cache operation", () => {
  for (const key of ["clearCache", "diskCache"] as const) {
    const lost = verdict({ ...GOOD, survival: { ...GOOD.survival, [key]: { ...KEPT, indexedDb: false } } });
    assert.equal(lost.clearOps.clearCache, "no-go", `${key} loss blocks clearCache (API and disk are a conjunction)`);
    assert.equal(lost.clearOps.clearCodeCaches, "go");
  }
  assert.equal(verdict({ ...GOOD, survival: { ...GOOD.survival, diskCodeCache: null } }).clearOps.clearCodeCaches, "no-go");
  assert.equal(verdict({ ...GOOD, negativeControlDetectedLoss: false }).clearOps.clearCache, "no-go", "a blind probe proves nothing");
});

test("T-1a.3 verdict is NO-GO above 1.25 × cap", () => {
  const over = verdict({ ...GOOD, partitions: [GOOD.partitions[0]!, { name: "persist:site-b", cacheBytes: 41 * MiB, codeCacheBytes: 0 }] });
  assert.equal(over.cap, "no-go");
  assert.equal(verdict({ ...GOOD, partitions: [GOOD.partitions[0]!, { name: "persist:site-b", cacheBytes: null, codeCacheBytes: 0 }] }).cap, "no-go");
  assert.equal(verdict({ ...GOOD, uncappedControlBytes: 30 * MiB }).cap, "no-go", "a cap the uncapped control never reaches is not shown to work");
});

test("shared pool is not evidence of a per-partition cap", () => {
  const shared = verdict({ ...GOOD, partitions: [{ name: "persist:site-a", cacheBytes: 16 * MiB, codeCacheBytes: 0 }, { name: "persist:site-b", cacheBytes: 16 * MiB, codeCacheBytes: 0 }] });
  assert.equal(shared.cap, "no-go");
  assert.equal(verdict({ ...GOOD, partitions: [GOOD.partitions[0]!] }).cap, "no-go");
});

test("wrong profile or Electron version cannot yield GO", () => {
  for (const readings of [{ ...GOOD, electronVersion: "43.8.7" }, { ...GOOD, platform: "win32-x64" }, { ...GOOD, profileVerified: false }]) {
    assert.deepEqual(verdict(readings).cap, "no-go");
    assert.deepEqual(verdict(readings).clearOps, { clearCache: "no-go", clearCodeCaches: "no-go" });
  }
});
