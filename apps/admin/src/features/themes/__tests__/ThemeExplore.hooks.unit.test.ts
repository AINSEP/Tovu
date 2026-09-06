import { act, renderHook } from "@testing-library/react";
import type { MouseEvent, SyntheticEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { useThemeExploreFullscreen } from "../ThemeExplore.hooks";

/**
 * @file `useThemeExploreFullscreen`'s own `syncFullscreenDialog` — every existing
 * `ThemeExplore.unit.test.tsx` assertion drives this through a real `<dialog>` element that jsdom
 * gives a working `showModal`/`close` pair, so `supportsNativeDialog` is always `true` there and
 * the `setAttribute`/`removeAttribute` jsdom-fallback branches, plus the "no dialog ref yet"
 * early return, have never executed. This suite drives `syncFullscreenDialog` directly by
 * attaching a plain (non-`<dialog>`-typed) DOM node to `dialogRef` and shaping its `showModal`/
 * `close` presence per case — same "control the inputs, assert the derived state" approach
 * `useOverflowDetection.hooks.unit.test.ts` uses for its own jsdom gap.
 */

/**
 * A real `<dialog>` element (jsdom reflects its `open` IDL property onto the `open` content
 * attribute exactly like a real browser — that reflection is separate from, and present with or
 * without, the modal-specific `showModal`/`close` API this fixture toggles) so the fallback
 * branch's `setAttribute("open", "")`/`removeAttribute("open")` calls actually flip `dialog.open`
 * the same way they would in a real browser, instead of a hand-defined property that silently
 * stops tracking reality the moment the fallback path is what's under test.
 */
function makeDialogStub(options: { withNativeDialog: boolean }): HTMLDialogElement {
  const el = document.createElement("dialog");
  if (options.withNativeDialog) {
    el.showModal = vi.fn(() => {
      Object.defineProperty(el, "open", { value: true, writable: true, configurable: true });
    });
    el.close = vi.fn(() => {
      Object.defineProperty(el, "open", { value: false, writable: true, configurable: true });
    });
  } else {
    // jsdom's own `HTMLDialogElement` DOES implement `showModal`/`close` — delete them so
    // `supportsNativeDialog` evaluates `false` and the function takes its attribute-fallback path.
    (el as unknown as { showModal?: unknown }).showModal = undefined;
    (el as unknown as { close?: unknown }).close = undefined;
  }
  el.setAttribute = vi.fn(el.setAttribute.bind(el));
  el.removeAttribute = vi.fn(el.removeAttribute.bind(el));
  return el;
}

/**
 * Attaches `dialog` to `dialogRef` during the render body — same ordering rationale
 * `useOverflowDetection.hooks.unit.test.ts` documents: React commits refs before running effects,
 * so this lands before the mount-time `syncFullscreenDialog` call the same way a real `<dialog
 * ref={dialogRef}>` would, rather than one render late (assigning `result.current.dialogRef
 * .current` AFTER `renderHook` returns misses the mount-time effect entirely, since the ref is
 * still `null` when it fires).
 */
function useHookWithDialog(dialog: HTMLDialogElement | null) {
  const hook = useThemeExploreFullscreen();
  if (hook.dialogRef.current !== dialog) hook.dialogRef.current = dialog;
  return hook;
}

describe("useThemeExploreFullscreen — syncFullscreenDialog", () => {
  it("does nothing (and does not throw) when the dialog ref is not attached to anything", () => {
    const { result } = renderHook(() => useThemeExploreFullscreen());
    expect(result.current.dialogRef.current).toBeNull();

    expect(() => act(() => result.current.setFullscreen(true))).not.toThrow();
    expect(result.current.fullscreen).toBe(true);
  });

  it("calls showModal()/close() when the dialog supports the native API", () => {
    const dialog = makeDialogStub({ withNativeDialog: true });
    const { result } = renderHook(() => useHookWithDialog(dialog));

    act(() => result.current.setFullscreen(true));
    expect(dialog.showModal).toHaveBeenCalledTimes(1);
    expect(dialog.setAttribute).not.toHaveBeenCalled();

    act(() => result.current.setFullscreen(false));
    expect(dialog.close).toHaveBeenCalledTimes(1);
    expect(dialog.removeAttribute).not.toHaveBeenCalled();
  });

  it("falls back to the open attribute when the dialog has no native showModal/close", () => {
    const dialog = makeDialogStub({ withNativeDialog: false });
    const { result } = renderHook(() => useHookWithDialog(dialog));

    act(() => result.current.setFullscreen(true));
    expect(dialog.setAttribute).toHaveBeenCalledWith("open", "");
    expect(dialog.open).toBe(true); // real `<dialog>` reflects the attribute onto `.open`

    act(() => result.current.setFullscreen(false));
    expect(dialog.removeAttribute).toHaveBeenCalledWith("open");
  });

  it("is a no-op when fullscreen already matches the dialog's own open state", () => {
    const dialog = makeDialogStub({ withNativeDialog: true });
    renderHook(() => useHookWithDialog(dialog));

    // `fullscreen` starts `false`, matching `dialog.open` (`false`) already, with the dialog
    // already attached before the mount-time effect runs — that effect's own run should already be
    // a no-op, before any `setFullscreen` call.
    expect(dialog.showModal).not.toHaveBeenCalled();
    expect(dialog.close).not.toHaveBeenCalled();
  });
});

describe("useThemeExploreFullscreen — dismiss paths", () => {
  it("closeFullscreen clears fullscreen and returns focus to the trigger button", () => {
    const { result } = renderHook(() => useThemeExploreFullscreen());
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    result.current.fullscreenTriggerRef.current = trigger;
    act(() => result.current.setFullscreen(true));

    act(() => result.current.closeFullscreen());

    expect(result.current.fullscreen).toBe(false);
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });

  it("handleFullscreenCancel prevents the default and closes", () => {
    const { result } = renderHook(() => useThemeExploreFullscreen());
    act(() => result.current.setFullscreen(true));
    const preventDefault = vi.fn();

    act(() =>
      result.current.handleFullscreenCancel({ preventDefault } as unknown as SyntheticEvent<HTMLDialogElement>)
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.fullscreen).toBe(false);
  });

  it("handleFullscreenBackdropClick closes only when the click target is the dialog itself", () => {
    const dialog = makeDialogStub({ withNativeDialog: true });
    const { result } = renderHook(() => useHookWithDialog(dialog));
    act(() => result.current.setFullscreen(true));

    const childTarget = document.createElement("span");
    act(() =>
      result.current.handleFullscreenBackdropClick({ target: childTarget } as unknown as MouseEvent<HTMLDialogElement>)
    );
    expect(result.current.fullscreen).toBe(true);

    act(() =>
      result.current.handleFullscreenBackdropClick({ target: dialog } as unknown as MouseEvent<HTMLDialogElement>)
    );
    expect(result.current.fullscreen).toBe(false);
  });
});
