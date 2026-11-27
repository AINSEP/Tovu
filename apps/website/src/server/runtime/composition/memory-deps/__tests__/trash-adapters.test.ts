/** The in-memory root's Trash adapters: marker flips per entity type and the purge cascades that
 * must match the durable adapters (index rows and references removed before the record itself). */
import assert from "node:assert/strict";
import test from "node:test";
import type { InMemoryTrashRepo } from "@jini-ai/cms/trash";
import type { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "@jini-ai/cms/forms";
import type { InMemoryEntryRefsRepo } from "@jini-ai/cms/widgets";
import type { TrashAwareInMemoryEntryRepo } from "@jini-ai/cms/entries";
import type { InMemoryNavLocationBindingRepo } from "@jini-ai/cms/navigation";
import type { TrashAwareInMemoryMenuRepo } from "@jini-ai/cms/navigation/site/trash-aware-memory-menu-repo";
import type { InMemoryCommentRepo } from "@jini-ai/cms/comments";
import type { InMemoryVersionedMediaRepo } from "@jini-ai/cms/media";
import {
  memoryFormSubmissionTrashAdapter, memoryFormTrashAdapter, memoryMenuTrashAdapter, memoryWidgetTrashAdapter,
} from "../slices/trash-adapters-forms-widgets.js";
import { memoryCommentTrashAdapter, memoryMediaTrashAdapter } from "../slices/trash-adapters-content.js";

const WS = "site-a";
const AT = "2026-11-27T10:00:00.000Z";
type Row = { id: string; version: number } & Record<string, unknown>;

/** A Map-backed record store that logs every write, so cascade order is observable. */
function rows(initial: Row[], log: unknown[][], name: string) {
  const map = new Map(initial.map(row => [row.id, row]));
  return {
    map,
    find: async ({ workspaceId, id }: { workspaceId: string; id: string }) => {
      assert.equal(workspaceId, WS);
      return map.get(id) ?? null;
    },
    save: async (record: Row) => { log.push([`${name}.save`, record]); map.set(record.id, record); },
    remove: (op: string) => async (args: { workspaceId: string; id: string }) => { log.push([`${name}.${op}`, args]); map.delete(args.id); },
  };
}

test("form purge removes each submission's trash index row, then the submissions, then the definition", async () => {
  const log: unknown[][] = [];
  const defs = rows([{ id: "form-1", version: 3, deletedAt: AT }], log, "defs");
  const formDefinitionRepo = { findAnyById: defs.find, save: defs.save, hardDelete: defs.remove("hardDelete") } as unknown as InMemoryFormDefinitionRepo;
  const formSubmissionRepo = {
    listAllForDefinition: async (args: unknown) => { log.push(["subs.listAllForDefinition", args]); return [{ id: "sub-1" }, { id: "sub-2" }]; },
    deleteAllForDefinition: async (args: unknown) => { log.push(["subs.deleteAllForDefinition", args]); },
  } as unknown as InMemoryFormSubmissionRepo;
  const trashRepo = { deleteByEntity: async (args: unknown) => { log.push(["trash.deleteByEntity", args]); } } as unknown as InMemoryTrashRepo;
  const adapter = memoryFormTrashAdapter({ formDefinitionRepo: () => formDefinitionRepo, formSubmissionRepo, trashRepo });

  assert.equal(adapter.entityType, "form");
  assert.equal(await adapter.purge({ workspaceId: WS, entityId: "form-1", expectedVersion: 3 }), "purged");
  assert.deepEqual(log, [
    ["subs.listAllForDefinition", { workspaceId: WS, formDefinitionId: "form-1" }],
    ["trash.deleteByEntity", { workspaceId: WS, entityType: "form_submission", entityId: "sub-1" }],
    ["trash.deleteByEntity", { workspaceId: WS, entityType: "form_submission", entityId: "sub-2" }],
    ["subs.deleteAllForDefinition", { workspaceId: WS, formDefinitionId: "form-1" }],
    ["defs.hardDelete", { workspaceId: WS, id: "form-1" }],
  ]);
});

test("form and form submission markers flip deletedAt; a submission purge hard-deletes only that submission", async () => {
  const log: unknown[][] = [];
  const defs = rows([{ id: "form-1", version: 1, deletedAt: null }], log, "defs");
  const subs = rows([{ id: "sub-1", version: 1, deletedAt: null }], log, "subs");
  const formDefinitionRepo = { findAnyById: defs.find, save: defs.save } as unknown as InMemoryFormDefinitionRepo;
  const formSubmissionRepo = { findAnyById: subs.find, save: subs.save, hardDelete: subs.remove("hardDelete") } as unknown as InMemoryFormSubmissionRepo;
  const form = memoryFormTrashAdapter({ formDefinitionRepo: () => formDefinitionRepo, formSubmissionRepo, trashRepo: {} as InMemoryTrashRepo });
  const submission = memoryFormSubmissionTrashAdapter({ formSubmissionRepo });

  assert.deepEqual(await form.hide({ workspaceId: WS, entityId: "form-1", at: AT, expectedVersion: 1 }), { ok: true, version: 2 });
  assert.deepEqual(defs.map.get("form-1"), { id: "form-1", version: 2, deletedAt: AT });
  assert.deepEqual(await form.unhide({ workspaceId: WS, entityId: "form-1", at: AT, expectedVersion: 2 }), { ok: true, version: 3 });
  assert.deepEqual(defs.map.get("form-1"), { id: "form-1", version: 3, deletedAt: null });

  assert.equal(submission.entityType, "form_submission");
  await submission.hide({ workspaceId: WS, entityId: "sub-1", at: AT, expectedVersion: null });
  assert.deepEqual(subs.map.get("sub-1"), { id: "sub-1", version: 2, deletedAt: AT });
  await submission.unhide({ workspaceId: WS, entityId: "sub-1", at: AT, expectedVersion: 2 });
  assert.deepEqual(subs.map.get("sub-1"), { id: "sub-1", version: 3, deletedAt: null });
  assert.equal(await submission.purge({ workspaceId: WS, entityId: "sub-1", expectedVersion: 3 }), "purged");
  assert.deepEqual(log.at(-1), ["subs.hardDelete", { workspaceId: WS, id: "sub-1" }]);
});

test("widget purge removes only the widget's outgoing references, then the entry", async () => {
  const log: unknown[][] = [];
  const entries = rows([{ id: "widget-1", version: 4, deletedAt: AT }], log, "entries");
  const entryRepo = { findAnyById: entries.find, saveAny: entries.save, hardDelete: entries.remove("hardDelete") } as unknown as TrashAwareInMemoryEntryRepo;
  const entryRefsRepo = { removeBySource: async (args: unknown) => { log.push(["refs.removeBySource", args]); } } as unknown as InMemoryEntryRefsRepo;
  const adapter = memoryWidgetTrashAdapter({ entryRepo, entryRefsRepo: () => entryRefsRepo });

  assert.equal(adapter.entityType, "widget");
  assert.deepEqual(await adapter.unhide({ workspaceId: WS, entityId: "widget-1", at: AT, expectedVersion: 4 }), { ok: true, version: 5 });
  assert.deepEqual(entries.map.get("widget-1"), { id: "widget-1", version: 5, deletedAt: null });
  const later = "2026-11-28T00:00:00.000Z";
  assert.deepEqual(await adapter.hide({ workspaceId: WS, entityId: "widget-1", at: later, expectedVersion: 5 }), { ok: true, version: 6 });
  assert.deepEqual(entries.map.get("widget-1"), { id: "widget-1", version: 6, deletedAt: later });
  assert.equal(await adapter.purge({ workspaceId: WS, entityId: "widget-1", expectedVersion: 6 }), "purged");
  assert.deepEqual(log.slice(2), [
    ["refs.removeBySource", { workspaceId: WS, sourceEntryId: "widget-1" }],
    ["entries.hardDelete", { workspaceId: WS, id: "widget-1" }],
  ]);
});

test("menu trash stashes the prior status, restores it (published when none was stashed), and purges bindings first", async () => {
  const log: unknown[][] = [];
  const menus = rows([
    { id: "menu-draft", version: 1, status: "draft", updatedAt: "old", priorStatus: null },
    { id: "menu-legacy", version: 1, status: "trash", updatedAt: "old", priorStatus: null },
  ], log, "menus");
  const menuRepo = { findAnyById: menus.find, saveAny: menus.save, remove: menus.remove("remove") } as unknown as TrashAwareInMemoryMenuRepo;
  const bindings = { removeByMenu: async (args: unknown) => { log.push(["bindings.removeByMenu", args]); } } as unknown as InMemoryNavLocationBindingRepo;
  const adapter = memoryMenuTrashAdapter({ menuRepo: () => menuRepo, navLocationBindingRepo: () => bindings });

  assert.equal(adapter.entityType, "menu");
  await adapter.hide({ workspaceId: WS, entityId: "menu-draft", at: AT, expectedVersion: 1 });
  assert.deepEqual(menus.map.get("menu-draft"), { id: "menu-draft", version: 2, status: "trash", updatedAt: AT, priorStatus: "draft" });
  await adapter.unhide({ workspaceId: WS, entityId: "menu-draft", at: AT, expectedVersion: 2 });
  assert.deepEqual(menus.map.get("menu-draft"), { id: "menu-draft", version: 3, status: "draft", updatedAt: AT, priorStatus: null });
  await adapter.unhide({ workspaceId: WS, entityId: "menu-legacy", at: AT, expectedVersion: 1 });
  assert.deepEqual(menus.map.get("menu-legacy"), { id: "menu-legacy", version: 2, status: "published", updatedAt: AT, priorStatus: null });

  log.length = 0;
  assert.equal(await adapter.purge({ workspaceId: WS, entityId: "menu-legacy", expectedVersion: 2 }), "purged");
  assert.deepEqual(log, [
    ["bindings.removeByMenu", { workspaceId: WS, menuId: "menu-legacy" }],
    ["menus.remove", { workspaceId: WS, id: "menu-legacy" }],
  ]);
});

test("comment trash restores to pending moderation, and purge stands down without a hard delete", async () => {
  const log: unknown[][] = [];
  const comments = rows([{ id: "c-1", version: 1, status: "approved", updatedAt: "old" }], log, "comments");
  const commentRepo = { findById: comments.find, save: comments.save } as unknown as InMemoryCommentRepo;
  const adapter = memoryCommentTrashAdapter({ commentRepo });

  await adapter.hide({ workspaceId: WS, entityId: "c-1", at: AT, expectedVersion: 1 });
  assert.deepEqual(comments.map.get("c-1"), { id: "c-1", version: 2, status: "trash", updatedAt: AT });
  await adapter.unhide({ workspaceId: WS, entityId: "c-1", at: AT, expectedVersion: 2 });
  assert.deepEqual(comments.map.get("c-1"), { id: "c-1", version: 3, status: "pending", updatedAt: AT });
  assert.equal(await adapter.purge({ workspaceId: WS, entityId: "c-1", expectedVersion: 3 }), "version-changed");
  assert.equal(comments.map.get("c-1")?.version, 3);
});

test("media trash flips trashed and back to active", async () => {
  const log: unknown[][] = [];
  const media = rows([{ id: "m-1", version: 7, status: "active", updatedAt: "old" }], log, "media");
  const mediaRepo = { findById: media.find, save: media.save } as unknown as InMemoryVersionedMediaRepo;
  const adapter = memoryMediaTrashAdapter({ mediaRepo });

  assert.deepEqual(await adapter.hide({ workspaceId: WS, entityId: "m-1", at: AT, expectedVersion: 7 }), { ok: true, version: 8 });
  assert.deepEqual(media.map.get("m-1"), { id: "m-1", version: 8, status: "trashed", updatedAt: AT });
  assert.deepEqual(await adapter.hide({ workspaceId: WS, entityId: "m-1", at: AT, expectedVersion: 8 }), { ok: true, version: 8, noop: true });
  assert.deepEqual(await adapter.unhide({ workspaceId: WS, entityId: "m-1", at: AT, expectedVersion: 8 }), { ok: true, version: 9 });
  assert.deepEqual(media.map.get("m-1"), { id: "m-1", version: 9, status: "active", updatedAt: AT });
});
