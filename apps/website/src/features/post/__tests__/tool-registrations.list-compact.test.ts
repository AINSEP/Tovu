import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryPostRepo } from "../repo.memory.js";
import { DEFAULT_POST_LIST_LIMIT } from "../post.js";
import {
  buildPostRegistrations,
  POST_LIST_MIN_EXCERPT_CHARS,
  POST_LIST_TEXT_BUDGET,
  type PostToolDeps,
} from "../tool-registrations.js";

/**
 * @file `content_post_list` (the listing mode of `content_read.content_post`) used to return every
 * row's full TipTap `bodyJson`. A real "summarize my posts" turn got a 67.7 KB result back, over
 * Claude Code's MCP output cap, so the CLI saved it to a file and the model spent 2+ extra Grep
 * rounds digging text back out of it. Certifies the listing is compact by default (a plain-text
 * `excerpt` plus `bodyChars`, no `bodyJson`), and that `includeBody: true` still returns the old,
 * full shape for a caller that needs it.
 */

const WORKSPACE_ID = "ws-list-compact";
const NOW = "2026-09-28T00:00:00.000Z";

function fakeRouteDeps() {
  const postRepo = new InMemoryPostRepo();
  const deps = {
    workspaceId: WORKSPACE_ID,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `id-${Math.random()}` },
    changeSets: new InMemoryChangeSetRepo(),
    outbox: new InMemoryOutbox(),
    bus: new InMemoryEventBus(),
    postRepo,
    authorize: async () => ({ allowed: true, reason: "matched" }),
  } as unknown as PostToolDeps;
  return { deps, postRepo };
}

function listTool(deps: PostToolDeps): ToolRegistration {
  const found = buildPostRegistrations(deps, { surfaceExchanges: createSurfaceExchangeStore() }).find(
    (r) => r.descriptor.id === "content_post_list",
  );
  assert.ok(found, "expected 'content_post_list' to be wired");
  return found;
}

function call(registration: ToolRegistration, input: unknown) {
  const ctx: ToolExecutionContext = {
    executionId: "exec-1",
    principal: { id: "principal-under-test" },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  };
  return registration.handler(ctx);
}

/** A TipTap doc of `paragraphs` paragraphs, each a heading-ish bold run plus a sentence. */
function richDoc(paragraphs: number) {
  return {
    type: "doc",
    content: Array.from({ length: paragraphs }, (_, i) => ({
      type: "paragraph",
      attrs: { textAlign: "left" },
      content: [
        { type: "text", marks: [{ type: "bold" }], text: `Point ${i}.` },
        { type: "text", text: ` This is sentence number ${i} of a long post body about small releases.` },
      ],
    })),
  };
}

async function seed(postRepo: InMemoryPostRepo, count: number, bodyJson: object): Promise<void> {
  for (let i = 0; i < count; i++) {
    await postRepo.save({
      id: `p${i}`,
      workspaceId: WORKSPACE_ID,
      title: `Post ${i}`,
      slug: `post-${i}`,
      bodyJson,
      status: "published",
      kind: "post",
      updatedAt: NOW,
      version: 1,
    } as never);
  }
}

type Row = Record<string, unknown>;

test("content_post_list returns a plain-text excerpt and bodyChars instead of bodyJson by default", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seed(postRepo, 1, {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", marks: [{ type: "bold" }], text: "Hello" }, { type: "text", text: " world." }] }],
  });

  const result = (await call(listTool(deps), { kind: "post" })) as { posts: Row[] };
  const row = result.posts[0];
  assert.ok(row);
  assert.equal("bodyJson" in row, false, "the default listing must not carry the full TipTap body");
  assert.equal(row.excerpt, "Hello world.");
  assert.equal(row.bodyChars, "Hello world.".length);
  assert.deepEqual(
    Object.keys(row).sort(),
    ["adminUrl", "bodyChars", "excerpt", "id", "kind", "publicUrl", "slug", "status", "title", "updatedAt", "version"],
  );
});

test("content_post_list gives a short listing whole bodies, so summarizing needs no follow-up reads", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seed(postRepo, 6, richDoc(40));

  const result = (await call(listTool(deps), { kind: "post" })) as { posts: Row[] };
  assert.equal(result.posts.length, 6);
  for (const row of result.posts) {
    const excerpt = row.excerpt as string;
    assert.equal(excerpt.length, row.bodyChars, "a 6-row listing fits every body whole");
    assert.equal(excerpt.endsWith("…"), false);
  }
});

test("content_post_list splits its text budget across a long listing and marks each cut", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seed(postRepo, DEFAULT_POST_LIST_LIMIT, richDoc(60));

  const result = (await call(listTool(deps), { kind: "post" })) as { posts: Row[] };
  const perRow = Math.max(POST_LIST_MIN_EXCERPT_CHARS, Math.floor(POST_LIST_TEXT_BUDGET / DEFAULT_POST_LIST_LIMIT));
  for (const row of result.posts) {
    const excerpt = row.excerpt as string;
    assert.ok(excerpt.length <= perRow + 1, `excerpt too long: ${excerpt.length} > ${perRow}`);
    assert.ok(excerpt.endsWith("…"), "a cut excerpt must say it was cut");
    assert.ok(excerpt.startsWith("Point 0. This is sentence number 0"));
    assert.ok((row.bodyChars as number) > perRow, "bodyChars reports the full text length, not the excerpt's");
  }
});

test("content_post_list never cuts an excerpt below POST_LIST_MIN_EXCERPT_CHARS, even at the max limit", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seed(postRepo, 200, richDoc(60));

  const result = (await call(listTool(deps), { kind: "post", limit: 200 })) as { posts: Row[] };
  const excerpt = result.posts[0]?.excerpt as string;
  assert.ok(excerpt.length >= POST_LIST_MIN_EXCERPT_CHARS * 0.8, `excerpt too short: ${excerpt.length}`);
  assert.ok(excerpt.length <= POST_LIST_MIN_EXCERPT_CHARS + 1, `excerpt too long: ${excerpt.length}`);
});

test("content_post_list with includeBody:true still returns every row's full bodyJson (old shape)", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  const doc = richDoc(3);
  await seed(postRepo, 2, doc);

  const result = (await call(listTool(deps), { kind: "post", includeBody: true })) as { posts: Row[] };
  assert.equal(result.posts.length, 2);
  for (const row of result.posts) {
    assert.deepEqual(row.bodyJson, doc);
    assert.equal("excerpt" in row, false);
  }
});

test("content_post_list's default page of rich posts stays well under Claude Code's 25k-token MCP output cap", async () => {
  const { deps, postRepo } = fakeRouteDeps();
  await seed(postRepo, DEFAULT_POST_LIST_LIMIT, richDoc(60));

  const compact = await call(listTool(deps), { kind: "post" });
  const full = await call(listTool(deps), { kind: "post", includeBody: true });
  // The MCP bridge pretty-prints results, so measure that form. ~4 chars per token: 60k chars is
  // ~15k tokens, leaving headroom under the CLI's 25k-token cap.
  const compactChars = JSON.stringify(compact, null, 2).length;
  const fullChars = JSON.stringify(full, null, 2).length;
  assert.ok(compactChars < 60_000, `default listing is ${compactChars} chars`);
  assert.ok(compactChars * 5 < fullChars, `expected the default listing far smaller than the full one (${compactChars} vs ${fullChars})`);
});

test("content_post_list publishes includeBody as an optional boolean in its input schema", () => {
  const { deps } = fakeRouteDeps();
  const schema = listTool(deps).descriptor.inputSchema as { properties: Record<string, { type?: string }>; required?: string[] };
  assert.equal(schema.properties.includeBody?.type, "boolean");
  assert.equal(schema.required?.includes("includeBody") ?? false, false);
});
