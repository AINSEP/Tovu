import assert from "node:assert/strict";
import test from "node:test";
import { createFakeSiteUpdate } from "@jini-ai/devops/deploy";
import { readSiteUpdateStatus } from "../read-status.js";

/** @file The admin status read: plain availability only, and every failure stays on the server. */

const SECRET = "https://user:hunter2@feed.internal.example/releases?token=s3cret";

function reader({ running = async () => "1.2.0", latest = async () => ({ version: "1.3.0", notes: "Faster pages." }) }: { running?: () => Promise<string>; latest?: () => Promise<{ version: string; notes: string } | null> } = {}) {
  const ids = createFakeSiteUpdate({ runningVersion: "1.2.0", latest: { version: "1.3.0", notes: "" } }).ports.ids;
  const reports: unknown[] = [];
  const runtime = { runningVersion: running, feed: { latestRelease: latest }, ids };
  const reportFailure = (required: { error: unknown }) => void reports.push(required);
  return { runtime, reports, reportFailure };
}

test("an unconfigured host is unavailable without any read", async () => {
  const reports: unknown[] = [];
  assert.deepEqual(await readSiteUpdateStatus({ runtime: null, reportFailure: (r) => void reports.push(r) }), { availability: { kind: "unavailable" } });
  assert.deepEqual(reports, []);
});

test("a newer release is available and an equal one is current", async () => {
  const newer = reader();
  assert.deepEqual(await readSiteUpdateStatus(newer), { availability: { kind: "available", runningVersion: "1.2.0", latest: "1.3.0", notes: "Faster pages." } });
  const same = reader({ latest: async () => ({ version: "1.2.0", notes: "" }) });
  assert.deepEqual(await readSiteUpdateStatus(same), { availability: { kind: "current", runningVersion: "1.2.0" } });
  assert.deepEqual([...newer.reports, ...same.reports], []);
});

test("a failed running version read or feed read returns no private details", async () => {
  const failures = [
    reader({ running: async () => { throw new Error(`version probe failed at ${SECRET}`); } }),
    reader({ latest: async () => { throw new Error(`feed ${SECRET} answered 401`); } }),
  ];
  for (const failing of failures) {
    const reply = await readSiteUpdateStatus(failing);
    assert.deepEqual(reply, { availability: { kind: "check-failed" } });
    assert.ok(!JSON.stringify(reply).includes("hunter2"));
    // The reporter gets the error object only: no feed URL, no message copy, no operation-chosen extras.
    assert.equal(failing.reports.length, 1);
    assert.deepEqual(Object.keys(failing.reports[0] as object), ["error"]);
    assert.ok((failing.reports[0] as { error: unknown }).error instanceof Error);
  }
});

test("a cancelled read stays a cancellation and reports nothing", async () => {
  const controller = new AbortController();
  const cancelled = reader({ latest: async () => { controller.abort(); throw controller.signal.reason; } });
  await assert.rejects(readSiteUpdateStatus(cancelled, { signal: controller.signal }), { name: "AbortError" });
  assert.deepEqual(cancelled.reports, []);
});

test("the last attempt is readable even when the release feed check fails", async () => {
  const attempt = { status: "updating" as const, toVersion: "1.3.0", summary: "Updating to 1.3.0." };
  const signals: (AbortSignal | undefined)[] = [];
  const readLastAttempt = async (_required: Record<string, never>, optional?: { signal?: AbortSignal | undefined }) => {
    signals.push(optional?.signal);
    // A journal row carries internals; only the safe projection may reach the admin.
    return { ...attempt, backupPath: "/srv/site/ops/restore-points/x.db", error: SECRET } as typeof attempt;
  };
  const failing = reader({ latest: async () => { throw new Error(`fetch failed for ${SECRET}`); } });
  const signal = new AbortController().signal;
  const reply = await readSiteUpdateStatus({ runtime: failing.runtime, reportFailure: failing.reportFailure, readLastAttempt }, { signal });
  assert.deepEqual(reply, { availability: { kind: "check-failed" }, lastAttempt: attempt });
  assert.equal(signals[0], signal, "cancellation is forwarded to the journal read");
  const current = reader({ latest: async () => null });
  assert.deepEqual(await readSiteUpdateStatus({ runtime: current.runtime, reportFailure: current.reportFailure, readLastAttempt }), { availability: { kind: "current", runningVersion: "1.2.0" }, lastAttempt: attempt });
  assert.deepEqual(await readSiteUpdateStatus({ runtime: current.runtime, reportFailure: current.reportFailure }), { availability: { kind: "current", runningVersion: "1.2.0" } }, "no journal reader: no lastAttempt");
  assert.deepEqual(await readSiteUpdateStatus({ runtime: current.runtime, reportFailure: current.reportFailure, readLastAttempt: async () => undefined }), { availability: { kind: "current", runningVersion: "1.2.0" } });
});
