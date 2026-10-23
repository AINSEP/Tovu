import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { useEmailProvider } from "../hooks/use-email-provider.hooks";
import { createEmailFake, PROVIDER } from "./email.test-helpers";

/** @file Provider saves never switch lanes; switching requires a separate confirmed action. */
describe("useEmailProvider", () => {
  it("requires a new key, trims fields, clears secrets after save and refreshes status", async () => {
    const api = createEmailFake();
    const onChanged = vi.fn();
    const { result } = renderHook(() => useEmailProvider({ api }, { onChanged }));
    await waitFor(() => expect(result.current.view.kind).toBe("loaded"));
    await act(() => result.current.saveKey(PROVIDER));
    expect(result.current.notice?.text).toBe("Enter the key first.");
    expect(api.saveProviderKey).not.toHaveBeenCalled();
    act(() => {
      result.current.setDraftField(PROVIDER.id, "token", "  secret  ");
      result.current.setDraftField(PROVIDER.id, "baseUrl", " https://example.com/mail ");
      result.current.setDraftField(PROVIDER.id, "username", "  ");
    });
    await act(() => result.current.saveKey(PROVIDER));
    expect(api.saveProviderKey).toHaveBeenCalledExactlyOnceWith({ providerId: PROVIDER.id, input: { token: "secret", baseUrl: "https://example.com/mail" } });
    expect(api.activateProvider).not.toHaveBeenCalled();
    expect(result.current.drafts[PROVIDER.id]).toEqual({});
    expect(result.current.notice).toMatchObject({ tone: "ok", text: "Key saved." });
    expect(onChanged).toHaveBeenCalledOnce();
    await waitFor(() => expect(api.listProviders).toHaveBeenCalledTimes(2));
  });

  it("switches only after confirmation, and cancel makes no request", async () => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailProvider({ api }));
    await waitFor(() => expect(result.current.view.kind).toBe("loaded"));
    act(() => result.current.askSwitch(PROVIDER));
    expect(api.activateProvider).not.toHaveBeenCalled();
    act(() => result.current.askSwitch(null));
    await act(() => result.current.confirmSwitch());
    expect(api.activateProvider).not.toHaveBeenCalled();
    act(() => result.current.askSwitch(PROVIDER));
    await act(() => result.current.confirmSwitch());
    expect(api.activateProvider).toHaveBeenCalledExactlyOnceWith({ providerId: PROVIDER.id });
    expect(result.current.pendingSwitch).toBeNull();
    expect(result.current.notice?.text).toBe("Now sending with this provider.");
  });

  it("keeps a failed key draft for retry and reports the safe API message", async () => {
    const api = createEmailFake();
    api.saveProviderKey.mockRejectedValue(new ApiError("Key refused", 400));
    const { result } = renderHook(() => useEmailProvider({ api }));
    act(() => result.current.setDraftField(PROVIDER.id, "token", "secret"));
    await act(() => result.current.saveKey(PROVIDER));
    expect(result.current.notice).toMatchObject({ tone: "error", text: "Key refused" });
    expect(result.current.drafts[PROVIDER.id]?.token).toBe("secret");
    expect(result.current.busyId).toBeNull();
    expect(api.activateProvider).not.toHaveBeenCalled();
  });
});
