import { FetchQueryProvider } from "@/lib/fetch-query";
/** Spec/ADR: ADS-memory/.local-artifacts/theme-preview-refresh/design.md */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PageEditor } from "../../pages/PageEditor";
import { usePageEditor } from "../../pages/hooks/use-page-editor.hooks";
import { createFakePageEditorPort } from "../../pages/hooks/page-editor-dependencies.hooks";
import { createFakeThemeCanvasPort } from "../../pages/hooks/theme-canvas-dependencies.hooks";
import { publishThemePreviewRefresh, resetThemePreviewRefresh } from "../theme-preview-refresh";
import type { AdminPost } from "@/lib/api";

// Only jsdom's unimplemented DOM submit is observed; services are injected fakes, no module mocks.
afterEach(() => {
  cleanup();
  resetThemePreviewRefresh();
  vi.restoreAllMocks();
});
it("theme refresh remounts and resubmits the dirty page preview without replacing the unsaved HTML", async () => {
  const page: AdminPost = {
    id: "pg1",
    workspaceId: "workspace-local",
    kind: "page",
    title: "Contact",
    slug: "contact",
    bodyJson: {},
    bodyFormat: "html",
    bodyHtml: "<h1>Saved</h1>",
    status: "draft",
    updatedAt: "2026-08-01T00:00:00.000Z",
    version: 1,
  };
  const port = createFakePageEditorPort({ page, activeThemeTemplates: ["pages-default.html"] });
  const deps = {
    port,
    themeCanvasPort: createFakeThemeCanvasPort(),
    navigate: () => {},
    t: (_locale: string, key: string) => key,
    locale: "en",
  };
  const submissions: HTMLFormElement[] = [];
  vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(function (this: HTMLFormElement) {
    submissions.push(this);
  });
  const ui = render(
    <FetchQueryProvider>
      <PageEditor slug="contact" usePageEditorHook={(slug) => usePageEditor(slug, deps)} />
    </FetchQueryProvider>,
  );
  await waitFor(() => expect(screen.getByTitle("Page preview")).toBeTruthy());
  fireEvent.click(screen.getByRole("tab", { name: "HTML" }));
  const editor = ui.container.querySelector("textarea");
  expect(editor).toBeTruthy();
  fireEvent.change(editor!, { target: { value: "<h1>Unsaved exact HTML</h1>" } });
  fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
  const before = screen.getByTitle("Page preview");
  await waitFor(() =>
    expect(submissions.at(-1)?.querySelector('input[name="bodyHtml"]')?.getAttribute("value")).toBe(
      "<h1>Unsaved exact HTML</h1>",
    ),
  );
  publishThemePreviewRefresh({ revision: "theme-save" });
  await waitFor(() => expect(screen.getByTitle("Page preview")).not.toBe(before));
  await waitFor(() =>
    expect(submissions.at(-1)?.action).toBe(
      "fake://template-preview/pg1?templateChoice=&__tovu_preview=theme-save",
    ),
  );
  expect(submissions.at(-1)?.querySelector('input[name="bodyHtml"]')?.getAttribute("value")).toBe(
    "<h1>Unsaved exact HTML</h1>",
  );
});
