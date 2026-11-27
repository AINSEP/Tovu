import assert from "node:assert/strict";
import test from "node:test";
import { validateBackstopRequest, runAuditedBackstop, readBackstopMetadata } from "../backstop-service.js";
import type { BackstopAuditRecord, BackstopAuditPort, PackedEntity } from "@jini-ai/cms/publish/transfer";

test("the Tovu binding states the 200 row / 50 file cap and the 50 MB bundle cap in its own copy", () => {
  const body = { reason: "Emergency footer fix", typedHost: "live.example", rows: [], files: Array.from({ length: 51 }, (_, i) => `snippets/${i}.html`) };
  assert.deepEqual(validateBackstopRequest({ body, destinationHost: "live.example" }), { error: "Choose at most 200 rows and 50 files per send." });
  const file = { entityType: "raw-file", id: "a.txt", state: { size: 51 * 1024 * 1024 },
    backstop: { mode: "backstop", reason: "Emergency footer fix", sourceActor: "a", destinationHost: "live.example" } } as unknown as PackedEntity;
  assert.throws(() => readBackstopMetadata({ entities: [file] }), { message: "Choose at most 200 rows and 50 files totaling at most 50 MB per send." });
});

test("the Tovu binding redacts credential-shaped text from a failed send before it is audited", async () => {
  const records = new Map<string, BackstopAuditRecord>();
  const audit: BackstopAuditPort = {
    ready: async () => true, save: async ({ record }) => { records.set(record.id, record); },
    get: async ({ id }) => records.get(id) ?? null, gaps: async () => [],
  };
  const record: BackstopAuditRecord = { id: "send-r", workspaceId: "ws", direction: "source", actorId: "admin", destination: "live.example", reason: "Emergency footer fix",
    at: "2026-10-04T00:00:00.000Z", items: [], gapLabels: [], result: "pending", runId: null, details: {}, inverses: [] };
  const secret = "password=hunter2hunter2";
  await assert.rejects(runAuditedBackstop({ audit, record, work: async () => { throw new Error(`destination said ${secret}`); } }));
  const saved = String(records.get("send-r")?.details.error);
  assert.ok(!saved.includes("hunter2hunter2"), saved);
});

test("the audit ledger shows pending during work, then distinguishes a preview from a sent run", async () => {
  const records = new Map<string, BackstopAuditRecord>();
  const audit: BackstopAuditPort = {
    ready: async () => true, save: async ({ record }) => { records.set(`${record.workspaceId}/${record.id}`, record); },
    get: async ({ workspaceId, id }) => records.get(`${workspaceId}/${id}`) ?? null, gaps: async () => [],
  };
  for (const [id, successResult, runId] of [
    ["preview", "planned", null], ["send", undefined, "remote-run-7"],
  ] as const) {
    const record: BackstopAuditRecord = {
      id, workspaceId: "ws", direction: "source", actorId: "owner", destination: "live.example",
      reason: "Emergency footer fix", at: "2026-10-04T00:00:00.000Z", items: [], gapLabels: [],
      result: "pending", runId: null, details: {}, inverses: [],
    };
    assert.equal(await audit.get({ workspaceId: "ws", id }), null);
    const outcome = runId === null ? { selected: 3 } : { selected: 3, runId };
    assert.deepEqual(await runAuditedBackstop({
      audit, record, ...(successResult === undefined ? {} : { successResult }), work: async () => {
        assert.deepEqual(await audit.get({ workspaceId: "ws", id }), record);
        return outcome;
      },
    }), outcome);
    assert.deepEqual(await audit.get({ workspaceId: "ws", id }), {
      ...record, result: successResult ?? "success", details: outcome, runId,
    });
  }
});
