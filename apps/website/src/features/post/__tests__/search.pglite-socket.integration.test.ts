import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import type { ClockPort, JsonObject, UUID } from "@jini-ai/cms/core";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { startPgliteOwner, type PgliteOwner } from "#src/platform/db/kernel/drivers/pglite-owner";
import { openPgliteSocketKernel } from "#src/platform/db/kernel/drivers/pglite-socket";
import { migrateContentDatabase } from "#src/platform/db/migrations/index";
import { createPost } from "../post.js";
import { postRepoFor } from "../repo.js";
import { searchAdminPosts } from "../search.js";
import { PostSearchIndex } from "../search-index.js";
import { EVAL_POSTS, EVAL_QUERIES, evalGateFailures } from "./search.eval.js";

/**
 * @file The post-search eval set (`search.eval.ts`) on the PGlite SOCKET leg (R1f part 2): the way a
 * PGlite site's API process and agent daemon both query — a PGlite owner serving its data dir on a
 * Unix socket, the kernel a node-postgres client of it (transport `"pglite-socket"`), schema from
 * the content migration history. Same gate as the in-process PGlite leg (`search.dialects.test.ts`).
 */

const WS = "ws-search-eval-socket" as UUID;
const clock: ClockPort = { nowIso: () => "2026-09-28T00:00:00.000Z" };

let dataParent: string;
let socketDir: string;
let owner: PgliteOwner;
let kernel: ContentKernel;
const results = new Map<string, string[]>();

function body(text: string): JsonObject {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] } as unknown as JsonObject;
}

before(async () => {
  dataParent = fs.mkdtempSync(path.join(os.tmpdir(), "r1f2-search-socket-"));
  socketDir = fs.mkdtempSync("/tmp/r1f2s-");
  owner = await startPgliteOwner({ dataDir: path.join(dataParent, "pglite") }, { socketDir });
  const base = openPgliteSocketKernel<unknown>({ socketPath: owner.socketPath });
  kernel = base as ContentKernel;
  await migrateContentDatabase(base);
  const repo = postRepoFor(kernel);
  for (const post of EVAL_POSTS) {
    await createPost({
      deps: { repo, clock },
      input: { workspaceId: WS, id: post.id as UUID, title: post.title, kind: "post", bodyJson: body(post.text), status: "published" },
    });
  }
  for (const q of EVAL_QUERIES) {
    const { hits } = await searchAdminPosts({ deps: { search: new PostSearchIndex(kernel) }, input: { workspaceId: WS, query: q.query, limit: 10 } });
    results.set(q.id, hits.map((hit) => hit.id));
  }
});

after(async () => {
  await kernel?.close();
  await owner?.close();
  fs.rmSync(dataParent, { recursive: true, force: true });
  fs.rmSync(socketDir, { recursive: true, force: true });
});

test("the socket kernel reports its transport as pglite-socket", () => {
  assert.equal(kernel.transport, "pglite-socket");
  assert.equal(kernel.dialect, "postgres");
});

test("PGlite over the owner's socket passes the post-search gate on every query", (t) => {
  assert.deepEqual(evalGateFailures(results, (line) => t.diagnostic(line)), []);
});
