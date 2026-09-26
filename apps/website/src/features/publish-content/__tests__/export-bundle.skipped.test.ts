import assert from "node:assert/strict";
import test from "node:test";

import { collectSkippedEntities } from "../export-bundle.js";
import type { PublishContentHandler } from "../type-registry.js";

/**
 * @file `publish-files-plan-2026-09-24.md`'s follow-up ("Publish Content silently drops a whole theme
 * from the publish table"): a handler's `listSkipped()` — every whole unit it refused to pack, e.g.
 * a theme tree blocked by `file-tree-policy.ts` for a disallowed file type — must reach the export
 * side so a caller (the push route) can surface it to an operator, not silently vanish.
 *
 * Takes an already-resolved `handlers` list rather than a `PublishContentDeps` bag, mirroring
 * `planner.ts`'s `attachReferencedBy(rows, handlerByType)` — a directly testable unit with no need to
 * stand up the real registered contributor graph.
 */

function fakeHandler(over: Partial<PublishContentHandler> & { entityType: string; permission: string }): PublishContentHandler {
  return {
    schemaVersion: 1,
    dependsOn: [],
    async *pack() {},
    async inspect() {
      return null;
    },
    async precheck() {
      return null;
    },
    async apply() {
      return { changeSetId: "cs1" };
    },
    ...over,
  };
}

test("collectSkippedEntities gathers every authorized handler's listSkipped output", async () => {
  const themeFiles = fakeHandler({
    entityType: "theme-files",
    permission: "theme.set",
    async listSkipped() {
      return [
        {
          entityType: "theme-files",
          id: "static/kuinetic-showcase",
          label: "static/kuinetic-showcase",
          reason: "Theme: static/kuinetic-showcase was not published: \"video.mp4\" has a file type ('mp4') that is not allowed for this tree",
        },
      ];
    },
  });
  const post = fakeHandler({ entityType: "post", permission: "content.write" });

  const skipped = await collectSkippedEntities({
    handlers: [themeFiles, post],
    authorize: async () => ({ allowed: true }),
    workspaceId: "ws1",
    principalId: "p1",
  });
  assert.deepEqual(skipped, [
    {
      entityType: "theme-files",
      id: "static/kuinetic-showcase",
      label: "static/kuinetic-showcase",
      reason: "Theme: static/kuinetic-showcase was not published: \"video.mp4\" has a file type ('mp4') that is not allowed for this tree",
    },
  ]);
});

test("collectSkippedEntities omits a handler this principal is not authorized for", async () => {
  const themeFiles = fakeHandler({
    entityType: "theme-files",
    permission: "theme.set",
    async listSkipped() {
      return [{ entityType: "theme-files", id: "static/x", label: "static/x", reason: "blocked" }];
    },
  });
  const skipped = await collectSkippedEntities({
    handlers: [themeFiles],
    authorize: async () => ({ allowed: false }),
    workspaceId: "ws1",
    principalId: "p1",
  });
  assert.deepEqual(skipped, []);
});

test("collectSkippedEntities skips a handler with no listSkipped at all", async () => {
  const post = fakeHandler({ entityType: "post", permission: "content.write" });
  const skipped = await collectSkippedEntities({
    handlers: [post],
    authorize: async () => ({ allowed: true }),
    workspaceId: "ws1",
    principalId: "p1",
  });
  assert.deepEqual(skipped, []);
});
