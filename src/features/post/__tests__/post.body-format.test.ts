import assert from "node:assert/strict";
import test from "node:test";

import type { OutboxPort } from "@jini-ai/cms/core";
import { createPost, updatePost, type CreatePostInput, type UpdatePostInput } from "../post.js";
import { InMemoryPostRepo } from "../repo.memory.js";

/**
 * @file SPEC-047/ADR-056 Decision 3 / CIC-3 — the `kind` -> `bodyFormat` write-chokepoint gate in
 * `resolveCreateFields`/`createPost`/`updatePost`.
 *
 * AC-1: "a Post can never carry body_format: 'html'" is a security/data-integrity property (the
 * whole reason D-1/D-2 exist — Tiptap must never be offered HTML-shaped content), not a validation
 * nicety a caller could work around by supplying the field directly. `createPost`/`updatePost` are
 * the general Post/Page CRUD chokepoint every admin route and the `content_post_*` tools go through;
 * REQ-5's Pages-vibecoding write path (`PagesHtmlDocumentStore`, `features/pages/html-document-store.sqlite.ts`)
 * is a SEPARATE, narrower adapter that never calls through here at all — so this chokepoint's job in
 * v1 is exactly "this path can never be tricked into producing an html-format row," proven below by
 * smuggling a `bodyFormat`/`bodyHtml` past `CreatePostInput`/`UpdatePostInput`'s own type (a
 * same-shape stand-in for an untyped/JS caller, or a caller trusting client input) and asserting the
 * chokepoint still writes `bodyFormat: "doc"`.
 */

const clock = { nowIso: () => "2026-08-04T00:00:00.000Z" };

const noopOutbox: OutboxPort = {
  enqueue: async () => {},
  claimPending: async () => [],
  markDelivered: async () => {},
  markFailed: async () => {},
};

test("createPost: a new post always carries bodyFormat 'doc' and bodyHtml null, with no caller input accepted for either", async () => {
  const repo = new InMemoryPostRepo([]);

  const { post } = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "ws-1", id: "post-1", title: "Hello", kind: "post" },
  });

  assert.equal(post.bodyFormat, "doc");
  assert.equal(post.bodyHtml ?? null, null);
});

test("createPost: a Post can never carry body_format 'html', even if a caller-supplied input smuggles it in", async () => {
  const repo = new InMemoryPostRepo([]);

  // `as unknown as CreatePostInput` stands in for an untyped caller (a raw JS route handler, or one
  // trusting `req.body` past the type system) — the property below is not part of `CreatePostInput`
  // on purpose, so this only compiles via the cast, exactly the smuggling path AC-1 must defeat.
  const smuggledInput = {
    workspaceId: "ws-1",
    id: "post-1",
    title: "Hello",
    kind: "post",
    bodyFormat: "html",
    bodyHtml: "<p>not tiptap</p>",
  } as unknown as CreatePostInput;

  const { post } = await createPost({ deps: { repo, clock }, input: smuggledInput });

  assert.equal(post.bodyFormat, "doc", "the chokepoint must derive bodyFormat from kind, never trust a caller-supplied value");
  assert.equal(post.bodyHtml ?? null, null, "bodyHtml must never be populated on a kind:'post' write");

  const saved = await repo.findById({ workspaceId: "ws-1", id: "post-1" });
  assert.ok(saved);
  assert.equal(saved!.bodyFormat, "doc", "the persisted row must match, not just the in-memory return value");
});

test("createPost: a kind:'page' input also gets bodyFormat 'doc' in v1 through this chokepoint — html Pages are written only through PagesHtmlDocumentStore, never here", async () => {
  const repo = new InMemoryPostRepo([]);

  const { post } = await createPost({
    deps: { repo, clock },
    input: { workspaceId: "ws-1", id: "page-1", title: "About", kind: "page" },
  });

  assert.equal(post.bodyFormat, "doc");
  assert.equal(post.bodyHtml ?? null, null);
});

test("updatePost: an existing row's bodyFormat stays 'doc' after an update, even if a caller-supplied input smuggles bodyFormat:'html'", async () => {
  const repo = new InMemoryPostRepo([
    {
      id: "post-1",
      workspaceId: "ws-1",
      title: "Hello",
      slug: "hello",
      bodyJson: { type: "doc", content: [] },
      bodyFormat: "doc",
      bodyHtml: null,
      status: "draft",
      kind: "post",
      updatedAt: "2026-08-03T00:00:00.000Z",
      version: 1,
    },
  ]);

  const smuggledInput = {
    workspaceId: "ws-1",
    id: "post-1",
    title: "Hello Updated",
    slug: "hello",
    bodyJson: { type: "doc", content: [] },
    status: "draft",
    bodyFormat: "html",
    bodyHtml: "<p>not tiptap</p>",
  } as unknown as UpdatePostInput;

  const { post } = await updatePost({ deps: { repo, clock, outbox: noopOutbox }, input: smuggledInput });

  assert.equal(post.bodyFormat, "doc");
  assert.equal(post.bodyHtml ?? null, null);

  const saved = await repo.findById({ workspaceId: "ws-1", id: "post-1" });
  assert.equal(saved!.bodyFormat, "doc");
});
