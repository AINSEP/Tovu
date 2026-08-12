import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostEditor } from "../PostEditor";
import type { PostEditorController } from "../hooks/use-post-editor.hooks";
import type { AdminPost } from "../../../lib/api";

/**
 * @file `PostEditor` — pins three new/fixed user-visible behaviors from the forms/PostEditor deep
 * pass: (1) the one-click Publish action (draft-only, saves and sets status in one request), (2)
 * the Delete confirmation moving from a blocking `window.confirm` to the shared `ConfirmDialog`
 * modal, and (3) the "← Posts" back link's kind-awareness fix (it used to point at `/admin/posts`
 * even while editing a page). Follows the RTL harness `FormEditor.unit.test.tsx` established for
 * this package.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const DRAFT_POST = {
  id: "p1",
  workspaceId: "w1",
  kind: "post" as const,
  title: "Hello world",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [{ type: "paragraph" }] },
  status: "draft" as const,
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

const DRAFT_PAGE = { ...DRAFT_POST, id: "pg1", kind: "page" as const, title: "About", slug: "about" };

let fetchMock: ReturnType<typeof vi.fn>;
/** Per-test override for the active theme's `templates` list; `[]` disables the picker. */
let activeThemeTemplates: string[];

beforeEach(() => {
  fetchMock = vi.fn();
  activeThemeTemplates = [];
  // `PostEditor` now also reads `core.language.locale` (via `useAdminLocale`) to translate its own
  // chrome — a real `fetch` call this file's tests never queued for. Routed here, ahead of
  // `fetchMock`, so it never consumes a slot from the post-load/save `mockResolvedValueOnce`
  // sequence every test below still queues on `fetchMock` itself unchanged. An empty settings
  // response resolves `loadLanguage()` to `DEFAULT_LOCALE` ("en"), matching every assertion below,
  // which was already written against the untranslated English strings.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/settings/effective")) {
      return Promise.resolve(jsonResponse({ data: [] }));
    }
    // Post-template-picker feature — `PostEditor`'s load effect now fetches presentation settings
    // in a `Promise.all` alongside the post. Routed here for the same reason `/settings/effective`
    // is: queued via `mockResolvedValueOnce` it would eat the slot each test below reserved for its
    // own save/publish response, and the post-load would resolve `undefined`. Defaults to an empty
    // template list, which keeps the picker in its disabled "no templates for this theme" state —
    // what every pre-existing assertion in this file was written against.
    if (url.includes("/presentation")) {
      return Promise.resolve(
        jsonResponse({
          settings: { activeThemeId: "basic" },
          availableThemeIds: [],
          availableThemes: [],
          activeThemeTemplates,
          activeThemeStaticPageIds: [],
        })
      );
    }
    return fetchMock(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Publish", () => {
  it("is offered for a draft post, saves and sets status to published in one request, then disappears", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }))
      .mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, status: "published", version: 2 } }));

    render(<PostEditor postId="p1" />);

    const publishButton = await screen.findByRole("button", { name: /^publish$/i });
    await user.click(publishButton);

    expect(await screen.findByText(/published · version 2/i)).toBeInTheDocument();
    // One PUT for the publish, carrying status: "published" — not a second draft-preserving save.
    const publishCall = fetchMock.mock.calls[1];
    expect(publishCall[1]?.method).toBe("PUT");
    expect(JSON.parse(publishCall[1]?.body as string)).toMatchObject({ status: "published" });
    // Nothing left for Publish to do once the post is live.
    expect(screen.queryByRole("button", { name: /^publish$/i })).not.toBeInTheDocument();
  });

  it("is not offered for an already-published post", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, status: "published" } }));

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    expect(screen.queryByRole("button", { name: /^publish$/i })).not.toBeInTheDocument();
  });
});

describe("Delete confirmation", () => {
  it("opens the ConfirmDialog instead of window.confirm, and only deletes on explicit confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    const deleteButton = await screen.findByRole("button", { name: /^delete$/i });
    await user.click(deleteButton);

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(await screen.findByText(/move to trash\?/i)).toBeInTheDocument();
    // Scoped to the dialog itself (post-title-in-document feature, 2026-08-11): the post's title
    // now ALSO renders inside the canvas as the doc's own title node
    // (`use-post-editor.hooks.ts`/`lib/post-title-extension.ts`), so a page-wide `getByText` for
    // "hello world" is ambiguous — there are legitimately two matches now, not a regression in the
    // dialog's own copy, which is what this assertion actually means to check.
    const dialog = document.querySelector(".confirm-dialog") as HTMLElement;
    expect(within(dialog).getByText(/hello world/i)).toBeInTheDocument();

    // Cancel leaves the post untouched — no DELETE fetched. `ConfirmDialog` stays mounted (its own
    // doc comment: the caller toggles `open`, never conditionally renders it), so "closed" here
    // means the `<dialog>` loses its `open` attribute, not that its text leaves the DOM.
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("deletes and navigates away only after the dialog's own confirm action", async () => {
    const user = userEvent.setup();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }))
      .mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    await user.click(await screen.findByRole("button", { name: /^delete$/i }));
    await screen.findByText(/move to trash\?/i);
    await user.click(screen.getByRole("button", { name: /move to trash/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const deleteCall = fetchMock.mock.calls[1];
    expect(deleteCall[1]?.method).toBe("DELETE");
  });
});

describe("Title and slug fields — accessible names", () => {
  it("gives the title and slug fields a real accessible name, not just a placeholder", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    const titleInput = await screen.findByLabelText("Post title");
    expect(titleInput).toHaveAttribute("placeholder", "Post title");
    expect(screen.getByLabelText("URL slug")).toHaveValue("hello-world");
  });
});

describe("Back-to-list link", () => {
  it("points at the Posts list for a post", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    const link = await screen.findByRole("link", { name: /posts/i });
    expect(link).toHaveAttribute("href", "/admin/posts");
  });

  it("points at the Pages list for a page — was hardcoded to Posts regardless of kind", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_PAGE }));

    render(<PostEditor postId="pg1" />);

    const link = await screen.findByRole("link", { name: /pages/i });
    expect(link).toHaveAttribute("href", "/admin/pages");
  });
});

/** The template picker shares the `combobox` role with the status select, so match its agent handle. */
function templateSelect(): HTMLSelectElement {
  const el = document.querySelector('[data-agent-element="post-template-choice"]');
  if (!(el instanceof HTMLSelectElement)) throw new Error("template picker not rendered");
  return el;
}

describe("Template picker", () => {
  /**
   * The picker's two non-obvious behaviors, both load-bearing for the site render:
   * a post with no saved choice must show the theme's FIRST template selected (never "No template
   * chosen"), and picking "No template chosen" must persist as `""` — not `null`. `""` is what the
   * render path reads as a deliberate opt-out; `null` means "never chosen" and falls back. A `||`
   * on the change handler collapses the two, which is how 11 published posts ended up serving a
   * diagnostic page.
   */
  it("defaults an unset post to the theme's first template rather than 'No template chosen'", async () => {
    activeThemeTemplates = ["blog-post.html", "long-form.html"];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: null } }));

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    const select = templateSelect();
    await waitFor(() => expect(select).toHaveValue("blog-post.html"));
  });

  it("the View Template button is disabled once 'No template chosen' is selected", async () => {
    const user = userEvent.setup();
    activeThemeTemplates = ["blog-post.html"];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: "blog-post.html" } }));

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    expect(screen.getByRole("button", { name: /view template/i })).toBeEnabled();
    await user.selectOptions(templateSelect(), "");
    expect(screen.getByRole("button", { name: /view template/i })).toBeDisabled();
  });

  it("clicking View Template opens the read-only modal for the selected template", async () => {
    const user = userEvent.setup();
    activeThemeTemplates = ["blog-post.html"];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: "blog-post.html" } }));
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/theme-assets/")) return Promise.resolve(new Response("<p>hi</p>", { status: 200 }));
        if (url.includes("/settings/effective")) return Promise.resolve(jsonResponse({ data: [] }));
        if (url.includes("/presentation")) {
          return Promise.resolve(
            jsonResponse({
              settings: { activeThemeId: "basic" },
              availableThemeIds: [],
              availableThemes: [{ id: "basic", tier: "static" }],
              activeThemeTemplates,
              activeThemeStaticPageIds: [],
            }),
          );
        }
        return fetchMock(input);
      }),
    );

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    await user.click(screen.getByRole("button", { name: /view template/i }));

    // "blog-post.html" also appears as the picker's own <option> text, so scope to the modal's
    // title node specifically rather than a bare `findByText` (which errors on the ambiguity).
    await waitFor(() => expect(document.querySelector("[data-preview-modal-title]")).toHaveTextContent("blog-post.html"));
    expect(await screen.findByText("<p>hi</p>")).toBeInTheDocument();
  });

  it('persists an explicit "No template chosen" as "" so the opt-out is distinguishable from never-chosen', async () => {
    const user = userEvent.setup();
    activeThemeTemplates = ["blog-post.html"];
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: "blog-post.html" } }))
      .mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_POST, templateChoice: "", version: 2 } }));

    render(<PostEditor postId="p1" />);

    await screen.findByRole("button", { name: /^save$/i });
    await user.selectOptions(templateSelect(), "");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body));
    expect(body.templateChoice).toBe("");
    expect(body.templateChoice).not.toBeNull();
  });
});

/**
 * Edit/Preview toolbar (2026-08-11) — drives `PostEditor` through the `usePostEditorHook` DI seam
 * rather than `fetch` mocks, same convention `PageEditor.unit.test.tsx` established for its own
 * "view toggle" suite: this is about `PostEditor`'s own tab-switching wiring and preview-eligibility
 * branching, not `usePostEditor`'s internals, and the seam already exists for exactly this. `editor:
 * null` throughout — none of these tests need a mounted TipTap instance (`EditorContent`/`Toolbar`
 * both already null-gate on it), and stubbing it keeps the suite fast, matching `PostEditorProps`'s
 * own doc comment on why the seam exists.
 */
function postController(overrides: Partial<PostEditorController> = {}): PostEditorController {
  return {
    post: DRAFT_POST as AdminPost,
    editor: null,
    title: "Hello world",
    setTitle: vi.fn(),
    slug: "hello-world",
    setSlug: vi.fn(),
    status: "draft",
    setStatus: vi.fn(),
    templateChoice: null,
    setTemplateChoice: vi.fn(),
    availableTemplates: [],
    activeThemeId: null,
    activeThemeTier: null,
    overridesThemePage: false,
    setOverridesThemePage: vi.fn(),
    hasSlugCollision: false,
    view: "edit",
    setView: vi.fn(),
    message: null,
    error: null,
    confirmingDelete: false,
    setConfirmingDelete: vi.fn(),
    deleting: false,
    confirmLeave: () => true,
    dirty: false,
    contentDirty: false,
    save: vi.fn(),
    remove: vi.fn(),
    ...overrides,
  };
}

function renderPostEditor(overrides: Partial<PostEditorController> = {}) {
  const ctrl = postController(overrides);
  const usePostEditorHook = () => ctrl;
  const utils = render(<PostEditor postId="p1" usePostEditorHook={usePostEditorHook} />);
  return { ctrl, ...utils };
}

describe("Edit/Preview toolbar", () => {
  it("marks the active view tab as selected", () => {
    renderPostEditor({ view: "edit" });
    expect(screen.getByRole("tab", { name: "Editor" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "false");
  });

  it("clicking the Preview tab calls setView('preview')", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ view: "edit" });
    await user.click(screen.getByRole("tab", { name: "Preview" }));
    expect(ctrl.setView).toHaveBeenCalledWith("preview");
  });

  it("clicking the Edit tab calls setView('edit')", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ view: "preview" });
    await user.click(screen.getByRole("tab", { name: "Editor" }));
    expect(ctrl.setView).toHaveBeenCalledWith("edit");
  });

  it("renders the Tiptap body editor, not the preview iframe, in edit view", () => {
    renderPostEditor({ view: "edit" });
    expect(document.querySelector('[data-agent-element="post-body"]')).toBeInTheDocument();
    expect(screen.queryByTitle("Post preview")).not.toBeInTheDocument();
  });

  it("renders the preview iframe, not the Tiptap body editor, in preview view", () => {
    renderPostEditor({ view: "preview" });
    expect(screen.getByTitle("Post preview")).toBeInTheDocument();
    expect(document.querySelector('[data-agent-element="post-body"]')).not.toBeInTheDocument();
  });

  // 2026-08-11: mirrors `PageEditor.tsx`'s own live-vs-fallback preview rule (see `PostPreview`'s
  // doc comment in `PostEditor.tsx`) — a published, un-dirtied post iframes its real public URL;
  // anything else falls back to a rendering of the editor buffer with a notice explaining why.
  it("preview iframes the real public URL when the post is published and has no unsaved changes", () => {
    renderPostEditor({ view: "preview", status: "published", dirty: false, contentDirty: false, slug: "hello-world" });
    const preview = screen.getByTitle("Post preview");
    expect(preview).toHaveAttribute("src", expect.stringContaining("/hello-world"));
    expect(screen.queryByText(/preview them with the theme/i)).not.toBeInTheDocument();
  });

  // Template-preview fix (2026-08-11, `ADS-memory/reports/implementation/
  // 2026-08-11-template-preview-render-bug.md`) — deliberately UNCHANGED for a draft, even a clean one
  // (`contentDirty` false): a draft's own `{"type":"content"}` slot does not survive the shared render
  // pipeline's visibility-filtered "content" resolver (confirmed live in `admin-post-template-preview
  // .test.ts`'s own draft case — the body degrades to an empty placeholder, which would read as "my
  // content disappeared"), so `canShowTemplatePreview` requires `status === "published"` and a draft
  // keeps the pre-existing editor-buffer fallback.
  it("preview still falls back to the editor-buffer sandbox for a clean draft post (drafts are out of this fix's scope)", () => {
    renderPostEditor({ view: "preview", status: "draft", dirty: false, contentDirty: false });
    const preview = screen.getByTitle("Post preview");
    expect(preview).not.toHaveAttribute("src");
    expect(screen.getByText(/publish this post to preview it with the theme/i)).toBeInTheDocument();
  });

  // Template-preview fix (2026-08-11) — the reported bug's exact repro: picking a DIFFERENT template
  // on an otherwise-untouched published post. `dirty` is correctly `true` (an unsaved `templateChoice`
  // change), but `contentDirty` stays `false` — this must show a real templated render, not the
  // editor-buffer sandbox. Before the fix, `dirty` alone gated the fallback, so switching templates
  // rendered unstyled and looked identical across every template (the fallback never read
  // `templateChoice`).
  it("preview shows a real templated render, with the pending template in the URL, when only the template choice is dirty on a published post", () => {
    renderPostEditor({
      view: "preview",
      status: "published",
      dirty: true,
      contentDirty: false,
      templateChoice: "blog-post.html",
    });
    const preview = screen.getByTitle("Post preview");
    expect(preview).toHaveAttribute("src", expect.stringContaining("/p1/template-preview"));
    expect(preview).toHaveAttribute("src", expect.stringContaining("templateChoice=blog-post.html"));
    expect(screen.getByText(/save to update the live post/i)).toBeInTheDocument();
  });

  // `SrcDocSandbox` also renders an `<iframe title="Post preview">` (via `srcDoc`, not `src`) — the
  // fallback is distinguished by the ABSENCE of a `src` attribute, same idiom `PageEditor.unit.test.tsx`
  // uses for its own equivalent branch. Reachable when a published post's body/title/slug/status
  // itself has unsaved edits (`contentDirty: true`). Same notice wording as before this fix; only the
  // branching condition changed.
  it("preview falls back to a rendering of the editor buffer, with a notice, when the post body itself has unsaved edits", () => {
    renderPostEditor({ view: "preview", status: "published", dirty: true, contentDirty: true });
    const preview = screen.getByTitle("Post preview");
    expect(preview).not.toHaveAttribute("src");
    expect(screen.getByText(/save your changes to preview them with the theme/i)).toBeInTheDocument();
  });

  it("preview falls back to a rendering of the editor buffer, with a notice, for a draft post with unsaved edits", () => {
    renderPostEditor({ view: "preview", status: "draft", dirty: true, contentDirty: true });
    const preview = screen.getByTitle("Post preview");
    expect(preview).not.toHaveAttribute("src");
    expect(screen.getByText(/publish this post to preview it with the theme/i)).toBeInTheDocument();
  });

  // The template picker is a publish-time setting, not tab-specific content — it has to survive the
  // toolbar restructure (2026-08-11: moved out of its own `.editor-slug-row` into this toolbar's
  // right-hand side) and stay visible regardless of which tab is active.
  it("keeps the template picker visible in preview view, not just edit view", () => {
    renderPostEditor({ view: "preview", availableTemplates: ["blog-post.html"], templateChoice: "blog-post.html" });
    expect(document.querySelector('[data-agent-element="post-template-choice"]')).toBeInTheDocument();
  });
});
