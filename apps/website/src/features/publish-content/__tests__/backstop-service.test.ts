import assert from "node:assert/strict";
import test from "node:test";
import { validateBackstopRequest, runAuditedBackstop, mayUseBackstop } from "../backstop-service.js";
import type { BackstopAuditRecord, BackstopAuditPort } from "../backstop-audit.js";

test("wrong typed host and a short reason are rejected with plain exact text", () => {
  const body = { reason: "Emergency footer fix", typedHost: "wrong.example", rows: [{ table: "p_widgets", pk: { id: "x" } }], files: [] };
  assert.deepEqual(validateBackstopRequest({ body, destinationHost: "live.example" }), { error: "Type live.example to confirm where this send will go." });
  assert.deepEqual(validateBackstopRequest({ body: { ...body, typedHost: "live.example", reason: "short" }, destinationHost: "live.example" }), { error: "Explain why you need this send in at least 10 characters." });
  assert.deepEqual(validateBackstopRequest({ body: { ...body, typedHost: "live.example" }, destinationHost: "live.example" }), {
    request: { reason: body.reason, typedHost: "live.example", selection: { rows: body.rows, files: [] } },
  });
});

test("row/file/byte caps and duplicate selections cannot widen the send", () => {
  const body = { reason: "Emergency footer fix", typedHost: "live.example", rows: [], files: Array.from({ length: 51 }, (_, i) => `snippets/${i}.html`) };
  assert.deepEqual(validateBackstopRequest({ body, destinationHost: "live.example" }), { error: "Choose at most 200 rows and 50 files per send." });
  assert.ok("error" in validateBackstopRequest({ body: { ...body, rows: Array(201).fill({ table: "p_widgets", pk: { id: "x" } }), files: [] }, destinationHost: "live.example" }));
});

test("only the owner and built-in admin qualify; custom wildcard roles cannot bypass this", async () => {
  const roles = { list: async () => [{ isBuiltin: false, name: "admin" }] };
  assert.equal(await mayUseBackstop({ actorId: "editor", ownerId: "owner", roles }), false);
  assert.equal(await mayUseBackstop({ actorId: "owner", ownerId: "owner", roles }), true);
  assert.equal(await mayUseBackstop({ actorId: "admin", ownerId: "owner", roles: { list: async () => [{ isBuiltin: true, name: "admin" }] } }), true);
});

test("source audit persists success AND failure, including the destination run id", async () => {
  const records = new Map<string, BackstopAuditRecord>();
  const audit: BackstopAuditPort = {
    ready: async () => true, save: async ({ record }) => { records.set(record.id, record); },
    get: async ({ id }) => records.get(id) ?? null, gaps: async () => [],
  };
  const record: BackstopAuditRecord = { id: "send-1", workspaceId: "ws", direction: "source", actorId: "admin", destination: "live.example", reason: "Emergency footer fix",
    at: "2026-10-04T00:00:00.000Z", items: [], gapLabels: ["table:p_widgets"], result: "pending", runId: null, details: {}, inverses: [] };
  const success = await runAuditedBackstop({ audit, record, work: async () => ({ runId: "run-dest", value: 42 }) });
  assert.equal(success.value, 42);
  assert.equal(records.get("send-1")?.result, "success");
  assert.equal(records.get("send-1")?.runId, "run-dest");
  await assert.rejects(runAuditedBackstop({ audit, record: { ...record, id: "send-2" }, work: async () => { throw new Error("destination refused"); } }), /destination refused/);
  assert.equal(records.get("send-2")?.result, "failure");
  assert.equal(records.get("send-2")?.details.error, "destination refused");
});

test("missing audit storage stops before any outbound write", async () => {
  let called = false;
  await assert.rejects(runAuditedBackstop({ audit: { ready: async () => false } as BackstopAuditPort, record: {} as BackstopAuditRecord,
    work: async () => { called = true; return {}; } }), /audit storage/);
  assert.equal(called, false);
});
