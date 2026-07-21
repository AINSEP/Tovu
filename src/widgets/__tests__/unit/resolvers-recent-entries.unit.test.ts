import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryEntryRepo } from "../../../features/entries/repo.memory";
import type { EntryListPort } from "../../../features/entries/list";
import { createRecentEntriesResolver } from "../../resolvers/recent-entries";
import type { WidgetInstanceView, WidgetResolveContext } from "../../types";

/**
 * @file `recent-entries` resolver — SPEC-043 REQ-24/REQ-25's bounded-query contract. Confirms the
 * 2026-07-21 fix: the resolver's query is bounded/sorted at the source, not a full-workspace scan
 * truncated in memory after the fact.
 */

const WORKSPACE_ID = "ws-1";
const CTX: WidgetResolveContext = { workspaceId: WORKSPACE_ID, preview: false };

function instance(id: string, maxItems?: number): WidgetInstanceView {
  return { id, widgetType: "recent-entries", config: maxItems === undefined ? {} : { maxItems } };
}

test("REQ-25: never returns more than the registered clamp, even with far more published entries than the clamp and no instance-level maxItems", async () => {
  const repo = new InMemoryEntryRepo();
  for (let i = 0; i < 50; i++) {
    await repo.save({
      id: `entry-${i}`,
      workspaceId: WORKSPACE_ID,
      type: "post",
      slug: `post-${i}`,
      status: "published",
      title: `Post ${i}`,
      bodyJson: null,
      fieldsJson: { ext: { site: {} } },
      publishedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
      version: 1,
    });
  }

  const resolver = createRecentEntriesResolver({ entryList: repo });
  const results = await resolver.resolveMany([instance("w-1")], CTX);

  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  assert.equal(result.ir.children?.length, 20, "must be capped at the registered clamp (20), not the 50 available entries");
});

test("REQ-25: query returns the most recently updated published entries first, unpublished entries excluded", async () => {
  const repo = new InMemoryEntryRepo();
  await repo.save({
    id: "draft-1",
    workspaceId: WORKSPACE_ID,
    type: "post",
    slug: "draft",
    status: "draft",
    title: "Draft",
    bodyJson: null,
    fieldsJson: { ext: { site: {} } },
    publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:05.000Z",
    version: 1,
  });
  await repo.save({
    id: "old-1",
    workspaceId: WORKSPACE_ID,
    type: "post",
    slug: "old",
    status: "published",
    title: "Old Post",
    bodyJson: null,
    fieldsJson: { ext: { site: {} } },
    publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:01.000Z",
    version: 1,
  });
  await repo.save({
    id: "new-1",
    workspaceId: WORKSPACE_ID,
    type: "post",
    slug: "new",
    status: "published",
    title: "New Post",
    bodyJson: null,
    fieldsJson: { ext: { site: {} } },
    publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:02.000Z",
    version: 1,
  });

  const resolver = createRecentEntriesResolver({ entryList: repo });
  const results = await resolver.resolveMany([instance("w-1", 5)], CTX);

  const result = results.get("w-1");
  assert.ok(result?.ok);
  if (!result.ok) return;
  const titles = result.ir.children?.map((c) => (c.props as { title: string }).title);
  assert.deepEqual(titles, ["New Post", "Old Post"], "newest-updated-first, draft excluded entirely");
});

test("REQ-25: the query itself is bounded/sorted/filtered — not a full unbounded scan truncated in memory afterward", async () => {
  const calls: Array<Parameters<EntryListPort["listByWorkspace"]>[0]> = [];
  const spyEntryList: EntryListPort = {
    async listByWorkspace(params) {
      calls.push(params);
      return [];
    },
  };

  const resolver = createRecentEntriesResolver({ entryList: spyEntryList });
  await resolver.resolveMany([instance("w-1")], CTX);

  assert.equal(calls.length, 1, "exactly one query for the whole batch (REQ-24)");
  assert.deepEqual(calls[0], {
    workspaceId: WORKSPACE_ID,
    status: "published",
    orderBy: "updatedAt",
    orderDirection: "desc",
    limit: 20,
  });
});
