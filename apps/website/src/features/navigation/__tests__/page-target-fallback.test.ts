import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryPostRepo } from "#src/features/post/index";
import { createMenuPageTargetResolver } from "../page-target-resolver.js";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";

test("a routing miss uses only a safe last-known URL, scoped to the requested workspace", async () => {
  const resolve = createMenuPageTargetResolver({ postRepo: new InMemoryPostRepo([
    buildPostRecord({ id: "missing", workspaceId: "other", kind: "page", title: "Other page", slug: "other-path", status: "published",
      bodyJson: {}, updatedAt: "2026-10-04", version: 1 }),
  ]) });
  const context = { workspaceId: "ws" };
  const target = { kind: "entryRef" as const, entryId: "missing", entryType: "page", lastKnownHref: "/about" };
  assert.deepEqual(await resolve({ target, context }), { path: "/about", available: true });
  assert.deepEqual(await resolve({ target, context: { workspaceId: "other" } }), { path: "/other-path", available: true });
  for (const lastKnownHref of ["javascript:alert(1)", "//evil.example", "/\\evil.example", "", 42]) {
    assert.equal(await resolve({ target: { ...target, lastKnownHref } as unknown as typeof target, context }), null);
  }
  assert.equal(await resolve({ target: { kind: "entryRef", entryId: "missing" }, context }), null);
});
