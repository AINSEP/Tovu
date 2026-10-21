import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { test } from "node:test";

import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { GoLiveCandidatesPort } from "../go-live.js";
import type { PostRecord, PostRepoPort } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";
import { postRepoFor } from "../repo.js";
import { buildPostRecord } from "./post-record.fixture.js";

/**
 * @file `listGoLiveCandidates` on the in-memory repo and every SQL dialect: published, untrashed,
 * saved before a `publishAt` inside `(afterIso, nowIso]`, in this workspace, oldest go-live first.
 */

const WS = "ws-go-live";
const SAVED = "2026-10-21T10:00:00.000Z";
const GO_LIVE = "2026-10-21T12:00:00.000Z";
const NOW = "2026-10-21T13:00:00.000Z";

const row = (id: string, fields: Partial<PostRecord> = {}) =>
  buildPostRecord({ id, slug: id, workspaceId: WS, status: "published", publishAt: GO_LIVE, updatedAt: SAVED, ...fields });

const ROWS = [
  row("due-late", { publishAt: "2026-10-21T12:30:00.000Z" }),
  row("due"),
  row("due-tie"),
  row("due-early", { publishAt: "2026-10-21T11:00:00.000Z" }),
  row("future", { publishAt: "2026-10-21T14:00:00.000Z" }),
  row("draft", { status: "draft" }),
  row("trashed", { deletedAt: NOW }),
  row("never-scheduled", { publishAt: null }),
  row("saved-after-go-live", { updatedAt: NOW }),
  row("other-workspace", { workspaceId: "ws-other" }),
];

function runContract(name: string, makeRepo: () => PostRepoPort & GoLiveCandidatesPort) {
  test(`listGoLiveCandidates returns exactly the due rows, oldest first, and honours afterIso (${name})`, async () => {
    const repo = makeRepo();
    for (const record of ROWS) await repo.save(record);
    const ids = async (afterIso?: string) =>
      (await repo.listGoLiveCandidates({ workspaceId: WS, nowIso: NOW, ...(afterIso ? { afterIso } : {}) })).map((post) => post.id);
    assert.deepEqual(await ids(), ["due-early", "due", "due-tie", "due-late"]);
    assert.deepEqual(await ids(GO_LIVE), ["due-late"], "afterIso is exclusive");
    assert.deepEqual(await ids(NOW), []);
  });
}

runContract("memory", () => new InMemoryPostRepo());

describeEachDialect("post go-live candidates", { tables: ["posts", "post_revisions"], make: postRepoFor }, (makeRepo) => {
  runContract("sql", makeRepo);
});
