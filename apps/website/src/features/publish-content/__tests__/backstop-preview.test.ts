import assert from "node:assert/strict";
import test from "node:test";
import { buildBackstopPreview } from "../backstop-preview.js";
import type { BackstopPorts, RawRowSnapshot } from "../backstop-ports.js";
import type { PackedEntity } from "../type-registry.js";

const row: RawRowSnapshot = { table: "p_banner", pk: { id: "one" }, columns: [{ name: "id", type: "TEXT", pk: 1, notnull: 1 }, { name: "title", type: "TEXT", pk: 0, notnull: 1 }], values: { id: "one", title: "Old footer" } };
const entity = { entityType: "raw-row", id: 'p_banner:{"id":"one"}', state: { ...row, values: { id: "one", title: "New footer" } } } as unknown as PackedEntity;
function ports(live: RawRowSnapshot | null): BackstopPorts {
  return { coveredTables: [], coveredRoots: [], rows: { read: async () => live } as BackstopPorts["rows"] };
}
test("preview exposes actual live and local values for an allowed raw row", async () => {
  const result = await buildBackstopPreview({ entities: [entity], backstop: ports(row), workspaceId: "ws" });
  assert.deepEqual(result, [{ entityType: "raw-row", entityId: entity.id, before: row.values, after: entity.state.values, unavailableReason: null }]);
});
test("preview never discloses a protected live column, secret value, or foreign workspace", async () => {
  for (const live of [
    { ...row, values: { ...row.values, api_token: "private" }, columns: [...row.columns, { name: "api_token", type: "TEXT", pk: 0, notnull: 0 }] },
    { ...row, values: { ...row.values, title: "sk-ant-api03-" + "a".repeat(100) } },
    { ...row, values: { ...row.values, workspace_id: "other" } },
  ]) {
    const result = await buildBackstopPreview({ entities: [entity], backstop: ports(live), workspaceId: "ws" });
    assert.equal(result[0].before, null); assert.ok(result[0].unavailableReason);
  }
});
test("preview checks protected addresses before any live read", async () => {
  let reads = 0; const backstop = ports(null); backstop.rows!.read = async () => { reads++; return row; };
  const denied = { ...entity, state: { ...entity.state, table: "sessions" } };
  const result = await buildBackstopPreview({ entities: [denied], backstop, workspaceId: "ws" });
  assert.equal(reads, 0); assert.equal(result[0].after, null); assert.ok(result[0].unavailableReason);
});
test("a missing live row displays an absent before value", async () => {
  const result = await buildBackstopPreview({ entities: [entity], backstop: ports(null), workspaceId: "ws" });
  assert.equal(result[0].before, null); assert.equal(result[0].unavailableReason, null);
});
test("file review returns changed byte checksums and sizes without leaking contents or absolute paths", async () => {
  const entity = { entityType: "raw-file", id: "extras/banner.html", state: { path: "extras/banner.html", sha256: "after-sha", size: 20, mode: 0o644 } } as unknown as PackedEntity;
  const backstop: BackstopPorts = { coveredTables: [], coveredRoots: [], files: {
    check: async () => null, read: async () => ({ bytes: Buffer.from("live footer"), mode: 0o644, absPath: "/private/site/extras/banner.html" }),
  } as BackstopPorts["files"] };
  const result = await buildBackstopPreview({ entities: [entity], backstop, workspaceId: "ws" });
  assert.equal((result[0].before as { size: number }).size, 11);
  assert.deepEqual(result[0].after, entity.state);
  assert.equal(JSON.stringify(result).includes("/private/site"), false);
  assert.equal(JSON.stringify(result).includes("live footer"), false);
  let reads = 0; backstop.files!.read = async () => { reads++; return null; };
  const denied = await buildBackstopPreview({ entities: [{ ...entity, id: ".env" }], backstop, workspaceId: "ws" });
  assert.equal(reads, 0); assert.equal(denied[0].after, null); assert.ok(denied[0].unavailableReason);
});
