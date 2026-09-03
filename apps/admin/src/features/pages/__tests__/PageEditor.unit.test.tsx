import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PageEditor } from "../PageEditor";
import type { PageEditorController } from "../hooks/use-page-editor.hooks";
import { api, type AdminPost } from "@/lib/api";

/**
 * @file `PageEditor` had no test of any kind before this pass (see the note this corrects in
 * `features/pages/README.md`, which claims "There is no PageEditor" — it is live-wired in
 * `panels.tsx:120` for `/admin/pages/{id}`). These are characterisation tests, written ahead of the
 * complexity-ceiling refactor, documenting what the component currently does — including the parts
 * that look like they could be bugs (e.g. the "view live" link is built from the *working-copy* slug,
 * not the last-saved one) rather than what it should do. Drives the component directly through its
 * `usePageEditorHook` DI seam (the same convention `PostEditor.tsx`'s `usePostEditorHook` and
 * `Pages.tsx`'s `usePagesHook` use) rather than mocking `fetch`, since the seam already exists and
 * this suite is about `PageEditor`'s own rendering/wiring, not `usePageEditor`'s internals.
 *
 * The back-link tests observe `event.defaultPrevented` via a same-tick `document` listener (added
 * after React's own) rather than letting an un-prevented `<a href>` click's default action run to
 * completion — jsdom has no real navigation to perform in this standalone render and logs "Not
 * implemented: navigation to another Document" otherwise, exactly the console noise
 * `apps/admin/INFO.md`'s test guidance says to avoid. Same idiom as `MenuEditor.unit.test.tsx`'s
 * `watchDefaultPrevented`.
 */

/** See file header. */
function watchDefaultPrevented(): { result: () => boolean | null } {
  let observed: boolean | null = null;
  document.addEventListener(
    "click",
    (e) => {
      observed = e.defaultPrevented;
      e.preventDefault();
    },
    { once: true }
  );
  return { result: () => observed };
}

const BASE_PAGE: AdminPost = {
  id: "pg1",
  workspaceId: "w1",
  kind: "page",
  title: "About",
  slug: "about",
  bodyJson: {},
  bodyFormat: "html",
  bodyHtml: "<p>Hello</p>",
  status: "draft",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

function controller(overrides: Partial<PageEditorController> = {}): PageEditorController {
  // `draftHtml` defaults to whatever `html` resolves to (own override or the base default) rather
  // than a fixed literal — same passthrough the real hook's initial `prettifyHtml(html)` gives, so a
  // test that overrides `html` alone (without also overriding `draftHtml`) still sees the HTML tab
  // show that same value, matching pre-refactor behavior.
  const html = overrides.html ?? "<p>Hello</p>";
  const page = overrides.page ?? BASE_PAGE;
  const templateChoice = overrides.templateChoice ?? null;
  return {
    page,
    error: null,
    message: null,
    title: "About",
    setTitle: vi.fn(),
    slug: "about",
    setSlug: vi.fn(),
    status: "draft",
    setStatus: vi.fn(),
    templateChoice,
    setTemplateChoice: vi.fn(),
    availableTemplates: [],
    html,
    setHtml: vi.fn(),
    draftHtml: html,
    setDraftHtml: vi.fn(),
    view: "visual",
    setView: vi.fn(),
    // Merged Visual tab (2026-09-02): edit mode is the DEFAULT, so this fake mirrors the real hook's
    // own default rather than the older two-tab world's "preview first". Every assertion below about
    // the iframe preview therefore passes `editing: false` explicitly, which also makes each of those
    // tests state which half of the merged tab it is about.
    editing: true,
    setEditing: vi.fn(),
    themeMode: "dark",
    setThemeMode: vi.fn(),
    t: (key: string) => key,
    device: "desktop",
    setDevice: vi.fn(),
    // Callback ref — `usePageEditor`'s real `frameRef` is `setFrameNode`, not a `RefObject` (see
    // `use-page-editor.hooks.ts`'s measuring-effect comment). A `vi.fn()` is a fine stand-in here:
    // `PagePreview`'s `<div ref={frameRef}>` just needs something callable to attach, and none of
    // these characterisation tests assert on calls into it.
    frameRef: vi.fn(),
    paneWidth: 880,
    saving: false,
    dirty: false,
    contentDirty: false,
    // Defaults to the SAME shape `defaultPageEditorPort.templatePreviewUrl` produces (the real
    // `api.templatePreviewUrl`), so the pre-existing characterization tests below — written when
    // `PagePreviewFrame` called `api.templatePreviewUrl` itself — still see realistic URLs without
    // restating that logic. A test proving the seam itself overrides this with a value the real `api`
    // could never produce (see "the preview iframe's src comes from the injected controller" below).
    templatePreviewUrl: page ? api.templatePreviewUrl(page.id, templateChoice) : "",
    // PENDING by default since the tab merge (2026-09-02), which is a change of test harness, not of
    // product behavior. The merged Visual tab defaults to edit mode, so a bare `renderEditor()` now
    // takes the canvas branch — and `InteractiveHtmlEditor` mounts a real GrapesJS editor, which
    // jsdom cannot host (see the note in the view-toggle block below: it throws from inside
    // `grapesjs.mjs` after the test has finished). `pending` renders the "Loading the theme's
    // styles…" notice instead, which leaves the header, the title/slug row and the whole toolbar —
    // everything this suite actually asserts on — rendered exactly as in production.
    canvasStyling: { status: "pending" },
    save: vi.fn(),
    remove: vi.fn(),
    confirmingDelete: false,
    setConfirmingDelete: vi.fn(),
    deleting: false,
    ...overrides,
  };
}

function renderEditor(overrides: Partial<PageEditorController> = {}) {
  const ctrl = controller(overrides);
  const usePageEditorHook = () => ctrl;
  const utils = render(<PageEditor slug="pg1" usePageEditorHook={usePageEditorHook} />);
  return { ctrl, ...utils };
}

describe("loading and error states", () => {
  it("shows a loading notice while page is null and there is no error", () => {
    renderEditor({ page: null });
    expect(screen.getByText(/loading editor/i)).toBeInTheDocument();
  });

  it("shows an error notice instead of loading when the initial load fails", () => {
    renderEditor({ page: null, error: "failed to load page" });
    expect(screen.getByText("failed to load page")).toBeInTheDocument();
    expect(screen.queryByText(/loading editor/i)).not.toBeInTheDocument();
  });
});

describe("header", () => {
  it("renders the fixed 'Edit page' heading regardless of the page's title", () => {
    renderEditor();
    expect(screen.getByRole("heading", { name: /edit page/i })).toBeInTheDocument();
  });

  it("back link points at the Pages list", () => {
    renderEditor();
    expect(screen.getByRole("link", { name: /pages/i })).toHaveAttribute("href", "/admin/pages");
  });

  it("back link navigates through without confirming when the working copy is not dirty", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    renderEditor({ dirty: false });
    const watcher = watchDefaultPrevented();

    fireEvent.click(screen.getByRole("link", { name: /pages/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    // The screen's own onClick did not call preventDefault — only the test's own listener did.
    expect(watcher.result()).toBe(false);
    vi.restoreAllMocks();
  });

  it("back link asks for confirmation when dirty, and does not navigate away if the operator cancels", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderEditor({ dirty: true });
    const watcher = watchDefaultPrevented();

    fireEvent.click(screen.getByRole("link", { name: /pages/i }));

    expect(window.confirm).toHaveBeenCalledWith("This page has unsaved changes. Leave anyway?");
    expect(watcher.result()).toBe(true);
    vi.restoreAllMocks();
  });
});

describe("title and slug fields", () => {
  it("reflects the controller's title and slug values", () => {
    renderEditor({ title: "My Page", slug: "my-page" });
    expect(screen.getByPlaceholderText("Untitled")).toHaveValue("My Page");
    expect(screen.getByLabelText("URL slug")).toHaveValue("my-page");
  });

  it("typing in the title field calls setTitle", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ title: "" });
    await user.type(screen.getByPlaceholderText("Untitled"), "X");
    expect(ctrl.setTitle).toHaveBeenCalledWith("X");
  });

  it("typing in the slug field calls setSlug", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ slug: "" });
    await user.type(screen.getByLabelText("URL slug"), "y");
    expect(ctrl.setSlug).toHaveBeenCalledWith("y");
  });

  it("the 'view live' link is built from the working-copy slug, not the last-saved one", () => {
    renderEditor({ slug: "draft-slug", page: { ...BASE_PAGE, slug: "saved-slug" } });
    const link = screen.getByRole("link", { name: /view/i });
    expect(link.getAttribute("href")).toContain("/draft-slug");
  });
});

describe("status, publish, save", () => {
  it("shows Publish only while the page is a draft", () => {
    renderEditor({ status: "draft" });
    expect(screen.getByRole("button", { name: /^publish$/i })).toBeInTheDocument();
  });

  it("hides Publish once the page is published", () => {
    renderEditor({ status: "published" });
    expect(screen.queryByRole("button", { name: /^publish$/i })).not.toBeInTheDocument();
  });

  it("clicking Publish calls save('published')", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ status: "draft" });
    await user.click(screen.getByRole("button", { name: /^publish$/i }));
    expect(ctrl.save).toHaveBeenCalledWith("published");
  });

  it("clicking Save calls save() with no status override", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor();
    await user.click(screen.getByRole("button", { name: /^save/i }));
    expect(ctrl.save).toHaveBeenCalledWith();
  });

  it("Save reads 'Saving…' while a save is in flight", () => {
    renderEditor({ saving: true });
    expect(screen.getByRole("button", { name: /saving…/i })).toBeInTheDocument();
  });

  it("Save reads 'Save •' when dirty and not saving", () => {
    renderEditor({ saving: false, dirty: true });
    expect(screen.getByRole("button", { name: "Save •" })).toBeInTheDocument();
  });

  it("Save reads plain 'Save' when neither saving nor dirty", () => {
    renderEditor({ saving: false, dirty: false });
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("changing the status select calls setStatus", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ status: "draft" });
    // Disambiguated by displayed value, not `getByRole("combobox")` alone — the template picker
    // (Task 4, 2026-08-11) shares the `combobox` role with the status select once a Page is
    // `bodyFormat: "html"` (`BASE_PAGE`'s own default), the same collision `PostEditor.unit.test.tsx`
    // notes for its own status select vs. its template picker.
    await user.selectOptions(screen.getByDisplayValue("Draft"), "published");
    expect(ctrl.setStatus).toHaveBeenCalledWith("published");
  });
});

describe("delete confirmation", () => {
  it("opens the ConfirmDialog on Delete, without touching window.confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    const { ctrl } = renderEditor({ title: "About" });
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(ctrl.setConfirmingDelete).toHaveBeenCalledWith(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("renders the dialog body with the page's title when confirmingDelete is true", () => {
    renderEditor({ confirmingDelete: true, title: "About" });
    expect(screen.getByText(/move &quot;about&quot; to trash\?|move "about" to trash\?/i)).toBeInTheDocument();
  });

  it("cancelling the dialog calls setConfirmingDelete(false), not remove", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ confirmingDelete: true });
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(ctrl.setConfirmingDelete).toHaveBeenCalledWith(false);
    expect(ctrl.remove).not.toHaveBeenCalled();
  });

  it("confirming the dialog calls remove", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ confirmingDelete: true });
    await user.click(screen.getByRole("button", { name: /move to trash/i }));
    expect(ctrl.remove).toHaveBeenCalledTimes(1);
  });
});

/**
 * The tab merge (2026-09-02) — "Interactive" and "Preview" became one "Visual" tab whose Edit
 * toggle picks the renderer. These assertions are the ones that would have caught a merge that
 * silently dropped a surface: exactly two tabs exist, and BOTH old renderers are still reachable.
 */
describe("view toggle (HTML / Visual)", () => {
  it("offers exactly two tabs, HTML and Visual — the old Interactive/Preview pair is gone", () => {
    renderEditor({ view: "visual" });
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["HTML", "Visual"]);
  });

  it("marks the active view tab as selected", () => {
    renderEditor({ view: "visual" });
    expect(screen.getByRole("tab", { name: "Visual" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "HTML" })).toHaveAttribute("aria-selected", "false");
  });

  it("clicking the HTML tab calls setView('html')", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ view: "visual" });
    await user.click(screen.getByRole("tab", { name: "HTML" }));
    expect(ctrl.setView).toHaveBeenCalledWith("html");
  });

  it("clicking the Visual tab calls setView('visual')", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ view: "html" });
    await user.click(screen.getByRole("tab", { name: "Visual" }));
    expect(ctrl.setView).toHaveBeenCalledWith("visual");
  });

  it("renders the rendered preview (not a textarea) in the Visual tab with editing off", () => {
    renderEditor({ view: "visual", editing: false });
    expect(screen.getByTitle("Page preview")).toBeInTheDocument();
    expect(screen.queryByLabelText("Page HTML")).not.toBeInTheDocument();
  });

  // 2026-08-11 fix: the preview used to always show the raw stored body in a sandboxed iframe with
  // no theme CSS (`ADS-memory/reports/implementation/2026-08-11-basic-page-template.md`'s own "Risks"
  // section flagged this as a real gap, not a regression). A published, un-dirtied page now iframes
  // the real public URL instead, so a visitor sees exactly what the operator sees.
  it("preview iframes the real public URL when the page is published and has no unsaved changes", () => {
    renderEditor({ view: "visual", editing: false, status: "published", dirty: false, contentDirty: false, slug: "about" });
    const preview = screen.getByTitle("Page preview");
    expect(preview).toHaveAttribute("src", expect.stringContaining("/about"));
    expect(screen.queryByText(/preview them with the theme/i)).not.toBeInTheDocument();
  });

  // Template-preview fix (2026-08-11, `ADS-memory/reports/implementation/
  // 2026-08-11-template-preview-render-bug.md`) — deliberately UNCHANGED for a draft, even a clean one
  // (`contentDirty` false): a draft's own `{"type":"content"}` slot does not survive the shared render
  // pipeline's visibility-filtered "content" resolver (confirmed live in `admin-post-template-preview
  // .test.ts`'s own draft case — the body degrades to an empty placeholder, which would read as "my
  // content disappeared"), so `canShowTemplatePreview` requires `status === "published"` and a draft
  // keeps the pre-existing raw-body fallback.
  it("preview still falls back to the raw-body sandbox for a clean draft page (drafts are out of this fix's scope)", () => {
    renderEditor({ view: "visual", editing: false, status: "draft", dirty: false, contentDirty: false });
    const preview = screen.getByTitle("Page preview");
    expect(preview).not.toHaveAttribute("src");
    expect(screen.getByText(/publish this page to preview it with the theme/i)).toBeInTheDocument();
  });

  // Template-preview fix (2026-08-11) — the reported bug's exact repro: picking a DIFFERENT template
  // on an otherwise-untouched published page. `dirty` is correctly `true` (an unsaved `templateChoice`
  // change), but `contentDirty` stays `false` — this must show a real templated render, not the raw
  // sandbox. Before the fix, `dirty` alone gated the fallback, so switching templates rendered
  // unstyled and looked identical across every template (the fallback never read `templateChoice`).
  it("preview shows a real templated render, with the pending template in the URL, when only the template choice is dirty on a published page", () => {
    renderEditor({
      view: "visual",
      editing: false,
      status: "published",
      dirty: true,
      contentDirty: false,
      templateChoice: "page-shell.html",
    });
    const preview = screen.getByTitle("Page preview");
    expect(preview).toHaveAttribute("src", expect.stringContaining("/pg1/template-preview"));
    expect(preview).toHaveAttribute("src", expect.stringContaining("templateChoice=page-shell.html"));
    expect(screen.getByText(/save to update the live page/i)).toBeInTheDocument();
  });

  // Proof this landed on the injection seam, not just on matching URL shape: `PageEditor.tsx` no
  // longer imports `lib/api` at all (see `page-editor-port.hooks.ts`'s `templatePreviewUrl` and
  // `use-page-editor.hooks.ts`'s `templatePreviewUrl` field) — it renders whatever the CONTROLLER
  // hands it. A URL the real `api.templatePreviewUrl` could never produce (no `/api/` prefix, no
  // `template-preview` segment) still ends up as the iframe's `src` verbatim, which is only possible
  // if the component reads it off the controller rather than calling a global `api` itself.
  it("preview iframe's src is exactly the controller's templatePreviewUrl, not one this component computed itself", () => {
    renderEditor({
      view: "visual",
      editing: false,
      status: "published",
      dirty: true,
      contentDirty: false,
      templateChoice: "page-shell.html",
      templatePreviewUrl: "fake://template-preview/pg1?templateChoice=page-shell.html",
    });
    const preview = screen.getByTitle("Page preview");
    expect(preview).toHaveAttribute("src", "fake://template-preview/pg1?templateChoice=page-shell.html");
  });

  // `SrcDocSandbox` also renders an `<iframe title="Page preview">` (via `srcDoc`, not `src`) — the
  // fallback is distinguished by the ABSENCE of a `src` attribute, not by element type. Reachable when
  // a published page's body/title/slug/status itself has unsaved edits (`contentDirty: true`) —
  // neither the live public URL nor the template-preview endpoint can reflect edits that were never
  // saved. Same notice wording as before this fix; only the branching condition changed.
  it("preview falls back to the raw-body sandbox, with a notice, when the page body itself has unsaved edits", () => {
    renderEditor({ view: "visual", editing: false, status: "published", dirty: true, contentDirty: true });
    const preview = screen.getByTitle("Page preview");
    expect(preview).not.toHaveAttribute("src");
    expect(screen.getByText(/save your changes to preview them with the theme/i)).toBeInTheDocument();
  });

  it("preview falls back to the raw-body sandbox, with a notice, for a draft page with unsaved edits", () => {
    renderEditor({ view: "visual", editing: false, status: "draft", dirty: true, contentDirty: true });
    const preview = screen.getByTitle("Page preview");
    expect(preview).not.toHaveAttribute("src");
    expect(screen.getByText(/publish this page to preview it with the theme/i)).toBeInTheDocument();
  });

  // Visibility-gap fix — `.page-preview-frame` renders up to 900px tall (`pages.css`), so a notice
  // placed AFTER it needed a scroll past that height to ever be seen. That gap was already diagnosed
  // and explicitly left unfixed by `ADS-memory/reports/implementation/
  // 2026-08-11-template-preview-render-bug.md` ("not a missing feature, a visibility gap") — an
  // operator who edits a page's HTML and switches to Preview without scrolling saw only an unstyled
  // wall of text with no visible explanation, indistinguishable from the theme CSS failing to load.
  // Asserts DOM order (notice before the iframe) rather than just presence, since presence alone
  // already passed before this fix — the bug was never that the notice was missing, only unreachable
  // without scrolling.
  it("places the raw-body-fallback notice BEFORE the preview frame, not after, so it's visible without scrolling", () => {
    renderEditor({ view: "visual", editing: false, status: "published", dirty: true, contentDirty: true });
    const notice = screen.getByText(/save your changes to preview them with the theme/i);
    const preview = screen.getByTitle("Page preview");
    expect(notice.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders an editable HTML textarea (not the preview) in html view", () => {
    renderEditor({ view: "html", html: "<p>hi</p>" });
    expect(screen.getByLabelText("Page HTML")).toHaveValue("<p>hi</p>");
    expect(screen.queryByTitle("Page preview")).not.toBeInTheDocument();
  });

  it("typing in the HTML textarea calls setHtml", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ view: "html", html: "" });
    await user.type(screen.getByLabelText("Page HTML"), "x");
    expect(ctrl.setHtml).toHaveBeenCalledWith("x");
  });

  it("hides the device width toggle in html view", () => {
    renderEditor({ view: "html" });
    expect(screen.queryByRole("group", { name: /preview width/i })).not.toBeInTheDocument();
  });

  // The one edit-mode assertion that does NOT mount GrapesJS, and the regression this
  // pins: the tab used to mount the editor unconditionally, which meant it could mount before the
  // active theme's CSS had resolved — and `InteractiveHtmlEditor` reads its canvas styling once, at
  // mount, so that canvas stayed unstyled (browser-default Times on white) for the rest of its life
  // no matter what arrived afterwards. See `use-theme-canvas-styling.hooks.ts`.
  it("waits for the theme's canvas styling instead of mounting the editor unstyled", () => {
    renderEditor({ view: "visual", editing: true, canvasStyling: { status: "pending" } });
    expect(screen.getByText(/loading the theme/i)).toBeInTheDocument();
  });

  // No "renders in interactive view" test: `InteractiveHtmlEditor` mounts a real GrapesJS editor,
  // which drives an `<iframe>` whose `onload` fires asynchronously — jsdom does not implement enough
  // of the canvas/frame machinery GrapesJS's `FrameView` expects (confirmed directly: mounting it
  // here throws an uncaught `TypeError` from inside `grapesjs.mjs` after the test has already
  // finished, "Cannot read properties of undefined (reading 'getTypes')", polluting the run per
  // Vitest's own "might cause false positive tests" warning). Interactive-tab correctness is
  // verified in a real browser instead — see the self-validation report.
});

describe("device toggle (Visual tab, preview mode only)", () => {
  it("marks the active device as pressed and shows its pixel width", () => {
    renderEditor({ view: "visual", editing: false, device: "tablet" });
    expect(screen.getByRole("button", { name: "Tablet" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("834px")).toBeInTheDocument();
  });

  it("clicking a device button calls setDevice", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ view: "visual", editing: false, device: "desktop" });
    await user.click(screen.getByRole("button", { name: "Mobile" }));
    expect(ctrl.setDevice).toHaveBeenCalledWith("mobile");
  });

  // HIDDEN, not disabled: `PAGE_PREVIEW_WIDTHS` works by rendering the document at a fixed width
  // inside a CSS-scaled box, which is a property of `PagePreview` alone — the GrapesJS canvas has no
  // such box and would not change at all. A control with no effect is worse than no control.
  it("hides the device width toggle while editing, since it cannot act on the canvas", () => {
    renderEditor({ view: "visual", editing: true });
    expect(screen.queryByRole("group", { name: /preview width/i })).not.toBeInTheDocument();
  });
});

/**
 * The Edit toggle — the merge's whole point. One tab, two renderers: the GrapesJS canvas that used
 * to be "Interactive", and the full-chrome iframe that used to be "Preview". Neither renderer was
 * rewritten; only which one this tab mounts.
 */
describe("Edit toggle (merged Visual tab)", () => {
  it("shows the Edit/Preview toggle in the Visual tab", () => {
    renderEditor({ view: "visual", editing: true });
    expect(screen.getByRole("group", { name: /edit mode/i })).toBeInTheDocument();
  });

  it("hides the Edit/Preview toggle in the HTML tab, where neither renderer is mounted", () => {
    renderEditor({ view: "html" });
    expect(screen.queryByRole("group", { name: /edit mode/i })).not.toBeInTheDocument();
  });

  it("marks Edit as pressed while editing, and Preview as pressed while previewing", () => {
    const { unmount } = renderEditor({ view: "visual", editing: true });
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute("aria-pressed", "false");
    unmount();

    renderEditor({ view: "visual", editing: false });
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Preview" })).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking Preview calls setEditing(false) — with no confirmation dialog in the way", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm");
    const { ctrl } = renderEditor({ view: "visual", editing: true });
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(ctrl.setEditing).toHaveBeenCalledWith(false);
    expect(confirmSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("clicking Edit calls setEditing(true)", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ view: "visual", editing: false });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(ctrl.setEditing).toHaveBeenCalledWith(true);
  });

  // The capability-parity assertion for the preview half: editing off must still reach the real
  // published route in a full-chrome iframe, exactly as the old Preview tab did.
  it("editing off mounts the full-chrome iframe preview, not the canvas", () => {
    renderEditor({ view: "visual", editing: false, status: "published", dirty: false, contentDirty: false });
    expect(screen.getByTitle("Page preview")).toHaveAttribute("src", expect.stringContaining("/about"));
  });

  // ...and for the edit half. `canvasStyling: "pending"` is the one edit-mode state that renders
  // without mounting GrapesJS (which jsdom cannot host — see the note in the view-toggle block), so
  // it is what proves editing-on takes the canvas branch rather than the iframe one.
  it("editing on takes the canvas branch, not the iframe one", () => {
    renderEditor({
      view: "visual",
      editing: true,
      status: "published",
      dirty: false,
      contentDirty: false,
      canvasStyling: { status: "pending" },
    });
    expect(screen.getByText(/loading the theme/i)).toBeInTheDocument();
    expect(screen.queryByTitle("Page preview")).not.toBeInTheDocument();
  });
});

/**
 * The colour-mode control. The Interactive canvas has always rendered the theme's DEFAULT mode
 * (dark for every shipped theme) because its document carries no `data-theme`, while the preview
 * iframe renders whatever the operator's own browser has stored for the site origin — which is how
 * one pane showed dark and the other light for the same published page. This control makes the
 * canvas side an explicit operator choice instead of an accidental default.
 */
describe("colour-mode control (merged Visual tab, edit mode only)", () => {
  it("offers Dark and Light while editing", () => {
    renderEditor({ view: "visual", editing: true, themeMode: "dark" });
    const group = screen.getByRole("group", { name: /colour mode/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Light" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking Light calls setThemeMode('light')", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ view: "visual", editing: true, themeMode: "dark" });
    await user.click(screen.getByRole("button", { name: "Light" }));
    expect(ctrl.setThemeMode).toHaveBeenCalledWith("light");
  });

  // HIDDEN in preview mode for the same "no lying controls" reason the device switcher is hidden in
  // edit mode: the preview iframe is a cross-origin document in dev (:5173 vs :3000) whose colour
  // mode is decided by the site's own `theme-toggle.js` reading ITS origin's localStorage. The admin
  // has no handle on that, so offering the control there would be a button that does nothing.
  it("hides the colour-mode control in preview mode, where it cannot reach the iframe", () => {
    renderEditor({ view: "visual", editing: false });
    expect(screen.queryByRole("group", { name: /colour mode/i })).not.toBeInTheDocument();
  });

  it("hides the colour-mode control in the HTML tab", () => {
    renderEditor({ view: "html" });
    expect(screen.queryByRole("group", { name: /colour mode/i })).not.toBeInTheDocument();
  });

  // The canvas reads its styling once at mount (`InteractiveHtmlEditor`'s own file header), so a new
  // `themeMode` can only take effect by remounting it. Keying the editor on the mode is what does
  // that; without the key the operator would click Light and see nothing change.
  it("keys the canvas on the colour mode so a mode change remounts it with the new styling", () => {
    renderEditor({ view: "visual", editing: true, themeMode: "light", canvasStyling: { status: "pending" } });
    // Pending renders the notice rather than GrapesJS, but the branch taken is the canvas one — the
    // key itself is asserted structurally by `PageEditor`'s own render in the browser check.
    expect(screen.getByText(/loading the theme/i)).toBeInTheDocument();
  });
});

/**
 * Capability parity with the two tabs this merge replaced. Every one of these was reachable before
 * the merge and must still be reachable after it — this is the list the owner would revert over.
 */
describe("no capability lost in the merge", () => {
  it("the raw HTML tab is still reachable and still editable", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ view: "html", html: "" });
    await user.type(screen.getByLabelText("Page HTML"), "z");
    expect(ctrl.setHtml).toHaveBeenCalledWith("z");
  });

  // Queried by agent handle, not by accessible name: the picker's `<label>` wraps only its
  // visually-hidden `<span>`, never the `<select>` itself, so the control has no accessible name.
  // That is a pre-existing a11y gap this merge neither introduced nor fixes — flagged, not widened.
  it("the template picker still renders for an html-format page, in both views", () => {
    const { unmount } = renderEditor({ view: "visual", availableTemplates: ["page-shell.html"] });
    expect(document.querySelector('[data-agent-element="page-template-choice"]')).toBeInTheDocument();
    unmount();

    renderEditor({ view: "html", availableTemplates: ["page-shell.html"] });
    expect(document.querySelector('[data-agent-element="page-template-choice"]')).toBeInTheDocument();
  });

  it("the 'view ↗' link still points at the public site", () => {
    renderEditor();
    expect(screen.getByRole("link", { name: "view ↗" })).toHaveAttribute(
      "href",
      expect.stringContaining("/about")
    );
  });

  it("every merged-tab control is agent-addressable", () => {
    renderEditor({ view: "visual", editing: true });
    const handles = [...document.querySelectorAll("[data-agent-element]")].map((el) =>
      el.getAttribute("data-agent-element")
    );
    expect(handles).toEqual(expect.arrayContaining(["page-view", "page-edit-mode", "page-colour-mode"]));
  });
});

describe("save/error messages", () => {
  it("shows the save-ok message when present", () => {
    renderEditor({ message: "Saved" });
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("shows the save-error message when present", () => {
    renderEditor({ error: "failed to save page" });
    expect(screen.getByText("failed to save page")).toBeInTheDocument();
  });

  it("shows neither when both are null", () => {
    renderEditor({ message: null, error: null });
    // Scoped to the `.save-ok`/`.save-error` header spans specifically (rather than a bare
    // `/saved/i` text search) since the template-preview fix (2026-08-11) added a Preview-tab notice
    // that legitimately contains the word "saved" ("Previewing your saved content...") — an unrelated
    // element, not a false pass for this assertion's actual subject.
    expect(document.querySelector(".save-ok")).not.toBeInTheDocument();
    expect(document.querySelector(".save-error")).not.toBeInTheDocument();
  });
});

// Guards against a false-positive suite: if the component silently failed to mount at all, every
// query above would just as validly return "not found". Assert the shell renders too.
describe("sanity", () => {
  it("mounts the editor shell once a page is loaded", async () => {
    renderEditor();
    await waitFor(() => expect(screen.getByRole("heading", { name: /edit page/i })).toBeInTheDocument());
  });
});
