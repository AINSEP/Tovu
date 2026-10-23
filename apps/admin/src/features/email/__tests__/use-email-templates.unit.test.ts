import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { useEmailTemplates } from "../hooks/use-email-templates.hooks";
import { createEmailFake, TEMPLATE } from "./email.test-helpers";

/** @file List actions use versioned rename and generic trash; creation opens the new editor. */
describe("useEmailTemplates", () => {
  it("creates with the translated name and opens the escaped editor path", async () => {
    const api = createEmailFake();
    api.createTemplate.mockResolvedValue({ ...TEMPLATE, id: "id/with space" });
    const open = vi.fn();
    const { result } = renderHook(() => useEmailTemplates({ api }, { open, newName: "Correo sin título" }));
    await act(() => result.current.create());
    expect(api.createTemplate).toHaveBeenCalledExactlyOnceWith({ name: "Correo sin título" });
    expect(open).toHaveBeenCalledExactlyOnceWith("/email/templates/id%2Fwith%20space");
    expect(result.current.creating).toBe(false);
  });

  it("trims a rename, sends its loaded version, updates the list, then trashes only on confirmation", async () => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailTemplates({ api }));
    await waitFor(() => expect(result.current.view.kind).toBe("loaded"));
    act(() => result.current.startRename(TEMPLATE));
    act(() => result.current.setRenameName(" Welcome back "));
    expect(api.renameTemplate).not.toHaveBeenCalled();
    await act(() => result.current.confirmRename());
    expect(api.renameTemplate).toHaveBeenCalledExactlyOnceWith({ id: TEMPLATE.id, name: "Welcome back", expectedVersion: 2 });
    expect(result.current.view).toMatchObject({ kind: "loaded", data: { templates: [{ name: "Welcome back", version: 3 }] } });
    act(() => result.current.setPendingTrash(TEMPLATE));
    expect(api.trashTemplate).not.toHaveBeenCalled();
    await act(() => result.current.confirmTrash());
    expect(api.trashTemplate).toHaveBeenCalledExactlyOnceWith({ id: TEMPLATE.id });
    expect(result.current.view).toEqual({ kind: "loaded", data: { templates: [] } });
    expect(result.current.pendingTrash).toBeNull();
  });

  it.each([" ", TEMPLATE.name])("does not write a blank or unchanged name (%s)", async (name) => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailTemplates({ api }));
    act(() => result.current.startRename(TEMPLATE));
    act(() => result.current.setRenameName(name));
    await act(() => result.current.confirmRename());
    expect(api.renameTemplate).not.toHaveBeenCalled();
    expect(result.current.renaming).toBeNull();
  });

  it("shows a failed create without navigating, and retains a template when trash fails", async () => {
    const api = createEmailFake();
    const open = vi.fn();
    api.createTemplate.mockRejectedValue(new ApiError("Create refused", 403));
    api.trashTemplate.mockRejectedValue(new ApiError("Trash refused", 403));
    const { result } = renderHook(() => useEmailTemplates({ api }, { open }));
    await waitFor(() => expect(result.current.view.kind).toBe("loaded"));
    await act(() => result.current.create());
    expect(open).not.toHaveBeenCalled();
    expect(result.current.error).toBe("Create refused");
    act(() => result.current.setPendingTrash(TEMPLATE));
    await act(() => result.current.confirmTrash());
    expect(result.current.error).toBe("Trash refused");
    expect(result.current.view).toEqual({ kind: "loaded", data: { templates: [TEMPLATE] } });
  });
});
