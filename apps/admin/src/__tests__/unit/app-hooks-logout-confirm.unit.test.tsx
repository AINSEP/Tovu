import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useLogoutConfirm } from "../../App.hooks";

/**
 * @file `useLogoutConfirm` — the confirmation-modal state around `App.tsx`'s real `logout()` (see
 * that hook's own doc comment for why it is separate from `UseAdminSession`). Pure state/behavior
 * only; `app-logout-confirm.unit.test.tsx` covers the rendered `App` integration (the sidebar
 * button, `ConfirmDialog`, and that Cancel/Escape never reach the real logout).
 */

describe("useLogoutConfirm", () => {
  it("starts closed and not pending", () => {
    const { result } = renderHook(() => useLogoutConfirm(vi.fn(async () => {})));
    expect(result.current.open).toBe(false);
    expect(result.current.pending).toBe(false);
  });

  it("request() opens the dialog without calling logout", () => {
    const logout = vi.fn(async () => {});
    const { result } = renderHook(() => useLogoutConfirm(logout));

    act(() => result.current.request());

    expect(result.current.open).toBe(true);
    expect(logout).not.toHaveBeenCalled();
  });

  it("cancel() closes the dialog without calling logout", () => {
    const logout = vi.fn(async () => {});
    const { result } = renderHook(() => useLogoutConfirm(logout));

    act(() => result.current.request());
    act(() => result.current.cancel());

    expect(result.current.open).toBe(false);
    expect(logout).not.toHaveBeenCalled();
  });

  it("confirm() calls the given logout exactly once and closes the dialog", async () => {
    const logout = vi.fn(async () => {});
    const { result } = renderHook(() => useLogoutConfirm(logout));

    act(() => result.current.request());
    await act(async () => {
      await result.current.confirm();
    });

    expect(logout).toHaveBeenCalledTimes(1);
    expect(result.current.open).toBe(false);
    expect(result.current.pending).toBe(false);
  });

  it("sets pending while the real logout is in flight", async () => {
    let releaseLogout!: () => void;
    const logout = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseLogout = resolve;
        }),
    );
    const { result } = renderHook(() => useLogoutConfirm(logout));

    act(() => result.current.request());
    let confirmSettled = false;
    act(() => {
      void result.current.confirm().then(() => {
        confirmSettled = true;
      });
    });

    await waitFor(() => expect(result.current.pending).toBe(true));
    expect(confirmSettled).toBe(false);

    releaseLogout();
    await waitFor(() => expect(confirmSettled).toBe(true));
    expect(result.current.pending).toBe(false);
  });
});
