import { forwardRef, type Ref } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageEditor } from "../PageEditor";
import type { PageEditorController } from "../hooks/use-page-editor.hooks";
import type { InteractiveHtmlEditorHandle } from "@jini-ai/ui/html-editor";
import { api, type AdminPost } from "@/lib/api";

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
    InteractiveHtmlEditor: forwardRef<InteractiveHtmlEditorHandle, Record<string, unknown>>((_props, ref) => {
      captured = ref;
      return <div data-testid="gjs-stub" />;
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
