/**
 * Owner bug (2026-10-05): a draft's Preview showed an empty frame, collapsed (white) and expanded
 * (grey). Root cause: the pending-html preview is a hidden `<form target>` POST into a named
 * `<iframe>`, armed by a debounced effect keyed on editor STATE (`view`, `status`, `html`, ...).
 * Toggling full screen swapped `PagePreview` between two different element trees, so React mounted
 * a brand-new form + `about:blank` iframe while none of the effect's dependencies changed — the new
 * iframe was never submitted into and stayed empty until some unrelated edit happened to re-arm it.
 *
 * Driven through the REAL `usePageEditor` (fake port), because the defect lives in the seam between
 * the hook's effect and the view's element tree; a fake controller cannot reproduce it.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageEditor } from "../PageEditor";
import { usePageEditor } from "../hooks/use-page-editor.hooks";
import { createFakePageEditorPort } from "../hooks/page-editor-dependencies.hooks";
import { createFakeThemeCanvasPort } from "../hooks/theme-canvas-dependencies.hooks";
import type { AdminPost } from "@/lib/api";

// Same stub `PageEditor.interactive-flush.unit.test.tsx` uses: the taxonomy box fetches on its own.
vi.mock("../../taxonomy/TermPicker", () => ({
  TermPicker: () => <div data-testid="term-picker" />,
}));

const DRAFT_PAGE: AdminPost = {
  id: "pg1",
  workspaceId: "w1",
  kind: "page",
  title: "Contact",
  slug: "html-form-demo",
  bodyJson: {},
  bodyFormat: "html",
  bodyHtml: "<h1>Contact us</h1>",
  status: "draft",
  updatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
};

/** Every form jsdom was asked to submit, in order. jsdom does not implement `submit()`. */
let submitted: HTMLFormElement[] = [];

beforeEach(() => {
  submitted = [];
  vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (this: HTMLFormElement) {
    submitted.push(this);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDraftEditor() {
  const port = createFakePageEditorPort({ page: DRAFT_PAGE, activeThemeTemplates: ["pages-default.html"] });
  const deps = { port, themeCanvasPort: createFakeThemeCanvasPort(), navigate: vi.fn(), t: (_locale: string, key: string) => key, locale: "en" };
  return render(<PageEditor slug="html-form-demo" usePageEditorHook={(slug: string) => usePageEditor(slug, deps)} />);
}

/** The hidden form currently in the document, and whether the iframe it targets has been filled. */
function mountedPreview(): { form: HTMLFormElement; iframe: HTMLIFrameElement; filled: boolean } {
  const iframe = screen.getByTitle("Page preview") as HTMLIFrameElement;
  const form = document.querySelector<HTMLFormElement>(`form[target="${iframe.name}"]`);
  if (!form) throw new Error("no hidden preview form targets the mounted iframe");
  return { form, iframe, filled: submitted.includes(form) };
}

describe("PageEditor — a draft's preview survives full-screen toggles", () => {
  it("fills the draft preview on open", async () => {
    renderDraftEditor();
    await waitFor(() => expect(mountedPreview().filled).toBe(true), { timeout: 3000 });
  });

  it("the iframe on screen after expanding, and after collapsing again, has been submitted into", async () => {
    renderDraftEditor();
    await waitFor(() => expect(mountedPreview().filled).toBe(true), { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: "Show full screen" }));
    expect(document.querySelector(".page-preview-expanded")).not.toBeNull();
    await waitFor(() => expect(mountedPreview().filled).toBe(true), { timeout: 3000 });

    fireEvent.click(screen.getByRole("button", { name: "Exit full screen" }));
    expect(document.querySelector(".page-preview-expanded")).toBeNull();
    await waitFor(() => expect(mountedPreview().filled).toBe(true), { timeout: 3000 });
  });

  // The view half of the fix: one element tree in both states, so the toggle keeps the rendered
  // document (and its scroll) instead of reloading it, and the fab stays inside the preview stage.
  it("keeps the SAME iframe node across the toggle, with the fab inside the preview stage", async () => {
    renderDraftEditor();
    await waitFor(() => expect(mountedPreview().filled).toBe(true), { timeout: 3000 });
    const before = mountedPreview().iframe;

    fireEvent.click(screen.getByRole("button", { name: "Show full screen" }));
    expect(mountedPreview().iframe).toBe(before);
    const fab = screen.getByRole("button", { name: "Exit full screen" });
    expect(fab.parentElement).toHaveClass("page-preview-stage");
    expect(fab.parentElement?.querySelector(".page-preview-notice")).toBeNull();
    expect(fab).not.toHaveAttribute("title");
    expect(fab.querySelector(".page-preview-fab-tip")).toHaveTextContent("Exit full screen (Esc)");

    fireEvent.click(fab);
    expect(mountedPreview().iframe).toBe(before);
  });
});
