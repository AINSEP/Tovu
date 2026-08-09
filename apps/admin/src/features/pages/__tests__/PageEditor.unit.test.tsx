import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PageEditor } from "../PageEditor";
import type { PageEditorController } from "../hooks/use-page-editor.hooks";
import type { AdminPost } from "../../../lib/api";

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
  return {
    page: BASE_PAGE,
    error: null,
    message: null,
    title: "About",
    setTitle: vi.fn(),
    slug: "about",
    setSlug: vi.fn(),
    status: "draft",
    setStatus: vi.fn(),
    html: "<p>Hello</p>",
    setHtml: vi.fn(),
    view: "preview",
    setView: vi.fn(),
    device: "desktop",
    setDevice: vi.fn(),
    saving: false,
    dirty: false,
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
    await user.selectOptions(screen.getByRole("combobox"), "published");
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

describe("view toggle (Preview / Interactive / HTML)", () => {
  it("marks the active view tab as selected", () => {
    renderEditor({ view: "preview" });
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Interactive" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "HTML" })).toHaveAttribute("aria-selected", "false");
  });

  it("clicking the HTML tab calls setView('html')", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ view: "preview" });
    await user.click(screen.getByRole("tab", { name: "HTML" }));
    expect(ctrl.setView).toHaveBeenCalledWith("html");
  });

  it("clicking the Interactive tab calls setView('interactive')", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ view: "preview" });
    await user.click(screen.getByRole("tab", { name: "Interactive" }));
    expect(ctrl.setView).toHaveBeenCalledWith("interactive");
  });

  it("renders the rendered preview (not a textarea) in preview view", () => {
    renderEditor({ view: "preview" });
    expect(screen.getByTitle("Page preview")).toBeInTheDocument();
    expect(screen.queryByLabelText("Page HTML")).not.toBeInTheDocument();
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

  // No "renders in interactive view" test: `InteractiveHtmlEditor` mounts a real GrapesJS editor,
  // which drives an `<iframe>` whose `onload` fires asynchronously — jsdom does not implement enough
  // of the canvas/frame machinery GrapesJS's `FrameView` expects (confirmed directly: mounting it
  // here throws an uncaught `TypeError` from inside `grapesjs.mjs` after the test has already
  // finished, "Cannot read properties of undefined (reading 'getTypes')", polluting the run per
  // Vitest's own "might cause false positive tests" warning). Interactive-tab correctness is
  // verified in a real browser instead — see the self-validation report.
});

describe("device toggle (preview view only)", () => {
  it("marks the active device as pressed and shows its pixel width", () => {
    renderEditor({ view: "preview", device: "tablet" });
    expect(screen.getByRole("button", { name: "Tablet" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Desktop" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("834px")).toBeInTheDocument();
  });

  it("clicking a device button calls setDevice", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ view: "preview", device: "desktop" });
    await user.click(screen.getByRole("button", { name: "Mobile" }));
    expect(ctrl.setDevice).toHaveBeenCalledWith("mobile");
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
    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument();
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
