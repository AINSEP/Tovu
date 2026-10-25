/** @file t02: filtering must precede the limit; projection and defaults are public contracts. */
import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError, withBatchInput, type BatchResult, type ToolExecutionContext } from "@jini-ai/core";
import { executeRegisteredTool } from "#src/assistant/__tests__/fixtures/execute-registered-tool";
import { deriveContentReadRegistrations } from "#src/assistant/content-read-tool";
import { POST_LIST_FIELDS } from "../agent-tools.js";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryPostRepo } from "../repo.memory.js";
import { InMemoryPostSearchIndex } from "../search-index.memory.js";
import { removeVia } from "./remove-post-double.js";
import type { PostRecord } from "../post.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


const NOW = "2026-10-01T00:00:00.000Z";
const BODY = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world." }] }],
};

function record(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: "one",
    workspaceId: "ws",
    kind: "page",
    title: "Welcome",
    slug: "welcome",
    status: "published",
    bodyFormat: "doc",
    bodyHtml: null,
    bodyJson: BODY,
    updatedAt: NOW,
    version: 2,
    ...overrides,
  };
}

function fixture({ rows = [record()] }: { rows?: PostRecord[] }, { allow = true }: { allow?: boolean } = {}) {
  const postRepo = new InMemoryPostRepo(rows);
  const reads: string[] = [];
  const listRows = postRepo.list.bind(postRepo);
  const findRow = postRepo.findById.bind(postRepo);
  postRepo.list = async input => { reads.push(`list:${input.workspaceId}`); return listRows(input); };
  postRepo.findById = async input => { reads.push(`get:${input.workspaceId}:${input.id}`); return findRow(input); };
  // `content_post_list` reads only `postRepo`/`authorize`; the rest are real in-memory ports.
  const deps: PostToolDeps = {
    workspaceId: "ws",
    clock: createFakeClock({ startIso: NOW }),
    idGen: { newId: () => "unused-by-list" },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    postRepo,
    postSearch: new InMemoryPostSearchIndex(postRepo),
    pluginBeforeSaveHook: async () => ({}),
    slugChangeCapture: () => undefined,
    removePost: removeVia(postRepo),
    forgetRemovedPost: async () => {},
    authorize: async () => ({ allowed: allow, reason: allow ? "matched" : "insufficient_permission" }),
  };
  const registrations = buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) });
  const registration = registrations.find(
    (r) => r.descriptor.id === "content_post_list",
  );
  assert.ok(registration);
  const card = deriveContentReadRegistrations(registrations).find(tool => tool.descriptor.id === "content_read.content_post");
  assert.ok(card);
  return { registration, card, reads };
}

function context(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec",
    principal: { id: "owner" },
    run: { id: "run" },
    input,
    signal: new AbortController().signal,
  };
}

async function list(input: Record<string, unknown>, rows?: PostRecord[]) {
  return (await fixture({ rows }).registration.handler(context({ kind: "page", ...input }))) as {
    posts: Record<string, unknown>[];
    total: number;
    hasMore: boolean;
  };
}

test("t02: no new params retains the pinned pre-change output and bytes", async () => {
  const expected = {
    posts: [
      {
        id: "one",
        kind: "page",
        title: "Welcome",
        slug: "welcome",
        status: "published",
        updatedAt: NOW,
        version: 2,
        publicUrl: "/welcome",
        adminUrl: "/admin/pages/welcome",
        excerpt: "Hello world.",
        bodyChars: 12,
        // 21e385e7e (post author) added these two to every list row.
        author: null,
        showAuthor: false,
      },
    ],
    total: 1,
    hasMore: false,
  };
  const result = await list({});
  assert.deepEqual(result, expected);
  assert.equal(JSON.stringify(result), JSON.stringify(expected));
});

test("t02: query matches title OR slug case-insensitively, excluding body-only matches", async () => {
  const rows = [
    record({ id: "title", title: "An ALPHA story", slug: "first" }),
    record({ id: "slug", title: "Second", slug: "docs-alpha" }),
    record({
      id: "body",
      title: "Third",
      slug: "third",
      bodyJson: { type: "doc", content: [{ type: "text", text: "alpha" }] },
    }),
  ];
  const result = await list({ query: "aLpHa", fields: ["slug"] }, rows);
  assert.deepEqual(result, {
    posts: [
      { id: "title", slug: "first" },
      { id: "slug", slug: "docs-alpha" },
    ],
    total: 2,
    hasMore: false,
  });
});

test("t02: status filters both drafts and published entries", async () => {
  const rows = [record({ id: "draft", status: "draft" }), record({ id: "live" })];
  assert.deepEqual(await list({ status: "draft", fields: ["status"] }, rows), {
    posts: [{ id: "draft", status: "draft" }],
    total: 1,
    hasMore: false,
  });
  assert.deepEqual(await list({ status: "published", fields: ["status"] }, rows), {
    posts: [{ id: "live", status: "published" }],
    total: 1,
    hasMore: false,
  });
});

test("t02: fields returns exactly the requested keys plus id, even with includeBody", async () => {
  assert.deepEqual(await list({ fields: ["title", "publicUrl"], includeBody: true }), {
    posts: [{ id: "one", title: "Welcome", publicUrl: "/welcome" }],
    total: 1,
    hasMore: false,
  });
  assert.deepEqual(await list({ fields: [] }), { posts: [{ id: "one" }], total: 1, hasMore: false });
  assert.deepEqual(await list({ fields: ["id", "id", "excerpt", "bodyChars"], includeBody: true }), {
    posts: [{ id: "one", excerpt: "Hello world.", bodyChars: 12 }],
    total: 1,
    hasMore: false,
  });
});

test("t02: combined filters run before limit and total/hasMore count only their matches", async () => {
  const rows = [
    record({ id: "irrelevant" }),
    record({ id: "draft", title: "Target", status: "draft" }),
    record({ id: "a", title: "Target A" }),
    record({ id: "b", slug: "target-b" }),
    record({ id: "trashed", title: "Target", deletedAt: NOW }),
    record({ id: "other-kind", kind: "post", title: "Target" }),
    record({ id: "other-workspace", workspaceId: "elsewhere", title: "Target" }),
  ];
  assert.deepEqual(await list({ query: "TARGET", status: "published", limit: 1, fields: [] }, rows), {
    posts: [{ id: "a" }],
    total: 2,
    hasMore: true,
  });
  assert.deepEqual(await list({ query: "TARGET", status: "published", limit: 2, fields: [] }, rows), {
    posts: [{ id: "a" }, { id: "b" }],
    total: 2,
    hasMore: false,
  });
  assert.deepEqual(await list({ query: "missing", fields: [] }, rows), {
    posts: [],
    total: 0,
    hasMore: false,
  });
});

test("t02: filters also work through the post lens", async () => {
  assert.deepEqual(
    await list({ kind: "post", query: "welcome", fields: ["kind"] }, [record({ kind: "post" })]),
    {
      posts: [{ id: "one", kind: "post" }],
      total: 1,
      hasMore: false,
    },
  );
});

test("t02: list publishes the optional query, real status enum and exact projection enum", () => {
  const schema = fixture({}).registration.descriptor.inputSchema as {
    properties: Record<string, Record<string, unknown>>;
    required: string[];
  };
  assert.equal(schema.properties.query?.type, "string");
  assert.deepEqual(schema.properties.status?.enum, ["draft", "published"]);
  assert.deepEqual(schema.properties.fields?.anyOf, [{ type: "array", items: {
    type: "string",
    enum: [
      "id",
      "kind",
      "title",
      "slug",
      "status",
      "updatedAt",
      "version",
      "publicUrl",
      "adminUrl",
      "excerpt",
      "bodyChars",
      "publishAt",
      "featuredMediaId",
      "scheduled",
      // 21e385e7e (post author) made both projectable.
      "author",
      "showAuthor",
    ],
  } }, { type: "string" }]);
  assert.deepEqual(schema.required, []);
  assert.deepEqual(schema.properties.query?.aliases, ["search"]);
});

test("t02: invalid status and projection inputs refuse with ToolInputError", async () => {
  for (const [input, message] of [
    [{ status: "scheduled" }, "'status' must be exactly 'draft' or 'published'"],
    ...[["bodyJson"], [null], ["template"], "title,template", "title,", "", 42].map(fields => [
      { fields },
      `content_post_list: fields must be an array or comma-separated string of supported field names. Supported names: ${POST_LIST_FIELDS.join(", ")}. Example: {"kind":"page","fields":["title","slug"]}.`,
    ] as const),
  ] as const) {
    await assert.rejects(
      list(input),
      (error: unknown) => error instanceof ToolInputError && error.message === message,
    );
  }
});

test("chat-input regression: comma-separated fields project the same rows through the merged read card", async () => {
  const { registration } = fixture({});
  const [card] = deriveContentReadRegistrations([
    registration,
    { ...registration, descriptor: { ...registration.descriptor, id: "content_post_get" } },
  ]);
  assert.ok(card);
  const input = { kind: "page", fields: " title, slug, title " };
  const result = await executeRegisteredTool({ registration: card, input });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.output, { posts: [{ id: "one", title: "Welcome", slug: "welcome" }], total: 1, hasMore: false });
  assert.equal(input.fields, " title, slug, title ");
  assert.deepEqual(await list({ fields: "title" }), await list({ fields: ["title"] }));
});

test("id-only reads derive both public kinds and retain workspace, trash and template isolation", async () => {
  const rows = [
    record({ id: "page" }), record({ id: "post", kind: "post" }),
    record({ id: "trash", deletedAt: NOW }), record({ id: "mail", kind: "email-template" }),
    record({ id: "foreign", workspaceId: "elsewhere" }),
  ];
  const { card, reads } = fixture({ rows });
  for (const id of ["page", "post"]) {
    const result = await executeRegisteredTool({ registration: card, input: { id } });
    assert.equal(result.status, "completed", JSON.stringify(result));
    assert.equal((result.output as { post: { kind: string } }).post.kind, id);
  }
  for (const id of ["trash", "mail", "foreign"]) {
    const result = await executeRegisteredTool({ registration: card, input: { id } });
    assert.notEqual(result.status, "completed");
    assert.match(result.error ?? "", /was not found/);
  }
  assert.deepEqual(reads, ["get:ws:page", "get:ws:post", "get:ws:trash", "get:ws:mail", "get:ws:foreign"]);
});

test("omitted-kind listing filters both public kinds before one global limit in repository order", async () => {
  const { card, reads } = fixture({ rows: [
    record({ id: "irrelevant" }), record({ id: "draft", title: "Target", status: "draft" }),
    record({ id: "post", title: "Target", kind: "post" }), record({ id: "page", title: "Target" }),
    record({ id: "trash", title: "Target", deletedAt: NOW }),
    record({ id: "mail", title: "Target", kind: "email-template" }),
    record({ id: "foreign", title: "Target", workspaceId: "elsewhere" }),
  ] });
  const result = await executeRegisteredTool({ registration: card, input: { query: "TARGET", status: "published", limit: 1, fields: ["kind"] } });
  assert.equal(result.status, "completed", JSON.stringify(result));
  assert.deepEqual(result.output, { posts: [{ id: "post", kind: "post" }], total: 2, hasMore: true });
  assert.deepEqual(reads, ["list:ws"], "the two public kinds share one repository read and one output cap");
});

test("search aliases query through the execution gate and batch items; conflicting spellings never read", async () => {
  const { card, reads } = fixture({ rows: [record({ id: "match", title: "Alpha" }), record({ id: "other" })] });
  const expected = { posts: [{ id: "match" }], total: 1, hasMore: false };
  for (const filter of [{ query: "aLpHa" }, { search: "aLpHa" }]) {
    const result = await executeRegisteredTool({ registration: card, input: { ...filter, fields: [] } });
    assert.equal(result.status, "completed", JSON.stringify(result));
    assert.deepEqual((result.output as typeof expected).posts, expected.posts);
    assert.equal((result.output as typeof expected).total, 1);
  }
  const batch = withBatchInput({ registration: card, tool: { toolId: card.descriptor.id } });
  const result = await executeRegisteredTool({ registration: batch, input: { items: [{ search: "alpha", fields: [] }, { query: "alpha", fields: [] }] } });
  assert.equal(result.status, "completed", JSON.stringify(result));
  const output = result.output as BatchResult;
  assert.deepEqual([output.total, output.succeeded, output.failed], [2, 2, 0]);
  for (const item of output.results) {
    assert.ok(item.ok);
    assert.deepEqual((item.result as typeof expected).posts, expected.posts);
  }
  const before = reads.length;
  const collision = await executeRegisteredTool({ registration: card, input: { query: "alpha", search: "alpha" } });
  assert.equal(collision.status, "failed");
  assert.equal(collision.errorKind, "validation");
  assert.equal(reads.length, before);
});

test("omitted-kind reads still authorize and supplied invalid kinds fail before repository reads", async () => {
  const denied = fixture({}, { allow: false });
  for (const input of [{}, { id: "one" }]) {
    const result = await executeRegisteredTool({ registration: denied.card, input });
    assert.notEqual(result.status, "completed");
    assert.match(result.error ?? "", /not authorized|permission|FORBIDDEN/i);
  }
  assert.deepEqual(denied.reads, []);
  const allowed = fixture({});
  for (const kind of [null, "template", "", 7]) {
    for (const input of [{ kind }, { id: "one", kind }]) {
      const result = await executeRegisteredTool({ registration: allowed.card, input });
      assert.equal(result.status, "failed");
      assert.equal(result.errorKind, "validation");
    }
  }
  assert.deepEqual(allowed.reads, []);
});
