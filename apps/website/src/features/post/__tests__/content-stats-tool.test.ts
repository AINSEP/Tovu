import assert from "node:assert/strict";
import test from "node:test";
import { isReadOnlyTool, ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { InMemoryPostRepo, type PostRecord } from "../index.js";
import { buildContentStatsRegistrations, contentStatsDerivedRisk, type ContentStatsToolDeps } from "../content-stats-tool.js";

const ctx = (input: unknown = {}): ToolExecutionContext => ({ executionId: "e", principal: { id: "owner" }, run: { id: "r" }, input, signal: new AbortController().signal });
const post = (id: string, text: string, overrides: Partial<PostRecord> = {}): PostRecord => ({ id, workspaceId: "ws", title: id, slug: id, kind: "post", status: "draft", bodyFormat: "doc", bodyHtml: null, bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] }, updatedAt: "2026-10-01T00:00:00Z", version: 1, ...overrides });

function harness(denied?: string) {
  const deps: ContentStatsToolDeps = {
    workspaceId: "ws",
    authorize: async ({ permission }) => ({ allowed: permission !== denied, reason: "fixture grant" }),
    postRepo: new InMemoryPostRepo([
      post("short", "one two"), post("long", "one\n two   three four", { status: "published" }), post("empty", ""),
      post("page", "ignored", { kind: "page", status: "published", bodyFormat: "html", bodyHtml: "<style>hidden words</style><p>Page has three</p>" }),
      post("trash", "should be excluded", { deletedAt: "2026-10-01T00:00:00Z" }), post("foreign", "other workspace", { workspaceId: "other" }),
    ]),
    contentTypeRepo: { listByWorkspace: async ({ workspaceId }) => { assert.equal(workspaceId, "ws"); return [{ key: "recipe", status: "active" }, { key: "empty", status: "active" }, { key: "widget", status: "active" }]; } },
    entryRepo: { listByWorkspace: async ({ workspaceId }) => { assert.equal(workspaceId, "ws"); return [{ type: "recipe", status: "draft" }, { type: "recipe", status: "published" }, { type: "widget", status: "published" }]; } },
    mediaRepo: { list: async ({ workspaceId }) => { assert.equal(workspaceId, "ws"); return [{ status: "active", source: { sha256: "image" } }, { status: "active", source: { sha256: "video" } }, { status: "active", source: { sha256: "pdf" } }, { status: "trashed", source: { sha256: "image" } }]; } },
    mediaContentTypeStore: { getMany: async (input) => {
      assert.deepEqual(input, { workspaceId: "ws", sha256s: ["image", "video", "pdf"] });
      return new Map([["image", "image/png"], ["video", "video/mp4"], ["pdf", "application/pdf"]]);
    } },
    assetBlobRepo: { list: async () => { assert.fail("recorded types need no blob lookup"); } },
    blobStore: { get: async () => { assert.fail("recorded types need no byte reads"); } },
  };
  return { deps, tool: buildContentStatsRegistrations(deps)[0]! };
}

test("counts the live workspace inventory and exact words across three posts and an HTML page", async () => {
  const { tool } = harness();
  assert.deepEqual(await tool.handler(ctx()), {
    posts: { total: 3, byStatus: { draft: 2, published: 1 }, words: { total: 6, average: 2, longest: [{ id: "long", title: "long", slug: "long", words: 4 }, { id: "short", title: "short", slug: "short", words: 2 }, { id: "empty", title: "empty", slug: "empty", words: 0 }] } },
    pages: { total: 1, byStatus: { published: 1 }, words: { total: 3, average: 3, longest: [{ id: "page", title: "page", slug: "page", words: 3 }] } },
    entries: [{ contentType: "empty", total: 0, byStatus: {} }, { contentType: "recipe", total: 2, byStatus: { draft: 1, published: 1 } }],
    media: { total: 3, images: 1, videos: 1, other: 1 },
  });
});

test("longest bounds and word-count opt-out change only the requested fields", async () => {
  const { tool } = harness();
  const zero = await tool.handler(ctx({ longest: 0 })) as any;
  assert.deepEqual(zero.posts.words, { total: 6, average: 2, longest: [] });
  const one = await tool.handler(ctx({ longest: 1 })) as any;
  assert.deepEqual(one.posts.words.longest, [{ id: "long", title: "long", slug: "long", words: 4 }]);
  const off = await tool.handler(ctx({ includeWordCounts: false })) as any;
  assert.deepEqual(off.posts, { total: 3, byStatus: { draft: 2, published: 1 } });
  assert.deepEqual(off.pages, { total: 1, byStatus: { published: 1 } });
  for (const longest of [-1, 21, 1.5, null]) await assert.rejects(() => tool.handler(ctx({ longest })), { name: "ToolInputError", message: "content_stats: longest must be an integer from 0 to 20." });
  for (const includeWordCounts of ["false", null]) await assert.rejects(() => tool.handler(ctx({ includeWordCounts })), { message: "content_stats: includeWordCounts must be a boolean." });
});

test("denied optional sections are omitted without reading their repositories", async () => {
  const { deps, tool } = harness("media.read");
  deps.mediaRepo.list = async () => assert.fail("must not read denied media");
  deps.mediaContentTypeStore.getMany = async () => assert.fail("must not read denied media types");
  deps.assetBlobRepo.list = async () => assert.fail("must not read denied blobs");
  deps.blobStore.get = async () => assert.fail("must not read denied bytes");
  const result = await tool.handler(ctx({ includeWordCounts: false })) as any;
  assert.deepEqual(Object.keys(result).sort(), ["entries", "omitted", "pages", "posts"]);
  assert.deepEqual(result.omitted, ["media"]);
  const collections = harness("admin.collections.read");
  collections.deps.entryRepo.listByWorkspace = async () => assert.fail("must not read denied entries");
  assert.deepEqual((await collections.tool.handler(ctx()) as any).omitted, ["entries"]);
});

test("content.read denial refuses the whole call before reads", async () => {
  const { deps, tool } = harness("content.read");
  deps.postRepo.list = async () => assert.fail("must not read denied content");
  await assert.rejects(() => tool.handler(ctx()), { name: "ToolInputError", message: "CONTENT_STATS_FORBIDDEN: principal 'owner' is not authorized for 'content.read' (fixture grant)" });
});

test("stats registration is readOnly with independent none risk", () => {
  const { tool } = harness();
  assert.equal(isReadOnlyTool({ descriptor: tool.descriptor }), true);
  assert.equal(contentStatsDerivedRisk.get("content_stats"), "none");
});

test("empty inventory has zero average, and ties have stable id order", async () => {
  const { deps, tool } = harness();
  deps.postRepo = new InMemoryPostRepo([post("b", "one two"), post("a", "one two")]);
  const result = await tool.handler(ctx()) as any;
  assert.deepEqual(result.pages, { total: 0, byStatus: {}, words: { total: 0, average: 0, longest: [] } });
  assert.deepEqual(result.posts.words.longest.map((row: any) => row.id), ["a", "b"]);
});

test("unrecorded legacy media types are sniffed without writing metadata, once per shared blob", async () => {
  const { deps, tool } = harness();
  deps.mediaRepo.list = async () => [
    { status: "active", source: { sha256: "image" } },
    { status: "active", source: { sha256: "image" } },
  ];
  deps.mediaContentTypeStore.getMany = async (input) => { assert.deepEqual(input, { workspaceId: "ws", sha256s: ["image"] }); return new Map(); };
  deps.assetBlobRepo.list = async (input) => { assert.deepEqual(input, { workspaceId: "ws" }); return [{ sha256: "image", storageKey: "stored-image" }]; };
  let reads = 0;
  deps.blobStore.get = async (input) => { assert.deepEqual(input, { storageKey: "stored-image" }); reads++; return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); };
  assert.deepEqual((await tool.handler(ctx()) as any).media, { total: 2, images: 2, videos: 0, other: 0 });
  assert.equal(reads, 1);
});

test("a missing legacy blob refuses rather than inventing a media classification", async () => {
  const { deps, tool } = harness();
  deps.mediaContentTypeStore.getMany = async () => new Map();
  deps.assetBlobRepo.list = async () => [];
  await assert.rejects(() => tool.handler(ctx()), { name: "ToolInputError", message: "content_stats: media blob 'image' is missing. Inspect the media library before retrying the count." });
});
