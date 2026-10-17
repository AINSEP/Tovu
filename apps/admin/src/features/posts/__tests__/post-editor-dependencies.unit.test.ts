import { describe, expect, it } from "vitest";

import { createFakePostEditorPort, defaultPostEditorPort } from "../hooks/post-editor-dependencies.hooks";

// The hook suite is being edited by another worker. These are the port's own contracts,
// including its id guards, which the hook cannot reach with its loaded post's id.
describe("post editor dependencies", () => {
  it("builds real template preview URLs with encoded ids and the three template choices", () => {
    const base = "/api/admin/v1/workspaces/workspace-local/posts/post%2Fone/template-preview";
    for (const [choice, suffix] of [[null, ""], ["", "?templateChoice="], ["long form.html", "?templateChoice=long%20form.html"]] as const) {
      const url = new URL(defaultPostEditorPort.templatePreviewUrl("post/one", choice), window.location.origin);
      expect(url.pathname + url.search).toBe(base + suffix);
    }
  });

  it("replaces the fake's current row so subsequent reads and saves use the replacement", async () => {
    const port = createFakePostEditorPort();
    const replacement = { ...port.post, id: "replacement", title: "Replacement", version: 7 };
    port.post = replacement;
    await expect(port.getPost(replacement.id)).resolves.toEqual({ post: replacement });
    const saved = await port.updatePost({ id: replacement.id }, { title: "Updated", expectedVersion: 7 });
    expect(saved.post).toEqual({ ...replacement, title: "Updated", version: 8 });
    expect(port.post).toEqual(saved.post);
  });

  it.each(["update", "delete", "autosave"] as const)("refuses %s for a different id without changing the row or parking a draft", async operation => {
    const port = createFakePostEditorPort();
    const original = { ...port.post };
    const action = operation === "update"
      ? () => port.updatePost({ id: "missing" }, { title: "Must not persist" })
      : operation === "delete"
        ? () => port.deletePost("missing")
        : () => port.putAutosave("missing", { baseVersion: original.version, title: "Unsaved", slug: "unsaved",
          bodyFormat: "doc", bodyJson: { type: "doc", content: [] } });
    await expect(action()).rejects.toThrow("fake post not found: missing");
    expect(port.post).toEqual(original);
    expect(port.putAutosaveCalls).toEqual([]);
    await expect(port.getAutosave(original.id)).resolves.toEqual({ autosave: null });
  });

  it("derives a slug from the stored title when the patch requests a slug without replacing the title", async () => {
    const port = createFakePostEditorPort();
    port.post = { ...port.post, title: "A New Title", slug: "old-slug" };
    await port.updatePost({ id: port.post.id }, { slugFromTitle: true });
    expect(port.post.title).toBe("A New Title");
    expect(port.post.slug).toBe("a-new-title");
    expect(port.post).not.toHaveProperty("slugFromTitle");
  });
});
