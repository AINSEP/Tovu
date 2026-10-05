/** @file t02: filtering must precede the limit; projection and defaults are public contracts. */
import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError, type ToolExecutionContext } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "../../../contracts/core/tool-surface-exchanges.js";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryPostRepo } from "../repo.memory.js";
import { InMemoryPostSearchIndex } from "../search-index.memory.js";
import { removeVia } from "./remove-post-double.js";
import type { PostRecord } from "../post.js";
import { buildPostRegistrations, type PostToolDeps } from "../tool-registrations.js";

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

function fixture(rows: PostRecord[] = [record()]) {
  const postRepo = new InMemoryPostRepo(rows);
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
    authorize: async () => ({ allowed: true, reason: "matched" }),
  };
  const registration = buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() }).find(
    (r) => r.descriptor.id === "content_post_list",
  );
  assert.ok(registration);
  return registration;
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
  return (await fixture(rows).handler(context({ kind: "page", ...input }))) as {
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
  const schema = fixture().descriptor.inputSchema as {
    properties: Record<string, Record<string, unknown>>;
    required: string[];
  };
  assert.equal(schema.properties.query?.type, "string");
  assert.deepEqual(schema.properties.status?.enum, ["draft", "published"]);
  assert.deepEqual(schema.properties.fields?.items, {
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
    ],
  });
  assert.deepEqual(schema.required, ["kind"]);
});

test("t02: invalid status and projection inputs refuse with ToolInputError", async () => {
  for (const [input, message] of [
    [{ status: "scheduled" }, "'status' must be exactly 'draft' or 'published'"],
    [{ fields: "title" }, "content_post_list: fields must be an array of supported field names."],
    [{ fields: ["bodyJson"] }, "content_post_list: fields must be an array of supported field names."],
    [{ fields: [null] }, "content_post_list: fields must be an array of supported field names."],
  ] as const) {
    await assert.rejects(
      list(input),
      (error: unknown) => error instanceof ToolInputError && error.message === message,
    );
  }
});
