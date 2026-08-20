import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdminMedia, AdminPost } from "../../../lib/api";
import { createFakePostEditorPort } from "../hooks/post-editor-dependencies.hooks";
import { handleFileDrop, handleFilePaste, uploadDroppedFile, usePostEditor, useWiredPostEditor } from "../hooks/use-post-editor.hooks";
import type { PostEditorController } from "../hooks/use-post-editor.hooks";

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

/** {@link uploadDroppedFile}/{@link handleFileDrop}/{@link handleFilePaste} group's own fixture —
 *  what `port.uploadMedia` resolves with, standing in for a real upload response. */
const UPLOADED_MEDIA: AdminMedia = {
  id: "asset-99",
  workspaceId: "ws1",
  title: "photo.png",
  alt: "",
  caption: "",
  credit: "",
  sha256: "fake-sha",
  status: "active",
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
  version: 1,
  width: null,
  height: null,
  cssClass: null,
};

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
        availableThemes: [{ id: "basic", tier: "static", apiVersion: 2 }],
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
    expect(result.current.activeThemeApiVersion).toBe(2);
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

describe("usePostEditor — templatePreviewUrl / previewFormTarget (2026-08-14, moved out of PostEditor.tsx/PostPreview)", () => {
  it("is empty before the post loads, then reflects the INJECTED port's templatePreviewUrl once loaded", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));

    expect(result.current.templatePreviewUrl).toBe("");
    expect(result.current.previewFormTarget).toBe("");

    await waitFor(() => expect(result.current.post).toEqual(POST));

    // `createFakePostEditorPort`'s own `templatePreviewUrl` returns a `fake://` scheme the real
    // `api.templatePreviewUrl` (`lib/api.ts`) could never produce — proving `usePostEditor` reads
    // this off the injected port rather than calling `lib/api` itself.
    expect(result.current.templatePreviewUrl).toBe("fake://template-preview/p1?templateChoice=");
    expect(result.current.previewFormTarget).toBe("post-preview-pending-p1");
  });

  it("rebuilds templatePreviewUrl through the port when templateChoice changes", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.post).toEqual(POST));

    act(() => result.current.setTemplateChoice("blog-post.html"));

    expect(result.current.templatePreviewUrl).toBe("fake://template-preview/p1?templateChoice=blog-post.html");
  });
});

describe("usePostEditor — pending-content-preview debounce (2026-08-14, moved out of PostPreview)", () => {
  // Fake timers are installed only AFTER the editor has mounted (real timers/`waitFor` for that
  // part, same as every other test in this file) and torn down in `afterEach` regardless of how the
  // test exits — installing them any earlier risks TipTap's own internal scheduling running under
  // them too, and leaving them installed after a failing assertion would leak into the next test.
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Stands in for the `<form ref={previewFormRef}>` DOM node `PostPreview` would normally attach —
   *  this test drives `usePostEditor` in isolation, with no `PostPreview` rendered, so it wires the
   *  ref directly the same way a real mount would populate `.current`. Cast through `unknown`
   *  because `previewFormRef.current` is `readonly` at the `RefObject` type level (by design — see
   *  `PostEditorController.previewFormRef`'s own doc); only a real DOM attach or a test double is
   *  meant to set it. */
  function attachFakeForm(ref: PostEditorController["previewFormRef"]): { submit: ReturnType<typeof vi.fn<(...args: any[]) => any>> } {
    const fakeForm = { submit: vi.fn() };
    (ref as unknown as { current: typeof fakeForm | null }).current = fakeForm;
    return fakeForm;
  }

  it("collapses THREE rapid pending changes into exactly ONE submit, 500ms after the LAST one — not the first, not three", async () => {
    const port = createFakePostEditorPort({ post: { ...POST, status: "published" } });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());

    const form = attachFakeForm(result.current.previewFormRef);

    vi.useFakeTimers();
    act(() => result.current.setView("preview"));
    // First change: title differs from the loaded post, so contentDirty (and therefore
    // canShowPendingContentPreview, since status is published) flips true here — this is what
    // arms the debounce, same as an operator's first keystroke after a publish.
    act(() => result.current.setTitle("Edit 1"));
    vi.advanceTimersByTime(200);
    // Second and third changes each land inside the still-running 500ms window and must each
    // restart it — templateChoice is in the effect's own dependency list for exactly this reason
    // (a pending template pick should also postpone the fire so the eventual submit carries it).
    act(() => result.current.setTemplateChoice("blog-post.html"));
    vi.advanceTimersByTime(200);
    act(() => result.current.setTemplateChoice("page-shell.html"));

    expect(form.submit).not.toHaveBeenCalled();
    // 499ms after the LAST change (page-shell.html) — the whole point of a trailing debounce is
    // that nothing has fired yet, even though 600ms have elapsed since the FIRST change.
    vi.advanceTimersByTime(499);
    expect(form.submit).not.toHaveBeenCalled();
    // The 500th ms after the last change — exactly one submit, not three.
    vi.advanceTimersByTime(1);
    expect(form.submit).toHaveBeenCalledTimes(1);
  });

  it("cancels the pending submit entirely when the operator leaves the Preview tab before it fires", async () => {
    const port = createFakePostEditorPort({ post: { ...POST, status: "published" } });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());

    const form = attachFakeForm(result.current.previewFormRef);

    vi.useFakeTimers();
    act(() => result.current.setView("preview"));
    act(() => result.current.setTitle("Edit 1"));
    vi.advanceTimersByTime(300);
    act(() => result.current.setView("edit"));
    vi.advanceTimersByTime(1000);

    expect(form.submit).not.toHaveBeenCalled();
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

describe("uploadDroppedFile / handleFileDrop / handleFilePaste — file-handler drag & paste upload (2026-08-12, B1)", () => {
  it("uploadDroppedFile uploads through port.uploadMedia and returns {assetId, alt: file.name}", async () => {
    const port = createFakePostEditorPort({ post: POST, uploadMediaResult: UPLOADED_MEDIA });
    const file = new File(["bytes"], "photo.png", { type: "image/png" });

    const result = await uploadDroppedFile(port, file);

    expect(result).toEqual({ assetId: "asset-99", alt: "photo.png" });
  });

  it("uploadDroppedFile returns null (not a throw) when the upload fails — a failed file must not crash the drop/paste handler", async () => {
    const port = createFakePostEditorPort({ post: POST, uploadMediaError: "upload failed" });
    const file = new File(["bytes"], "photo.png", { type: "image/png" });

    const result = await uploadDroppedFile(port, file);

    expect(result).toBeNull();
  });

  it("handleFileDrop inserts a ref-based {assetId, transformName, alt} image node at the drop position — the SAME node shape insertMediaRef (the Media picker's own command) produces, never a data: URL", async () => {
    const port = createFakePostEditorPort({ post: POST, uploadMediaResult: UPLOADED_MEDIA });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    const editor = result.current.editor!;
    const dropPos = editor.state.doc.content.size; // end of doc — a plausible drop position
    const file = new File(["bytes"], "photo.png", { type: "image/png" });

    handleFileDrop(port, editor, [file], dropPos);

    await waitFor(() => {
      const json = editor.getJSON() as { content?: Array<{ type?: string; attrs?: Record<string, unknown> }> };
      const inserted = json.content?.find((node) => node.type === "image");
      expect(inserted?.attrs).toMatchObject({ assetId: "asset-99", transformName: "public", alt: "photo.png" });
    });
    expect(JSON.stringify(editor.getJSON())).not.toContain("data:"); // never base64-inlined
  });

  it("handleFilePaste inserts through insertMediaRef at the current selection — same node shape as drop, positioned differently since onPaste carries no pos argument", async () => {
    const port = createFakePostEditorPort({ post: POST, uploadMediaResult: UPLOADED_MEDIA });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    const editor = result.current.editor!;
    const file = new File(["bytes"], "photo.png", { type: "image/png" });

    handleFilePaste(port, editor, [file]);

    await waitFor(() => {
      const json = editor.getJSON() as { content?: Array<{ type?: string; attrs?: Record<string, unknown> }> };
      const inserted = json.content?.find((node) => node.type === "image");
      expect(inserted?.attrs).toMatchObject({ assetId: "asset-99", transformName: "public", alt: "photo.png" });
    });
  });

  it("handleFileDrop uploads and inserts every file independently — one failing upload in a multi-file drop does not block the others", async () => {
    let call = 0;
    const port = createFakePostEditorPort({ post: POST });
    // Override uploadMedia directly (createFakePostEditorPort's own options only model ONE
    // fixed result/error, not a per-call sequence) so the first file fails and the second succeeds.
    port.uploadMedia = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error("first upload failed");
      return { media: UPLOADED_MEDIA };
    });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    const editor = result.current.editor!;
    const dropPos = editor.state.doc.content.size;
    const bad = new File(["bytes"], "bad.png", { type: "image/png" });
    const good = new File(["bytes"], "good.png", { type: "image/png" });

    handleFileDrop(port, editor, [bad, good], dropPos);

    await waitFor(() => {
      const json = editor.getJSON() as { content?: Array<{ type?: string; attrs?: Record<string, unknown> }> };
      const inserted = json.content?.filter((node) => node.type === "image") ?? [];
      expect(inserted).toHaveLength(1); // only the successful upload landed
      expect(inserted[0]?.attrs).toMatchObject({ alt: "good.png" });
    });
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
