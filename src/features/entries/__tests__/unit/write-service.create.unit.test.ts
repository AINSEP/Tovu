import assert from "node:assert/strict";
import test from "node:test";

import { EntrySlugConflictError } from "../../errors";
import { createEntry } from "../../write-service";

/**
 * @file REQ-13/14/19 (SPEC-020) — `createEntry` slug-uniqueness and type-existence/workspace-
 * ownership validation (C-409).
 *
 * Covers: AC-21 (duplicate (workspaceId,type,slug) rejected), AC-29 (nonexistent type rejected),
 * AC-30 (cross-workspace type reference rejected — INV-01), AC-27 (entry.created outbox event).
 */

const NOW = "2026-07-15T00:00:00.000Z";
const clock = { nowIso: () => NOW };
let idCounter = 0;
const ids = { newId: () => `entry-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function activeContentType(workspaceId = "ws-1") {
  return { workspaceId, key: "recipe", status: "active" as const, fields: [] as Array<{ name: string; kind: "text"; required: boolean; queryable: boolean }> };
}

function fakeEntryRepo(existing: Array<{ workspaceId: string; type: string; slug: string }> = []) {
  const rows = [...existing];
  const events: unknown[] = [];
  return {
    rows,
    events,
    findBySlug: async (params: { workspaceId: string; type: string; slug: string }) =>
      rows.find((r) => r.workspaceId === params.workspaceId && r.type === params.type && r.slug === params.slug) ?? null,
    save: async (row: { workspaceId: string; type: string; slug: string }) => {
      rows.push(row);
    },
    appendRevision: async () => undefined,
    transaction: async <T>(fn: () => Promise<T>) => fn(),
  };
}

function fakeContentTypeRepo(ct: ReturnType<typeof activeContentType> | null) {
  return { findByKey: async () => ct };
}

const outbox = { enqueue: async () => undefined };

test("AC-21: a second entry submitted with the identical (workspaceId, type, slug) is rejected with ENTRY_SLUG_CONFLICT, no second row created", async () => {
  const entryRepo = fakeEntryRepo([{ workspaceId: "ws-1", type: "recipe", slug: "chili" }]);
  const contentTypeRepo = fakeContentTypeRepo(activeContentType());

  const result = await createEntry({
    deps: { entryRepo, contentTypeRepo, clock, ids, authorize: alwaysAllow, outbox },
    input: { workspaceId: "ws-1", actorId: "user-1", type: "recipe", slug: "chili", title: "Chili Again", fieldsJson: { ext: { site: {} } } },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.error instanceof EntrySlugConflictError);
  assert.equal(entryRepo.rows.length, 1);
});

test("AC-29: an entry write specifying a nonexistent content type is rejected with CONTENT_TYPE_NOT_FOUND", async () => {
  const entryRepo = fakeEntryRepo();
  const contentTypeRepo = fakeContentTypeRepo(null);

  const result = await createEntry({
    deps: { entryRepo, contentTypeRepo, clock, ids, authorize: alwaysAllow, outbox },
    input: { workspaceId: "ws-1", actorId: "user-1", type: "does-not-exist", slug: "x", title: "X", fieldsJson: { ext: { site: {} } } },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal((result.error as { code?: string }).code ?? (result.error as Error).name, "CONTENT_TYPE_NOT_FOUND");
});

test("AC-30/INV-01: a content type that exists only in a DIFFERENT workspace is not silently accepted — rejected as a workspace-ownership violation", async () => {
  const entryRepo = fakeEntryRepo();
  const contentTypeRepo = fakeContentTypeRepo(activeContentType("ws-OTHER"));

  const result = await createEntry({
    deps: { entryRepo, contentTypeRepo, clock, ids, authorize: alwaysAllow, outbox },
    input: { workspaceId: "ws-1", actorId: "user-1", type: "recipe", slug: "x", title: "X", fieldsJson: { ext: { site: {} } } },
  });

  assert.equal(result.ok, false, "a content type owned by a different workspace must never be silently accepted (SPEC-016 REQ-18's general soft-reference rule)");
  assert.equal(entryRepo.rows.length, 0);
});

test("AC-27: a successful entry creation enqueues an entry.created outbox event in the same call", async () => {
  const events: unknown[] = [];
  const trackedOutbox = { enqueue: async (e: unknown) => { events.push(e); } };
  const entryRepo = fakeEntryRepo();
  const contentTypeRepo = fakeContentTypeRepo(activeContentType());

  const result = await createEntry({
    deps: { entryRepo, contentTypeRepo, clock, ids, authorize: alwaysAllow, outbox: trackedOutbox },
    input: { workspaceId: "ws-1", actorId: "user-1", type: "recipe", slug: "chili-new", title: "Chili", fieldsJson: { ext: { site: {} } } },
  });

  assert.equal(result.ok, true);
  assert.equal(events.length, 1);
  const event = events[0] as { name: string };
  assert.equal(event.name, "entry.created");
});
