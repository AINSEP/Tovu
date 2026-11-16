/**
 * @file Characterization of `contributeRawRowPublish` over a fake `RawRowPort`, written before
 * `buildRawRowHandler` was split (publish-engine P0.6). The SQLite-backed suite
 * (`raw-row-contributor.test.ts`) pins the end-to-end behaviour; this file pins the decisions that a
 * fake port can drive one at a time: the pack selection rules, inspect's silent-null rules, and the
 * apply sequence (precheck, gateway check, transaction, second precheck, OCC, inverse, rollback).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";

import { PublishContentApplyRowError } from "../apply-errors.js";
import type { BackstopInverse } from "../backstop-audit.js";
import type { BackstopSelection, RawColumn, RawRowPort, RawRowSnapshot, RawValue } from "../backstop-ports.js";
import { CONTENT_HASH_VERSION } from "../content-hash.js";
import { contributeRawRowPublish, rawRowId } from "../raw-row-contributor.js";
import type { PackedEntity, PublishContentDeps } from "../type-registry.js";

const COLUMNS: readonly RawColumn[] = [{ name: "id", type: "TEXT", pk: 1, notnull: 0 }, { name: "title", type: "TEXT", pk: 0, notnull: 0 }];
type Pk = Readonly<Record<string, RawValue>>;

/** In-memory rows keyed by table and primary key; records every port call in order. */
class FakeRows implements RawRowPort {
  readonly calls: string[] = [];
  readonly rows = new Map<string, RawRowSnapshot>();
  columnsError: unknown = undefined;
  readError: unknown = undefined;
  failAfterUpsert = false;
  private depth = 0;

  put(table: string, id: string, title: string): void {
    this.rows.set(`${table}/${id}`, { table, columns: COLUMNS, pk: { id }, values: { id, title } });
  }
  async columns({ table }: { table: string }) { this.calls.push(`columns:${table}`); if (this.columnsError) throw this.columnsError; return COLUMNS; }
  async read({ table, pk }: { table: string; pk: Pk }) {
    this.calls.push(`read:${table}/${String(pk.id)}`);
    if (this.readError) throw this.readError;
    return this.rows.get(`${table}/${String(pk.id)}`) ?? null;
  }
  async upsert({ table, pk, values }: { table: string; pk: Pk; values: Readonly<Record<string, RawValue>> }) {
    this.calls.push(`upsert:${table}/${String(pk.id)}:${this.depth > 0 ? "in-tx" : "outside"}`);
    this.rows.set(`${table}/${String(pk.id)}`, { table, columns: COLUMNS, pk, values });
  }
  async removeCreated({ table, pk }: { table: string; pk: Pk }) { this.calls.push(`remove:${table}/${String(pk.id)}`); this.rows.delete(`${table}/${String(pk.id)}`); }
  async transaction<T>({ work }: { work: () => Promise<T> }): Promise<T> {
    this.calls.push("tx:begin");
    this.depth += 1;
    try { return await work(); } finally { this.depth -= 1; this.calls.push("tx:end"); }
  }
}

function setup(overrides: { selection?: BackstopSelection; wiring?: Partial<PublishContentDeps> } = {}) {
  const rows = new FakeRows();
  const inverses: BackstopInverse[] = [];
  const outbox = new InMemoryOutbox();
  const changeSets = new InMemoryChangeSetRepo([], [], outbox);
  const deps: PublishContentDeps = {
    workspaceId: "ws", ports: {}, clock: { nowMs: () => Date.parse("2026-10-04T00:00:00.000Z") }, idGen: { newId: () => "id-1" },
    outbox, changeSets, authorize: async () => ({ allowed: true, reason: "test" }),
    backstop: { rows, inverses, coveredTables: ["posts"], coveredRoots: [], selection: overrides.selection ?? { rows: [{ table: "p_widgets", pk: { id: "a" } }] } },
    ...overrides.wiring,
  };
  const handler = contributeRawRowPublish().build(deps);
  const pack = async () => { const out: PackedEntity[] = []; for await (const e of handler.pack()) out.push(e); return out; };
  return { rows, inverses, deps, handler, pack, changeSets };
}

const applyInput = (entity: PackedEntity, extra: { expectedVersion?: number } = {}) =>
  ({ entity, principalId: "admin", expectedVersion: extra.expectedVersion, idempotencyKey: "key-1" });

test("the handler declares the raw-row type, its permission and the per-run command key", () => {
  const { handler } = setup();
  assert.deepEqual(
    [handler.entityType, handler.schemaVersion, handler.permission, handler.dependsOn, handler.idempotencyScope],
    ["raw-row", 1, "publish.backstop", [], "run"],
  );
  const contributor = contributeRawRowPublish();
  assert.deepEqual([contributor.entityType, contributor.dependsOn], ["raw-row", []]);
});

test("pack: yields the selected rows in order and reports each refusal as a skipped row labelled by its id", async () => {
  const f = setup({ selection: { rows: [
    { table: "p_widgets", pk: { id: "a" } },
    { table: "p_widgets", pk: { id: "gone" } },
    { table: "posts", pk: { id: "x" } },
    { table: "secrets_vault", pk: { id: "u" } },
    { table: "p_widgets", pk: { id: "b" } },
  ] } });
  f.rows.put("p_widgets", "a", "A"); f.rows.put("p_widgets", "b", "B");
  const packed = await f.pack();
  assert.deepEqual(packed.map((e) => e.id), [rawRowId({ table: "p_widgets", pk: { id: "a" } }), rawRowId({ table: "p_widgets", pk: { id: "b" } })]);
  assert.deepEqual([packed[0]!.entityType, packed[0]!.schemaVersion, packed[0]!.hashVersion, packed[0]!.requiredBlobs], ["raw-row", 1, CONTENT_HASH_VERSION, []]);
  assert.deepEqual(await f.handler.listSkipped!(), [
    { entityType: "raw-row", id: rawRowId({ table: "p_widgets", pk: { id: "gone" } }), label: rawRowId({ table: "p_widgets", pk: { id: "gone" } }), reason: "The selected row no longer exists." },
    { entityType: "raw-row", id: rawRowId({ table: "posts", pk: { id: "x" } }), label: rawRowId({ table: "posts", pk: { id: "x" } }), reason: "Table 'posts' already publishes normally; use Overwrite live in normal publishing." },
    { entityType: "raw-row", id: rawRowId({ table: "secrets_vault", pk: { id: "u" } }), label: rawRowId({ table: "secrets_vault", pk: { id: "u" } }), reason: "Table 'secrets_vault' holds private or per-install data and is never sent." },
  ]);
  assert.equal(f.rows.calls.filter((c) => c.startsWith("read:")).join(","), "read:p_widgets/a,read:p_widgets/gone,read:p_widgets/b", "a refused table is never read");
});

test("pack: a second pack starts from an empty skipped list, and no port yields nothing", async () => {
  const f = setup();
  await f.pack();
  assert.equal((await f.handler.listSkipped!()).length, 1);
  await f.pack();
  assert.equal((await f.handler.listSkipped!()).length, 1, "reset, not accumulated");
  const noPort = setup({ wiring: { backstop: { coveredTables: [], coveredRoots: [], selection: { rows: [{ table: "p_widgets", pk: { id: "a" } }] } } } });
  assert.deepEqual(await noPort.pack(), []);
  assert.deepEqual(await noPort.handler.listSkipped!(), []);
});

test("pack: more than 200 selected rows is refused with the exact words", async () => {
  const selection = { rows: Array.from({ length: 201 }, (_, i) => ({ table: "p_widgets", pk: { id: String(i) } })) };
  await assert.rejects(setup({ selection }).pack(), (err: Error) => err.message === "Choose at most 200 rows per send.");
  const ok = setup({ selection: { rows: selection.rows.slice(0, 200) } });
  await ok.pack();
  assert.equal((await ok.handler.listSkipped!()).length, 200, "200 is allowed (all skipped here: none exist)");
});

test("listSkipped returns a copy", async () => {
  const f = setup();
  await f.pack();
  (await f.handler.listSkipped!()).length = 0;
  assert.equal((await f.handler.listSkipped!()).length, 1);
});

test("inspect: hash, hash version and a hash-derived version for a readable row; null for every refusal", async () => {
  const f = setup();
  f.rows.put("p_widgets", "a", "A");
  const [packed] = await f.pack();
  const seen = await f.handler.inspect({ id: packed!.id });
  assert.deepEqual(seen, { hash: packed!.contentHash, hashVersion: CONTENT_HASH_VERSION, version: Number.parseInt(packed!.contentHash.slice(0, 12), 16) });
  assert.equal(await f.handler.inspect({ id: rawRowId({ table: "p_widgets", pk: { id: "missing" } }) }), null);
  f.rows.put("posts", "a", "covered");
  assert.equal(await f.handler.inspect({ id: rawRowId({ table: "posts", pk: { id: "a" } }) }), null, "covered table, though the row exists");
  assert.equal(await f.handler.inspect({ id: rawRowId({ table: "secrets_vault", pk: { id: "a" } }) }), null, "private table");
  assert.equal(await f.handler.inspect({ id: "not an id" }), null);
  f.rows.readError = new Error("database connection lost");
  assert.equal(await f.handler.inspect({ id: packed!.id }), null, "inspect never throws a read failure");
});

test("inspect refuses a row whose live columns are private, and a destination with no port", async () => {
  const f = setup();
  f.rows.rows.set("p_widgets/a", { table: "p_widgets", columns: [...COLUMNS, { name: "access_token", type: "TEXT", pk: 0, notnull: 0 }], pk: { id: "a" }, values: { id: "a" } });
  assert.equal(await f.handler.inspect({ id: rawRowId({ table: "p_widgets", pk: { id: "a" } }) }), null);
  const noPort = setup({ wiring: { backstop: { coveredTables: [], coveredRoots: [] } } });
  assert.equal(await noPort.handler.inspect({ id: rawRowId({ table: "p_widgets", pk: { id: "a" } }) }), null);
});

async function packedA(f: ReturnType<typeof setup>): Promise<PackedEntity> {
  f.rows.put("p_widgets", "a", "A");
  const [entity] = await f.pack();
  return entity!;
}

test("apply: a refused precheck is a blocked row with the refusal's words, before the gateway check or any write", async () => {
  const f = setup();
  const entity = await packedA(f);
  f.rows.calls.length = 0;
  await assert.rejects(f.handler.apply(applyInput({ ...entity, contentHash: "tampered" })), (err: unknown) =>
    err instanceof PublishContentApplyRowError && err.message === "The raw row does not match its checked content hash.");
  assert.equal(f.rows.calls.some((c) => c.startsWith("upsert") || c === "tx:begin"), false);
});

test("apply: every missing gateway part is refused with the exact words, before the transaction", async () => {
  for (const missing of ["changeSets", "authorize", "outbox"] as const) {
    const f = setup({ wiring: { [missing]: undefined } });
    const entity = await packedA(f);
    f.rows.calls.length = 0;
    await assert.rejects(f.handler.apply(applyInput(entity)), (err: Error) => err.message === "The raw row command gateway is not wired.", missing);
    assert.equal(f.rows.calls.includes("tx:begin"), false, missing);
  }
});

test("apply: a create writes inside the transaction, re-checks first, records the inverse and returns the change set id", async () => {
  const f = setup();
  const entity = await packedA(f);
  f.rows.rows.clear();
  f.rows.calls.length = 0;
  const result = await f.handler.apply(applyInput(entity));
  assert.ok(result.changeSetId.length > 0);
  assert.deepEqual(f.rows.calls.filter((c) => c === "tx:begin" || c.startsWith("upsert") || c === "tx:end"), ["tx:begin", "upsert:p_widgets/a:in-tx", "tx:end"]);
  assert.equal(f.rows.calls.filter((c) => c === "columns:p_widgets").length, 2, "precheck before the transaction and again inside it");
  assert.deepEqual(f.inverses, [{ kind: "raw-row", entity, before: null, afterHash: entity.contentHash }]);
  const stored = (await f.changeSets.findById({ id: result.changeSetId } as never)) as { summary?: string; actor?: { id: string } } | null;
  if (stored) assert.equal(stored.summary, "Send 'p_widgets:{\"id\":\"a\"}' by hand");
});

test("apply: OCC refuses a create over an existing row and an update over a missing or different row", async () => {
  const conflict = (err: unknown) => err instanceof PublishContentApplyRowError && err.message === "This row changed on live after it was checked.";
  const f = setup();
  const entity = await packedA(f);
  await assert.rejects(f.handler.apply(applyInput(entity)), conflict);
  const live = await f.handler.inspect({ id: entity.id });
  await assert.rejects(f.handler.apply(applyInput(entity, { expectedVersion: live!.version + 1 })), conflict);
  f.rows.rows.clear();
  await assert.rejects(f.handler.apply(applyInput(entity, { expectedVersion: live!.version })), conflict);
  f.rows.put("p_widgets", "a", "A");
  f.rows.calls.length = 0;
  await f.handler.apply(applyInput(entity, { expectedVersion: live!.version }));
  assert.ok(f.rows.calls.includes("upsert:p_widgets/a:in-tx"));
});

test("apply: the inverse carries the prior row of an update", async () => {
  const f = setup();
  const entity = await packedA(f);
  const prior = f.rows.rows.get("p_widgets/a")!;
  const live = await f.handler.inspect({ id: entity.id });
  await f.handler.apply(applyInput(entity, { expectedVersion: live!.version }));
  assert.deepEqual(f.inverses.map((i) => ({ ...i, before: (i as { before: unknown }).before })), [{ kind: "raw-row", entity, before: prior, afterHash: entity.contentHash }]);
});

test("apply: a command that fails after the write restores the prior row, or removes a created one", async () => {
  for (const existing of [true, false]) {
    const f = setup();
    const entity = await packedA(f);
    const live = await f.handler.inspect({ id: entity.id });
    if (!existing) f.rows.rows.clear();
    const prior = f.rows.rows.get("p_widgets/a");
    (f.deps.changeSets as { insert: unknown }).insert = async () => { throw new Error("change set insert failed"); };
    f.rows.calls.length = 0;
    await assert.rejects(f.handler.apply(applyInput(entity, existing ? { expectedVersion: live!.version } : {})), /change set insert failed/);
    const tail = f.rows.calls.filter((c) => c.startsWith("upsert") || c.startsWith("remove"));
    assert.deepEqual(tail, existing ? ["upsert:p_widgets/a:in-tx", "upsert:p_widgets/a:in-tx"] : ["upsert:p_widgets/a:in-tx", "remove:p_widgets/a"]);
    assert.deepEqual(f.rows.rows.get("p_widgets/a") ?? null, prior ?? null);
    assert.deepEqual(f.inverses, [], "no inverse recorded for a failed command");
  }
});

test("precheck: a port failure that is not a refusal propagates, and no port or no backstop is refused in words", async () => {
  const f = setup();
  const entity = await packedA(f);
  f.rows.columnsError = new Error("connection lost");
  await assert.rejects(f.handler.precheck({ entity }), /connection lost/);
  const noBackstop = contributeRawRowPublish().build({ ...f.deps, backstop: undefined });
  assert.equal(await noBackstop.precheck({ entity }), "Send by hand is not available on this destination.");
  const noRows = contributeRawRowPublish().build({ ...f.deps, backstop: { coveredTables: [], coveredRoots: [] } });
  assert.equal(await noRows.precheck({ entity }), "Send by hand is not available on this destination.");
});

test("precheck: a workspace_id column that is not this workspace is refused", async () => {
  const f = setup();
  const entity = await packedA(f);
  const foreign = { ...entity, state: { ...entity.state, values: { ...(entity.state.values as object), workspace_id: "other" } } };
  const live: RawColumn[] = [...COLUMNS, { name: "workspace_id", type: "TEXT", pk: 0, notnull: 0 }];
  f.rows.columns = async () => live;
  const withColumn = { ...foreign, state: { ...foreign.state, columns: live } };
  assert.equal(await f.handler.precheck({ entity: withColumn }), "This row belongs to a different workspace.");
});
