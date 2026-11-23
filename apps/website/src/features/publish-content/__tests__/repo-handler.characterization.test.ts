/**
 * @file Characterization of the behaviours of `createRepoPublishHandler` that the factory's main suite
 * (`repo-handler.test.ts`) does not pin, written before the factory was split by responsibility
 * (publish-engine P0.6). Each case names the config field or step it guards.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { ChangeSetItemRecord, ChangeSetRecord, ChangeSetRepoPort } from "@jini-ai/core/contracts/events";

import { PublishContentApplyRowError } from "@jini-ai/cms/publish/transfer";
import { contentHash, CONTENT_HASH_VERSION } from "@jini-ai/cms/publish/content/content-hash";
import { changedSincePlan, notWired } from "@jini-ai/cms/publish/content/precheck-reasons";
import { createRepoPublishHandler, gatewayDeps, okOrThrow } from "../repo-handler.js";
import type { RepoPublishTypeConfig, RepoWriteContext } from "../repo-handler.js";
import type { PackedEntity, PublishContentDeps, PublishContentHandler } from "../type-registry.js";

const WORKSPACE_ID = "workspace-1";

interface Row {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly note: string;
  readonly version: number;
}
type Ports = { readonly rows: Map<string, Row> };

function makeDeps(ports: Ports | undefined, overrides: Partial<PublishContentDeps> = {}): PublishContentDeps & { ports: unknown } {
  return {
    workspaceId: WORKSPACE_ID,
    ports: { holder: ports },
    clock: { nowMs: () => Date.parse("2026-09-25T00:00:00.000Z") },
    idGen: { newId: () => "unused" },
    authorize: async () => ({ allowed: true, reason: "ok" }),
    outbox: { enqueue: async () => {}, claimPending: async () => [], markDelivered: async () => {}, markFailed: async () => {} },
    ...overrides,
  } as never;
}

function workingChangeSets(inserted: Array<{ record: ChangeSetRecord; items: ChangeSetItemRecord[] }> = []): ChangeSetRepoPort {
  return {
    insert: async ({ record, items }) => { inserted.push({ record, items }); },
    findById: async () => null, findByIdempotencyKey: async () => null, listByWorkspace: async () => [], save: async () => {},
  };
}

function config(overrides: Partial<RepoPublishTypeConfig<Row, Ports>> = {}): RepoPublishTypeConfig<Row, Ports> {
  return {
    entityType: "widget",
    permission: "admin.widgets.manage",
    ports: ({ deps }, _optional = {}) => (deps.ports as { holder?: Ports }).holder,
    list: async ({ ports }) => [...ports.rows.values()],
    find: async ({ ports, id }) => ports.rows.get(id) ?? null,
    fields: { id: "local", title: "transferred", subtitle: "transferred", note: "provenance", version: "local" },
    write: async (ctx) => {
      ctx.ports.rows.set(ctx.id, { id: ctx.id, title: String(ctx.state.title), note: "", version: (ctx.existing?.version ?? 0) + 1 });
    },
    ...overrides,
  };
}

function entity(id: string, state: Record<string, unknown> = { title: "T" }): PackedEntity {
  return { entityType: "widget", id, schemaVersion: 1, contentHash: "x", hashVersion: 1, requiredBlobs: [], state };
}

function applyInput(id: string, extra: Partial<Parameters<PublishContentHandler["apply"]>[0]> = {}): Parameters<PublishContentHandler["apply"]>[0] {
  return { entity: entity(id), expectedVersion: undefined, principalId: "op-1", idempotencyKey: "key-1", ...extra };
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const item of iterable) out.push(item);
  return out;
}

const row = (extra: Partial<Row> = {}): Row => ({ id: "w1", title: "T", note: "n", version: 3, ...extra });

test("pack: an omitWhenAbsent field is left out while undefined, any other missing field packs as null", async () => {
  const ports: Ports = { rows: new Map([["w1", row()]]) };
  const handler = createRepoPublishHandler(config({ omitWhenAbsent: ["subtitle"] })).build(makeDeps(ports));
  const [packed] = await collect(handler.pack());
  assert.deepEqual(packed!.state, { title: "T", note: "n" });
  assert.equal("subtitle" in packed!.state, false);

  const noOmit = createRepoPublishHandler(config()).build(makeDeps(ports));
  const [withNull] = await collect(noOmit.pack());
  assert.deepEqual(withNull!.state, { title: "T", subtitle: null, note: "n" });
});

test("pack: schemaVersion defaults to 1, hashVersion is the current one, requiredBlobs defaults to [], displayLabel only when non-empty", async () => {
  const ports: Ports = { rows: new Map([["w1", row()], ["w2", row({ id: "w2" })]]) };
  const labelled = createRepoPublishHandler(config({ displayLabel: ({ row: r }) => (r.id === "w1" ? "Label one" : undefined) })).build(makeDeps(ports));
  const packed = await collect(labelled.pack());
  assert.deepEqual(packed.map((p) => [p.id, p.schemaVersion, p.hashVersion, p.requiredBlobs, p.displayLabel]), [
    ["w1", 1, CONTENT_HASH_VERSION, [], "Label one"],
    ["w2", 1, CONTENT_HASH_VERSION, [], undefined],
  ]);
  assert.equal("displayLabel" in packed[1]!, false);

  const versioned = createRepoPublishHandler(config({ schemaVersion: 4, requiredBlobs: () => ["a".repeat(64)] })).build(makeDeps(ports));
  assert.equal(versioned.schemaVersion, 4);
  assert.equal((await collect(versioned.pack()))[0]!.requiredBlobs[0], "a".repeat(64));
});

test("pack and inspect hash the transferred fields of the same row identically (default idOf and versionOf)", async () => {
  const ports: Ports = { rows: new Map([["w1", row()]]) };
  const handler = createRepoPublishHandler(config()).build(makeDeps(ports));
  const [packed] = await collect(handler.pack());
  const expected = contentHash({ entityType: "widget", state: { title: "T", subtitle: null } });
  assert.equal(packed!.contentHash, expected);
  assert.deepEqual(await handler.inspect({ id: "w1" }), { version: 3, hash: expected });
  assert.equal(await handler.inspect({ id: "missing" }), null);
});

test("legacyHashState receives the row and the packed state, and replaces only the hash input", async () => {
  const ports: Ports = { rows: new Map([["w1", row()]]) };
  const seen: Array<{ row: Row; packedState: Record<string, unknown> }> = [];
  const handler = createRepoPublishHandler(config({ legacyHashState: (input) => { seen.push(input); return { legacy: true }; } })).build(makeDeps(ports));
  const [packed] = await collect(handler.pack());
  assert.deepEqual(seen[0]!.packedState, { title: "T", subtitle: null, note: "n" });
  assert.equal(seen[0]!.row.id, "w1");
  assert.equal(packed!.contentHash, contentHash({ entityType: "widget", state: { legacy: true } }));
  assert.deepEqual(packed!.state, { title: "T", subtitle: null, note: "n" });
});

test("the contributor carries coversTables, coversRoots and dependsOn (default []) beside build", () => {
  const plain = createRepoPublishHandler(config());
  assert.deepEqual([plain.entityType, plain.dependsOn, plain.coversTables, plain.coversRoots], ["widget", [], undefined, undefined]);
  const covered = createRepoPublishHandler(config({ coversTables: ["t"], coversRoots: ["r"], dependsOn: ["media"] }));
  assert.deepEqual([covered.dependsOn, covered.coversTables, covered.coversRoots], [["media"], ["t"], ["r"]]);
  assert.deepEqual(covered.build(makeDeps({ rows: new Map() })).dependsOn, ["media"]);
});

test("extend receives the deps and a ports reader that reads the bag when it is called", async () => {
  let reader: (() => Ports | undefined) | undefined;
  const handler = createRepoPublishHandler(config({
    extend: (ctx) => { reader = ctx.ports; return { seedHash: async () => "seed" }; },
  })).build(makeDeps(undefined));
  assert.equal(reader?.(), undefined);
  assert.equal(await handler.seedHash?.({ id: "w1" } as never), "seed");
});

test("not wired: the messages name the ports key, which defaults to the entity type", async () => {
  const handler = createRepoPublishHandler(config({ portsKey: "gadget" })).build(makeDeps(undefined));
  assert.equal(await handler.precheck({ entity: entity("w1") }), notWired({ entityType: "widget", id: "w1", portName: "gadget port" }));
  await assert.rejects(handler.apply(applyInput("w1")), (err: Error) =>
    err.message === "publish-content: widget.apply() requires PublishContentDeps.ports.gadget — wire it from the apply-loop composition root (features/publish-content/apply-loop.ts).");
  const defaulted = createRepoPublishHandler(config()).build(makeDeps(undefined));
  assert.equal(await defaulted.precheck({ entity: entity("w1") }), notWired({ entityType: "widget", id: "w1", portName: "widget port" }));
});

test("with undo and no change-set repo, apply refuses with the exact composition-root message", async () => {
  const handler = createRepoPublishHandler(config({ undo: { restore: async () => {}, remove: async () => {} } })).build(makeDeps({ rows: new Map() }));
  await assert.rejects(handler.apply(applyInput("w1")), (err: Error) =>
    err.message === "publish-content: widget.apply() requires PublishContentDeps.changeSets/authorize/outbox — wire it from the apply-loop composition root (features/publish-content/apply-loop.ts).");
});

test("conflictError builds the CAS conflict and the mapped conflict class's conflict", async () => {
  class Custom extends PublishContentApplyRowError {}
  class DomainClash extends Error {}
  const made: string[] = [];
  const conflictError = ({ message }: { message: string }, _optional = {}) => { made.push(message); return new Custom({ rowOutcome: "conflict", message }); };
  const ports: Ports = { rows: new Map([["w1", row()]]) };
  const handler = createRepoPublishHandler(config({
    conflictError,
    errors: { conflict: [DomainClash] },
    write: async () => { throw new DomainClash("clash"); },
  })).build(makeDeps(ports));

  await assert.rejects(handler.apply(applyInput("w1", { expectedVersion: 9 })), (err: unknown) =>
    err instanceof Custom && err.message === changedSincePlan({ entityType: "widget", id: "w1", detail: "expected version 9, found version 3" }));
  await assert.rejects(handler.apply(applyInput("w1", { expectedVersion: 3 })), (err: unknown) =>
    err instanceof Custom && err.message === changedSincePlan({ entityType: "widget", id: "w1", detail: "clash" }));
  assert.equal(made.length, 2);
});

test("a PublishContentApplyRowError and a non-Error thrown by write pass through unmapped", async () => {
  class Blocked extends Error {}
  const rowError = new PublishContentApplyRowError({ rowOutcome: "blocked", message: "already a row error" });
  for (const thrown of [rowError, "a string"] as const) {
    const handler = createRepoPublishHandler(config({ errors: { blocked: [Blocked] }, write: async () => { throw thrown; } })).build(makeDeps({ rows: new Map() }));
    await assert.rejects(handler.apply(applyInput("w1")), (err: unknown) => err === thrown);
  }
});

test("the write context carries the ports, deps, ids, state, existing row, expected version, principal and replacement", async () => {
  const ports: Ports = { rows: new Map([["w1", row()]]) };
  const deps = makeDeps(ports);
  let seen: RepoWriteContext<Row, Ports> | undefined;
  const handler = createRepoPublishHandler(config({ write: async (ctx) => { seen = ctx; } })).build(deps);
  const replacement = { version: 3, sourceSha256: "b".repeat(64) };
  const result = await handler.apply(applyInput("w1", { expectedVersion: 3, sourceReplacement: replacement as never }));
  assert.equal(seen!.ports, ports);
  assert.equal(seen!.deps, deps);
  assert.deepEqual([seen!.workspaceId, seen!.id, seen!.expectedVersion, seen!.principalId], [WORKSPACE_ID, "w1", 3, "op-1"]);
  assert.deepEqual(seen!.state, { title: "T" });
  assert.equal(seen!.existing?.version, 3);
  assert.equal(seen!.sourceReplacement, replacement);
  assert.deepEqual(result, { changeSetId: "w1" });

  await handler.apply(applyInput("w1", { expectedVersion: 3 }));
  assert.equal("sourceReplacement" in seen!, false);
});

test("with undo, the default summary names the type and id, and the inverse is the row read inside the command", async () => {
  const inserted: Array<{ record: ChangeSetRecord; items: ChangeSetItemRecord[] }> = [];
  const ports: Ports = { rows: new Map([["w1", row()]]) };
  const handler = createRepoPublishHandler(config({ undo: { restore: async () => {}, remove: async () => {} } }))
    .build(makeDeps(ports, { changeSets: workingChangeSets(inserted) }));
  await handler.apply(applyInput("w1", { expectedVersion: 3 }));
  assert.equal(inserted[0]!.record.summary, "Import widget 'w1' via publish-content");
  assert.equal(inserted[0]!.items[0]!.operation, "update");
  assert.deepEqual(inserted[0]!.items[0]!.inversePayload, { id: "w1", title: "T", note: "n", version: 3 });
});

test("a rollback runs the registered side effects last first, then restore with the prior row (or remove on a create)", async () => {
  for (const existing of [true, false]) {
    const order: string[] = [];
    const ports: Ports = { rows: new Map(existing ? [["w1", row()]] : []) };
    const failing: ChangeSetRepoPort = { ...workingChangeSets(), insert: async () => { throw new Error("insert failed"); } };
    const handler = createRepoPublishHandler(config({
      write: async (ctx) => {
        ctx.onRollback({ undo: async () => { order.push("first"); } });
        ctx.onRollback({ undo: async () => { order.push("second"); } });
      },
      undo: {
        restore: async ({ prior }) => { order.push(`restore:${prior.version}`); },
        remove: async () => { order.push("remove"); },
      },
    })).build(makeDeps(ports, { changeSets: failing }));
    await assert.rejects(handler.apply(applyInput("w1", { expectedVersion: existing ? 3 : undefined })));
    assert.deepEqual(order, ["second", "first", existing ? "restore:3" : "remove"]);
  }
});

test("gatewayDeps returns the five gateway deps and names every missing one in its error", () => {
  const full = makeDeps(undefined, { changeSets: workingChangeSets() });
  const got = gatewayDeps({ deps: full, entityType: "widget" });
  assert.deepEqual(Object.keys(got).sort(), ["authorize", "changeSets", "clock", "idGen", "outbox"]);
  for (const missing of ["changeSets", "authorize", "outbox"] as const) {
    assert.throws(() => gatewayDeps({ deps: { ...full, [missing]: undefined }, entityType: "widget" }), (err: Error) =>
      err.message === "publish-content: widget.apply() requires PublishContentDeps.changeSets/authorize/outbox — wire it from the apply-loop composition root (features/publish-content/apply-loop.ts).", missing);
  }
});

test("okOrThrow returns the value of an ok result and throws the error of a failed one", () => {
  assert.equal(okOrThrow({ result: { ok: true, value: 5 } }), 5);
  const error = new Error("nope");
  assert.throws(() => okOrThrow({ result: { ok: false, error } }), (err: unknown) => err === error);
});
