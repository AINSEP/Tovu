import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useEmbedInsertControl, type EmbedEditor } from "../EmbedInsertControl/EmbedInsertControl.hooks";

/**
 * @file `useEmbedInsertControl` — the menu/dialog visibility state and the two pinned
 * `useWidgetAddControl` instances `EmbedInsertControl.tsx` delegates to, driven directly here with
 * `renderHook` rather than through a full component render. First test file for this logic —
 * `EmbedInsertControl` had none before this refactor pass, flat or split. Complements
 * `EmbedInsertControl.unit.test.tsx`, which covers the same behavior indirectly through the
 * rendered component; this file isolates the state machine itself, the same split
 * `SeeMore.hooks.unit.test.tsx`/`MediaPickerDialog.hooks.unit.test.tsx` use for their components.
 */

function fakeEditor(): EmbedEditor {
  return {
    commands: {
      insertMediaEmbed: vi.fn().mockReturnValue(true),
      insertWidgetEmbed: vi.fn().mockReturnValue(true),
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useEmbedInsertControl — visibility flags", () => {
  it("starts with the menu, widget mode, and media picker all closed", () => {
    const { result } = renderHook(() => useEmbedInsertControl(fakeEditor()));
    expect(result.current.open).toBe(false);
    expect(result.current.widgetMode).toBe(false);
    expect(result.current.mediaPicking).toBe(false);
  });

  it("each setter flips only its own flag", () => {
    const { result } = renderHook(() => useEmbedInsertControl(fakeEditor()));

    act(() => result.current.setOpen(true));
    expect(result.current).toMatchObject({ open: true, widgetMode: false, mediaPicking: false });

    act(() => result.current.setWidgetMode(true));
    expect(result.current).toMatchObject({ open: true, widgetMode: true, mediaPicking: false });

    act(() => result.current.setMediaPicking(true));
    expect(result.current).toMatchObject({ open: true, widgetMode: true, mediaPicking: true });
  });
});

describe("useEmbedInsertControl — insertWidget", () => {
  it("calls editor.commands.insertWidgetEmbed with the given widgetEntryId and a non-empty placementId", () => {
    const editor = fakeEditor();
    const { result } = renderHook(() => useEmbedInsertControl(editor));

    act(() => result.current.insertWidget("w1"));

    expect(editor.commands.insertWidgetEmbed).toHaveBeenCalledTimes(1);
    const [attrs] = vi.mocked(editor.commands.insertWidgetEmbed).mock.calls[0];
    expect(attrs.widgetEntryId).toBe("w1");
    expect(attrs.placementId).toBeTruthy();
  });

  it("mints a different placementId on each call", () => {
    const editor = fakeEditor();
    const { result } = renderHook(() => useEmbedInsertControl(editor));

    act(() => result.current.insertWidget("w1"));
    act(() => result.current.insertWidget("w2"));

    const calls = vi.mocked(editor.commands.insertWidgetEmbed).mock.calls;
    expect(calls[0][0].placementId).not.toBe(calls[1][0].placementId);
  });

  it("is a safe no-op when editor is null — never throws", () => {
    const { result } = renderHook(() => useEmbedInsertControl(null));
    expect(() => act(() => result.current.insertWidget("w1"))).not.toThrow();
  });

  it("falls back to the timestamp+random placementId when crypto.randomUUID is unavailable", () => {
    // jsdom always implements crypto.randomUUID, so this fallback (a browser too old to have it)
    // is otherwise never exercised — stub it away for this one test only.
    vi.stubGlobal("crypto", {});
    const editor = fakeEditor();
    const { result } = renderHook(() => useEmbedInsertControl(editor));

    act(() => result.current.insertWidget("w1"));

    const [attrs] = vi.mocked(editor.commands.insertWidgetEmbed).mock.calls[0];
    expect(attrs.placementId).toMatch(/^placement-\d+-[a-z0-9]+$/);
  });
});

describe("useEmbedInsertControl — formControl / menuControl are independent pinned useWidgetAddControl instances", () => {
  it("both start with no pickerType and no error", () => {
    const { result } = renderHook(() => useEmbedInsertControl(fakeEditor()));
    expect(result.current.formControl.pickerType).toBeNull();
    expect(result.current.menuControl.pickerType).toBeNull();
    expect(result.current.formControl.error).toBeNull();
    expect(result.current.menuControl.error).toBeNull();
  });

  it("setting formControl's pickerType does not affect menuControl — two genuinely separate hook instances", () => {
    const { result } = renderHook(() => useEmbedInsertControl(fakeEditor()));

    act(() => result.current.formControl.setPickerType("contact-form"));

    expect(result.current.formControl.pickerType).toBe("contact-form");
    expect(result.current.menuControl.pickerType).toBeNull();
  });

  it("setting menuControl's pickerType does not affect formControl", () => {
    const { result } = renderHook(() => useEmbedInsertControl(fakeEditor()));

    act(() => result.current.menuControl.setPickerType("menu"));

    expect(result.current.menuControl.pickerType).toBe("menu");
    expect(result.current.formControl.pickerType).toBeNull();
  });

  it("formControl.handleUseExisting resolves through insertWidget into editor.commands.insertWidgetEmbed and clears pickerType", async () => {
    const editor = fakeEditor();
    const { result } = renderHook(() => useEmbedInsertControl(editor));

    act(() => result.current.formControl.setPickerType("contact-form"));
    await act(async () => {
      await result.current.formControl.handleUseExisting("cf1");
    });

    expect(editor.commands.insertWidgetEmbed).toHaveBeenCalledWith(expect.objectContaining({ widgetEntryId: "cf1" }));
    expect(result.current.formControl.pickerType).toBeNull();
  });

  it("menuControl.handleUseExisting resolves independently of formControl", async () => {
    const editor = fakeEditor();
    const { result } = renderHook(() => useEmbedInsertControl(editor));

    act(() => result.current.menuControl.setPickerType("menu"));
    await act(async () => {
      await result.current.menuControl.handleUseExisting("m1");
    });

    expect(editor.commands.insertWidgetEmbed).toHaveBeenCalledWith(expect.objectContaining({ widgetEntryId: "m1" }));
    expect(result.current.menuControl.pickerType).toBeNull();
    expect(result.current.formControl.pickerType).toBeNull();
  });
});
