import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { useEmailActivity } from "../hooks/use-email-activity.hooks";
import { ACTIVITY, BLOCK, createEmailFake, PLAN } from "./email.test-helpers";

/** @file Activity filters reset pages; unblock requires a reason then the server's revision. */
describe("useEmailActivity", () => {
  it("appends the next page, then resets the cursor when outcome or recipient changes", async () => {
    const api = createEmailFake();
    const second = { ...ACTIVITY, id: "send-2" };
    api.listActivity.mockResolvedValueOnce({ access: "full", items: [ACTIVITY], nextCursor: "page-2", empty: null })
      .mockResolvedValueOnce({ access: "full", items: [second], nextCursor: null, empty: null });
    const { result } = renderHook(() => useEmailActivity({ api }, { debounceMs: 0 }));
    await waitFor(() => expect(result.current.activity.view.kind).toBe("loaded"));
    await act(() => result.current.activity.loadMore());
    expect(api.listActivity).toHaveBeenLastCalledWith({ filter: { outcome: undefined, recipient: undefined }, cursor: "page-2" });
    expect(result.current.activity.view).toMatchObject({ kind: "loaded", data: { items: [ACTIVITY, second], nextCursor: null } });
    act(() => result.current.setFilter({ outcome: "failed" }));
    await waitFor(() => expect(api.listActivity).toHaveBeenLastCalledWith({ filter: { outcome: "failed", recipient: undefined } }));
    act(() => result.current.setFilter({ outcome: "failed", recipient: " ada@example.com " }));
    await waitFor(() => expect(api.listActivity).toHaveBeenLastCalledWith({ filter: { outcome: "failed", recipient: "ada@example.com" } }));
    expect(result.current.activity.view).toMatchObject({ kind: "loaded", data: { items: [], empty: "none_recorded" } });
  });

  it("retains existing rows and cursor on a failed later page", async () => {
    const api = createEmailFake();
    api.listActivity.mockResolvedValueOnce({ access: "masked", items: [ACTIVITY], nextCursor: "page-2", empty: null })
      .mockRejectedValueOnce(new ApiError("Try later", 503));
    const { result } = renderHook(() => useEmailActivity({ api }, { debounceMs: 0 }));
    await waitFor(() => expect(result.current.activity.view.kind).toBe("loaded"));
    await act(() => result.current.activity.loadMore());
    expect(result.current.activity.view).toMatchObject({ kind: "loaded", data: { items: [ACTIVITY], nextCursor: "page-2", access: "masked" } });
    expect(result.current.activity.moreError).toBe("Try later");
    expect(result.current.activity.loadingMore).toBe(false);
  });

  it("searches blocked addresses and appends their next page", async () => {
    const api = createEmailFake();
    api.listSuppressions.mockResolvedValue({ items: [BLOCK], nextCursor: "blocked-2", empty: null });
    const { result } = renderHook(() => useEmailActivity({ api }, { debounceMs: 0 }));
    await waitFor(() => expect(result.current.suppressions.view.kind).toBe("loaded"));
    act(() => result.current.setSearch(" ada "));
    await waitFor(() => expect(api.listSuppressions).toHaveBeenLastCalledWith({ search: "ada" }));
    const other = { ...BLOCK, address: "other@example.com" };
    api.listSuppressions.mockResolvedValueOnce({ items: [other], nextCursor: null, empty: null });
    await act(() => result.current.suppressions.loadMore());
    expect(api.listSuppressions).toHaveBeenLastCalledWith({ search: "ada", cursor: "blocked-2" });
    expect(result.current.suppressions.view).toMatchObject({ kind: "loaded", data: { items: [BLOCK, other] } });
  });

  it("rejects a short reason before requesting a plan and confirms exactly that plan revision", async () => {
    const api = createEmailFake();
    api.removeSuppression.mockResolvedValueOnce({ removed: false, confirmationRequired: true, plan: PLAN }).mockResolvedValueOnce({ removed: true });
    const { result } = renderHook(() => useEmailActivity({ api }, { debounceMs: 0 }));
    await waitFor(() => expect(result.current.suppressions.view.kind).toBe("loaded"));
    act(() => result.current.startRemoval(BLOCK));
    act(() => result.current.setRemovalReason(" ab "));
    await act(() => result.current.continueRemoval());
    expect(api.removeSuppression).not.toHaveBeenCalled();
    expect(result.current.removal).toMatchObject({ kind: "reason", error: "Say why this address may get email again." });
    act(() => result.current.setRemovalReason(" Address fixed "));
    await act(() => result.current.continueRemoval());
    expect(api.removeSuppression).toHaveBeenNthCalledWith(1, { address: BLOCK.address, scope: BLOCK.scope, reason: "Address fixed" });
    expect(result.current.removal).toMatchObject({ kind: "confirm", plan: PLAN });
    expect(api.removeSuppression).toHaveBeenCalledTimes(1);
    await act(() => result.current.continueRemoval());
    expect(api.removeSuppression).toHaveBeenNthCalledWith(2, { address: PLAN.address, scope: PLAN.scope, reason: PLAN.reason }, { confirm: { revision: PLAN.revision } });
    expect(result.current.removal).toBeNull();
    expect(result.current.removedNotice).toBe(BLOCK.address);
    await waitFor(() => expect(api.listSuppressions).toHaveBeenCalledTimes(2));
  });

  it.each(["plan", "confirm"])("shows owner-only text for a 403 at the %s step and keeps the dialog open", async (step) => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailActivity({ api }, { debounceMs: 0 }));
    await waitFor(() => expect(result.current.suppressions.view.kind).toBe("loaded"));
    act(() => result.current.startRemoval(BLOCK));
    act(() => result.current.setRemovalReason("Address fixed"));
    if (step === "confirm") await act(() => result.current.continueRemoval());
    api.removeSuppression.mockRejectedValueOnce(new ApiError("Forbidden", 403));
    await act(() => result.current.continueRemoval());
    expect(result.current.removal).toMatchObject({ kind: step === "plan" ? "reason" : "confirm", pending: false, error: "Only the site owner can remove a block." });
    expect(result.current.removedNotice).toBeNull();
  });

  it("cancel discards a plan without confirming it", async () => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailActivity({ api }, { debounceMs: 0 }));
    act(() => result.current.startRemoval(BLOCK));
    act(() => result.current.setRemovalReason(PLAN.reason));
    await act(() => result.current.continueRemoval());
    act(() => result.current.cancelRemoval());
    await act(() => result.current.continueRemoval());
    expect(api.removeSuppression).toHaveBeenCalledTimes(1);
    expect(result.current.removal).toBeNull();
  });

  it("loads one send's feedback and closes it on a second click", async () => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailActivity({ api }, { debounceMs: 0 }));
    act(() => result.current.toggleDetail("send-1"));
    await waitFor(() => expect(result.current.detail).toEqual({ kind: "loaded", data: { activity: ACTIVITY, feedback: [] } }));
    expect(api.getActivity).toHaveBeenCalledExactlyOnceWith({ id: "send-1" });
    act(() => result.current.toggleDetail("send-1"));
    expect(result.current.detail).toBeNull();
    expect(result.current.openId).toBeNull();
  });
});
