import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { useEmailSender } from "../hooks/use-email-sender.hooks";
import { createEmailFake, DNS } from "./email.test-helpers";

/** @file Sender validation happens before settings writes; DNS is checked explicitly. */
describe("useEmailSender", () => {
  it("loads sender settings, saves only changed trimmed values, then refreshes DNS and status", async () => {
    const api = createEmailFake();
    const onChanged = vi.fn();
    const { result } = renderHook(() => useEmailSender({ api }, { onChanged }));
    await waitFor(() => expect(result.current.draft.email).toBe("hello@example.com"));
    act(() => result.current.setDraft({ name: "  New name  ", email: " hello@example.com " }));
    expect(result.current.dirty).toBe(true);
    expect(api.saveSender).not.toHaveBeenCalled();
    await act(() => result.current.save());
    expect(api.saveSender).toHaveBeenCalledExactlyOnceWith({ key: "senderName", value: "New name" });
    expect(result.current.dirty).toBe(false);
    expect(result.current.saveState).toBe("saved");
    expect(onChanged).toHaveBeenCalledOnce();
    await waitFor(() => expect(api.readDns).toHaveBeenCalledTimes(2));
  });

  it.each(["not-an-address", "Ada <ada@example.com>", "a@example.com, b@example.com"])("refuses %s without any setting writes", async (email) => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailSender({ api }));
    await waitFor(() => expect(result.current.draft.name).toBe("Example"));
    act(() => result.current.setDraft({ name: "New", email }));
    await act(() => result.current.save());
    expect(api.saveSender).not.toHaveBeenCalled();
    expect(result.current.saveState).toEqual({ error: "Enter one email address, like hello@example.com." });
  });

  it("saves a changed address and permits clearing it", async () => {
    const api = createEmailFake();
    const { result } = renderHook(() => useEmailSender({ api }));
    await waitFor(() => expect(result.current.draft.email).toBe("hello@example.com"));
    act(() => result.current.setDraft({ email: " ada@example.com " }));
    await act(() => result.current.save());
    expect(api.saveSender).toHaveBeenLastCalledWith({ key: "senderEmail", value: "ada@example.com" });
    act(() => result.current.setDraft({ email: "" }));
    await act(() => result.current.save());
    expect(api.saveSender).toHaveBeenLastCalledWith({ key: "senderEmail", value: "" });
  });

  it("keeps edits after a failed save and retains DNS when a recheck fails", async () => {
    const api = createEmailFake();
    api.saveSender.mockRejectedValue(new ApiError("Save refused", 403));
    api.verifyDns.mockResolvedValueOnce({ ...DNS, dns: { ...DNS.dns!, overall: "Matches" } }).mockRejectedValueOnce(new ApiError("Try later", 503));
    const { result } = renderHook(() => useEmailSender({ api }));
    await waitFor(() => expect(result.current.draft.name).toBe("Example"));
    act(() => result.current.setDraft({ name: "New" }));
    await act(() => result.current.save());
    expect(result.current.saveState).toEqual({ error: "Save refused" });
    expect(result.current.dirty).toBe(true);
    await act(() => result.current.checkAgain());
    expect(result.current.dns).toMatchObject({ kind: "loaded", data: { dns: { overall: "Matches" } } });
    await act(() => result.current.checkAgain());
    expect(result.current.checkError).toBe("Try later");
    expect(result.current.checking).toBe(false);
    expect(result.current.dns).toMatchObject({ kind: "loaded", data: { dns: { overall: "Matches" } } });
    expect(api.saveSender).toHaveBeenCalledTimes(1);
  });
});
