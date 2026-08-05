import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePages } from "../hooks/use-pages.hooks";

/**
 * @file `usePages` — everything the Pages LIST screen does, extracted so it is reachable from
 * `renderHook` with no table, no `RowMenu`, no `ConfirmDialog`. Follows the fetch-mocking harness
 * `PostEditor.unit.test.tsx`/`Comments.unit.test.tsx`/`use-roles.unit.test.ts` established for this
 * package (mock global `fetch`, not the `api` module).
 *
 * Error strings are asserted verbatim — this hook's own doc comment says they moved off `Pages.tsx`
 * unchanged, and a drifted string here is the bug class this migration has already produced twice
 * elsewhere.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const PAGE: {
  id: string;
  workspaceId: string;
  kind: "page";
  title: string;
  slug: string;
  bodyJson: Record<string, unknown>;
  status: "draft" | "published";
  updatedAt: string;
  version: number;
} = {
  id: "pg1",
  workspaceId: "workspace-local",
  kind: "page",
  title: "About",
  slug: "about",
  bodyJson: {},
  status: "published",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderLoaded() {
  fetchMock.mockResolvedValueOnce(jsonResponse({ posts: [{ post: PAGE }] }));
  const view = renderHook(() => usePages());
  await waitFor(() => expect(view.result.current.pages).not.toBeNull());
  return view;
}

describe("initial load", () => {
  it("starts with pages=null, then resolves to the unwrapped list", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves
    const { result } = renderHook(() => usePages());
    expect(result.current.pages).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("unwraps `{ posts: [{ post }] }` into a flat page array", async () => {
    const { result } = await renderLoaded();
    expect(result.current.pages).toEqual([PAGE]);
  });

  it("sets the ApiError's own message on a failed load", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "not allowed" }, 403));
    const { result } = renderHook(() => usePages());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("not allowed");
    expect(result.current.pages).toBeNull();
  });

  it("falls back to 'failed to load pages' for a non-Error rejection", async () => {
    fetchMock.mockRejectedValueOnce("network exploded");
    const { result } = renderHook(() => usePages());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("failed to load pages");
  });
});

describe("createPage", () => {
  it("sets creating=true immediately, and — unlike the failure path — never resets it on success (the screen navigates away instead)", async () => {
    const { result } = await renderLoaded();
    let resolveCreate: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveCreate = resolve)));

    let createPromise!: Promise<void>;
    act(() => {
      createPromise = result.current.createPage();
    });
    expect(result.current.creating).toBe(true);

    await act(async () => {
      resolveCreate?.(jsonResponse({ post: { ...PAGE, id: "pg2", title: "Untitled" } }));
      await createPromise;
    });
    // No `setCreating(false)` on the success path in the source — only the catch branch resets it.
    // A real screen never observes this because `navigate()` unmounts it first; pinned here so a
    // future "cleanup" that adds a success-path reset is a deliberate, tested change, not a
    // guess.
    expect(result.current.creating).toBe(true);
  });

  it("POSTs { title: 'Untitled' } to the pages collection", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...PAGE, id: "pg2", title: "Untitled" } }));

    await act(async () => {
      await result.current.createPage();
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain("/workspaces/workspace-local/pages");
    expect((call[1] as RequestInit).method).toBe("POST");
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ title: "Untitled" });
  });

  it("sets error and clears creating, without navigating, on failure", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "quota exceeded" }, 403));

    await act(async () => {
      await result.current.createPage();
    });

    expect(result.current.creating).toBe(false);
    expect(result.current.error).toBe("quota exceeded");
  });

  it("falls back to 'failed to create page' for a non-Error rejection", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockRejectedValueOnce("boom");

    await act(async () => {
      await result.current.createPage();
    });

    expect(result.current.error).toBe("failed to create page");
  });
});

describe("disablePage", () => {
  it("PATCHes status: draft for the given page id", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...PAGE, status: "draft" } }));

    await act(async () => {
      await result.current.disablePage(PAGE);
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain(`/workspaces/workspace-local/posts/${PAGE.id}`);
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({ status: "draft" });
  });

  it("replaces only the matching row in local state with the server's response, on success", async () => {
    const OTHER_PAGE = { ...PAGE, id: "pg-other", title: "Other" };
    fetchMock.mockResolvedValueOnce(jsonResponse({ posts: [{ post: PAGE }, { post: OTHER_PAGE }] }));
    const { result } = renderHook(() => usePages());
    await waitFor(() => expect(result.current.pages).not.toBeNull());

    const updated = { ...PAGE, status: "draft" as const };
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: updated }));
    await act(async () => {
      await result.current.disablePage(PAGE);
    });

    expect(result.current.pages).toEqual([updated, OTHER_PAGE]);
  });

  it("clears rowSavingId in the finally branch even when the request fails, and sets the exact fallback message", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockRejectedValueOnce("offline");

    await act(async () => {
      await result.current.disablePage(PAGE);
    });

    expect(result.current.rowSavingId).toBeNull();
    expect(result.current.error).toBe("failed to disable page");
  });
});

describe("removePage", () => {
  it("is a no-op with no pendingDelete — no fetch call beyond the initial load", async () => {
    const { result } = await renderLoaded();
    const callsBefore = fetchMock.mock.calls.length;

    await act(async () => {
      await result.current.removePage();
    });

    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("DELETEs the pending page and removes it from local state on success, clearing pendingDelete", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPendingDelete(PAGE));
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: PAGE }));

    await act(async () => {
      await result.current.removePage();
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain(`/workspaces/workspace-local/pages/${PAGE.id}`);
    expect((call[1] as RequestInit).method).toBe("DELETE");
    expect(result.current.pages).toEqual([]);
    expect(result.current.pendingDelete).toBeNull();
    expect(result.current.rowSavingId).toBeNull();
  });

  it("clears pendingDelete and rowSavingId EVEN ON FAILURE, and sets the exact fallback message — the dialog must not get stuck open", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setPendingDelete(PAGE));
    fetchMock.mockRejectedValueOnce("server down");

    await act(async () => {
      await result.current.removePage();
    });

    expect(result.current.pendingDelete).toBeNull();
    expect(result.current.rowSavingId).toBeNull();
    expect(result.current.error).toBe("failed to delete page");
    // The row must still be present — a failed delete does not optimistically drop it.
    expect(result.current.pages).toEqual([PAGE]);
  });
});
