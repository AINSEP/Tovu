import assert from "node:assert/strict";
import test from "node:test";

import { ToolInputError, type ToolExecutionContext, type ToolRegistration } from "@jini-ai/core";
import type { TrashPort } from "@jini-ai/cms/trash";

import { deriveTrashItemRegistrations, getTrashItemAgentToolCatalog, TRASH_ITEM_DELEGATES, type TrashItemToolDeps } from "../trash-item-tool.js";
import type { TrashEntry } from "../registry.js";

/**
 * @file DI-fake tests for the `trash_item` paths the composition-level suites do not reach (Stryker
 * lane L14: 28.8 %, 83 no-coverage): every bespoke delegate's input mapping (including the
 * email-template → post kind guard), the declared catalog's kind enum, and the generic path's
 * null-version and refusal handling.
 */

function deps(over: Partial<TrashItemToolDeps> = {}): TrashItemToolDeps {
  return {
    authorize: async () => ({ allowed: true, reason: "ok" }),
    workspaceId: "ws",
    isTrashableEntityType: () => true,
    postRepo: { findById: async () => null },
    commentRepo: { findById: async () => null },
    commentsReady: Promise.resolve(),
    registry: new Map(),
    trash: {} as TrashPort,
    db: {} as TrashItemToolDeps["db"],
    clock: { nowIso: () => "2026-10-25T00:00:00.000Z" },
    ...over,
  } as TrashItemToolDeps;
}

const delegate = (kind: string) => TRASH_ITEM_DELEGATES.get(kind)!;

test("delegate table: kinds, tool ids and permissions, in the order the model is told", () => {
  assert.deepEqual(
    [...TRASH_ITEM_DELEGATES.values()].map((d) => [d.entityType, d.toolId, d.permission]),
    [
      ["post", "content_post_delete", "content.write"],
      ["comment", "comments_trash_comment", "comments.delete"],
      ["media", "media_trash_asset", "media.delete"],
      ["redirect", "redirects_tombstone", "admin.redirects.manage"],
      ["widget", "widgets_trash_instance", "widgets.delete"],
      ["theme", "theme_trash", "theme.edit"],
    ],
  );
});

test("post delegate: the row's own kind is forwarded, an email-template is handed over as 'post', a missing row is null", async () => {
  const seen: unknown[] = [];
  const rows: Record<string, { kind: string }> = { a: { kind: "page" }, b: { kind: "email-template" }, c: { kind: "post" } };
  const d = deps({ postRepo: { findById: async (q) => (seen.push(q), rows[q.id] ?? null) } });
  assert.deepEqual(await delegate("post").toDelegateInput(d, "a"), { id: "a", kind: "page" });
  assert.deepEqual(await delegate("post").toDelegateInput(d, "b"), { id: "b", kind: "post" });
  assert.deepEqual(await delegate("post").toDelegateInput(d, "c"), { id: "c", kind: "post" });
  assert.equal(await delegate("post").toDelegateInput(d, "zz"), null);
  assert.deepEqual(seen[0], { workspaceId: "ws", id: "a" });
});

test("comment delegate: waits for commentsReady, then forwards the row's version; missing is null", async () => {
  let release!: () => void;
  const ready = new Promise<void>((r) => { release = r; });
  let read = false;
  const d = deps({ commentsReady: ready, commentRepo: { findById: async (q) => (read = true, q.id === "c1" ? { version: 4 } : null) } });
  const pending = delegate("comment").toDelegateInput(d, "c1");
  await new Promise((r) => setImmediate(r));
  assert.equal(read, false, "the comment table is not read before commentsReady settles");
  release();
  assert.deepEqual(await pending, { commentId: "c1", expectedVersion: 4 });
  assert.equal(await delegate("comment").toDelegateInput(d, "nope"), null);
});

test("media/redirect/widget/theme delegates map the id to their own input key without reading anything", async () => {
  const d = deps({ postRepo: { findById: async () => { throw new Error("no read"); } }, commentRepo: { findById: async () => { throw new Error("no read"); } } });
  assert.deepEqual(await delegate("media").toDelegateInput(d, "m"), { mediaId: "m" });
  assert.deepEqual(await delegate("redirect").toDelegateInput(d, "r"), { id: "r" });
  assert.deepEqual(await delegate("widget").toDelegateInput(d, "w"), { widgetInstanceId: "w" });
  assert.deepEqual(await delegate("theme").toDelegateInput(d, "t"), { themeId: "t" });
});

test("getTrashItemAgentToolCatalog declares exactly trash_item, with every delegate kind plus 'user' in its enum", () => {
  const catalog = getTrashItemAgentToolCatalog();
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0]!.name, "trash_item");
  const schema = catalog[0]!.inputSchema as { properties: { entityType: { enum: string[] } } };
  assert.deepEqual(schema.properties.entityType.enum, ["post", "comment", "media", "redirect", "widget", "theme", "user"]);
});

const FORM_ENTRY = {
  entityType: "form", label: "Form", permission: "admin.forms.manage", table: "form_definitions", idColumn: "id",
  workspaceColumn: "workspace_id", marker: { kind: "timestamp", column: "deleted_at" }, versionColumn: "version",
  display: { title: "form_definitions.name" },
} as unknown as TrashEntry;

function genericTool(row: Record<string, unknown> | undefined, marker: Awaited<ReturnType<TrashPort["trash"]>>, writes: unknown[]): ToolRegistration {
  const d = deps({
    registry: new Map([["form", FORM_ENTRY]]),
    db: { run: async () => row } as unknown as TrashItemToolDeps["db"],
    trash: { trash: async (args: unknown) => (writes.push(args), marker) } as unknown as TrashPort,
  });
  return deriveTrashItemRegistrations({ registrations: [], routeDeps: d, surfaces: {} as never }, { delegates: new Map() })[0]!;
}

const call = (reg: ToolRegistration, input: unknown) =>
  reg.handler({ executionId: "e", principal: { id: "p" }, run: { id: "r" }, input, signal: new AbortController().signal } as ToolExecutionContext);

test("generic kind: a row whose version reads NULL is trashed with no expected-version check (expectedVersion null at the port)", async () => {
  const writes: Array<{ expectedVersion: unknown }> = [];
  const out = await call(genericTool({ title: "F", version: null }, { ok: true, version: null }, writes), { entityType: "form", entityId: "f1" });
  assert.deepEqual(out, { entityType: "form", entityId: "f1", via: "moveToTrash", outcome: { trashed: true, cancelled: false, version: null } });
  assert.equal(writes.length, 1);
  assert.equal(writes[0]!.expectedVersion, null);
});

test("generic kind: a port-level refusal surfaces as the mapped ToolInputError, never a success", async () => {
  await assert.rejects(
    call(genericTool({ title: "F", version: 2 }, { ok: false, reason: "version-changed" }, []), { entityType: "form", entityId: "f1" }),
    (err: unknown) => err instanceof ToolInputError && err.message === "trash_item: form 'f1' changed during removal. Reload and try again. Nothing was changed.",
  );
});

test("generic kind: a missing row is not-found before any write", async () => {
  const writes: unknown[] = [];
  await assert.rejects(
    call(genericTool(undefined, { ok: true, version: 1 }, writes), { entityType: "form", entityId: "gone" }),
    (err: unknown) => err instanceof ToolInputError && err.message === "trash_item: form 'gone' was not found. Nothing was changed.",
  );
  assert.deepEqual(writes, []);
});

test("trash_item's declared input schema is closed and requires both entityType and entityId (non-empty id)", () => {
  const schema = getTrashItemAgentToolCatalog()[0]!.inputSchema as Record<string, unknown> & { properties: Record<string, Record<string, unknown>> };
  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["entityType", "entityId"]);
  assert.deepEqual(Object.keys(schema.properties).sort(), ["entityId", "entityType"]);
  assert.equal(schema.properties.entityId!.type, "string");
  assert.equal(schema.properties.entityId!.minLength, 1);
  assert.equal(schema.properties.entityType!.type, "string");
});

test("both the generic and the delegate path authorize with the entity in scope (type and id), against the kind's own permission", async () => {
  const seen: Array<Record<string, unknown>> = [];
  const authorize = (async (q: Record<string, unknown>) => (seen.push(q), { allowed: false, reason: "nope" })) as unknown as TrashItemToolDeps["authorize"];
  const d = deps({
    authorize, registry: new Map([["form", FORM_ENTRY]]),
    db: { run: async () => { throw new Error("denied calls must not read"); } } as unknown as TrashItemToolDeps["db"],
  });
  const delegateHandler = async () => { throw new Error("denied calls must not reach the delegate"); };
  const [reg] = deriveTrashItemRegistrations(
    { registrations: [{ descriptor: { id: "media_trash_asset" }, handler: delegateHandler } as unknown as ToolRegistration], routeDeps: d, surfaces: {} as never },
    { delegates: new Map([["media", TRASH_ITEM_DELEGATES.get("media")!]]) },
  );
  await assert.rejects(call(reg!, { entityType: "form", entityId: "f1" }), (e: unknown) => (e as { permission?: string }).permission === "admin.forms.manage");
  await assert.rejects(call(reg!, { entityType: "media", entityId: "m1" }), (e: unknown) => (e as { permission?: string }).permission === "media.delete");
  assert.deepEqual(seen, [
    { principalId: "p", permission: "admin.forms.manage", workspaceId: "ws", entityType: "form", entityId: "f1" },
    { principalId: "p", permission: "media.delete", workspaceId: "ws", entityType: "media", entityId: "m1" },
  ]);
});

test("generic kind: the version read by the tool is the one enforced — a row bumped before the write is version-changed", async () => {
  let reads = 0;
  const writes: unknown[] = [];
  const d = deps({
    registry: new Map([["form", FORM_ENTRY]]),
    db: { run: async () => ({ title: "F", version: ++reads === 1 ? 2 : 3 }) } as unknown as TrashItemToolDeps["db"],
    trash: { trash: async (a: unknown) => (writes.push(a), { ok: true, version: 4 }) } as unknown as TrashPort,
  });
  const [reg] = deriveTrashItemRegistrations({ registrations: [], routeDeps: d, surfaces: {} as never }, { delegates: new Map() });
  await assert.rejects(call(reg!, { entityType: "form", entityId: "f1" }), (e: unknown) => e instanceof ToolInputError && /changed during removal/.test(e.message));
  assert.deepEqual(writes, []);
});
