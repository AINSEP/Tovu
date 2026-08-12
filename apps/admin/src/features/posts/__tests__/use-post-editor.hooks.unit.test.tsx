import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminPost } from "../../../lib/api";
import { createFakePostEditorPort } from "../hooks/post-editor-dependencies.hooks";
import { usePostEditor, useWiredPostEditor } from "../hooks/use-post-editor.hooks";

/**
 * @file `usePostEditor` — first coverage for this hook (none existed before the `useWiredX`
 * conversion this file lands alongside; see `use-post-editor.hooks.ts`'s own file header).
 *
 * Drives {@link usePostEditor} directly with `createFakePostEditorPort` throughout — unlike
 * `use-redirects.hooks.unit.test.tsx`'s split (a `fetch`-stubbed `useWiredRedirects` group plus a
 * smaller injected-port group), this hook has no `lib/fetch-query` wiring to also exercise, so there
 * is nothing a `fetch` stub would additionally cover that the injected port doesn't already reach.
 * One small `useWiredPostEditor` smoke test at the end confirms the wiring itself (real port, real
 * `navigate`) composes without throwing.
 *
 * The hook mounts a REAL TipTap editor (`useEditor`, not injected — editor/local-state
 * infrastructure per this conversion's own port file header, not a host service) — every test that
 * needs `result.current.editor` non-null waits for it, same as `PostEditor.unit.test.tsx` already
 * does for the full component.
 */

const POST: AdminPost = {
  id: "p1",
  workspaceId: "ws1",
  kind: "post",
  title: "Hello World",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }] },
  bodyFormat: "doc",
  status: "draft",
  templateChoice: null,
  overridesThemePage: false,
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 3,
};

const PAGE: AdminPost = { ...POST, id: "pg1", kind: "page", slug: "about-page" };

function fakeNavigate() {
  return vi.fn<(path: string) => void>();
}

/** Injected `t` for every test below except the dedicated "t is genuinely injected" group further
 *  down — identity function, matching `wired-hooks-convention.md`'s own `t: (k) => k` example so
 *  every other assertion in this file stays independent of `PostEditor`'s actual copy. */
const fakeT = (key: string): string => key;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("usePostEditor — load", () => {
  it("populates post/title/slug/status and the theme fields from the injected port", async () => {
    const port = createFakePostEditorPort({
      post: POST,
      presentation: {
        settings: { activeThemeId: "basic" },
        availableThemes: [{ id: "basic", tier: "static" }],
        activeThemeTemplates: ["blog-post.html"],
        activeThemeStaticPageIds: ["pricing"],
      },
    });
    const navigate = fakeNavigate();

    const { result } = renderHook(() => usePostEditor("p1", { port, navigate, t: fakeT }));

    await waitFor(() => expect(result.current.post).toEqual(POST));
    expect(result.current.title).toBe("Hello World");
    expect(result.current.slug).toBe("hello-world");
    expect(result.current.status).toBe("draft");
    expect(result.current.activeThemeId).toBe("basic");
    expect(result.current.activeThemeTier).toBe("static");
    expect(result.current.availableTemplates).toEqual(["blog-post.html"]);
    // "hello-world" is not in the theme's own static page ids ("pricing") — no collision.
    expect(result.current.hasSlugCollision).toBe(false);
  });

  it("defaults templateChoice to the theme's first template when the post has never had one set", async () => {
    const port = createFakePostEditorPort({
      post: { ...POST, templateChoice: null },
      presentation: { activeThemeTemplates: ["blog-post.html", "page-shell.html"] },
    });

    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));

    await waitFor(() => expect(result.current.post).not.toBeNull());
    expect(result.current.templateChoice).toBe("blog-post.html");
  });

  it("hasSlugCollision is true when the post's slug matches one of the active theme's own static page ids", async () => {
    const port = createFakePostEditorPort({
      post: { ...POST, slug: "pricing" },
      presentation: { activeThemeStaticPageIds: ["pricing", "about"] },
    });

    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));

    await waitFor(() => expect(result.current.slug).toBe("pricing"));
    expect(result.current.hasSlugCollision).toBe(true);
  });

  it("reports a load failure via error, leaving post null", async () => {
    const port = createFakePostEditorPort({ getPostError: "post not found" });

    const { result } = renderHook(() => usePostEditor("missing", { port, navigate: fakeNavigate(), t: fakeT }));

    await waitFor(() => expect(result.current.error).toBe("post not found"));
    expect(result.current.post).toBeNull();
  });

  it("synthesizes a title node from the loaded post.title into a pre-migration bodyJson (back-compat, post-title-in-document feature)", async () => {
    const port = createFakePostEditorPort({
      post: { ...POST, bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body." }] }] } },
    });

    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));

    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await waitFor(() => {
      const json = result.current.editor!.getJSON() as { content?: Array<{ type?: string }> };
      expect(json.content?.[0]?.type).toBe("title");
    });
    expect(result.current.dirty).toBe(false); // freshly loaded, untouched — must not show dirty
  });
});

describe("usePostEditor — title/slug/status setters", () => {
  it("setSlug/setStatus update state directly", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.post).not.toBeNull());

    act(() => result.current.setSlug("new-slug"));
    expect(result.current.slug).toBe("new-slug");

    act(() => result.current.setStatus("published"));
    expect(result.current.status).toBe("published");
  });

  it("setTitle updates title state AND the editor's own title node text (two-way sync, post-title-in-document feature)", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());

    act(() => result.current.setTitle("Renamed"));

    expect(result.current.title).toBe("Renamed");
    await waitFor(() => {
      const json = result.current.editor!.getJSON() as { content?: Array<{ content?: Array<{ text?: string }> }> };
      expect(json.content?.[0]?.content?.[0]?.text).toBe("Renamed");
    });
  });
});

describe("usePostEditor — dirty guard / confirmLeave", () => {
  it("is not dirty immediately after load, and becomes dirty after a change", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.post).not.toBeNull());
    expect(result.current.dirty).toBe(false);

    act(() => result.current.setSlug("changed"));
    await waitFor(() => expect(result.current.dirty).toBe(true));
  });

  it("confirmLeave returns true without prompting when not dirty", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.post).not.toBeNull());

    expect(result.current.confirmLeave()).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("confirmLeave prompts via window.confirm once dirty, and returns the operator's answer", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.post).not.toBeNull());
    act(() => result.current.setSlug("changed"));
    await waitFor(() => expect(result.current.dirty).toBe(true));

    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    expect(result.current.confirmLeave()).toBe(false);
  });
});

describe("usePostEditor — save", () => {
  it("saves title/slug/status/bodyJson/templateChoice/overridesThemePage through the injected port, clearing dirty", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());

    act(() => result.current.setSlug("new-slug"));
    await waitFor(() => expect(result.current.dirty).toBe(true));

    await act(async () => {
      await result.current.save();
    });

    expect(port.post.slug).toBe("new-slug");
    expect(result.current.message).toMatch(/^Saved/);
    expect(result.current.dirty).toBe(false); // re-baselined against the just-saved state
  });

  it("save('published') forces status to published in the same call, without a separate status change", async () => {
    const port = createFakePostEditorPort({ post: { ...POST, status: "draft" } });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());

    await act(async () => {
      await result.current.save("published");
    });

    expect(port.post.status).toBe("published");
    expect(result.current.status).toBe("published");
    expect(result.current.message).toMatch(/^Published/);
  });

  it("a failed save surfaces the port's error message and leaves dirty state untouched", async () => {
    const port = createFakePostEditorPort({ post: POST, updatePostError: "save failed on the server" });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    act(() => result.current.setSlug("new-slug"));
    await waitFor(() => expect(result.current.dirty).toBe(true));

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.error).toBe("save failed on the server");
    expect(result.current.dirty).toBe(true); // not re-baselined — the save never actually landed
  });
});

describe("usePostEditor — delete", () => {
  it("removes a POST and navigates to /posts", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const navigate = fakeNavigate();
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate, t: fakeT }));
    await waitFor(() => expect(result.current.post).not.toBeNull());

    await act(async () => {
      await result.current.remove();
    });

    expect(navigate).toHaveBeenCalledWith("/posts");
  });

  it("removes a PAGE and navigates to /pages — kind-aware, not hardcoded to /posts", async () => {
    const port = createFakePostEditorPort({ post: PAGE });
    const navigate = fakeNavigate();
    const { result } = renderHook(() => usePostEditor("pg1", { port, navigate, t: fakeT }));
    await waitFor(() => expect(result.current.post).not.toBeNull());

    await act(async () => {
      await result.current.remove();
    });

    expect(navigate).toHaveBeenCalledWith("/pages");
  });

  it("a failed delete surfaces the error and resets deleting/confirmingDelete without navigating", async () => {
    const port = createFakePostEditorPort({ post: POST, deletePostError: "delete failed" });
    const navigate = fakeNavigate();
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate, t: fakeT }));
    await waitFor(() => expect(result.current.post).not.toBeNull());
    act(() => result.current.setConfirmingDelete(true));

    await act(async () => {
      await result.current.remove();
    });

    expect(result.current.error).toBe("delete failed");
    expect(result.current.deleting).toBe(false);
    expect(result.current.confirmingDelete).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("usePostEditor — injected port is genuinely read (negative verification)", () => {
  /**
   * Confirms the hook's `title`/`slug` truly come from whatever port is passed in, not a fixture the
   * test file happens to reuse everywhere else above — the same reasoning `use-redirects.hooks
   * .unit.test.tsx`'s own "does not resolve `redirects` while the injected port's list call is still
   * pending" test states for itself.
   */
  it("reflects a DIFFERENT post's title/slug than every other test in this file uses", async () => {
    const port = createFakePostEditorPort({
      post: { ...POST, id: "p9", title: "A Totally Different Title", slug: "totally-different-slug" },
    });

    const { result } = renderHook(() => usePostEditor("p9", { port, navigate: fakeNavigate(), t: fakeT }));

    await waitFor(() => expect(result.current.title).toBe("A Totally Different Title"));
    expect(result.current.slug).toBe("totally-different-slug");
  });
});

describe("usePostEditor — injected t is genuinely returned, not built internally", () => {
  /**
   * Standing i18n rule (2026-08-11, `PostEditor.tsx` no longer imports `useAdminLocale`/
   * `POSTS_DICT` itself): `t` must come from the hook's own `deps.t`, not something this hook
   * quietly rebuilds from a dictionary it reaches for on its own. A DISTINCTIVE fake (not the
   * identity `fakeT` every other test in this file uses) proves the returned `t` is literally the
   * same function reference/behavior passed in — an identity `t` would pass this same assertion
   * even if the hook silently ignored `deps.t` and returned its own `(k) => k`.
   */
  it("result.current.t is exactly the injected function, not a hook-internal one", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const distinctiveT = (key: string): string => `TRANSLATED[${key}]`;

    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: distinctiveT }));

    await waitFor(() => expect(result.current.post).not.toBeNull());
    expect(result.current.t("Save")).toBe("TRANSLATED[Save]");
    expect(result.current.t).toBe(distinctiveT);
  });
});

describe("useWiredPostEditor", () => {
  /**
   * Smoke test for the composition itself (real `defaultPostEditorPort` + real `navigate`), NOT a
   * network test — `fetch` is stubbed to fail deterministically (same discipline every other test in
   * this file, and `use-redirects.hooks.unit.test.tsx`, already follows: never let a real request
   * reach the network — jsdom's pinned test origin, `http://localhost:3000/`
   * (`vitest.config.ts`), is this machine's real dev server, and an unstubbed call here would
   * actually hit it). The assertion is only that mounting and reaching a settled `error` state does
   * not throw, proving `useWiredPostEditor` wires its two real dependencies correctly, not that a
   * network call succeeds.
   */
  it("composes the real port and real navigate without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "not found" }), { status: 404 })));
    const { result } = renderHook(() => useWiredPostEditor("nonexistent"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});
