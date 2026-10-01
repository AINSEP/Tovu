import { forwardRef, useState, type Ref } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageEditor } from "../PageEditor";
import { usePageEditor, type PageEditorController } from "../hooks/use-page-editor.hooks";
import { createFakePageEditorPort } from "../hooks/page-editor-dependencies.hooks";
import { createFakeThemeCanvasPort } from "../hooks/theme-canvas-dependencies.hooks";
import type { InteractiveHtmlEditorHandle } from "@jini-ai/ui/html-editor";
import { api, type AdminPost } from "@/lib/api";

// The shared Categories & Tags box reads its own taxonomy list and terms; stubbed to echo its
// content ref so this file's fetch queue and assertions stay about the editor itself (its own
// branches: `features/taxonomy/__tests__/TermPicker.unit.test.tsx`).
vi.mock("../../taxonomy/TermPicker", () => ({
  TermPicker: (props: { contentType: string; contentId: string }) => (
    <div data-testid="term-picker">{`${props.contentType}/${props.contentId}`}</div>
  ),
}));

/**
 * @file Interactive flush (2026-09-23 plan) — proves `PageEditorPane` attaches `usePageEditor`'s
 * `interactiveEditorRef` onto the REAL `<InteractiveHtmlEditor>` (`@jini-ai/ui/html-editor`), not a
 * ref this component owns itself. `PageEditor.unit.test.tsx`'s existing characterization suite proves
 * the rest of this component's wiring; this file is narrowly about the one new prop, so
 * `@jini-ai/ui/html-editor` is mocked down to a `forwardRef` stub that records whatever `ref` it was
 * given rather than mounting a real GrapesJS instance.
 */

let captured: Ref<InteractiveHtmlEditorHandle> | null = null;

vi.mock("@jini-ai/ui/html-editor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@jini-ai/ui/html-editor")>();
  return {
    ...actual,
    InteractiveHtmlEditor: forwardRef<InteractiveHtmlEditorHandle, Record<string, unknown>>((props, ref) => {
      captured = ref;
      // Like the real canvas, consume the HTML at mount rather than following prop updates.
      const [initialHtml] = useState(() => String(props.html));
      return <div data-testid="gjs-stub">{initialHtml}</div>;
    }),
  };
});

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

/** Minimal `PageEditorController` factory — same defaults `PageEditor.unit.test.tsx`'s own
 *  `controller()` uses (see that file for the full, documented set); this suite only needs enough of
 *  the shape to reach the `interactive` surface without throwing. */
function controller(overrides: Partial<PageEditorController> = {}): PageEditorController {
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
    activeThemeId: null,
    activeThemeTier: null,
    activeThemeApiVersion: undefined,
    showTemplateModal: false,
    onViewTemplateClick: vi.fn(),
    onCloseTemplateModal: vi.fn(),
    html,
    setHtml: vi.fn(),
    draftHtml: html,
    setDraftHtml: vi.fn(),
    htmlTextareaRef: vi.fn(),
    onHtmlScroll: vi.fn(),
    onPreviewFrameLoad: vi.fn(),
    view: "interactive",
    setView: vi.fn(),
    device: "desktop",
    setDevice: vi.fn(),
    previewExpanded: false,
    togglePreviewExpanded: vi.fn(),
    frameRef: vi.fn(),
    paneWidth: 880,
    saving: false,
    t: (key) => key,
    dirty: false,
    contentDirty: false,
    templatePreviewUrl: page ? api.templatePreviewUrl(page.id, templateChoice) : "",
    previewFormRef: { current: null },
    previewFormTarget: page ? `page-preview-pending-${page.id}` : "",
    // "ready" — the interactive surface, not "interactive-pending" — see `rules.ts`'s
    // `pageEditorSurface`.
    canvasStyling: { status: "ready", styling: {} },
    save: vi.fn(),
    saveConflict: null,
    saveOverwritingConflict: vi.fn(),
    dismissSaveConflict: vi.fn(),
    remove: vi.fn(),
    confirmingDelete: false,
    setConfirmingDelete: vi.fn(),
    deleting: false,
    confirmLeave: () => true,
    onBackLinkClick: vi.fn(async () => {}),
    recoverableDraft: null,
    restoreRecoveredDraft: vi.fn(),
    discardRecoveredDraft: vi.fn(),
    autosaveStaleBasis: null,
    pendingExternalVersion: null,
    loadExternalChange: vi.fn(),
    dismissExternalChange: vi.fn(),
    contentRevision: 0,
    embedPlaceholderDescriber: () => undefined,
    interactiveEditorRef: { current: null },
    setHtmlFromCanvas: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  captured = null;
});

describe("PageEditor — Interactive flush ref wiring", () => {
  it("attaches usePageEditor's interactiveEditorRef onto the real InteractiveHtmlEditor", () => {
    const ctrl = controller();
    const usePageEditorHook = () => ctrl;
    render(<PageEditor slug="pg1" usePageEditorHook={usePageEditorHook} />);

    expect(captured).toBe(ctrl.interactiveEditorRef);
  });
});


describe("PageEditor — scroll event routing", () => {
  it("passes the rendered HTML textarea's scroll position to its controller", () => {
    const ctrl = controller({ view: "html" });
    render(<PageEditor slug="about" usePageEditorHook={() => ctrl} />);
    const textarea = screen.getByRole("textbox", { name: "Page HTML" });
    expect(ctrl.htmlTextareaRef).toHaveBeenCalledWith(textarea);
    textarea.scrollTop = 220;
    fireEvent.scroll(textarea);
    expect(ctrl.onHtmlScroll).toHaveBeenCalledExactlyOnceWith(220);
    expect(ctrl.onPreviewFrameLoad).not.toHaveBeenCalled();
  });

  it.each(["draft", "published"] as const)("passes the %s preview iframe's load to its controller", (status) => {
    const ctrl = controller({ view: "preview", page: { ...BASE_PAGE, status }, status });
    render(<PageEditor slug="about" usePageEditorHook={() => ctrl} />);
    const iframe = screen.getByTitle("Page preview");
    fireEvent.load(iframe);
    expect(ctrl.onPreviewFrameLoad).toHaveBeenCalledExactlyOnceWith(iframe);
    expect(ctrl.onHtmlScroll).not.toHaveBeenCalled();
  });
});

describe("PageEditor — recovered content remount", () => {
  it("remounts the Interactive canvas with recovered HTML using the real editor hook", async () => {
    const port = createFakePageEditorPort({
      page: BASE_PAGE,
      autosave: {
        bodyFormat: "html",
        bodyHtml: "<p>Recovered canvas</p>",
        title: "Recovered title",
        slug: "about",
        baseVersion: BASE_PAGE.version,
        savedAt: "2026-09-06T00:00:00.000Z",
        savedByPrincipalId: "user-local",
      },
    });
    const deps = { port, themeCanvasPort: createFakeThemeCanvasPort(), navigate: vi.fn(), t: (_locale: string, key: string) => key, locale: "en" };
    const usePageEditorHook = (slug: string) => usePageEditor(slug, deps);
    const view = render(<PageEditor slug="about" usePageEditorHook={usePageEditorHook} />);
    try {
      await screen.findByRole("button", { name: "Restore", exact: true });
      fireEvent.click(screen.getByRole("tab", { name: "Interactive" }));
      const originalCanvas = await screen.findByTestId("gjs-stub");
      expect(originalCanvas).toHaveTextContent("<p>Hello</p>");
      fireEvent.click(screen.getByRole("button", { name: "Restore", exact: true }));
      await waitFor(() => expect(screen.getByTestId("gjs-stub")).not.toBe(originalCanvas));
      expect(originalCanvas).not.toBeInTheDocument();
      expect(screen.getByTestId("gjs-stub")).toHaveTextContent("<p>Recovered canvas</p>");
    } finally {
      view.unmount();
      localStorage.clear();
    }
  });
});
