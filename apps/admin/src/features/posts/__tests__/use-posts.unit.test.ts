import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminPost } from "@/lib/api";
import { createFakePostsListPort } from "../hooks/posts-list-dependencies.hooks";
import { usePosts, useWiredPosts } from "../hooks/use-posts.hooks";

/**
 * @file `usePosts` — everything the Posts LIST screen does. No hook-level test file existed for
 * this before (`Posts.tsx` has no unit test today either, per this hook's own file-header comment)
 * — authored fresh alongside the `useWiredX` conversion (`posts-list-port.hooks.ts` /
 * `posts-list-dependencies.hooks.ts`), mirroring `use-pages.unit.test.ts`'s structure exactly since
 * `Posts.tsx`/`Pages.tsx` are twin screens over the same shape of route. The bodies below drive the
 * wired hook (real `fetch`, same harness `use-pages.unit.test.ts`/`Comments.unit.test.tsx`/
 * `use-roles.unit.test.ts` established for this package); the "injected port" describe block at the
 * bottom proves the pure hook is independently testable against `createFakePostsListPort` with no
 * `fetch` stub at all.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const POST: AdminPost = {
  id: "p1",
  workspaceId: "workspace-local",
  kind: "post",
  title: "Hello World",
  slug: "hello-world",
  bodyJson: {},
  status: "published",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderLoaded() {
  fetchMock.mockResolvedValueOnce(jsonResponse({ posts: [{ post: POST }] }));
  const view = renderHook(() => useWiredPosts());
  await waitFor(() => expect(view.result.current.posts).not.toBeNull());
  return view;
}

describe("initial load", () => {
  it("starts with posts=null, then resolves to the unwrapped list", async () => {
    const { result } = await renderLoaded();
    expect(result.current.posts).toEqual([POST]);
    expect(result.current.error).toBeNull();
  });

  it("sets the ApiError's own message on a failed load", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "not allowed" }, 403));
    const { result } = renderHook(() => useWiredPosts());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("not allowed");
    expect(result.current.posts).toBeNull();
  });

  it("falls back to 'failed to load posts' for a non-Error rejection", async () => {
    fetchMock.mockRejectedValueOnce("network exploded");
    const { result } = renderHook(() => useWiredPosts());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("failed to load posts");
  });
});

describe("createPost", () => {
  it("POSTs { title: 'Untitled' } to the posts collection and navigates via the real router", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...POST, id: "p2", title: "Untitled" } }));

    await act(async () => {
      await result.current.createPost();
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain("/workspaces/workspace-local/posts");
    expect((call[1] as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ title: "Untitled" });
  });

  it("sets error and clears creating, without navigating, on failure", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "quota exceeded" }, 403));

    await act(async () => {
      await result.current.createPost();
    });

    expect(result.current.creating).toBe(false);
    expect(result.current.error).toBe("quota exceeded");
  });
});

describe("disablePost", () => {
  it("PATCHes status: draft for the given post id and replaces only the matching row", async () => {
    const OTHER_POST = { ...POST, id: "p-other", title: "Other" };
    fetchMock.mockResolvedValueOnce(jsonResponse({ posts: [{ post: POST }, { post: OTHER_POST }] }));
    const { result } = renderHook(() => useWiredPosts());
    await waitFor(() => expect(result.current.posts).not.toBeNull());

    const updated = { ...POST, status: "draft" as const };
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: updated }));
    await act(async () => {
      await result.current.disablePost(POST);
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain(`/workspaces/workspace-local/posts/${POST.id}`);
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ status: "draft" });
    expect(result.current.posts).toEqual([updated, OTHER_POST]);
  });

  it("clears rowSavingId in the finally branch even when the request fails", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockRejectedValueOnce("offline");

    await act(async () => {
      await result.current.disablePost(POST);
    });

    expect(result.current.rowSavingId).toBeNull();
    expect(result.current.error).toBe("failed to disable post");
  });
});

describe("removePost", () => {
  it("is a no-op with no pendingDelete — no fetch call beyond the initial load", async () => {
    const { result } = await renderLoaded();
    const callsBefore = fetchMock.mock.calls.length;

    await act(async () => {
      await result.current.removePost();
    });

    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("DELETEs the pending post and removes it from local state on success, clearing pendingDelete", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPendingDelete(POST));
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: POST }));

    await act(async () => {
      await result.current.removePost();
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain(`/workspaces/workspace-local/posts/${POST.id}`);
    expect((call[1] as RequestInit).method).toBe("DELETE");
    expect(result.current.posts).toEqual([]);
    expect(result.current.pendingDelete).toBeNull();
  });
});

describe("injected port (useWiredX conversion coverage)", () => {
  it("loads posts through the injected port and navigates on create, without touching fetch", async () => {
    const port = createFakePostsListPort({ posts: [POST] });
    const navigate = vi.fn();
    const { result } = renderHook(() => usePosts({ port, navigate }));
    await waitFor(() => expect(result.current.posts).not.toBeNull());
    expect(result.current.posts).toEqual([POST]);

    await act(async () => {
      await result.current.createPost();
    });

    expect(port.posts).toHaveLength(2);
    expect(navigate).toHaveBeenCalledWith(`/posts/${port.posts[1]!.id}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disablePost patches the post through the injected port", async () => {
    const port = createFakePostsListPort({ posts: [POST] });
    const { result } = renderHook(() => usePosts({ port, navigate: vi.fn() }));
    await waitFor(() => expect(result.current.posts).not.toBeNull());

    await act(async () => {
      await result.current.disablePost(POST);
    });

    expect(port.posts[0]!.status).toBe("draft");
    expect(result.current.posts![0].status).toBe("draft");
  });

  it("removePost deletes the pending post through the injected port", async () => {
    const port = createFakePostsListPort({ posts: [POST] });
    const { result } = renderHook(() => usePosts({ port, navigate: vi.fn() }));
    await waitFor(() => expect(result.current.posts).not.toBeNull());

    act(() => result.current.setPendingDelete(POST));
    await act(async () => {
      await result.current.removePost();
    });

    expect(port.posts).toEqual([]);
    expect(result.current.posts).toEqual([]);
  });

  it("sets the fallback error when the injected port's create call rejects", async () => {
    const port = createFakePostsListPort({ posts: [], createError: new Error("quota exceeded") });
    const { result } = renderHook(() => usePosts({ port, navigate: vi.fn() }));
    await waitFor(() => expect(result.current.posts).not.toBeNull());

    await act(async () => {
      await result.current.createPost();
    });

    expect(result.current.error).toBe("quota exceeded");
    expect(result.current.creating).toBe(false);
  });
});
