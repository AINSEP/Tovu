import { act, render, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/lib/api";
import { createFakePostEditorPort } from "../hooks/post-editor-dependencies.hooks";
import { usePostEditor } from "../hooks/use-post-editor.hooks";
import { postEditorRouteKey } from "../post-editor-route-key";

/**
 * Review 2026-11-02 (r1-tovu #4): every new post's first Save recorded its slug against the one empty
 * route identity, so two new posts shared the panel key "". Navigating A→B then reused A's hook, whose
 * last saved slug was B, so it skipped loading B and kept A on screen under B's URL. The route here is
 * keyed exactly as `panels.tsx` keys `<PostEditor>`: `postEditorRouteKey(segment)`.
 */

type Editor = ReturnType<typeof usePostEditor>;

/** A post store that keeps every created post, addressed by slug or id. */
function multiPostPort() {
  const rows = new Map<string, AdminPost>();
  const base = createFakePostEditorPort();
  let created = 0;
  return {
    ...base,
    async createPost(input: Parameters<typeof base.createPost>[0]) {
      created += 1;
      const slug = input.title.toLowerCase().replace(/\s+/g, "-");
      const post: AdminPost = { ...base.post, ...input, id: `nav-new-${created}`, slug, version: 1 };
      rows.set(post.id, post);
      rows.set(slug, post);
      return { post };
    },
    async getPost(target: string) {
      const post = rows.get(target);
      if (!post) throw new Error(`fake post not found: ${target}`);
      return { post };
    },
  };
}

afterEach(() => localStorage.clear());

describe("PostEditor route key — two newly created posts", () => {
  it("navigating between two new posts shows each post under its own URL", async () => {
    const port = multiPostPort();
    const navigate = vi.fn<(path: string, options?: { replace?: boolean }) => void>();
    const view: { current: Editor | null } = { current: null };
    function Probe({ postId }: { postId: string }) {
      view.current = usePostEditor(postId, { port, navigate, t: (k: string) => k });
      return null;
    }
    const routeTo = (segment: string) => <Probe key={postEditorRouteKey(segment)} postId={segment} />;

    async function createPost(title: string): Promise<void> {
      await waitFor(() => expect(view.current?.post?.title).toBe("Untitled"));
      await waitFor(() => expect(view.current?.editor).not.toBeNull());
      act(() => view.current?.setTitle(title));
      await act(async () => { await view.current?.save(); });
    }

    const { rerender } = render(routeTo(""));
    await createPost("Nav Post A");
    expect(navigate).toHaveBeenLastCalledWith("/posts/nav-post-a", { replace: true });
    rerender(routeTo("nav-post-a"));

    rerender(routeTo(""));
    await createPost("Nav Post B");
    expect(navigate).toHaveBeenLastCalledWith("/posts/nav-post-b", { replace: true });
    rerender(routeTo("nav-post-b"));

    rerender(routeTo("nav-post-a"));
    await waitFor(() => expect(view.current?.post?.id).toBe("nav-new-1"));
    rerender(routeTo("nav-post-b"));
    await waitFor(() => expect(view.current?.post?.id).toBe("nav-new-2"));
    expect(view.current?.title).toBe("Nav Post B");
  });
});
