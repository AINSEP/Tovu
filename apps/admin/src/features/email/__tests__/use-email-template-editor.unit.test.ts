import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { EmailTemplatePreview } from "../email-api";
import { useEmailTemplateEditor } from "../hooks/use-email-template-editor.hooks";
import { createEmailFake, PREVIEW, TEMPLATE } from "./email.test-helpers";

/** @file The unsaved working copy owns preview; version conflicts never overwrite that copy. */
afterEach(() => vi.useRealTimers());
describe("useEmailTemplateEditor", () => {
  it("seeds field samples and previews unsaved HTML, values and mode", async () => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailTemplateEditor({ api, id: TEMPLATE.id }, { debounceMs: 0 }));
    await waitFor(() => expect(result.current.preview.pending).toBe(false));
    expect(result.current.html).toBe(TEMPLATE.html);
    expect(result.current.values).toEqual({ name: "Ada" });
    act(() => { result.current.setHtml("<p>{{name}} {{extra}}</p>"); result.current.setValue("name", "Bo"); result.current.setMode("sent"); });
    api.previewTemplate.mockResolvedValue({ ...PREVIEW, mode: "sent", scriptsStripped: true, undeclaredFields: ["extra", "name"] });
    await waitFor(() => expect(api.previewTemplate).toHaveBeenLastCalledWith({ html: "<p>{{name}} {{extra}}</p>", values: { name: "Bo" }, mode: "sent" }));
    await waitFor(() => expect(result.current.fieldNames).toEqual(["name", "extra"]));
    expect(result.current.dirty).toBe(true);
    expect(api.saveTemplateHtml).not.toHaveBeenCalled();
  });

  it("debounces rapid edits and cancels a queued preview on unmount", async () => {
    vi.useFakeTimers();
    const api = createEmailFake();
    const { result, unmount } = renderHook(() => useEmailTemplateEditor({ api, id: TEMPLATE.id }, { debounceMs: 400 }));
    await act(async () => {});
    expect(result.current.html).toBe(TEMPLATE.html);
    expect(api.previewTemplate).not.toHaveBeenCalled();
    act(() => result.current.setHtml("<p>First</p>"));
    await act(() => vi.advanceTimersByTimeAsync(200));
    act(() => result.current.setHtml("<p>Last</p>"));
    await act(() => vi.advanceTimersByTimeAsync(399));
    expect(api.previewTemplate).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(api.previewTemplate).toHaveBeenCalledExactlyOnceWith({ html: "<p>Last</p>", values: { name: "Ada" }, mode: "admin" });
    act(() => result.current.setHtml("<p>Never</p>"));
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(api.previewTemplate).toHaveBeenCalledTimes(1);
  });

  it("ignores an older preview that resolves after a newer one", async () => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailTemplateEditor({ api, id: TEMPLATE.id }, { debounceMs: 0 }));
    await waitFor(() => expect(result.current.preview.data).toEqual(PREVIEW));
    let resolveOld!: (data: EmailTemplatePreview) => void;
    api.previewTemplate.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    act(() => result.current.setHtml("<p>Old</p>"));
    await waitFor(() => expect(api.previewTemplate).toHaveBeenLastCalledWith(expect.objectContaining({ html: "<p>Old</p>" })));
    api.previewTemplate.mockResolvedValue({ ...PREVIEW, html: "<p>New</p>" });
    act(() => result.current.setHtml("<p>New</p>"));
    await waitFor(() => expect(result.current.preview.data?.html).toBe("<p>New</p>"));
    await act(async () => resolveOld({ ...PREVIEW, html: "<p>Old</p>" }));
    expect(result.current.preview.data?.html).toBe("<p>New</p>");
  });

  it("keeps unsaved HTML through rename and saves against the returned version", async () => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailTemplateEditor({ api, id: TEMPLATE.id }, { debounceMs: 0 }));
    await waitFor(() => expect(result.current.html).toBe(TEMPLATE.html));
    act(() => { result.current.setHtml("<p>Working copy</p>"); result.current.setName(" New title "); });
    await act(() => result.current.commitName());
    expect(api.renameTemplate).toHaveBeenCalledExactlyOnceWith({ id: TEMPLATE.id, name: "New title", expectedVersion: 2 });
    expect(result.current.html).toBe("<p>Working copy</p>");
    expect(result.current.dirty).toBe(true);
    await act(() => result.current.save());
    expect(api.saveTemplateHtml).toHaveBeenCalledExactlyOnceWith({ id: TEMPLATE.id, html: "<p>Working copy</p>", expectedVersion: 3 });
    expect(result.current.dirty).toBe(false);
    expect(result.current.savedAt).toBe(TEMPLATE.updatedAt);
  });

  it("adopts the server's normalized HTML after a save, so the editor is clean again", async () => {
    const api = createEmailFake();
    api.saveTemplateHtml.mockImplementation(async (input) => ({ ...TEMPLATE, html: input.html.trimEnd(), version: input.expectedVersion + 1 }));
    const { result } = renderHook(() => useEmailTemplateEditor({ api, id: TEMPLATE.id }, { debounceMs: 0 }));
    await waitFor(() => expect(result.current.html).toBe(TEMPLATE.html));
    act(() => result.current.setHtml("<p>Edited</p>\n"));
    await act(() => result.current.save());
    expect(result.current.html).toBe("<p>Edited</p>");
    expect(result.current.dirty).toBe(false);
  });

  it.each(["save", "rename"])("keeps edits and shows copy-before-reload advice for a 409 on %s", async (operation) => {
    const api = createEmailFake();
    api.saveTemplateHtml.mockRejectedValue(new ApiError("Concurrent edit", 409, "CONCURRENT_EDIT"));
    api.renameTemplate.mockRejectedValue(new ApiError("Concurrent edit", 409, "CONCURRENT_EDIT"));
    const { result } = renderHook(() => useEmailTemplateEditor({ api, id: TEMPLATE.id }, { debounceMs: 0 }));
    await waitFor(() => expect(result.current.html).toBe(TEMPLATE.html));
    act(() => { result.current.setHtml("<p>Keep me</p>"); result.current.setName("New title"); });
    await act(() => operation === "save" ? result.current.save() : result.current.commitName());
    expect(operation === "save" ? result.current.saveError : result.current.renameError).toBe("Someone else changed this template. Reload to get their version; copy your edits first.");
    expect(result.current.html).toBe("<p>Keep me</p>");
    expect(result.current.dirty).toBe(true);
    expect(result.current.saving).toBe(false);
    expect(result.current.savedAt).toBeNull();
  });
});
