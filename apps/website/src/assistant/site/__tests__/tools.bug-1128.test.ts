import assert from "node:assert/strict";
import { it } from "node:test";
import { anonymousMemberAccess } from "./member-access.fixture.js";
import { createSiteAssistantTools, type SiteAssistantToolDeps } from "../tools.js";
import { listPublishedPosts } from "#src/features/post/index";

it("BUG T-B08: the published entry text counts node separators in its 4000-character cap", async () => {
  const first = "a".repeat(3997);
  const row = { id: "post-a", workspaceId: "ws", title: "Post", slug: "post", status: "published",
    kind: "post", updatedAt: "2026-01-01", version: 1, deletedAt: null, bodyFormat: "doc",
    bodyJson: { type: "doc", content: [first, "bbbb"].map(text => ({
      type: "paragraph", content: [{ type: "text", text }],
    })) },
  };
  const postRepo = { list: async (input: { workspaceId: string }) => {
    assert.deepEqual(input, { workspaceId: "ws" });
    return [row];
  } } as unknown as SiteAssistantToolDeps['postRepo'];
  const tools = createSiteAssistantTools({ workspaceId: "ws", postRepo, listPublishedPosts, memberAccess: anonymousMemberAccess() });

  const result = await tools.get_published_entry({ slug: "post" });

  assert.ok("text" in result);
  assert.equal(result.text, `${first} bb`);
});
