import assert from "node:assert/strict";
import test from "node:test";

import type { RawColumn, RawRowPort, RawRowSnapshot, RawValue } from "../backstop-ports.js";
import { contributeRawRowPublish, rawRowId, undoRawRow } from "../raw-row-contributor.js";
import type { PackedEntity, PublishContentDeps } from "../type-registry.js";

/**
 * @file DI-fake tests for `raw-row-contributor.ts` (Stryker lane L14: 65.8 %, 126 survivors — the
 * largest pile in the lane). A hand-written `RawRowPort` records every read, so each address guard is
 * shown to refuse BEFORE the live database is touched, and each value/column shape rule is pinned on
 * its own.
 */

const COLUMNS: RawColumn[] = [
  { name: "id", type: "TEXT", pk: 1, notnull: 0 },
  { name: "title", type: "TEXT", pk: 0, notnull: 0 },
];

function fakePort(rows: RawRowSnapshot[], over: Partial<RawRowPort> = {}): RawRowPort & { reads: unknown[] } {
  const reads: unknown[] = [];
  return {
    reads,
    columns: async ({ table }) => (rows.find((r) => r.table === table)?.columns ?? COLUMNS),
    read: async (input) => {
      reads.push(input);
      return rows.find((r) => r.table === input.table && JSON.stringify(r.pk) === JSON.stringify(input.pk)) ?? null;
    },
    upsert: async () => {},
    removeCreated: async () => {},
    transaction: async ({ work }) => work(),
    ...over,
  };
}

function row(id: string, values: Record<string, RawValue> = {}): RawRowSnapshot {
  return { table: "p_widgets", columns: COLUMNS, pk: { id }, values: { id, title: "t", ...values } };
}

function build(port: RawRowPort, selection: Array<{ table: string; pk: Record<string, RawValue> }> = [], workspaceId = "ws") {
  const deps = {
    workspaceId, ports: {}, clock: { nowMs: () => 0 }, idGen: { newId: () => "x" },
    backstop: { rows: port, coveredTables: ["Posts"], coveredRoots: [], selection: { rows: selection } },
  } as unknown as PublishContentDeps;
  return { deps, handler: contributeRawRowPublish().build(deps) };
}

async function packAll(handler: ReturnType<typeof build>["handler"]) {
  const packed: PackedEntity[] = [];
  for await (const e of handler.pack()) packed.push(e);
  return { packed, skipped: await handler.listSkipped!() };
}

test("rawRowId sorts primary-key columns so the address is order-independent", () => {
  assert.equal(rawRowId({ table: "t", pk: { b: 2, a: "x" } }), 't:{"a":"x","b":2}');
  assert.equal(rawRowId({ table: "t", pk: { a: "x", b: 2 } }), rawRowId({ table: "t", pk: { b: 2, a: "x" } }));
});

test("inspect: every malformed address is refused without reading the live database", async () => {
  const port = fakePort([row("a")]);
  const { handler } = build(port);
  const bad = [
    "", ":", ':{"id":"a"}', "p_widgets", "p_widgets:", "p_widgets:5", 'p_widgets:"a"', "p_widgets:true",
    'bad-table:{"id":"a"}', 'p_widgets:{"bad col":"a"}', 'p_widgets:{"password":"a"}', 'p_widgets:{"__proto__":"a"}',
    'p_widgets:{"id":true}', 'p_widgets:{"id":{}}', 'p_widgets:{"id":[1]}', 'p_widgets:{"id":1e400}',
    'p_widgets:{"id":9007199254740993}', 'p_widgets:{"id":"a","x":null}', 'posts:{"id":"a"}', 'POSTS:{"id":"a"}', "p_widgets:{}",
  ];
  for (const id of bad) assert.equal(await handler.inspect(id), null, id);
  assert.deepEqual(port.reads, [], "no malformed or covered address reaches port.read");
});

test("inspect: a well-formed address reads once and reports hash/version; numbers (safe ints, floats) are valid keys", async () => {
  const port = fakePort([row("a"), { ...row("n"), pk: { id: 1.5 }, values: { id: 1.5, title: "t" } }]);
  const { handler } = build(port);
  const found = await handler.inspect('p_widgets:{"id":"a"}');
  assert.equal(typeof found?.hash, "string");
  assert.equal(found?.version, Number.parseInt(found!.hash.slice(0, 12), 16));
  assert.ok(await handler.inspect('p_widgets:{"id":1.5}'));
  assert.equal(await handler.inspect('p_widgets:{"id":"missing"}'), null);
  assert.equal(port.reads.length, 3);
});

test("inspect: a read error, or a live row with a private column, is null (never exposes values)", async () => {
  const throwing = build(fakePort([], { read: async () => { throw new Error("boom"); } })).handler;
  assert.equal(await throwing.inspect('p_widgets:{"id":"a"}'), null);
  const priv = { ...row("a"), columns: [...COLUMNS, { name: "api_key", type: "TEXT", pk: 0, notnull: 0 }] };
  assert.equal(await build(fakePort([priv])).handler.inspect('p_widgets:{"id":"a"}'), null);
});

test("pack: covered or denied tables are skipped with a reason BEFORE any read; a read error and a vanished row are skipped", async () => {
  // The custom read replaces the port's recorder, so record here: refused selections must never be read.
  const reads: string[] = [];
  const port = fakePort([row("a")], {
    read: async (input) => {
      reads.push(`${input.table}:${JSON.stringify(input.pk)}`);
      if ((input.pk as { id: string }).id === "err") throw new Error("disk says no");
      if ((input.pk as { id: string }).id === "err2") throw "not an Error";
      return (input.pk as { id: string }).id === "a" ? row("a") : null;
    },
  });
  const { handler } = build(port, [
    { table: "posts", pk: { id: "a" } },
    { table: "p_widgets", pk: { password: "a" } },
    { table: "p_widgets", pk: { id: "err" } },
    { table: "p_widgets", pk: { id: "err2" } },
    { table: "p_widgets", pk: { id: "gone" } },
    { table: "p_widgets", pk: { id: "a" } },
  ]);
  const { packed, skipped } = await packAll(handler);
  assert.deepEqual(packed.map((e) => e.id), ['p_widgets:{"id":"a"}']);
  assert.deepEqual(skipped.map((s) => s.reason), [
    "Table 'posts' already publishes normally; use Overwrite live in normal publishing.",
    "Column 'password' may hold a key or password; this row is never sent.",
    "disk says no",
    "This row cannot be sent safely.",
    "The selected row no longer exists.",
  ]);
  assert.deepEqual(reads, ['p_widgets:{"id":"err"}', 'p_widgets:{"id":"err2"}', 'p_widgets:{"id":"gone"}', 'p_widgets:{"id":"a"}']);
});

test("pack: more than 200 selected rows is refused outright; exactly 200 is accepted; no port packs nothing", async () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ table: "p_widgets", pk: { id: `r${i}` } }));
  await assert.rejects(packAll(build(fakePort([]), many(201)).handler), { message: "Choose at most 200 rows per send." });
  assert.equal((await packAll(build(fakePort([]), many(200)).handler)).skipped.length, 200);
  const noPort = contributeRawRowPublish().build({ workspaceId: "ws", backstop: undefined } as unknown as PublishContentDeps);
  assert.deepEqual((await packAll(noPort)).packed, []);
});

test("precheck: value scalars — null, string, finite number, safe int and canonical base64 blob pass; others fail", async () => {
  const VALUE_REFUSAL = "The raw row must contain a valid value for every column.";
  const cases: Array<[RawValue | unknown, boolean]> = [
    [null, true], ["", true], [1.25, true], [Number.MAX_SAFE_INTEGER, true], [{ blobBase64: "" }, true], [{ blobBase64: "YWJj" }, true],
    [{ blobBase64: "YWI=" }, true], [{ blobBase64: "YQ==" }, true],
    [{ blobBase64: "YQ=" }, false], [{ blobBase64: "Y" }, false], [{ blobBase64: "YWJj\n" }, false], [{ blobBase64: "!WJj" }, false],
    [{ blobBase64: "YWJj", extra: 1 }, false], [{ blobBase64: 5 }, false], [{}, false], [true, false], [[], false],
    [Number.MAX_SAFE_INTEGER + 2, false],
  ];
  for (const [title, ok] of cases) {
    const live = row("a", { title: title as RawValue });
    const port = fakePort([live]);
    const { handler } = build(port, [{ table: "p_widgets", pk: { id: "a" } }]);
    const { packed, skipped } = await packAll(handler);
    if (ok) assert.equal(packed.length, 1, `${JSON.stringify(title)} should pass: ${skipped[0]?.reason}`);
    else assert.equal(skipped[0]?.reason, VALUE_REFUSAL, JSON.stringify(title));
  }
});

test("precheck: column shape — each RawColumn field must have the right type", async () => {
  const { handler } = build(fakePort([row("a")]), [{ table: "p_widgets", pk: { id: "a" } }]);
  const [packed] = (await packAll(handler)).packed;
  const SHAPE = "The raw row has no valid column shape.";
  for (const bad of [{ name: 1, type: "T", pk: 0, notnull: 0 }, { name: "x", type: 1, pk: 0, notnull: 0 }, { name: "x", type: "T", pk: 0.5, notnull: 0 }, { name: "x", type: "T", pk: 0, notnull: "0" }]) {
    assert.equal(await handler.precheck({ ...packed!, state: { ...packed!.state, columns: [COLUMNS[0], bad] } }), SHAPE, JSON.stringify(bad));
  }
  assert.equal(await handler.precheck({ ...packed!, state: { ...packed!.state, columns: "x" } }), SHAPE);
  assert.equal(await handler.precheck({ ...packed!, state: { ...packed!.state, values: [] } }), "The raw row has no valid column values.");
  assert.equal(
    await handler.precheck({ ...packed!, state: { ...packed!.state, columns: [...COLUMNS, { name: "secret_x", type: "TEXT", pk: 0, notnull: 0 }] } }),
    "Column 'secret_x' may hold a key or password; this row is never sent.",
  );
});

test("precheck: the live table must have a primary key that equals the address; a foreign workspace row is refused", async () => {
  const noPk = { ...row("a"), columns: COLUMNS.map((c) => ({ ...c, pk: 0 })) };
  const h1 = build(fakePort([noPk]), [{ table: "p_widgets", pk: { id: "a" } }]).handler;
  assert.equal((await packAll(h1)).skipped[0]?.reason, "Choose a row by its complete primary key.");
  const mismatch = { ...row("a"), values: { id: "b", title: "t" } };
  const h2 = build(fakePort([mismatch]), [{ table: "p_widgets", pk: { id: "a" } }]).handler;
  assert.equal((await packAll(h2)).skipped[0]?.reason, "Choose a row by its complete primary key.");
  const wsCols = [...COLUMNS, { name: "workspace_id", type: "TEXT", pk: 0, notnull: 1 }];
  const foreign = { ...row("a", { workspace_id: "other" }), columns: wsCols };
  const h3 = build(fakePort([foreign]), [{ table: "p_widgets", pk: { id: "a" } }]).handler;
  assert.equal((await packAll(h3)).skipped[0]?.reason, "This row belongs to a different workspace.");
  const own = { ...row("a", { workspace_id: "ws" }), columns: wsCols };
  assert.equal((await packAll(build(fakePort([own]), [{ table: "p_widgets", pk: { id: "a" } }]).handler)).packed.length, 1);
});

test("precheck: a columns() failure surfaces its message (or a fixed one), and a missing live table is a shape refusal", async () => {
  const { handler } = build(fakePort([row("a")]), [{ table: "p_widgets", pk: { id: "a" } }]);
  const [packed] = (await packAll(handler)).packed;
  const h1 = build(fakePort([row("a")], { columns: async () => { throw new Error("locked"); } })).handler;
  assert.equal(await h1.precheck(packed!), "locked");
  const h2 = build(fakePort([row("a")], { columns: async () => { throw 7; } })).handler;
  assert.equal(await h2.precheck(packed!), "The live row cannot be inspected safely.");
  const h3 = build(fakePort([row("a")], { columns: async () => null })).handler;
  assert.equal(await h3.precheck(packed!), "Live's 'p_widgets' has a different shape; update live first.");
});

test("apply without a command gateway refuses after a passing precheck; undo without rows is unavailable", async () => {
  const { handler, deps } = build(fakePort([row("a")]), [{ table: "p_widgets", pk: { id: "a" } }]);
  const [packed] = (await packAll(handler)).packed;
  await assert.rejects(handler.apply({ entity: packed!, principalId: "p", idempotencyKey: "k" } as never), { message: "The raw row command gateway is not wired." });
  assert.equal(
    await undoRawRow({ deps: { ...deps, backstop: undefined }, entity: packed!, before: null, afterHash: packed!.contentHash }),
    "Send by hand is not available on this destination.",
  );
});

test("pack: a backstop with no selection packs nothing", async () => {
  const deps = { workspaceId: "ws", backstop: { rows: fakePort([row("a")]), coveredTables: [], coveredRoots: [] } } as unknown as PublishContentDeps;
  const out = await packAll(contributeRawRowPublish().build(deps));
  assert.deepEqual(out, { packed: [], skipped: [] });
});

test("apply: a failing precheck — before, or freshly inside the transaction — throws a 'blocked' row error with that reason", async () => {
  const { handler } = build(fakePort([row("a")]), [{ table: "p_widgets", pk: { id: "a" } }]);
  const [packed] = (await packAll(handler)).packed;
  const isBlocked = (message: string) => (err: unknown) => {
    assert.equal((err as { name?: string }).name, "PublishContentApplyRowError");
    assert.equal((err as { rowOutcome?: string }).rowOutcome, "blocked");
    assert.equal((err as Error).message, message);
    return true;
  };
  const stale = { ...packed!, contentHash: "stale" };
  await assert.rejects(handler.apply({ entity: stale, principalId: "p", idempotencyKey: "k" } as never), isBlocked("The raw row does not match its checked content hash."));
  // columns() answers correctly for the first precheck, then the live table drifts inside the transaction.
  let calls = 0;
  const drifting = fakePort([row("a")], { columns: async () => (++calls === 1 ? COLUMNS : [COLUMNS[0]!]) });
  const deps = {
    workspaceId: "ws", clock: { nowMs: () => 0 }, idGen: { newId: () => "x" }, outbox: {}, changeSets: {}, authorize: async () => ({ allowed: true }),
    backstop: { rows: drifting, coveredTables: [], coveredRoots: [], selection: { rows: [] } },
  } as unknown as PublishContentDeps;
  await assert.rejects(
    contributeRawRowPublish().build(deps).apply({ entity: packed!, principalId: "p", idempotencyKey: "k" } as never),
    isBlocked("Live's 'p_widgets' has a different shape; update live first."),
  );
  assert.equal(calls, 2);
});

test("undo: a failing precheck is returned; an inverse the destination would refuse is returned and nothing is written", async () => {
  const writes: unknown[] = [];
  const port = fakePort([row("a")], { upsert: async (r) => { writes.push(r); }, removeCreated: async (r) => { writes.push(r); } });
  const { handler, deps } = build(port, [{ table: "p_widgets", pk: { id: "a" } }]);
  const [packed] = (await packAll(handler)).packed;
  assert.equal(
    await undoRawRow({ deps, entity: { ...packed!, contentHash: "stale" }, before: null, afterHash: packed!.contentHash }),
    "The raw row does not match its checked content hash.",
  );
  const live = await handler.inspect(packed!.id);
  const before = { ...row("a", { title: "old" }), values: { id: "a", title: "old", password: "x" } };
  assert.equal(
    await undoRawRow({ deps, entity: packed!, before, afterHash: live!.hash }),
    "Column 'password' may hold a key or password; this row is never sent.",
  );
  assert.deepEqual(writes, []);
});

test("apply: EACH missing command-gateway dependency on its own refuses the write", async () => {
  const { handler, deps } = build(fakePort([row("a")]), [{ table: "p_widgets", pk: { id: "a" } }]);
  const [packed] = (await packAll(handler)).packed;
  const full = { ...deps, changeSets: {}, authorize: async () => ({ allowed: true }), outbox: {} } as unknown as PublishContentDeps;
  for (const missing of ["changeSets", "authorize", "outbox"] as const) {
    const partial = { ...full, [missing]: undefined } as unknown as PublishContentDeps;
    await assert.rejects(
      contributeRawRowPublish().build(partial).apply({ entity: packed!, principalId: "p", idempotencyKey: "k" } as never),
      { message: "The raw row command gateway is not wired." }, missing,
    );
  }
});
