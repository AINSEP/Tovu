import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    // Per-tab scroll memory (2026-09-16) — callback refs/handlers, same "a `vi.fn()` stand-in is
    // fine, nothing here asserts on calls into it" reasoning `frameRef` above already documents.
    htmlTextareaRef: vi.fn(),
    onHtmlScroll: vi.fn(),
    onPreviewFrameLoad: vi.fn(),
    view: "preview",
    setView: vi.fn(),
    device: "desktop",
    setDevice: vi.fn(),
    previewExpanded: false,
    togglePreviewExpanded: vi.fn(),
    // Callback ref — `usePageEditor`'s real `frameRef` is `setFrameNode`, not a `RefObject` (see
    // `use-page-editor.hooks.ts`'s measuring-effect comment). A `vi.fn()` is a fine stand-in here:
    // `PagePreview`'s `<div ref={frameRef}>` just needs something callable to attach, and none of
    // these characterisation tests assert on calls into it.
    frameRef: vi.fn(),
    paneWidth: 880,
    saving: false,
    t: (key) => key,
    dirty: false,
    contentDirty: false,
    // Defaults to the SAME shape `defaultPageEditorPort.templatePreviewUrl` produces (the real
    // `api.templatePreviewUrl`), so the pre-existing characterization tests below — written when
    // `PagePreviewFrame` called `api.templatePreviewUrl` itself — still see realistic URLs without
    // restating that logic. A test proving the seam itself overrides this with a value the real `api`
    // could never produce (see "the preview iframe's src comes from the injected controller" below).
    templatePreviewUrl: page ? api.templatePreviewUrl(page.id, templateChoice) : "",
    previewFormRef: { current: null },
    previewFormTarget: page ? `page-preview-pending-${page.id}` : "",
    // Settled-with-no-styling by default: the Interactive tab then mounts a real GrapesJS editor
    // exactly as it did before canvas styling existed, so no test here has to wait on a theme fetch.
    canvasStyling: { status: "ready", styling: {} },
    save: vi.fn(),
    saveConflict: null,
    saveOverwritingConflict: vi.fn(),
    dismissSaveConflict: vi.fn(),
    remove: vi.fn(),
    confirmingDelete: false,
    setConfirmingDelete: vi.fn(),
    deleting: false,
    // Mirrors `useDirtyGuard.confirmLeave`'s real behavior (message text included) closely enough
    // for these characterization tests: gated on the SAME `dirty` override every pre-existing
    // back-link test here already sets, calling through to `window.confirm` exactly like the real
    // hook does, rather than a fixed stub that would stop proving the component actually reads
    // `confirmLeave` off the controller.
    confirmLeave: () => !(overrides.dirty ?? false) || window.confirm("You have unsaved changes. Leave without saving?"),
    recoverableDraft: null,
    restoreRecoveredDraft: vi.fn(),
    discardRecoveredDraft: vi.fn(),
    // Stale basis (2026-09-06). `null` is "autosave is healthy", so the notice never renders in the
    // pre-existing tests here — its own suite below overrides it.
    autosaveStaleBasis: null,
    // Content refresh (2026-09-16). `null` is required, not merely defaulted to it: an override
    // object missing this key entirely reads as `undefined !== null`, which would render the
    // external-change notice in EVERY pre-existing test above — see this feature's plan doc for why
    // this line is called out explicitly.
    pendingExternalVersion: null,
    loadExternalChange: vi.fn(),
    dismissExternalChange: vi.fn(),
    contentRevision: 0,
    // Bug A / interactive-bugs plan Slice A3 — no pre-existing test drives the Interactive surface's
    // placeholder card, so an inert stub is enough; a test that needs a real descriptor overrides it.
    embedPlaceholderDescriber: () => undefined,
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

    expect(window.confirm).toHaveBeenCalledWith("You have unsaved changes. Leave without saving?");
    expect(watcher.result()).toBe(true);
    vi.restoreAllMocks();
  });
});

/** Standing-draft autosave (2026-09-06) — the recovery banner. `usePageEditor`'s own scheduling/
 *  ordering behavior is proven at the hook level; this is purely "does the component render/wire
 *  what the controller hands it". */
describe("standing-draft autosave recovery banner", () => {
  const RECOVERABLE = {
    bodyFormat: "html" as const,
    bodyHtml: "<p>recovered</p>",
    title: "Recovered title",
    slug: "recovered-slug",
    baseVersion: 1,
    savedAt: "2026-09-06T00:05:00.000Z",
    savedByPrincipalId: "user-local",
  };

  it("renders nothing when there is no recoverable draft", () => {
    renderEditor({ recoverableDraft: null });
    expect(screen.queryByText(/unsaved changes from/i)).not.toBeInTheDocument();
  });

  it("shows the banner with Restore/Discard actions when a draft was recovered", () => {
    renderEditor({ recoverableDraft: RECOVERABLE, page: { ...BASE_PAGE, version: 1 } });
    expect(screen.getByText(/unsaved changes from/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restore/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument();
  });

  it("labels a stale draft (baseVersion behind the loaded page's version) instead of implying it is current", () => {
    renderEditor({ recoverableDraft: RECOVERABLE, page: { ...BASE_PAGE, version: 2 } });
    expect(screen.getByText(/before a newer save/i)).toBeInTheDocument();
  });

  it("clicking Restore calls the controller's restoreRecoveredDraft", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ recoverableDraft: RECOVERABLE });
    await user.click(screen.getByRole("button", { name: /restore/i }));
    expect(ctrl.restoreRecoveredDraft).toHaveBeenCalledTimes(1);
  });

  it("clicking Discard calls the controller's discardRecoveredDraft", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ recoverableDraft: RECOVERABLE });
    await user.click(screen.getByRole("button", { name: /discard/i }));
    expect(ctrl.discardRecoveredDraft).toHaveBeenCalledTimes(1);
  });
});

/**
 * Standing-draft autosave — the STALE-BASIS notice (2026-09-06). Distinct from the recovery banner
 * above: that one offers work found parked from a PREVIOUS session, this one reports that the
 * server is refusing writes for the session happening right now. `usePageEditor` decides when
 * (`autosaveStaleBasis`) and `rules.ts` decides what it says; this proves the component renders it
 * at all, which is precisely the gap that existed — the hook recorded the refusal and no editor
 * consumed it, so the operator was told nothing until they reloaded.
 */
describe("standing-draft autosave stale-basis notice", () => {
  const STALE = {
    baseVersion: 1,
    draft: {
      bodyFormat: "html" as const,
      bodyHtml: "<p>still being typed</p>",
      title: "About",
      slug: "about",
      baseVersion: 1,
    },
  };

  it("renders nothing while autosave is healthy", () => {
    renderEditor({ autosaveStaleBasis: null });
    expect(screen.queryByText(/someone else saved this/i)).not.toBeInTheDocument();
  });

  it("tells the operator autosaving has paused, their work is unsaved, and it is still in the editor", () => {
    renderEditor({ autosaveStaleBasis: STALE });
    const notice = screen.getByText(/someone else saved this while you were editing/i);
    expect(notice).toHaveTextContent(/version 1/);
    expect(notice).toHaveTextContent(/autosaving has paused/i);
    expect(notice).toHaveTextContent(/were NOT saved/);
    expect(notice).toHaveTextContent(/still here in the editor/i);
  });

  /** Deliberately no Dismiss, and deliberately no Reload button — see `PageAutosaveStaleBanner`'s
   *  own doc. This asserts the absence, because "add a Dismiss" is the obvious next change and it
   *  would put the operator back in the silent state this whole fix exists to end. */
  it("offers no button that could silence it or discard the operator's text", () => {
    const { container } = renderEditor({ autosaveStaleBasis: STALE });
    const region = container.querySelector('[data-agent-element="page-autosave-stale"]');
    expect(region).not.toBeNull();
    expect(region!.querySelectorAll("button")).toHaveLength(0);
  });
});

/**
 * The version-conflict banner (2026-09-07, audit claim #1). The refusal itself is proven in
 * `use-page-editor.unit.test.ts`; this covers the SINK — that the controller's `saveConflict`
 * actually reaches a rendered banner and that its two buttons are wired to the two controller
 * actions, rather than to nothing.
 */
describe("version-conflict banner", () => {
  const CONFLICT = { expectedVersion: 1, currentVersion: 2, attemptedStatus: undefined } as const;

  it("states that the work was not saved, is still in the editor, and that saving again replaces theirs", () => {
    renderEditor({ saveConflict: { ...CONFLICT } });
    const notice = screen.getByText(/someone else saved this while you were editing/i);
    expect(notice).toHaveTextContent(/version 1/);
    expect(notice).toHaveTextContent(/version 2/);
    expect(notice).toHaveTextContent(/were NOT saved/);
    expect(notice).toHaveTextContent(/still here in the editor/i);
    expect(notice).toHaveTextContent(/will replace their version/i);
  });

  it("renders nothing at all when there is no conflict", () => {
    const { container } = renderEditor();
    expect(container.querySelector('[data-agent-element="page-version-conflict"]')).toBeNull();
  });

  it('"Save anyway" calls saveOverwritingConflict, and nothing else', async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ saveConflict: { ...CONFLICT } });
    await user.click(screen.getByRole("button", { name: "Save anyway" }));
    expect(ctrl.saveOverwritingConflict).toHaveBeenCalledTimes(1);
    expect(ctrl.dismissSaveConflict).not.toHaveBeenCalled();
    expect(ctrl.save).not.toHaveBeenCalled();
  });

  it('"Keep editing" dismisses without writing anything', async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ saveConflict: { ...CONFLICT } });
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(ctrl.dismissSaveConflict).toHaveBeenCalledTimes(1);
    expect(ctrl.saveOverwritingConflict).not.toHaveBeenCalled();
    expect(ctrl.save).not.toHaveBeenCalled();
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

  // Regression (2026-09-03): a Page can now claim the literal root slug "/" (post.ts's ROOT_SLUG,
  // gated to kind: "page"). A naive `/${slug}` template doubles that into "//" — a link the site's
  // router can never match ("Cannot GET //", confirmed live in a browser before this fix). Asserts
  // the href ends in a single trailing slash, not two.
  it("the 'view live' link renders a single '/' for the root-slug page, not '//'", () => {
    renderEditor({ slug: "/" });
    const link = screen.getByRole("link", { name: /view/i });
    expect(link.getAttribute("href")).toMatch(/\/$/);
    expect(link.getAttribute("href")).not.toMatch(/\/\/$/);
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

  /** This `.segmented` row is hand-rolled `role="tablist"`/`role="tab"` markup, not a `<TabBar>`,
   *  so a35ce9f12's keyboard fix did not reach it: a keyboard user had to Tab through all three
   *  view buttons instead of arrowing between them, and every one of them was its own tab stop. */
  it("ArrowRight moves to the next view tab and takes focus with it", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ view: "html" });

    screen.getByRole("tab", { name: "HTML" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(ctrl.setView).toHaveBeenCalledWith("interactive");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Interactive" }));
  });

  it("End moves to the last view tab and Home back to the first", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ view: "html" });

    screen.getByRole("tab", { name: "HTML" }).focus();
    await user.keyboard("{End}");
    expect(ctrl.setView).toHaveBeenLastCalledWith("preview");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Preview" }));

    await user.keyboard("{Home}");
    expect(ctrl.setView).toHaveBeenLastCalledWith("html");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "HTML" }));
  });

  it("keeps one roving tab stop: only the active view tab is in the native Tab order", () => {
    renderEditor({ view: "preview" });

    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "HTML" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tab", { name: "Interactive" })).toHaveAttribute("tabindex", "-1");
  });

  it("renders the rendered preview (not a textarea) in preview view", () => {
    renderEditor({ view: "preview" });
    expect(screen.getByTitle("Page preview")).toBeInTheDocument();
    expect(screen.queryByLabelText("Page HTML")).not.toBeInTheDocument();
  });

  // 2026-08-11 fix: the preview used to always show the raw stored body in a sandboxed iframe with
  // no theme CSS (`ADS-memory/reports/implementation/2026-08-11-basic-page-template.md`'s own "Risks"
  // section flagged this as a real gap, not a regression). A published, un-dirtied page now iframes
  // the real public URL instead, so a visitor sees exactly what the operator sees.
  it("preview iframes the real public URL when the page is published and has no unsaved changes", () => {
    renderEditor({ view: "preview", status: "published", dirty: false, contentDirty: false, slug: "about" });
    const preview = screen.getByTitle("Page preview");
    expect(preview).toHaveAttribute("src", expect.stringContaining("/about"));
    expect(screen.queryByText(/preview them with the theme/i)).not.toBeInTheDocument();
  });

  // Regression (2026-09-03) — same root-slug bug as the "view live" link above, for the "Live site"
  // preview branch (`PagePreviewFrame`'s `canShowLiveSite` case). Before the fix this rendered
  // `src=".../{origin}//"`, which the site served as "Cannot GET //" instead of the Home page.
  // Cache-busting (2026-09-16) appended `?_v=<version>` to this src, so the root-slug regression
  // check can no longer assert "ends in a single slash" — the query string now occupies the end of
  // the string. Re-pointed at the slash immediately BEFORE `?_v=`, which is exactly the character
  // the original "//" bug doubled; `not.toMatch(/\/\/\?/)` keeps guarding that regression directly.
  it("preview iframe's live-site src renders a single '/' before the query string for the root-slug page, not '//'", () => {
    renderEditor({ view: "preview", status: "published", dirty: false, contentDirty: false, slug: "/", page: { ...BASE_PAGE, slug: "/", version: 5 } });
    const preview = screen.getByTitle("Page preview");
    const src = preview.getAttribute("src")!;
    // `siteUrl` in this test environment returns the bare path with no origin prefixed, so the
    // slash is the FIRST character, not one preceded by a domain — accept either that start-of-
    // string form or a real "somechar/?_v=" form (what a real `siteUrl` origin produces).
    expect(src).toMatch(/[^/]\/\?_v=\d+$|^\/\?_v=\d+$/);
    expect(src).not.toMatch(/\/\/\?/);
    expect(src).toContain("?_v=5");
  });

  // 2026-09-09 widening — a clean draft now gets the SAME template-preview mechanism a published
  // page does (a hidden form POSTs `html` into `templatePreviewUrl`, landing in the named iframe),
  // rather than the old raw-body `SrcDocSandbox` fallback: `template-preview.ts`'s own `bodyHtml`
  // override bypasses the visibility guard that used to make a draft's real body unreachable there.
  // The iframe itself carries no `src` (it's targeted by the hidden form instead); the form's
  // `action` is the real assertion.
  it("preview POSTs into templatePreviewUrl for a clean draft page, not the raw-body sandbox", () => {
    const { container } = renderEditor({ view: "preview", status: "draft", dirty: false, contentDirty: false });
    const preview = screen.getByTitle("Page preview");
    expect(preview).not.toHaveAttribute("src");
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("action", expect.stringContaining("/pg1/template-preview"));
    expect(screen.getByText(/publish to make it visible on the site/i)).toBeInTheDocument();
  });

  // Template-preview fix (2026-08-11, widened 2026-09-09) — the reported bug's exact repro: picking a
  // DIFFERENT template on an otherwise-untouched published page. `dirty` is correctly `true` (an
  // unsaved `templateChoice` change), but `contentDirty` stays `false` — this must show a real
  // templated render, not the raw sandbox. The pending template rides `templatePreviewUrl`'s own
  // query string, which is now the hidden form's `action` rather than the iframe's `src`.
  it("preview POSTs the pending template choice, in the URL, when only the template choice is dirty on a published page", () => {
    const { container } = renderEditor({
      view: "preview",
      status: "published",
      dirty: true,
      contentDirty: false,
      templateChoice: "page-shell.html",
    });
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("action", expect.stringContaining("/pg1/template-preview"));
    expect(form).toHaveAttribute("action", expect.stringContaining("templateChoice=page-shell.html"));
    expect(screen.getByText(/save to update the live page/i)).toBeInTheDocument();
  });

  // Proof this landed on the injection seam, not just on matching URL shape: `PageEditor.tsx` no
  // longer imports `lib/api` at all (see `page-editor-port.hooks.ts`'s `templatePreviewUrl` and
  // `use-page-editor.hooks.ts`'s `templatePreviewUrl` field) — it renders whatever the CONTROLLER
  // hands it. A URL the real `api.templatePreviewUrl` could never produce (no `/api/` prefix, no
  // `template-preview` segment) still ends up as the hidden form's `action` verbatim, which is only
  // possible if the component reads it off the controller rather than calling a global `api` itself.
  it("preview form's action is exactly the controller's templatePreviewUrl, not one this component computed itself", () => {
    const { container } = renderEditor({
      view: "preview",
      status: "published",
      dirty: true,
      contentDirty: false,
      templateChoice: "page-shell.html",
      templatePreviewUrl: "fake://template-preview/pg1?templateChoice=page-shell.html",
    });
    const form = container.querySelector("form");
    expect(form).toHaveAttribute("action", "fake://template-preview/pg1?templateChoice=page-shell.html");
  });

  // The hidden form's whole reason to exist: carrying the operator's PENDING, unsaved `html` into the
  // preview endpoint via a `bodyHtml` field — a plain `GET` iframe `src` has no way to send a body.
  it("the hidden form's bodyHtml field carries the current working-copy html, not the last-saved value", () => {
    const { container } = renderEditor({
      view: "preview",
      status: "published",
      dirty: true,
      contentDirty: true,
      html: "<p>Unsaved edit</p>",
    });
    const input = container.querySelector('input[name="bodyHtml"]');
    expect(input).toHaveValue("<p>Unsaved edit</p>");
  });

  // 2026-09-09 widening — a published page with unsaved content edits now gets the same POST
  // mechanism, distinguished from the two cases above by wording: `contentDirty` means title/slug/
  // status/body itself changed, not just the template picker.
  it("preview POSTs into templatePreviewUrl, with an 'unsaved edits' notice, when the page body itself has unsaved edits", () => {
    const { container } = renderEditor({ view: "preview", status: "published", dirty: true, contentDirty: true });
    const preview = screen.getByTitle("Page preview");
    expect(preview).not.toHaveAttribute("src");
    expect(container.querySelector("form")).toHaveAttribute("action", expect.stringContaining("/pg1/template-preview"));
    expect(screen.getByText(/previewing your unsaved edits/i)).toBeInTheDocument();
  });

  it("preview POSTs into templatePreviewUrl, with an 'unsaved edits' notice, for a draft page with unsaved edits", () => {
    const { container } = renderEditor({ view: "preview", status: "draft", dirty: true, contentDirty: true });
    const preview = screen.getByTitle("Page preview");
    expect(preview).not.toHaveAttribute("src");
    expect(container.querySelector("form")).toHaveAttribute("action", expect.stringContaining("/pg1/template-preview"));
    expect(screen.getByText(/previewing your unsaved edits/i)).toBeInTheDocument();
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
  it("places the template-preview notice BEFORE the preview frame, not after, so it's visible without scrolling", () => {
    renderEditor({ view: "preview", status: "published", dirty: true, contentDirty: true });
    const notice = screen.getByText(/previewing your unsaved edits/i);
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

  // The one interactive-view assertion that does NOT mount GrapesJS, and the regression this
  // pins: the tab used to mount the editor unconditionally, which meant it could mount before the
  // active theme's CSS had resolved — and `InteractiveHtmlEditor` reads its canvas styling once, at
  // mount, so that canvas stayed unstyled (browser-default Times on white) for the rest of its life
  // no matter what arrived afterwards. See `use-theme-canvas-styling.hooks.ts`.
  it("waits for the theme's canvas styling instead of mounting the editor unstyled", () => {
    renderEditor({ view: "interactive", canvasStyling: { status: "pending" } });
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

/** The template picker shares the `combobox` role with the status select, same collision
 *  `PostEditor.unit.test.tsx`'s own `templateSelect()` documents for its picker. */
function templateSelect(): HTMLSelectElement {
  const el = document.querySelector('[data-agent-element="page-template-choice"]');
  if (!(el instanceof HTMLSelectElement)) throw new Error("template picker not rendered");
  return el;
}

/**
 * Bare-page ruling (2026-09-23, S6) — `null` and `""` used to render and display identically ("No
 * template chosen"). They now diverge: `null` still renders the theme's page shell ("Theme default"),
 * `""` renders bare (only this Page's own HTML). This is genuinely new coverage — no pre-existing test
 * in this file touched `page-template-choice` at all.
 */
describe("Template picker (bare-page ruling)", () => {
  it("labels the bare option 'No template — HTML only', not the old 'No template chosen'", () => {
    renderEditor({ templateChoice: "", availableTemplates: ["pages-default.html"] });
    const select = templateSelect();
    expect(select).toHaveDisplayValue("No template — HTML only");
    expect(screen.queryByText("No template chosen")).not.toBeInTheDocument();
  });

  it("shows the bare hint only when templateChoice is '', not for null or a real filename", () => {
    const hint = /serves only this page's html/i;

    renderEditor({ templateChoice: "", availableTemplates: ["pages-default.html"] });
    expect(screen.getByText(hint)).toBeInTheDocument();

    cleanup();
    renderEditor({ templateChoice: null, availableTemplates: ["pages-default.html"] });
    expect(screen.queryByText(hint)).not.toBeInTheDocument();

    cleanup();
    renderEditor({ templateChoice: "pages-default.html", availableTemplates: ["pages-default.html"] });
    expect(screen.queryByText(hint)).not.toBeInTheDocument();
  });

  // The exact regression `pagePickerValue` exists to prevent: a `null` Page (never chosen — "Theme
  // default") must not display as the bare option just because the theme's shell name happens to be
  // first/absent from the list.
  it("a null Page whose theme ships a page-shell template shows that template selected, not bare or the sentinel", () => {
    renderEditor({ templateChoice: null, availableTemplates: ["pages-default.html", "blog-post.html"] });
    const select = templateSelect();
    expect(select).toHaveValue("pages-default.html");
    expect(select).not.toHaveValue("");
  });

  it("a null Page whose theme ships no page-shell template shows the 'Theme default' sentinel option", () => {
    renderEditor({ templateChoice: null, availableTemplates: ["blog-post.html"] });
    const select = templateSelect();
    expect(select).toHaveDisplayValue("Theme default");
  });

  it("picking the bare option calls setTemplateChoice('')", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ templateChoice: "pages-default.html", availableTemplates: ["pages-default.html"] });
    await user.selectOptions(templateSelect(), "");
    expect(ctrl.setTemplateChoice).toHaveBeenCalledWith("");
  });

  it("picking 'Theme default' calls setTemplateChoice(null)", async () => {
    // The sentinel option only renders when `pagePickerValue` needs it — a `null` Page whose theme
    // ships no page-shell template (same fixture as the "shows the sentinel" test above).
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ templateChoice: null, availableTemplates: ["blog-post.html"] });
    await user.selectOptions(templateSelect(), "__theme-default__");
    expect(ctrl.setTemplateChoice).toHaveBeenCalledWith(null);
  });
});

/**
 * The external-change notice (2026-09-16) — an assistant tool wrote a newer version of this page
 * while the editor had unsaved edits. `controller()`'s default `pendingExternalVersion: null` keeps
 * this notice off in every OTHER suite in this file; see that default's own comment for why the key
 * must be present, not merely falsy-by-omission.
 */
describe("external-change notice", () => {
  it("shows no notice when pendingExternalVersion is null", () => {
    renderEditor({ pendingExternalVersion: null });
    expect(screen.queryByText(/changed outside the editor/i)).not.toBeInTheDocument();
  });

  it("shows the notice with Load latest and Keep my edits when pendingExternalVersion is set", () => {
    renderEditor({ pendingExternalVersion: 4 });
    expect(screen.getByText(/changed outside the editor/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load latest/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep my edits/i })).toBeInTheDocument();
  });

  it("Load latest calls loadExternalChange; Keep my edits calls dismissExternalChange", async () => {
    const user = userEvent.setup();
    const { ctrl } = renderEditor({ pendingExternalVersion: 4 });
    await user.click(screen.getByRole("button", { name: /load latest/i }));
    expect(ctrl.loadExternalChange).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /keep my edits/i }));
    expect(ctrl.dismissExternalChange).toHaveBeenCalledTimes(1);
  });

  it("preview iframes the live URL with the page version, so a new version cannot come from browser cache", () => {
    renderEditor({
      view: "preview",
      status: "published",
      dirty: false,
      contentDirty: false,
      slug: "about",
      page: { ...BASE_PAGE, slug: "about", version: 9 },
    });
    const preview = screen.getByTitle("Page preview");
    expect(preview.getAttribute("src")).toContain("/about?_v=9");
  });
});
