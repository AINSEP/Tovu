import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostEditor } from "../PostEditor";
import type { PostEditorController } from "../hooks/use-post-editor.hooks";
import { api, type AdminPost } from "@/lib/api";

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

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;
/** Per-test override for the active theme's `templates` list; `[]` disables the picker. */
let activeThemeTemplates: string[];

beforeEach(() => {
  fetchMock = vi.fn();
  activeThemeTemplates = [];
  // `useWiredPostEditor` (2026-08-11: `useAdminLocale`/`POSTS_DICT` moved out of `PostEditor.tsx`
  // and into the hook, per the standing i18n rule — see `use-post-editor.hooks.ts`'s file header)
  // now reads `core.language.locale` (via `useAdminLocale`) to build its own bound `t`, a real
  // `fetch` call this file's tests never queued for. Routed here, ahead of `fetchMock`, so it never
  // consumes a slot from the post-load/save `mockResolvedValueOnce` sequence every test below still
  // queues on `fetchMock` itself unchanged. An empty settings response resolves `loadLanguage()` to
  // `DEFAULT_LOCALE` ("en"), matching every assertion below, which was already written against the
  // untranslated English strings.
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
    // Mention feature (2026-08-11) — `use-post-editor.hooks.ts`'s own load effect now also fires
    // `port.listPosts()` on mount, a real `fetch` call this file's tests never queued for either.
    // Same reasoning as `/settings/effective`/`/presentation` just above: routed here, ahead of
    // `fetchMock`, so it never eats a slot from the post-load/save `mockResolvedValueOnce` sequence
    // every test below still queues on `fetchMock` itself, unchanged. Matched on the BARE
    // `/workspaces/{ws}/posts` URL with no id segment AND no explicit method — `createPost` hits the
    // same bare URL but as a `POST`, and every per-post call (`getPost`/`updatePost`/`deletePost`)
    // always has an `/{id}` suffix, so this cannot accidentally intercept either. Defaults to no
    // other posts, which keeps the mention picker in its empty/disabled state — what every
    // pre-existing assertion in this file was written against.
    if (/\/posts$/.test(url) && (init?.method ?? "GET") === "GET") {
      return Promise.resolve(jsonResponse({ posts: [] }));
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

describe("Formatting toolbar — alignment icons", () => {
  /**
   * Icons replacing the Left/Center/Right/Justify word labels (owner, 2026-08-11: "How come it
   * just doesn't use the icons? ... would be nice to have"). Mounts the REAL editor (not the
   * `editor: null` DI-seam used by the "Edit/Preview toolbar" describe block below) because
   * `Toolbar` only renders once TipTap has mounted — an icon-only button's accessible name comes
   * from `aria-label` alone (a screen reader ignores `title`), so this has to assert against a real
   * rendered button, not a stubbed controller that never renders `Toolbar` at all.
   */
  it("align buttons keep their accessible name via aria-label, with no visible text label left in the button", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    // Waits for the real TipTap editor to mount — `Toolbar` is null-gated on `editor` until then.
    await screen.findByTitle("Bold (⌘B)");

    for (const name of ["Align left", "Align center", "Align right", "Justify"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("title", name);
      expect(button.textContent).toBe(""); // icon only — an <svg aria-hidden>, no word label
    }
  });
});

describe("CharacterCount readout", () => {
  /**
   * Owner's "anything and everything" extension list (2026-08-11) — a live character count in the
   * toolbar. Mounts the real editor (same reasoning as the alignment-icons describe block above):
   * `editor.storage.characterCount` only exists once TipTap has actually mounted with the
   * extension registered. `DRAFT_POST`'s title, "Hello world", is 11 characters — synthesized into
   * the doc's title node by `withTitleNode` on load, with the fixture's own empty paragraph
   * contributing nothing — so this also incidentally proves the count reflects the WHOLE doc
   * (title node included), not just the body paragraphs.
   */
  it("shows the live character count once the editor has mounted", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: DRAFT_POST }));

    render(<PostEditor postId="p1" />);

    expect(await screen.findByText("11 characters")).toBeInTheDocument();
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

  // Characterization test (2026-08-20, `PostEditorToolbarEnd` extraction pass) — pins a branch that
  // had no prior coverage in this file: an `"html"`-format record (a Page routed through this same
  // `/admin/posts/{id}` screen — see `PostEditor.tsx`'s own file header) has nothing to pick a Post
  // template for, so the whole picker must not render at all, not just show empty/disabled.
  it("renders no template picker at all for an html-format record (a Page)", async () => {
    activeThemeTemplates = ["blog-post.html"];
    fetchMock.mockResolvedValueOnce(jsonResponse({ post: { ...DRAFT_PAGE, bodyFormat: "html" } }));

    render(<PostEditor postId="pg1" />);

    await screen.findByRole("button", { name: /^save$/i });
    expect(document.querySelector(".editor-template-picker")).not.toBeInTheDocument();
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
        // 2026-08-19 architecture audit finding 1: every real static theme (`basic` included) is
        // `apiVersion: 2`, whose page templates live under `render/pages/`, not `pages/` — pinned
        // exactly here (not just `includes("/theme-assets/")`) so this end-to-end test would have
        // caught the original bug (a v1-only fetch URL that 404s for every v2 theme).
        if (url === "/theme-assets/basic/render/pages/blog-post.html") {
          return Promise.resolve(new Response("<p>hi</p>", { status: 200 }));
        }
        if (url.includes("/theme-assets/")) return Promise.resolve(new Response("not found", { status: 404 }));
        if (url.includes("/settings/effective")) return Promise.resolve(jsonResponse({ data: [] }));
        if (url.includes("/presentation")) {
          return Promise.resolve(
            jsonResponse({
              settings: { activeThemeId: "basic" },
              availableThemeIds: [],
              availableThemes: [{ id: "basic", tier: "static", apiVersion: 2 }],
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
    const body = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
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
  const post = overrides.post ?? (DRAFT_POST as AdminPost);
  const templateChoice = overrides.templateChoice ?? null;
  // Computed ahead of the returned object so the derived `onX` handlers below (the UI-subhook
  // fields, `usePostEditorUi`'s own real wiring — see that hook's file header) forward to
  // whichever `save`/`setConfirmingDelete`/`setShowTemplateModal` mock a test actually overrode,
  // same as the real hook composing them from its own live values.
  const save = overrides.save ?? vi.fn();
  const setConfirmingDelete = overrides.setConfirmingDelete ?? vi.fn();
  const setShowTemplateModal = overrides.setShowTemplateModal ?? vi.fn();
  return {
    onPublish: () => save("published"),
    onSave: () => save(),
    onDeleteClick: () => setConfirmingDelete(true),
    onDeleteCancel: () => setConfirmingDelete(false),
    onViewTemplateClick: () => setShowTemplateModal(true),
    onCloseTemplateModal: () => setShowTemplateModal(false),
    post,
    editor: null,
    title: "Hello world",
    setTitle: vi.fn(),
    slug: "hello-world",
    setSlug: vi.fn(),
    status: "draft",
    setStatus: vi.fn(),
    templateChoice,
    setTemplateChoice: vi.fn(),
    availableTemplates: [],
    mentionablePosts: [],
    activeThemeId: null,
    activeThemeTier: null,
    activeThemeApiVersion: undefined,
    overridesThemePage: false,
    setOverridesThemePage: vi.fn(),
    hasSlugCollision: false,
    view: "edit",
    setView: vi.fn(),
    message: null,
    error: null,
    confirmingDelete: false,
    setConfirmingDelete,
    deleting: false,
    confirmLeave: () => true,
    dirty: false,
    contentDirty: false,
    // Defaults to the SAME shape `defaultPostEditorPort.templatePreviewUrl` produces (the real
    // `api.templatePreviewUrl`), so the pre-existing "Edit/Preview toolbar" characterization tests
    // below — written when `PostPreview` called `api.templatePreviewUrl` itself — still see realistic
    // URLs without restating that logic. Mirrors `PageEditor.unit.test.tsx`'s identical fixture.
    templatePreviewUrl: post ? api.templatePreviewUrl(post.id, templateChoice) : "",
    // `null` by default, matching `editor: null` above — see this describe block's own comment on
    // why a `null` `bodyJson` means the debounced auto-submit effect never fires in this DI harness.
    bodyJson: null,
    showTemplateModal: false,
    setShowTemplateModal,
    previewFormRef: { current: null },
    previewFormTarget: post ? `post-preview-pending-${post.id}` : "",
    save,
    remove: vi.fn(),
    t: (key: string) => key,
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

  // Pending-content preview fix (2026-08-12, the owner's own reported bug) — a published post with
  // unsaved BODY edits (`contentDirty: true`) used to fall all the way to the raw `SrcDocSandbox`
  // fallback (no `src`, a `srcDoc` string instead). It now gets its OWN themed branch: neither `src`
  // nor `srcDoc` is set directly (see `PostPreview`'s own doc, branch 3) — instead a hidden
  // `<form method="post" target="{iframe name}">` is rendered alongside the iframe, ready to carry
  // `bodyJson` into it. `editor: null` in this DI harness means the debounced auto-submit effect
  // never fires (it bails out on a `null` `bodyJson` — see `PostPreview`'s effect), so this only
  // asserts the static markup shape, not a real navigation; `post-editor-preview-branches.spec.ts`
  // covers the real submit+navigate behavior end to end in a browser.
  it("preview shows a themed live-template render, carried via a hidden form POST, when the post body itself has unsaved edits", () => {
    renderPostEditor({ view: "preview", status: "published", dirty: true, contentDirty: true });
    const preview = screen.getByTitle("Post preview");
    expect(preview).not.toHaveAttribute("src");
    expect(preview).not.toHaveAttribute("srcdoc");
    const previewName = preview.getAttribute("name");
    expect(previewName).toBeTruthy();

    // The hidden form's `target` must match the iframe's `name` exactly — that's what routes a form
    // submit into it instead of the top-level document.
    const form = document.querySelector("form[method='post']");
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("target", previewName as string);
    expect(form).toHaveAttribute("action", expect.stringContaining("/p1/template-preview"));

    expect(screen.getByText(/previewing your unsaved edits through the live template/i)).toBeInTheDocument();
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

/**
 * Slug-collision override, tri-state (2026-08-15) — a two-state checkbox can no longer represent
 * `overridesThemePage`'s three real states (`null`/`true`/`false`), so the control became a
 * `<select>`. These pin the value<->option mapping and the copy change (the notice used to claim the
 * theme page wins by default, which is now false) — nothing here exercises `usePostEditor` itself
 * (that hook's own tri-state plumbing is covered by `use-post-editor.hooks.unit.test.tsx`), only that
 * `PostEditor` renders and drives the control correctly for a given controller state.
 */
describe("Slug-collision override (tri-state)", () => {
  it("renders nothing when there is no slug collision", () => {
    renderPostEditor({ hasSlugCollision: false });
    expect(document.querySelector('[data-agent-element="post-override-theme-page"]')).not.toBeInTheDocument();
  });

  it("selects 'Use the default' when overridesThemePage is null (never decided)", () => {
    renderPostEditor({ hasSlugCollision: true, overridesThemePage: null });
    const select = document.querySelector('[data-agent-element="post-override-theme-page"]') as HTMLSelectElement;
    expect(select).toBeInTheDocument();
    expect(select.value).toBe("default");
    // The copy must no longer claim the theme page wins by default — that became false 2026-08-15.
    expect(screen.getByText(/this post is shown at that url instead of the theme's page/i)).toBeInTheDocument();
  });

  it("selects 'Always show this post' when overridesThemePage is explicitly true", () => {
    renderPostEditor({ hasSlugCollision: true, overridesThemePage: true });
    const select = document.querySelector('[data-agent-element="post-override-theme-page"]') as HTMLSelectElement;
    expect(select.value).toBe("post");
  });

  it("selects \"Always show the theme's page\" when overridesThemePage is explicitly false", () => {
    renderPostEditor({ hasSlugCollision: true, overridesThemePage: false });
    const select = document.querySelector('[data-agent-element="post-override-theme-page"]') as HTMLSelectElement;
    expect(select.value).toBe("theme");
  });

  it("choosing 'Use the default' calls setOverridesThemePage(null), not false", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ hasSlugCollision: true, overridesThemePage: true });
    await user.selectOptions(
      document.querySelector('[data-agent-element="post-override-theme-page"]') as HTMLSelectElement,
      "default"
    );
    expect(ctrl.setOverridesThemePage).toHaveBeenCalledWith(null);
  });

  it("choosing 'Always show this post' calls setOverridesThemePage(true)", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ hasSlugCollision: true, overridesThemePage: null });
    await user.selectOptions(
      document.querySelector('[data-agent-element="post-override-theme-page"]') as HTMLSelectElement,
      "post"
    );
    expect(ctrl.setOverridesThemePage).toHaveBeenCalledWith(true);
  });

  it("choosing \"Always show the theme's page\" calls setOverridesThemePage(false)", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderPostEditor({ hasSlugCollision: true, overridesThemePage: null });
    await user.selectOptions(
      document.querySelector('[data-agent-element="post-override-theme-page"]') as HTMLSelectElement,
      "theme"
    );
    expect(ctrl.setOverridesThemePage).toHaveBeenCalledWith(false);
  });
});
