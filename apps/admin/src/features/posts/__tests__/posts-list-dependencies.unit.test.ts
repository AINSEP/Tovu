import { describe, expect, it } from "vitest";
import type { AdminPost } from "@/lib/api";
import { createFakePostsListPort } from "../hooks/posts-list-dependencies.hooks";

/** A seeded row; the list port has no create (the editor owns creation on first Save). */
function seed(title: string): AdminPost {
  return {
    id: "fake-post-1", workspaceId: "fake-ws", kind: "post", title, slug: title.toLowerCase(), bodyJson: {}, bodyFormat: "doc",
    status: "draft", templateChoice: null, overridesThemePage: false, updatedAt: new Date(0).toISOString(), version: 1,
  };
}

// The hook suite is owned by another worker. Exercise the dependency port's own contracts here.
describe("posts list fake port", () => {
  it("starts empty without seed options and lists seeded rows", async () => {
    await expect(createFakePostsListPort().listPosts()).resolves.toEqual({ posts: [] });
    const post = seed("Hello");
    await expect(createFakePostsListPort({ posts: [post] }).listPosts()).resolves.toEqual({ posts: [{ post }] });
  });

  it.each(["concurrent save", "update", "delete"] as const)("refuses %s for an unknown id without changing other posts", async action => {
    const post = seed("Keep me");
    const port = createFakePostsListPort({ posts: [post] });
    if (action === "concurrent save") {
      expect(() => port.simulateConcurrentSave("missing")).toThrow("fake post not found: missing");
    } else if (action === "update") {
      await expect(port.updatePost({ id: "missing" }, { title: "Lost" })).rejects.toThrow("fake post not found: missing");
    } else {
      await expect(port.deletePost("missing")).rejects.toThrow("fake post not found: missing");
    }
    expect(port.posts).toEqual([post]);
  });

  it("allows an update without a version basis and never persists expectedVersion", async () => {
    const post = seed("Original");
    const port = createFakePostsListPort({ posts: [post] });
    const { post: updated } = await port.updatePost({ id: post.id }, { title: "Updated" });
    expect(updated).toEqual({ ...post, title: "Updated", version: 2 });
    expect(updated).not.toHaveProperty("expectedVersion");
    expect(port.posts).toEqual([updated]);
  });

  it("a concurrent save defaults its title and rejects a stale version without losing that save", async () => {
    const post = seed("Original");
    const port = createFakePostsListPort({ posts: [post] });
    port.simulateConcurrentSave(post.id);
    await expect(port.updatePost({ id: post.id }, { title: "Stale", expectedVersion: 1 })).rejects.toMatchObject({
      status: 409, code: "VERSION_CONFLICT",
      message: `post '${post.id}' was modified by another save (expected version 1, current version 2)`,
    });
    expect(port.posts).toEqual([{ ...post, title: "Saved by someone else", version: 2 }]);
  });
});
