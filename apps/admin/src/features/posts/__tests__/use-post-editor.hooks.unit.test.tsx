import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, type AdminMedia, type AdminPost } from "@/lib/api";
import { createFakePostEditorPort } from "../hooks/post-editor-dependencies.hooks";
import {
  FILE_HANDLER_ALLOWED_MIME_TYPES,
  handleFileDrop,
  handleFilePaste,
  uploadDroppedFile,
  usePostEditor,
  useWiredPostEditor,
} from "../hooks/use-post-editor.hooks";
import type { PostEditorController } from "../hooks/use-post-editor.hooks";
import type { PostEditorPort } from "../hooks/post-editor-port.hooks";

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
  contentType: "image/png",
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
  // A REFUSED autosave mirrors the operator's text into `localStorage`
  // (`lib/standing-draft-local-backup.ts`), and jsdom keeps one storage for the whole file — so
  // without this, one test's refused draft becomes the NEXT test's mount-time `recoverableDraft`
  // for the same post id. Refusals are reachable from any test here now that
  // `createFakePostEditorPort` models the server's real version guard.
  localStorage.clear();
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

  /**
   * Stale-settlement race (2026-09-05 sweep) — neither the Save nor the Publish button in
   * `PostEditorHeader` (`PostEditor.tsx`) is disabled while a save is in flight, so an operator can
   * click Save, then Publish, before Save's own request has settled. `save()` had no in-flight guard
   * at all: whichever of the two `port.updatePost` calls settled LAST won, regardless of which one
   * the operator actually clicked last. Root cause 1 (no in-flight guard) from the 2026-09-05
   * stale-settlement sweep.
   */
  it("a slower Save request that settles AFTER a later Publish click does not overwrite Publish's result", async () => {
    let state: AdminPost = { ...POST, status: "draft" };
    const resolvers: Array<() => void> = [];
    const port: PostEditorPort = {
      async getPost() {
        return { post: state };
      },
      async getPresentation() {
        return {
          settings: { workspaceId: "fake-ws", activeThemeId: "fake-theme", updatedAt: new Date(0).toISOString() },
          availableThemes: [],
          activeThemeTemplates: [],
          activeThemeStaticPageIds: [],
        };
      },
      updatePost(_target, patch) {
        return new Promise((resolve) => {
          // Each call parks its own resolution instead of settling immediately, so the test
          // controls the ORDER two overlapping `save()` calls settle in, independent of which one
          // was issued first.
          resolvers.push(() => {
            state = { ...state, ...patch, version: state.version + 1 } as AdminPost;
            resolve({ post: state });
          });
        });
      },
      async deletePost() {
        return { post: state };
      },
      async listPosts() {
        return { posts: [] };
      },
      async uploadMedia() {
        throw new Error("not used by this test");
      },
      templatePreviewUrl: () => "",
      async putAutosave() {
        return { applied: true };
      },
      async getAutosave() {
        return { autosave: null };
      },
      async discardAutosave() {
        return { ok: true };
      },
    };

    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());

    // Click Save (keeps `status` at "draft"), then click Publish — the exact sequence an impatient
    // double-click reaches, since neither button disables while the first request is still in flight.
    let saveSettled = false;
    let publishSettled = false;
    act(() => {
      result.current.save().then(() => {
        saveSettled = true;
      });
      result.current.save("published").then(() => {
        publishSettled = true;
      });
    });
    expect(resolvers).toHaveLength(2);

    // Publish — the LATER click, the operator's actual final intent — settles FIRST over the wire...
    await act(async () => {
      resolvers[1]();
      await Promise.resolve();
    });
    // ...then Save's request, issued first but slower, settles SECOND, after Publish already won.
    await act(async () => {
      resolvers[0]();
      await Promise.resolve();
    });
    await waitFor(() => expect(saveSettled && publishSettled).toBe(true));

    // A correct implementation keeps whichever call the operator issued LAST (Publish) as the final
    // state, regardless of which request happened to settle last over the wire.
    expect(result.current.status).toBe("published");
    expect(result.current.message).toMatch(/^Published/);
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
  it("FILE_HANDLER_ALLOWED_MIME_TYPES is exactly the server's DEFAULT_ALLOWED_MIME_TYPES ceiling (2026-09-07) — its own doc comment claims this, so drift here is a false comment, not just a stale list", () => {
    // Hardcoded, not imported from `@jini-ai/cms` — mirrors this constant's own doc comment on why
    // (that subpath is the full server-side upload/DB implementation, no place in a browser bundle).
    // Keep in sync BY HAND with `@jini-ai/cms/media`'s `media-service.ts` `DEFAULT_ALLOWED_MIME_TYPES`,
    // same as `fetch-image.test.ts`'s equivalent pin for `IMPORTABLE_CONTENT_TYPES` in apps/website.
    expect(new Set(FILE_HANDLER_ALLOWED_MIME_TYPES)).toEqual(
      new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "video/mp4", "video/webm"])
    );
  });

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

/**
 * Standing-draft autosave (2026-09-06) — debounce/ordering mechanics are proven once, generically,
 * in `use-standing-draft-autosave.unit.test.ts`; these prove WIRING — that `usePostEditor` feeds the
 * hook the right shape and reacts to it correctly — via `createFakePostEditorPort`.
 */
describe("usePostEditor — standing-draft autosave + recovery", () => {
  it("a seeded standing draft is exposed as recoverableDraft on load, and never silently applied to the working copy", async () => {
    const seeded = {
      bodyFormat: "doc" as const,
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "recovered" }] }] },
      title: "Recovered title",
      slug: "hello-world",
      baseVersion: POST.version,
      savedAt: "2026-09-06T00:00:00.000Z",
      savedByPrincipalId: "user-local",
    };
    const port = createFakePostEditorPort({ post: POST, autosave: seeded });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await waitFor(() => expect(result.current.recoverableDraft).not.toBeNull());

    expect(result.current.recoverableDraft).toEqual(seeded);
    // The banner is offered, not applied — the loaded post's own title is still what's shown.
    expect(result.current.title).toBe(POST.title);
  });

  it("restoreRecoveredDraft applies the draft into the editor/title/slug and dismisses the banner, without telling the server", async () => {
    const seeded = {
      bodyFormat: "doc" as const,
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "recovered" }] }] },
      title: "Recovered title",
      slug: "recovered-slug",
      baseVersion: POST.version,
      savedAt: "2026-09-06T00:00:00.000Z",
      savedByPrincipalId: "user-local",
    };
    const port = createFakePostEditorPort({ post: POST, autosave: seeded });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await waitFor(() => expect(result.current.recoverableDraft).not.toBeNull());

    act(() => result.current.restoreRecoveredDraft());

    expect(result.current.title).toBe("Recovered title");
    expect(result.current.slug).toBe("recovered-slug");
    expect(result.current.recoverableDraft).toBeNull();
    expect(port.discardAutosaveCalled).toBe(false);
  });

  it("discardRecoveredDraft clears the standing draft server-side and dismisses the banner", async () => {
    const seeded = {
      bodyFormat: "doc" as const,
      bodyJson: { type: "doc", content: [] },
      title: "Recovered title",
      slug: "hello-world",
      baseVersion: POST.version,
      savedAt: "2026-09-06T00:00:00.000Z",
      savedByPrincipalId: "user-local",
    };
    const port = createFakePostEditorPort({ post: POST, autosave: seeded });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await waitFor(() => expect(result.current.recoverableDraft).not.toBeNull());

    await act(async () => result.current.discardRecoveredDraft());

    expect(port.discardAutosaveCalled).toBe(true);
    expect(result.current.recoverableDraft).toBeNull();
    // Discarding must not silently apply the draft it just threw away.
    expect(result.current.title).toBe(POST.title);
  });

  it("editing schedules a debounced autosave PUT matching buildPostAutosaveDraft's own shape", async () => {
    vi.useFakeTimers();
    try {
      const port = createFakePostEditorPort({ post: POST });
      const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.editor).not.toBeNull();

      act(() => result.current.setTitle("Edited via autosave"));
      await act(async () => vi.advanceTimersByTimeAsync(3001));

      expect(port.putAutosaveCalls).toHaveLength(1);
      expect(port.putAutosaveCalls[0]).toMatchObject({
        bodyFormat: "doc",
        title: "Edited via autosave",
        slug: POST.slug,
        baseVersion: POST.version,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("a successful save clears the standing draft, even when nothing was ever recovered", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());

    act(() => result.current.setTitle("Saved for real"));
    await act(async () => {
      await result.current.save();
    });

    expect(port.discardAutosaveCalled).toBe(true);
  });

  /**
   * The save-vs-in-flight-autosave race, asserted at the COMPOSED level rather than only on the
   * shared hook. `discardAutosaveCalled` alone (the assertion directly above) would still be `true`
   * under an implementation where the discard raced the in-flight PUT and lost — the stale crumb
   * would land AFTER the save and resurrect superseded content on the next reload. This asserts the
   * observable SEQUENCE the port actually saw, which only an ordered implementation can produce.
   */
  it("a Save issued while an autosave PUT is still in flight leaves the DISCARD as the last write the server sees", async () => {
    const ops: string[] = [];
    let releasePut!: () => void;
    const base = createFakePostEditorPort({ post: POST });
    const port: typeof base = {
      ...base,
      get post() {
        return base.post;
      },
      get putAutosaveCalls() {
        return base.putAutosaveCalls;
      },
      get discardAutosaveCalled() {
        return base.discardAutosaveCalled;
      },
      async putAutosave(id, draft) {
        ops.push("put:start");
        await new Promise<void>((resolve) => {
          releasePut = resolve;
        });
        ops.push("put:end");
        return base.putAutosave(id, draft);
      },
      async discardAutosave(id) {
        ops.push("discard");
        return base.discardAutosave(id);
      },
    };

    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.editor).not.toBeNull();

      // Type, let the debounce fire, and hold that PUT open — this is the in-flight autosave.
      act(() => result.current.setTitle("Typed then saved fast"));
      await act(async () => vi.advanceTimersByTimeAsync(3001));
      expect(ops).toEqual(["put:start"]);

      // The operator clicks Save while that write is still on the wire.
      let saveSettled = false;
      act(() => {
        void result.current.save().then(() => {
          saveSettled = true;
        });
      });
      await act(async () => vi.advanceTimersByTimeAsync(0));
      // The discard must NOT have jumped the queue ahead of the still-open PUT.
      expect(ops).toEqual(["put:start"]);

      releasePut();
      await act(async () => vi.advanceTimersByTimeAsync(0));
      await act(async () => vi.advanceTimersByTimeAsync(3001));

      expect(saveSettled).toBe(true);
      expect(ops).toEqual(["put:start", "put:end", "discard"]);
      // The literal defect: nothing may be written after the discard, or the next editor load
      // would offer a crumb the save already superseded.
      expect(ops[ops.length - 1]).toBe("discard");
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The "reload the page on accident or exit out of the page" case in the owner's own words, at the
   * composed level: an edit made inside the debounce window must be parked when the editor goes
   * away, not dropped with the cancelled timer.
   */
  it("navigating away mid-edit parks the pending draft instead of dropping it", async () => {
    vi.useFakeTimers();
    try {
      const port = createFakePostEditorPort({ post: POST });
      const { result, unmount } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.editor).not.toBeNull();

      act(() => result.current.setTitle("Half-typed, then left the screen"));
      // Well inside the 3s idle window — the debounce has provably not fired yet.
      await act(async () => vi.advanceTimersByTimeAsync(500));
      expect(port.putAutosaveCalls).toHaveLength(0);

      unmount();
      await act(async () => vi.advanceTimersByTimeAsync(0));

      expect(port.putAutosaveCalls).toHaveLength(1);
      expect(port.putAutosaveCalls[0]).toMatchObject({ title: "Half-typed, then left the screen" });
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * STALE BASIS (2026-09-06) — the two-tab case, at the composed level. `simulateConcurrentSave`
   * moves the stored row under this editor exactly as another operator's save would, so the next
   * autosave tick is refused by the fake's own version guard rather than by a stubbed answer.
   *
   * Asserts the two things that together ARE the fix: the editor's controller now carries something
   * an operator can be told (`autosaveStaleBasis` — what `PostEditor.tsx` renders its notice from),
   * and the operator's typed text is still exactly where they left it. Asserting only that
   * `putAutosave` was called would pass under the silent bug this closes, and asserting only the
   * notice without the text would pass under a "fix" that reported the conflict by throwing the
   * work away — which would be worse than the original defect.
   */
  it("a refused autosave surfaces autosaveStaleBasis carrying the refused text, and leaves the working copy untouched", async () => {
    vi.useFakeTimers();
    try {
      const port = createFakePostEditorPort({ post: POST });
      const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.editor).not.toBeNull();
      expect(result.current.autosaveStaleBasis).toBeNull();

      // Another operator saves. This editor is not told, and still believes it is on POST.version.
      port.simulateConcurrentSave();

      act(() => result.current.setTitle("Typed while the other tab was saving"));
      await act(async () => vi.advanceTimersByTimeAsync(3001));

      expect(port.putAutosaveCalls).toHaveLength(1);
      expect(result.current.autosaveStaleBasis).toEqual({
        baseVersion: POST.version,
        draft: expect.objectContaining({ title: "Typed while the other tab was saving", baseVersion: POST.version }),
      });
      // The single most important property of this whole path.
      expect(result.current.title).toBe("Typed while the other tab was saving");
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The notice must not linger once autosaving actually works again — an operator staring at a
   * false "autosaving has paused" would stop trusting the true one.
   *
   * Walks the whole two-tab recovery the product actually offers: the refused tick, the operator's
   * own Save rejected by the same superseded basis (`409 VERSION_CONFLICT`), their explicit "Save
   * anyway", and then a tick on the fresh basis that the server accepts. Their text survives every
   * step of it.
   */
  it("autosaveStaleBasis clears once a write is accepted again, rather than sticking for the session", async () => {
    vi.useFakeTimers();
    try {
      const port = createFakePostEditorPort({ post: POST });
      const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.editor).not.toBeNull();

      port.simulateConcurrentSave();
      act(() => result.current.setTitle("Typed while the other tab was saving"));
      await act(async () => vi.advanceTimersByTimeAsync(3001));
      expect(result.current.autosaveStaleBasis).not.toBeNull();

      // The operator's own Save hits the same superseded basis, then they choose to overwrite.
      await act(async () => {
        await result.current.save();
      });
      expect(result.current.saveConflict).not.toBeNull();
      await act(async () => {
        await result.current.saveOverwritingConflict();
      });

      act(() => result.current.setTitle("Typed again, now on the current version"));
      await act(async () => vi.advanceTimersByTimeAsync(3001));

      expect(result.current.autosaveStaleBasis).toBeNull();
      expect(result.current.title).toBe("Typed again, now on the current version");
    } finally {
      vi.useRealTimers();
    }
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

/**
 * Optimistic concurrency (2026-09-06) — the editor half of the guard `be45461e` added to
 * `updatePost` and `routes/posts/update.ts` wired to the wire.
 *
 * Every conflict below is reached by the editor genuinely being stale (`simulateConcurrentSave`
 * advances the fake's row behind its back) rather than by seeding a canned rejection: a canned one
 * would pass identically if the editor never sent a version at all, which is exactly the bug.
 */
describe("usePostEditor — optimistic concurrency", () => {
  it("sends the version the editor loaded as expectedVersion on every save", async () => {
    const port = createFakePostEditorPort({ post: POST }); // POST.version === 3
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    // Also the loaded row, not just the editor: `expectedVersion` comes from `post`, so a test that
    // acted while the load effect was still in flight would assert against an unloaded editor and
    // read the documented no-basis fallback instead of the behavior it means to pin.
    await waitFor(() => expect(result.current.post).not.toBeNull());

    await act(async () => {
      await result.current.save();
    });

    expect(port.updatePostCalls).toHaveLength(1);
    expect(port.updatePostCalls[0].expectedVersion).toBe(3);

    // And the NEXT save uses the version that save produced, not the stale original — otherwise
    // every second save in a session would conflict with itself.
    await act(async () => {
      await result.current.save();
    });
    expect(port.updatePostCalls[1].expectedVersion).toBe(4);
  });

  it("rejects a save whose basis another operator superseded, WITHOUT discarding the operator's typed work", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    // Also the loaded row, not just the editor: `expectedVersion` comes from `post`, so a test that
    // acted while the load effect was still in flight would assert against an unloaded editor and
    // read the documented no-basis fallback instead of the behavior it means to pin.
    await waitFor(() => expect(result.current.post).not.toBeNull());

    act(() => result.current.setTitle("My careful rewrite"));
    act(() => result.current.setSlug("my-careful-rewrite"));
    await waitFor(() => expect(result.current.dirty).toBe(true));

    // Another operator saves first.
    act(() => port.simulateConcurrentSave("Their version"));

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.saveConflict).toEqual({ expectedVersion: 3, currentVersion: 4, attemptedStatus: undefined });
    // Not folded into the generic save-error line — the two need opposite reactions.
    expect(result.current.error).toBeNull();
    // The operator's work: still here, still unsaved, still dirty.
    expect(result.current.title).toBe("My careful rewrite");
    expect(result.current.slug).toBe("my-careful-rewrite");
    expect(result.current.dirty).toBe(true);
    // And the other operator's save is intact — this was a rejection, not a report.
    expect(port.post.title).toBe("Their version");
    expect(port.post.version).toBe(4);
  });

  it("keeps rejecting an ordinary Save after a conflict — nothing silently re-bases", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    // Also the loaded row, not just the editor: `expectedVersion` comes from `post`, so a test that
    // acted while the load effect was still in flight would assert against an unloaded editor and
    // read the documented no-basis fallback instead of the behavior it means to pin.
    await waitFor(() => expect(result.current.post).not.toBeNull());
    act(() => result.current.setTitle("Mine"));
    act(() => port.simulateConcurrentSave("Theirs"));

    await act(async () => {
      await result.current.save();
    });
    await act(async () => {
      await result.current.save();
    });

    expect(result.current.saveConflict).not.toBeNull();
    expect(port.post.title).toBe("Theirs");
  });

  it("saveOverwritingConflict re-reads the current version, lands the work, and keeps the publish intent", async () => {
    const port = createFakePostEditorPort({ post: { ...POST, status: "draft" } });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    // Also the loaded row, not just the editor: `expectedVersion` comes from `post`, so a test that
    // acted while the load effect was still in flight would assert against an unloaded editor and
    // read the documented no-basis fallback instead of the behavior it means to pin.
    await waitFor(() => expect(result.current.post).not.toBeNull());
    act(() => result.current.setTitle("Mine, published"));
    act(() => port.simulateConcurrentSave("Theirs"));

    await act(async () => {
      await result.current.save("published");
    });
    expect(result.current.saveConflict?.attemptedStatus).toBe("published");

    await act(async () => {
      await result.current.saveOverwritingConflict();
    });

    expect(result.current.saveConflict).toBeNull();
    expect(port.post.title).toBe("Mine, published");
    // The ORIGINAL intent replayed — a rejected Publish must not quietly retry as a draft save.
    expect(port.post.status).toBe("published");
    expect(result.current.status).toBe("published");
    expect(result.current.message).toMatch(/^Published/);
    // Sent against the version the other operator produced, not the stale basis.
    expect(port.updatePostCalls.at(-1)?.expectedVersion).toBe(4);
  });

  it("saveOverwritingConflict never pulls the other operator's content into the working copy", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    // Also the loaded row, not just the editor: `expectedVersion` comes from `post`, so a test that
    // acted while the load effect was still in flight would assert against an unloaded editor and
    // read the documented no-basis fallback instead of the behavior it means to pin.
    await waitFor(() => expect(result.current.post).not.toBeNull());
    act(() => result.current.setTitle("Mine"));
    act(() => port.simulateConcurrentSave("Theirs"));
    await act(async () => {
      await result.current.save();
    });

    await act(async () => {
      await result.current.saveOverwritingConflict();
    });

    // Re-reading the row is for its VERSION only. If the fresh row's title had been applied, this
    // would read "Theirs" and the operator's rewrite would be gone.
    expect(result.current.title).toBe("Mine");
    expect(port.post.title).toBe("Mine");
  });

  it("dismissSaveConflict hides the banner and saves nothing", async () => {
    const port = createFakePostEditorPort({ post: POST });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    // Also the loaded row, not just the editor: `expectedVersion` comes from `post`, so a test that
    // acted while the load effect was still in flight would assert against an unloaded editor and
    // read the documented no-basis fallback instead of the behavior it means to pin.
    await waitFor(() => expect(result.current.post).not.toBeNull());
    act(() => result.current.setTitle("Mine"));
    act(() => port.simulateConcurrentSave("Theirs"));
    await act(async () => {
      await result.current.save();
    });

    act(() => result.current.dismissSaveConflict());

    expect(result.current.saveConflict).toBeNull();
    expect(result.current.title).toBe("Mine");
    expect(port.post.title).toBe("Theirs");
  });

  it("treats a slug-uniqueness 409 as an ordinary save error, NOT a version conflict", async () => {
    const base = createFakePostEditorPort({ post: POST });
    const port: PostEditorPort = {
      ...base,
      async updatePost() {
        // Same status, same route, no code — the exact envelope the slug-collision branch returns.
        throw new ApiError("slug 'taken' already exists", 409);
      },
    };
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    // Also the loaded row, not just the editor: `expectedVersion` comes from `post`, so a test that
    // acted while the load effect was still in flight would assert against an unloaded editor and
    // read the documented no-basis fallback instead of the behavior it means to pin.
    await waitFor(() => expect(result.current.post).not.toBeNull());

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.saveConflict).toBeNull();
    expect(result.current.error).toBe("slug 'taken' already exists");
  });

  it("falls back to an unguarded save only when no post has loaded yet — there is no version to claim", async () => {
    const port = createFakePostEditorPort({ post: POST, getPostError: "boom" });
    const { result } = renderHook(() => usePostEditor("p1", { port, navigate: fakeNavigate(), t: fakeT }));
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    await waitFor(() => expect(result.current.error).toBe("boom"));
    expect(result.current.post).toBeNull();

    await act(async () => {
      await result.current.save();
    });

    expect(port.updatePostCalls[0].expectedVersion).toBeUndefined();
  });
});
