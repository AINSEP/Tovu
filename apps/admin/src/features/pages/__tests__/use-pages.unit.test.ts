import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { createFakePagesPort } from "../hooks/pages-dependencies.hooks";
import { usePages, useWiredPages } from "../hooks/use-pages.hooks";
import { PAGES_RESOURCE, pageAdminPath } from "../rules";

/**
 * @file `usePages` — everything the Pages LIST screen does, extracted so it is reachable from
 * `renderHook` with no table, no `RowMenu`, no `ConfirmDialog`. Follows the fetch-mocking harness
 * `PostEditor.unit.test.tsx`/`Comments.unit.test.tsx`/`use-roles.unit.test.ts` established for this
 * package (mock global `fetch`, not the `api` module).
 *
 * Error strings are asserted verbatim — this hook's own doc comment says they moved off `Pages.tsx`
 * unchanged, and a drifted string here is the bug class this migration has already produced twice
 * elsewhere.
 *
 * The bodies above drive the wired hook (real `fetch`) — unchanged from before the `useWiredX`
 * conversion, just a call-site swap. The "injected port" describe block at the bottom is new
 * coverage added alongside that conversion, proving the pure hook is independently testable
 * against `createFakePagesPort` with no `fetch` stub at all.
 *
 * `useWiredPages()` now also calls `useAdminLocale()` internally (this file's own i18n pass —
 * see `use-pages.hooks.ts`'s header), which fires its own `api.getSettingsEffective({ namespace:
 * "core.language" })` call on mount, ahead of `port.listPages()`'s own fetch (hook-call order:
 * `useAdminLocale()` runs first in `useWiredPages()`, so its effect registers, and fires, first).
 * Left as a raw `fetch` call, that call would consume the very `fetchMock.mockResolvedValueOnce(...)`
 * each test below queues for the PAGES request, handing `port.listPages()` the default empty mock
 * instead and breaking every scripted response. `vi.spyOn(api, "getSettingsEffective")` below
 * intercepts it at the `api` layer instead — same fix `use-settings-container.hooks.unit.test.ts`'s
 * `queueLocale()` uses for the identical race — so it never touches `fetchMock`'s queue at all and
 * every existing scripted `fetch` response still lands on the call it was written for.
 */

beforeEach(() => {
  vi.spyOn(api, "getSettingsEffective").mockResolvedValue({ data: [] });
});

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

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderLoaded() {
  fetchMock.mockResolvedValueOnce(jsonResponse({ posts: [{ post: PAGE }] }));
  const view = renderHook(() => useWiredPages());
  await waitFor(() => expect(view.result.current.pages).not.toBeNull());
  return view;
}

describe("initial load", () => {
  it("starts with pages=null, then resolves to the unwrapped list", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useWiredPages());
    expect(result.current.pages).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("unwraps `{ posts: [{ post }] }` into a flat page array", async () => {
    const { result } = await renderLoaded();
    expect(result.current.pages).toEqual([PAGE]);
  });

  it("sets the ApiError's own message on a failed load", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "not allowed" }, 403));
    const { result } = renderHook(() => useWiredPages());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("not allowed");
    expect(result.current.pages).toBeNull();
  });

  it("falls back to 'failed to load pages' for a non-Error rejection", async () => {
    fetchMock.mockRejectedValueOnce("network exploded");
    const { result } = renderHook(() => useWiredPages());
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

describe("togglePagePublish", () => {
  /**
   * Regression for the reported bug (owner screenshots, 2026-09-22): clicking "Disable" in the row
   * menu did nothing but show "title is required". Root cause — this action PATCHed
   * `{ status: "draft", expectedVersion }` alone; `PUT /posts/:id`'s `validateUpdatePostInput`
   * (`apps/website/src/features/post/post.ts`) treats a missing `title`/`slug` as `""` and rejects
   * the request before ever reaching the version check. RED before the fix: this assertion failed
   * because the body was `{ status: "draft", expectedVersion: PAGE.version }` with no
   * `title`/`slug`/`bodyJson` at all.
   */
  it("PATCHes the row's own title/slug/bodyJson alongside status: draft AND expectedVersion, for a published row", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...PAGE, status: "draft" } }));

    await act(async () => {
      await result.current.togglePagePublish(PAGE);
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(String(call[0])).toContain(`/workspaces/workspace-local/posts/${PAGE.id}`);
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      title: PAGE.title,
      slug: PAGE.slug,
      bodyJson: PAGE.bodyJson,
      status: "draft",
      expectedVersion: PAGE.version,
    });
  });

  /** The other direction — a draft row publishing. Owner rename (2026-09-22): the old `disablePage`
   *  only ever flipped published -> draft; a draft page had no way to publish from this list at all
   *  before this change. */
  it("PATCHes status: published for a draft row", async () => {
    const DRAFT = { ...PAGE, status: "draft" as const };
    fetchMock.mockResolvedValueOnce(jsonResponse({ posts: [{ post: DRAFT }] }));
    const { result } = renderHook(() => useWiredPages());
    await waitFor(() => expect(result.current.pages).not.toBeNull());

    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT, status: "published" } }));
    await act(async () => {
      await result.current.togglePagePublish(DRAFT);
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({ status: "published", expectedVersion: DRAFT.version });
  });

  /** Multi-author hardening (2026-09-18, Task 14a) — mirrors `use-posts.unit.test.ts`'s identical
   *  two-author test; Pages shares the exact same route and guard. */
  it("a save by another operator since this list loaded turns togglePagePublish into a 409, not a silent overwrite", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: `post '${PAGE.id}' was modified by another save (expected version ${PAGE.version}, current version ${PAGE.version + 1})`,
          code: "VERSION_CONFLICT",
          details: { expectedVersion: PAGE.version, currentVersion: PAGE.version + 1 },
        },
        409
      )
    );

    await act(async () => {
      await result.current.togglePagePublish(PAGE);
    });

    const call = fetchMock.mock.calls.at(-1)!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({ status: "draft", expectedVersion: PAGE.version });
    expect(result.current.pages).toEqual([PAGE]);
    expect(result.current.error).toMatch(/modified by another save/);
  });

  it("replaces only the matching row in local state with the server's response, on success", async () => {
    const OTHER_PAGE = { ...PAGE, id: "pg-other", title: "Other" };
    fetchMock.mockResolvedValueOnce(jsonResponse({ posts: [{ post: PAGE }, { post: OTHER_PAGE }] }));
    const { result } = renderHook(() => useWiredPages());
    await waitFor(() => expect(result.current.pages).not.toBeNull());

    const updated = { ...PAGE, status: "draft" as const };
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: updated }));
    await act(async () => {
      await result.current.togglePagePublish(PAGE);
    });

    expect(result.current.pages).toEqual([updated, OTHER_PAGE]);
  });

  it("clears rowSavingId in the finally branch even when the request fails, and sets the exact fallback message", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockRejectedValueOnce("offline");

    await act(async () => {
      await result.current.togglePagePublish(PAGE);
    });

    expect(result.current.rowSavingId).toBeNull();
    expect(result.current.error).toBe("failed to unpublish page");
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

/**
 * Sink of the review's H4 finding — mirrors `use-posts.unit.test.ts`'s identical test.
 * `togglePagePublish` and `removePage` share one `rowSavingId` field, and `togglePagePublish`'s
 * `finally` clears it unconditionally, so an unrelated row's publish-toggle settling can wipe a
 * DIFFERENT row's in-flight Delete lock, making its `ConfirmDialog` read as settled while the
 * delete is still on the wire.
 */
describe("rowSavingId — shared between the publish toggle and Delete", () => {
  it("an unrelated publish toggle settling does not unlock a different row's in-flight Delete confirm", async () => {
    const OTHER_PAGE = { ...PAGE, id: "pg-other", title: "Other" };
    const port = createFakePagesPort({ pages: [PAGE, OTHER_PAGE] });
    const { result } = renderHook(() => usePages({ port, navigate: vi.fn(), t: (k) => k, locale: "en" }));
    await waitFor(() => expect(result.current.pages).not.toBeNull());

    let resolveToggle!: (v: { post: typeof PAGE }) => void;
    vi.spyOn(port, "updatePost").mockImplementationOnce(() => new Promise((resolve) => (resolveToggle = resolve)));
    let resolveDelete!: (v: { post: typeof PAGE }) => void;
    vi.spyOn(port, "deletePage").mockImplementationOnce(() => new Promise((resolve) => (resolveDelete = resolve)));

    act(() => {
      void result.current.togglePagePublish(PAGE);
    });
    await waitFor(() => expect(result.current.rowSavingId).toBe(PAGE.id));

    act(() => result.current.setPendingDelete(OTHER_PAGE));
    act(() => {
      void result.current.removePage();
    });
    await waitFor(() => expect(result.current.rowSavingId).toBe(OTHER_PAGE.id));

    await act(async () => {
      resolveToggle({ post: { ...PAGE, status: "draft", version: PAGE.version + 1 } });
      await Promise.resolve();
    });

    // The unrelated toggle settling must not unlock a DIFFERENT row's in-flight Delete confirm.
    expect(result.current.rowSavingId).toBe(OTHER_PAGE.id);

    await act(async () => {
      resolveDelete({ post: OTHER_PAGE });
      await Promise.resolve();
    });
    expect(result.current.rowSavingId).toBeNull();
  });

  /**
   * The reverse order, mirroring `use-posts.unit.test.ts`'s twin: above, the Delete is the LAST to
   * settle, so `removePage`'s own guard is satisfied either way and unguarding it changes nothing.
   * Here the Delete settles FIRST while a publish toggle on a different row is still outstanding —
   * the only case that guard exists for.
   */
  it("a Delete settling first does not unlock a different row's in-flight publish toggle", async () => {
    const OTHER_PAGE = { ...PAGE, id: "pg-other", title: "Other" };
    const port = createFakePagesPort({ pages: [PAGE, OTHER_PAGE] });
    const { result } = renderHook(() => usePages({ port, navigate: vi.fn(), t: (k) => k, locale: "en" }));
    await waitFor(() => expect(result.current.pages).not.toBeNull());

    let resolveDelete!: (v: { post: typeof PAGE }) => void;
    vi.spyOn(port, "deletePage").mockImplementationOnce(() => new Promise((resolve) => (resolveDelete = resolve)));
    let resolveToggle!: (v: { post: typeof PAGE }) => void;
    vi.spyOn(port, "updatePost").mockImplementationOnce(() => new Promise((resolve) => (resolveToggle = resolve)));

    act(() => result.current.setPendingDelete(OTHER_PAGE));
    act(() => {
      void result.current.removePage();
    });
    await waitFor(() => expect(result.current.rowSavingId).toBe(OTHER_PAGE.id));

    act(() => {
      void result.current.togglePagePublish(PAGE);
    });
    await waitFor(() => expect(result.current.rowSavingId).toBe(PAGE.id));

    await act(async () => {
      resolveDelete({ post: OTHER_PAGE });
      await Promise.resolve();
    });

    expect(result.current.rowSavingId).toBe(PAGE.id);

    await act(async () => {
      resolveToggle({ post: { ...PAGE, status: "draft", version: PAGE.version + 1 } });
      await Promise.resolve();
    });
    expect(result.current.rowSavingId).toBeNull();
  });
});

describe("injected port (useWiredX conversion coverage)", () => {
  it("loads pages through the injected port and navigates on create, without touching fetch", async () => {
    vi.stubGlobal("fetch", fetchMock);
    try {
      const port = createFakePagesPort({ pages: [PAGE] });
      const navigate = vi.fn();
      const { result } = renderHook(() => usePages({ port, navigate, t: (k) => k, locale: "en" }));
      await waitFor(() => expect(result.current.pages).not.toBeNull());
      expect(result.current.pages).toEqual([PAGE]);

      await act(async () => {
        await result.current.createPage();
      });

      expect(port.pages).toHaveLength(2);
      // readable-slugs S6a: same slug-vs-id-vs-root-slug rule Pages.tsx's own row navigation
      // already uses for an existing page, not a bare `/pages/${id}` template.
      expect(navigate).toHaveBeenCalledWith(pageAdminPath(port.pages[1]!));
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("togglePagePublish patches the page through the injected port", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    const { result } = renderHook(() => usePages({ port, navigate: vi.fn(), t: (k) => k, locale: "en" }));
    await waitFor(() => expect(result.current.pages).not.toBeNull());

    await act(async () => {
      await result.current.togglePagePublish(PAGE);
    });

    expect(port.pages[0]!.status).toBe("draft");
    expect(result.current.pages![0].status).toBe("draft");
  });

  /** Reached by the fake genuinely being stale (`simulateConcurrentSave`) — mirrors
   *  `use-posts.unit.test.ts`'s identical test. */
  it("togglePagePublish rejects with the SAME basis it loaded once another operator has saved, and never applies the write", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    const { result } = renderHook(() => usePages({ port, navigate: vi.fn(), t: (k) => k, locale: "en" }));
    await waitFor(() => expect(result.current.pages).not.toBeNull());

    port.simulateConcurrentSave(PAGE.id, "Their edit");

    await act(async () => {
      await result.current.togglePagePublish(PAGE);
    });

    expect(result.current.error).toMatch(/modified by another save/);
    expect(port.pages[0]!.title).toBe("Their edit");
    expect(port.pages[0]!.status).not.toBe("draft");
  });

  it("removePage deletes the pending page through the injected port", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    const { result } = renderHook(() => usePages({ port, navigate: vi.fn(), t: (k) => k, locale: "en" }));
    await waitFor(() => expect(result.current.pages).not.toBeNull());

    act(() => result.current.setPendingDelete(PAGE));
    await act(async () => {
      await result.current.removePage();
    });

    expect(port.pages).toEqual([]);
    expect(result.current.pages).toEqual([]);
  });

  it("sets the fallback error when the injected port's create call rejects", async () => {
    const port = createFakePagesPort({ pages: [], createError: new Error("quota exceeded") });
    const { result } = renderHook(() => usePages({ port, navigate: vi.fn(), t: (k) => k, locale: "en" }));
    await waitFor(() => expect(result.current.pages).not.toBeNull());

    await act(async () => {
      await result.current.createPage();
    });

    expect(result.current.error).toBe("quota exceeded");
    expect(result.current.creating).toBe(false);
  });
});

/**
 * Regression coverage, this screen's own copy of `use-posts.unit.test.ts`'s "content refresh bus"
 * suite (Posts/Pages are twin screens — see that file's header for the reported bug this fixes).
 * `pages_write_html` (`apps/website/src/features/pages/agent-tools.ts`) is the agent tool that used
 * to leave this list stale.
 *
 * Driven through the REAL `lib/content-refresh-bus`, same choice `use-taxonomy.hooks.ts`'s own suite
 * makes and for the same reason: the thing that was broken is the wiring between this hook and the
 * bus, not either module's internals.
 */
describe("usePages — content refresh bus", () => {
  const NEW_PAGE = { ...PAGE, id: "pg2", title: "About", slug: "about" };

  afterEach(() => resetContentRefreshBus());

  it("re-reads the list when a content refresh fires, so an assistant-written page appears without a reload", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    const { result } = renderHook(() => usePages({ port, navigate: vi.fn(), t: (k) => k, locale: "en" }));
    await waitFor(() => expect(result.current.pages).toEqual([PAGE]));

    // The assistant's tool call landing server-side. The screen has no way to know it happened.
    port.pages.push(NEW_PAGE);
    expect(result.current.pages).toEqual([PAGE]);

    act(() => publishContentRefresh());

    await waitFor(() => expect(result.current.pages).toEqual([PAGE, NEW_PAGE]));
  });

  it("refreshes on a notification that names pages, and ignores one that names only other resources", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    const { result } = renderHook(() => usePages({ port, navigate: vi.fn(), t: (k) => k, locale: "en" }));
    await waitFor(() => expect(result.current.pages).toEqual([PAGE]));

    port.pages.push(NEW_PAGE);

    // A narrowed notification about somebody else's resource must not cost this screen a refetch.
    act(() => publishContentRefresh(["taxonomy"]));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.pages).toEqual([PAGE]);

    act(() => publishContentRefresh([PAGES_RESOURCE]));
    await waitFor(() => expect(result.current.pages).toEqual([PAGE, NEW_PAGE]));
  });

  it("does not let a slower, earlier-triggered refresh overwrite a newer one that already settled (out-of-order response race)", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    const { result } = renderHook(() => usePages({ port, navigate: vi.fn(), t: (k) => k, locale: "en" }));
    await waitFor(() => expect(result.current.pages).toEqual([PAGE]));

    // Two assistant writes land back to back, each publishing its own content-refresh
    // notification — two overlapping `listPages()` calls with no ordering guarantee on responses.
    let resolveFirst!: (v: { posts: { post: typeof PAGE }[] }) => void;
    let resolveSecond!: (v: { posts: { post: typeof PAGE }[] }) => void;
    vi.spyOn(port, "listPages")
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSecond = resolve)));

    act(() => {
      publishContentRefresh();
      publishContentRefresh();
    });

    // The SECOND (more recent) request settles first, with the newer list.
    await act(async () => {
      resolveSecond({ posts: [{ post: PAGE }, { post: NEW_PAGE }] });
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.pages).toEqual([PAGE, NEW_PAGE]));

    // The FIRST (now-stale) request finally settles. It must not resurrect the older list.
    await act(async () => {
      resolveFirst({ posts: [{ post: PAGE }] });
      await Promise.resolve();
    });

    expect(result.current.pages).toEqual([PAGE, NEW_PAGE]);
  });

  it("stops re-reading once unmounted", async () => {
    const port = createFakePagesPort({ pages: [PAGE] });
    const listSpy = vi.spyOn(port, "listPages");
    const { result, unmount } = renderHook(() => usePages({ port, navigate: vi.fn(), t: (k) => k, locale: "en" }));
    await waitFor(() => expect(result.current.pages).toEqual([PAGE]));

    const callsWhileMounted = listSpy.mock.calls.length;
    unmount();
    act(() => publishContentRefresh());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(listSpy).toHaveBeenCalledTimes(callsWhileMounted);
  });
});
