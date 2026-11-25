import assert from "node:assert/strict";
import test from "node:test";
import { createMediaBytesPolicy, type MediaBytesProbes } from "./media-bytes.js";
import type { HostBlobGcJournalEntry } from "#src/platform/db/repos/blob-gc-journal";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 25);
const WS = "ws-1";

const entry = (over: Partial<HostBlobGcJournalEntry> = {}): HostBlobGcJournalEntry => ({
  id: "media/ab/abc.png", workspaceId: WS, sha256: "abc", storageKey: "media/ab/abc.png",
  kind: "original", reason: "manual", journaledAt: new Date(NOW - 31 * DAY).toISOString(), ...over,
});

/** Every probe bound and answering "not referenced", so one override is the only thing that differs. */
const clearProbes = (over: Partial<MediaBytesProbes> = {}): MediaBytesProbes => ({
  live: async () => false, trashed: async () => false, rendition: async () => false,
  forms: async () => false, transfer: async () => false, recovery: async () => ({ protectedRestorePointAgeMs: null }), ...over,
});

function policyWith(required: { entries?: HostBlobGcJournalEntry[]; orphans?: Array<{ sha256: string; storageKey: string }>; probes?: MediaBytesProbes }) {
  const statted: string[] = [];
  const policy = createMediaBytesPolicy({
    gc: { workspaceId: WS, graceMs: 30 * DAY, now: () => NOW, listLegacyOrphans: async () => required.orphans ?? [] },
    journal: { list: async () => required.entries ?? [] },
    probes: required.probes ?? clearProbes(),
    stat: async (storageKey: string) => { statted.push(storageKey); return { size: 100 }; },
    signal: new AbortController().signal,
  }, {});
  return { policy, statted };
}

test("eligible only when every probe is bound and clear past grace; manual and Trash TTL stay apart", async () => {
  const { policy } = policyWith({ entries: [entry(), entry({ storageKey: "k2", id: "k2", sha256: "def", reason: "trash-ttl" })] });
  const report = await policy.report();
  assert.deepEqual(report.eligible.manual.map(item => item.storageKey), ["media/ab/abc.png"]);
  assert.deepEqual(report.eligible.trashTtl.map(item => item.storageKey), ["k2"]);
  assert.deepEqual(await policy.measure(), { bytes: 200, items: 2 });
});

test("trashed-media reference kept", async () => {
  const { policy } = policyWith({ entries: [entry()], probes: clearProbes({ trashed: async () => true }) });
  const report = await policy.report();
  assert.deepEqual(report.eligible, { manual: [], trashTtl: [] });
  assert.deepEqual(report.kept.map(item => item.why), ["trashed"]);
  assert.deepEqual(await policy.measure(), { bytes: 0, items: 0 });
});

test("an unbound probe keeps the bytes as unknown, never eligible", async () => {
  const { forms: _unbound, ...rest } = clearProbes();
  const { policy } = policyWith({ entries: [entry()], probes: rest });
  assert.deepEqual((await policy.report()).kept.map(item => item.why), ["unknown"]);
});

test("legacy orphan reported, not removed", async () => {
  const { policy, statted } = policyWith({ orphans: [{ sha256: "old", storageKey: "media/ol/old.jpg" }] });
  const report = await policy.report();
  assert.deepEqual(report.legacyOrphans.map(item => ({ storageKey: item.storageKey, reason: item.reason })), [{ storageKey: "media/ol/old.jpg", reason: null }]);
  assert.deepEqual(report.eligible, { manual: [], trashTtl: [] });
  assert.deepEqual(await policy.measure(), { bytes: 0, items: 0 });
  assert.equal("sweep" in policy, false, "the media policy has no sweep");
  assert.ok(statted.includes("media/ol/old.jpg"), "orphan bytes are measured for the report");
});

test("protected restore point extends grace", async () => {
  const held = clearProbes({ recovery: async () => ({ protectedRestorePointAgeMs: 40 * DAY }) });
  const { policy } = policyWith({ entries: [entry()], probes: held });
  assert.deepEqual((await policy.report()).kept.map(item => item.why), ["grace"]);
  const { policy: released } = policyWith({ entries: [entry({ journaledAt: new Date(NOW - 41 * DAY).toISOString() })], probes: held });
  assert.equal((await released.report()).eligible.manual.length, 1);
});
