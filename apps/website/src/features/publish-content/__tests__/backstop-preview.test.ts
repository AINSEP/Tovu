import assert from "node:assert/strict";
import test from "node:test";
import { buildBackstopPreview } from "../backstop-preview.js";
import type { BackstopPorts, RawRowSnapshot } from "../backstop-ports.js";
import type { PackedEntity } from "../type-registry.js";

const row: RawRowSnapshot = { table: "p_banner", pk: { id: "one" }, columns: [{ name: "id", type: "TEXT", pk: 1, notnull: 1 }, { name: "title", type: "TEXT", pk: 0, notnull: 1 }], values: { id: "one", title: "Old footer" } };
const entity = { entityType: "raw-row", id: 'p_banner:{"id":"one"}', state: { ...row, values: { id: "one", title: "New footer" } } } as unknown as PackedEntity;
const unused = async (): Promise<never> => { throw new Error("preview never calls this port method"); };
function ports(live: RawRowSnapshot | null): BackstopPorts {
  return { coveredTables: [], coveredRoots: [], rows: { columns: unused, read: async () => live, upsert: unused, removeCreated: unused, transaction: unused } };
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
    capture: unused, replace: unused, restore: unused,
  } };
  const result = await buildBackstopPreview({ entities: [entity], backstop, workspaceId: "ws" });
  assert.equal((result[0].before as { size: number }).size, 11);
  assert.deepEqual(result[0].after, entity.state);
  assert.equal(JSON.stringify(result).includes("/private/site"), false);
  assert.equal(JSON.stringify(result).includes("live footer"), false);
  let reads = 0; backstop.files!.read = async () => { reads++; return null; };
  const denied = await buildBackstopPreview({ entities: [{ ...entity, id: ".env" }], backstop, workspaceId: "ws" });
  assert.equal(reads, 0); assert.equal(denied[0].after, null); assert.ok(denied[0].unavailableReason);
});

test("TW2 pins unavailable ports, covered addresses, read failures and unrelated entities", async () => {
  const backstop: BackstopPorts = { coveredTables: [], coveredRoots: [] };
  const file = { ...entity, entityType: "raw-file", id: "extras/page.html", state: { path: "extras/page.html", size: 0, sha256: "digest", mode: 0o644 } };
  const preview = async (item: PackedEntity, port = backstop) => (await buildBackstopPreview({ entities: [item], backstop: port, workspaceId: "ws" }))[0];
  assert.equal((await preview(entity)).unavailableReason, "Live row values are not available.");
  assert.equal((await preview(file)).unavailableReason, "Live file values are not available.");
  assert.equal((await preview(entity, { ...backstop, coveredTables: ["P_BANNER"] })).unavailableReason, "This table already publishes normally.");
  assert.equal((await preview(file, { ...backstop, coveredRoots: ["EXTRAS/"] })).unavailableReason, "This file already publishes normally.");
  const failing = ports(null); failing.rows!.read = unused;
  assert.equal((await preview(entity, failing)).unavailableReason, "These values could not be inspected safely. Check again before sending.");
  assert.deepEqual(await buildBackstopPreview({ entities: [{ ...entity, entityType: "post" }], backstop, workspaceId: "ws" }), []);
});

test("file review reports an executable live file as mode 755, and a file absent on the destination as no before value", async () => {
  const file = { entityType: "raw-file", id: "extras/run.sh", state: { path: "extras/run.sh", sha256: "after-sha", size: 4, mode: 0o755 } } as unknown as PackedEntity;
  let live: { bytes: Buffer; mode: number; absPath: string } | null = { bytes: Buffer.from("#!/bin/sh"), mode: 0o100750, absPath: "/private/site/extras/run.sh" };
  const backstop: BackstopPorts = { coveredTables: [], coveredRoots: [], files: { check: async () => null, read: async () => live, capture: unused, replace: unused, restore: unused } };
  const [executable] = await buildBackstopPreview({ entities: [file], backstop, workspaceId: "ws" });
  assert.equal((executable!.before as { mode: number }).mode, 0o755);
  live = null;
  const [absent] = await buildBackstopPreview({ entities: [file], backstop, workspaceId: "ws" });
  assert.equal(absent!.before, null);
  assert.deepEqual(absent!.after, file.state);
});

test("a blob-valued column is checked as its decoded text, so a secret hidden in a blob is still refused", async () => {
  const blob = (text: string) => ({ blobBase64: Buffer.from(text).toString("base64") });
  const safeRow: RawRowSnapshot = { ...row, values: { id: "one", title: blob("Plain footer") } as unknown as RawRowSnapshot["values"] };
  const safeEntity = { ...entity, state: safeRow } as unknown as PackedEntity;
  const [safe] = await buildBackstopPreview({ entities: [safeEntity], backstop: ports(safeRow), workspaceId: "ws" });
  assert.equal(safe!.unavailableReason, null);
  // The PEM marker is assembled at runtime so this fixture is not itself a credential-shaped
  // literal that secret-scan-guard would flag in the tracked tree.
  const pemMarker = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
  const secretRow: RawRowSnapshot = { ...row, values: { id: "one", title: blob(`${pemMarker}\nabc`) } as unknown as RawRowSnapshot["values"] };
  const [secret] = await buildBackstopPreview({ entities: [{ ...entity, state: secretRow } as unknown as PackedEntity], backstop: ports(row), workspaceId: "ws" });
  assert.ok(secret!.unavailableReason, "a private key hidden in a blob column is refused");
  assert.equal(secret!.after, null);
});
