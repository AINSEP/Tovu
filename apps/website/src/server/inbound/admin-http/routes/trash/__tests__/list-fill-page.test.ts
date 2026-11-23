import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { TrashItem } from "@jini-ai/cms/trash";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminTrashListRoute } from "../list.js";

const now = "2026-10-01T12:00:00.000Z";
const route = "/api/admin/v1/workspaces/:workspaceId/trash";

function row(id: string, entityType: string): TrashItem {
  return {
    id, workspaceId: "ws-7", entityType, entityId: `${id}-entity`, displayTitle: id, displaySubtitle: null,
    trashedAt: "2026-09-30T00:00:00.000Z", purgeAfter: "2026-11-29T00:00:00.000Z", actorPrincipalId: "principal-7", actorPluginId: null,
  } as unknown as TrashItem;
}

/** A keyset source over `rows`: the cursor is the index of the next row to read. */
function keysetTrash(rows: readonly TrashItem[]) {
  const reads: Array<{ limit: number; cursor: string | null }> = [];
  const list = async (input: { limit: number }, optional: { cursor?: string | null }) => {
    const cursor = optional.cursor ?? null;
    reads.push({ limit: input.limit, cursor });
    const start = cursor === null ? 0 : Number(cursor);
    const end = Math.min(rows.length, start + input.limit);
    return { items: rows.slice(start, end), nextCursor: end < rows.length ? String(end) : null };
  };
  return { reads, trash: { list } };
}

async function listPage(rows: readonly TrashItem[], query: Record<string, string>) {
  const source = keysetTrash(rows);
  const app = express();
  // This principal may moderate comments but not delete media, so every media row is hidden.
  const deps = { workspaceId: "ws-7", registry: new Map(), clock: { nowIso: () => now }, trash: source.trash,
    authorize: async ({ permission }: { permission: string }) => ({ allowed: permission !== "media.delete", reason: "test" }),
    userRepo: { list: async () => [] } } as any;
  registerAdminTrashListRoute({ app, deps });
  const { res, capture } = createCapturingResponse();
  res.locals.principal = { id: "principal-7" };
  await extractRouteHandler(app, "get", route)({ params: { workspaceId: "ws-7" }, query, body: undefined }, res);
  return { capture, reads: source.reads };
}

// B150: hidden rows ahead of visible ones must not leave the page short while visible rows remain.
test("trash list keeps reading past hidden rows until the page holds `limit` visible items", async () => {
  const rows = [row("m1", "media"), row("m2", "media"), row("m3", "media"), row("c1", "comment"), row("c2", "comment")];
  const { capture, reads } = await listPage(rows, { limit: "2" });
  assert.equal(capture.statusCode, 200);
  const body = capture.jsonBody as { items: Array<{ id: string }>; nextCursor: string | null };
  assert.deepEqual(body.items.map((item) => item.id), ["c1", "c2"]);
  assert.equal(body.nextCursor, null);
  // Each follow-up read asks only for the shortfall, so no visible row is fetched and then dropped.
  assert.deepEqual(reads, [{ limit: 2, cursor: null }, { limit: 2, cursor: "2" }, { limit: 1, cursor: "4" }]);
});

test("trash list never over-fills a page, so the cursor resumes at the first unreturned row", async () => {
  const rows = [row("m1", "media"), row("c1", "comment"), row("c2", "comment"), row("c3", "comment")];
  const { capture } = await listPage(rows, { limit: "2" });
  const body = capture.jsonBody as { items: Array<{ id: string }>; nextCursor: string | null };
  assert.deepEqual(body.items.map((item) => item.id), ["c1", "c2"]);
  assert.equal(body.nextCursor, "3");
});

test("trash list stops after a bounded number of reads and returns a cursor to continue from", async () => {
  const rows = Array.from({ length: 40 }, (_, index) => row(`m${index}`, "media"));
  const { capture, reads } = await listPage(rows, { limit: "1" });
  const body = capture.jsonBody as { items: unknown[]; nextCursor: string | null };
  assert.deepEqual(body.items, []);
  assert.ok(reads.length < rows.length, `expected a bounded scan, saw ${reads.length} reads`);
  assert.equal(body.nextCursor, String(reads.length));
});
