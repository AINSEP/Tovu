import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { PostRecord, PostRepoPort } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { postRepoFor } from "../repo.js";

/**
 * @file `listHtmlByKind` parity between the in-memory repo (a test double for many suites) and the SQL
 * adapter on every dialect (Stryker lane L14: `repo.memory.ts` lines 59-64 had no test). One scenario
 * pins every filter clause, the keyset cursor (strictly-older OR same-time-larger-id), the
 * newest-first/id-ascending order and the limit.
 */

const WS = "ws-html-kind";

function post(id: string, overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id, workspaceId: WS, title: `T ${id}`, slug: id, bodyJson: { type: "doc", content: [] },
    bodyFormat: "html", bodyHtml: `<p>${id}</p>`, status: "draft", kind: "page",
    updatedAt: "2026-10-02T00:00:00.000Z", version: 1, ...overrides,
  };
}

const ROWS: PostRecord[] = [
  post("b", { updatedAt: "2026-10-03T00:00:00.000Z" }),
  post("a", { updatedAt: "2026-10-03T00:00:00.000Z" }),
  post("c"),
  post("d", { updatedAt: "2026-10-01T00:00:00.000Z" }),
  post("other-ws", { workspaceId: "ws-other" }),
  post("other-kind", { kind: "post" }),
  post("doc-format", { bodyFormat: "doc", bodyJson: { type: "doc", content: [] }, bodyHtml: null }),
  post("trashed", { deletedAt: "2026-10-04T00:00:00.000Z" }),
];

async function scenario(repo: PostRepoPort): Promise<void> {
  const ids = async (q: { limit: number; before?: { updatedAt: string; id: string } }) =>
    (await repo.listHtmlByKind!({ workspaceId: WS, kind: "page", ...q })).map((r) => r.id);
  assert.deepEqual(await ids({ limit: 10 }), ["a", "b", "c", "d"]);
  assert.deepEqual(await ids({ limit: 2 }), ["a", "b"]);
  assert.deepEqual(await ids({ limit: 10, before: { updatedAt: "2026-10-03T00:00:00.000Z", id: "a" } }), ["b", "c", "d"]);
  assert.deepEqual(await ids({ limit: 10, before: { updatedAt: "2026-10-03T00:00:00.000Z", id: "b" } }), ["c", "d"]);
  assert.deepEqual(await ids({ limit: 1, before: { updatedAt: "2026-10-02T00:00:00.000Z", id: "c" } }), ["d"]);
  assert.deepEqual(await ids({ limit: 10, before: { updatedAt: "2026-10-01T00:00:00.000Z", id: "d" } }), []);
  assert.deepEqual((await repo.listHtmlByKind!({ workspaceId: WS, kind: "post", limit: 10 })).map((r) => r.id), ["other-kind"]);
}

test("in-memory repo: listHtmlByKind filters, orders, pages and bounds", async () => {
  await scenario(new InMemoryPostRepo(ROWS));
});

test("in-memory repo: an html row with a NULL body is skipped (a shape the SQL CHECK posts_body_format_shape forbids)", async () => {
  const repo = new InMemoryPostRepo([...ROWS, post("null-html", { bodyHtml: null, updatedAt: "2026-10-09T00:00:00.000Z" })]);
  await scenario(repo);
});

describeEachDialect<PostRepoPort>("post repo listHtmlByKind", { tables: ["posts", "post_revisions"], make: postRepoFor }, (makeRepo) => {
  test("SQL repo: identical result to the in-memory repo", async () => {
    const repo = makeRepo();
    for (const row of ROWS) await repo.save(row);
    await scenario(repo);
  });
});
