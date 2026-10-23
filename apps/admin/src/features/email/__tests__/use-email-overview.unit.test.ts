import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import type { MailTestSendResult } from "../email-api";
import { useEmailOverview } from "../hooks/use-email-overview.hooks";
import { createEmailFake, AT } from "./email.test-helpers";

/** @file Every send outcome, including the structured 429 result, survives the API boundary. */
const base = { to: "ada@example.com", from: "hello@example.com", driver: "hosted", at: AT };
const outcomes: MailTestSendResult[] = [
  { ...base, outcome: "accepted", providerMessageId: "msg-1" },
  { ...base, outcome: "captured", where: "console", providerMessageId: "msg-2" },
  { ...base, outcome: "redirected", redirectedTo: "test@example.com", providerMessageId: "msg-3" },
  { ...base, outcome: "failed", errorCode: "REFUSED", message: "Refused", retryable: false },
  { ...base, outcome: "unknown", errorCode: "TIMEOUT", message: "Timed out", retryable: false },
];
describe("useEmailOverview", () => {
  it.each(outcomes)("shows $outcome without claiming delivery", async (answer) => {
    const api = createEmailFake();
    api.sendTest.mockResolvedValue({ sent: answer.outcome === "accepted", result: answer });
    const { result } = renderHook(() => useEmailOverview({ api }, { requestId: () => "click-id-1" }));
    await waitFor(() => expect(result.current.uses.kind).toBe("loaded"));
    act(() => result.current.setTo(" ada@example.com "));
    await act(() => result.current.sendTest());
    expect(api.sendTest).toHaveBeenCalledExactlyOnceWith({ to: "ada@example.com", requestId: "click-id-1" });
    expect(result.current.test).toEqual({ kind: "done", result: answer });
    await waitFor(() => expect(api.readUses).toHaveBeenCalledTimes(2));
  });

  it("omits a blank recipient so the server uses the account address; each click has a new id", async () => {
    const api = createEmailFake();
    let click = 0;
    const { result } = renderHook(() => useEmailOverview({ api }, { requestId: () => `click-id-${++click}` }));
    await act(() => result.current.sendTest());
    await act(() => result.current.sendTest());
    expect(api.sendTest.mock.calls).toEqual([[{ to: undefined, requestId: "click-id-1" }], [{ to: undefined, requestId: "click-id-2" }]]);
  });

  it("renders the result carried by a 429 instead of a generic transport error", async () => {
    const api = createEmailFake();
    const answer: MailTestSendResult = { ...base, outcome: "failed", errorCode: "RATE_LIMITED", message: "Wait before sending again.", retryable: true };
    api.sendTest.mockRejectedValue(new ApiError("Too many requests", 429, "RATE_LIMITED", { result: answer }));
    const { result } = renderHook(() => useEmailOverview({ api }));
    await act(() => result.current.sendTest());
    expect(result.current.test).toEqual({ kind: "done", result: answer });
  });

  it("reports an error without a result, then permits retry", async () => {
    const api = createEmailFake();
    api.sendTest.mockRejectedValueOnce(new ApiError("Unavailable", 503));
    const { result } = renderHook(() => useEmailOverview({ api }));
    await act(() => result.current.sendTest());
    expect(result.current.test).toEqual({ kind: "error", message: "Unavailable" });
    await act(() => result.current.sendTest());
    expect(result.current.test.kind).toBe("done");
  });
});
