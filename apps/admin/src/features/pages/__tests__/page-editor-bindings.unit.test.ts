import { describe, expect, it, vi } from "vitest";
import { bindPageEditor } from "@jini-ai/admin/pages/PageEditor";
import { bindPageEditorHooks } from "@jini-ai/admin/pages/hooks/use-page-editor.hooks";
import { createPageRouteRules } from "@jini-ai/admin/pages/page-route-rules";
import {
  buildPageAutosaveDraft, buildPageSavePlan, pageAcceptsHtmlBody, pageAutosaveStaleBasisMessage,
  pageDirtyGuardBaseline, pageEditableHtml, pagePartialSaveMessage, pagePreviewFormTarget,
  pageRefreshMayHaveUnsavedEdits, pageSaveSuccessMessage, pageUnchangedSaveMessage,
  pageVersionConflictMessage, pickerValueToChoice, PAGE_PREVIEW_IFRAME_SANDBOX, THEME_DEFAULT_SENTINEL,
} from "@jini-ai/admin/pages/page-editor-rules";
import { createEmbedPlaceholderDescriber, isProtectedEmbedElement } from "@jini-ai/admin/pages/lib/embed-placeholder";
import { pagePreviewYoutubeIds } from "@jini-ai/admin/pages/lib/page-preview-youtube";
import { prettifyHtml } from "@jini-ai/admin/pages/lib/prettify-html";
import { DEVICE_PREVIEW_WIDTHS } from "@jini-ai/admin/shell/components/DevicePreview/DevicePreview.hooks";
import { editorTemplateOptions } from "@jini-ai/admin/shell/lib/editor-template-options.rules";
import { slugRedirectPath } from "@jini-ai/admin/shell/lib/slug-redirect-path";
import { unchangedSaveHandlers } from "@jini-ai/admin/shell/lib/unchanged-save-warning";
import { PageEditor } from "../PageEditor";
import { useWiredPageEditor } from "../hooks/use-page-editor.hooks";
import { pagePickerValue } from "../rules";

vi.mock("@jini-ai/admin/pages/PageEditor", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@jini-ai/admin/pages/PageEditor")>();
  return { ...actual, bindPageEditor: vi.fn(actual.bindPageEditor) };
});
vi.mock("@jini-ai/admin/pages/hooks/use-page-editor.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@jini-ai/admin/pages/hooks/use-page-editor.hooks")>();
  return { ...actual, bindPageEditorHooks: vi.fn(actual.bindPageEditorHooks) };
});
vi.mock("@jini-ai/admin/pages/page-route-rules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@jini-ai/admin/pages/page-route-rules")>();
  return { ...actual, createPageRouteRules: vi.fn(actual.createPageRouteRules) };
});

describe("Page editor host bindings", () => {
  it("supplies the original view rules and bound editor hook", () => {
    expect(PageEditor).toBeTypeOf("function");
    expect(bindPageEditor).toHaveBeenCalledWith(expect.objectContaining({
      hooks: expect.objectContaining({ usePageEditorHook: useWiredPageEditor }),
      deps: expect.objectContaining({
        pickerValueToChoice,
        THEME_DEFAULT_SENTINEL,
        pageAutosaveStaleBasisMessage,
        pageVersionConflictMessage,
        devicePreviewWidths: DEVICE_PREVIEW_WIDTHS,
        isProtectedEmbedElement,
        pagePreviewYoutubeIds,
        previewIframeSandbox: PAGE_PREVIEW_IFRAME_SANDBOX,
      }),
    }));
  });

  it("supplies the same theme-default sentinel to the route picker", () => {
    expect(createPageRouteRules).toHaveBeenCalledWith(expect.objectContaining({
      deps: expect.objectContaining({ THEME_DEFAULT_SENTINEL }),
    }));
    expect(pagePickerValue({ templateChoice: null, availableTemplates: [] })).toBe(THEME_DEFAULT_SENTINEL);
  });

  it("supplies the original load, formatting, recovery, preview and save rules", () => {
    expect(bindPageEditorHooks).toHaveBeenCalledWith(expect.objectContaining({
      deps: expect.objectContaining({
        prettifyHtml,
        unchangedSaveHandlers,
        pageDirtyGuardBaseline,
        pageRefreshMayHaveUnsavedEdits,
        pageEditableHtml,
        pageAcceptsHtmlBody,
        createEmbedPlaceholderDescriber,
        slugRedirectPath,
        editorTemplateOptions,
        pagePreviewFormTarget,
        buildPageAutosaveDraft,
        buildPageSavePlan,
        pagePartialSaveMessage,
        pageSaveSuccessMessage,
        pageUnchangedSaveMessage,
      }),
    }));
  });
});
