import assert from "node:assert/strict";
import test from "node:test";

import type { BackstopAuditPort, BackstopAuditRecord } from "@jini-ai/cms/publish/transfer";
import { runAuditedBackstop } from "../backstop-service.js";
import { PUBLISH_CONTENT_BUNDLE_MAX_BODY_BYTES } from "@jini-ai/cms/publish/transfer";
import { PUBLISH_CONTENT_PULL_MAX_BLOBS } from "../peer-transport.js";

/**
 * @file Guards of the publish engine that no other suite could see being changed (publish-engine
 * design section 3: K9, D9, D12). Written before the engine is split or moved; each test was shown
 * to fail when the value or step it names is changed.
 */

test("T-K9c: one pull request transfers at most 2,000 blobs", () => {
  assert.equal(PUBLISH_CONTENT_PULL_MAX_BLOBS, 2000);
});

test("T-D9c: a staged bundle body is capped at 20 MB", () => {
  assert.equal(PUBLISH_CONTENT_BUNDLE_MAX_BODY_BYTES, 20 * 1024 * 1024);
});

const RECORD: BackstopAuditRecord = {
  id: "audit-1",
  workspaceId: "ws-1",
  direction: "source",
  actorId: "owner-1",
  destination: "dest.example",
  reason: "a reason of enough length",
  at: "2026-11-16T00:00:00.000Z",
  items: [],
  gapLabels: [],
  result: "planned",
  runId: null,
  details: {},
  inverses: [],
};

/** A fake of the audit port that records the order of saves relative to the audited work. */
function recordingAudit(): { audit: BackstopAuditPort; events: string[] } {
  const events: string[] = [];
  const audit: BackstopAuditPort = {
    ready: async () => true,
    save: async ({ record }) => { events.push(`save:${record.result}`); },
    get: async () => null,
    gaps: async () => [],
  };
  return { audit, events };
}

test("T-D12h: a raw send is recorded as pending BEFORE its work runs, then as its result", async () => {
  const { audit, events } = recordingAudit();

  const result = await runAuditedBackstop({ audit, record: RECORD, work: async () => { events.push("work"); return { runId: "run-9" }; } });

  assert.deepEqual(result, { runId: "run-9" });
  assert.deepEqual(events, ["save:pending", "work", "save:success"]);
});

test("T-D12h: a raw send that fails is still on record: pending first, failure after, and the error is rethrown", async () => {
  const { audit, events } = recordingAudit();
  const failure = new Error("the destination refused");

  await assert.rejects(runAuditedBackstop({ audit, record: RECORD, work: async () => { events.push("work"); throw failure; } }), (error) => error === failure);

  assert.deepEqual(events, ["save:pending", "work", "save:failure"]);
});

test("T-D12g: a raw send does no work and writes nothing when its audit storage is not installed", async () => {
  const { audit, events } = recordingAudit();
  const notReady: BackstopAuditPort = { ...audit, ready: async () => false };

  await assert.rejects(
    runAuditedBackstop({ audit: notReady, record: RECORD, work: async () => { events.push("work"); return {}; } }),
    /needs its audit storage installed/
  );

  assert.deepEqual(events, []);
});
