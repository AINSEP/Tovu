import { expect, it, vi } from "vitest";
import { applySaveFailure, PageBodyWriteError } from "@jini-ai/cms/react/pages/hooks/page-editor-save";
import { readVersionConflict } from "../../../lib/shell-collaborators";
import { isUnexpectedServerFailure } from "@jini-ai/admin/shell/lib/server-failure";
import { pagePartialSaveMessage } from "@jini-ai/admin/pages/page-editor-rules";
import { t } from "../page-editor-i18n";

it("applies partial metadata success without cleaning the unsaved HTML", () => {
  const saved = { slug: "landing", status: "draft" as const, version: 8 };
  const setters = { setPage: vi.fn(), setSlug: vi.fn(), setStatus: vi.fn(), setSavedTemplateChoice: vi.fn(), setSaveConflict: vi.fn(), setError: vi.fn(), setSavedHtml: vi.fn() };
  applySaveFailure({ e: new PageBodyWriteError({ savedRow: saved, reason: new Error("Body refused") }), attemptedStatus: undefined, form: { templateChoice: null }, setters, t, locale: "en", readVersionConflict, isUnexpectedServerFailure, pagePartialSaveMessage });
  expect(setters.setPage).toHaveBeenCalledWith(saved);
  expect(setters.setSavedHtml).not.toHaveBeenCalled();
  expect(setters.setError).toHaveBeenCalledWith(pagePartialSaveMessage({ t, locale: "en", reason: new Error("Body refused") }));
});
