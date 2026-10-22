import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, type AdminMailStatus } from "@/lib/api";
import { emailSummary, useEmail, type EmailPort } from "../hooks/use-email.hooks";

/**
 * @file `useEmail` over an injected port: loading → loaded, 403 → forbidden, any other failure →
 * error (never "not set up"), and Retry reads again. `emailSummary` is the Status verdict.
 */

const READY: AdminMailStatus = {
  mailDeliveryAvailable: true,
  state: "ready",
  lanes: [{ lane: "transactional", providerId: "p", state: "ready" }, { lane: "bulk", providerId: "p", state: "ready" }],
  warnings: [],
};

function port(getMailStatus: EmailPort["getMailStatus"]): EmailPort {
  return { getMailStatus };
}

describe("useEmail", () => {
  it("starts loading, then shows the status", async () => {
    const fake = port(vi.fn(async () => READY));
    const { result } = renderHook(() => useEmail({ port: fake, locale: "es" }));
    expect(result.current.view).toEqual({ kind: "loading" });
    expect(result.current.locale).toBe("es");
    await waitFor(() => expect(result.current.view).toEqual({ kind: "loaded", status: READY }));
  });

  it("reports a 403 as forbidden", async () => {
    const fake = port(vi.fn(async () => { throw new ApiError("forbidden", 403, "FORBIDDEN"); }));
    const { result } = renderHook(() => useEmail({ port: fake, locale: "en" }));
    await waitFor(() => expect(result.current.view).toEqual({ kind: "forbidden" }));
  });

  it("reports any other failure as error, and retry reads again", async () => {
    const getMailStatus = vi.fn<EmailPort["getMailStatus"]>()
      .mockRejectedValueOnce(new ApiError("internal error", 500))
      .mockResolvedValueOnce(READY);
    const fake = port(getMailStatus);
    const { result } = renderHook(() => useEmail({ port: fake, locale: "en" }));
    await waitFor(() => expect(result.current.view).toEqual({ kind: "error" }));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.view).toEqual({ kind: "loaded", status: READY }));
    expect(getMailStatus).toHaveBeenCalledTimes(2);
  });

  it("ignores a status that arrives after unmount", async () => {
    let resolve: (value: AdminMailStatus) => void = () => {};
    const fake = port(() => new Promise<AdminMailStatus>((done) => { resolve = done; }));
    const { result, unmount } = renderHook(() => useEmail({ port: fake, locale: "en" }));
    unmount();
    resolve(READY);
    await Promise.resolve();
    expect(result.current.view).toEqual({ kind: "loading" });
  });
});

describe("emailSummary", () => {
  it("is not set up when no provider is chosen", () => {
    expect(emailSummary({ status: { mailDeliveryAvailable: false, state: "unconfigured" } })).toBe("not_set_up");
  });

  it("is never healthy on a local-only lane", () => {
    const status: AdminMailStatus = {
      mailDeliveryAvailable: false,
      state: "degraded",
      lanes: [{ lane: "transactional", providerId: "local", state: "local_only" }, { lane: "bulk", providerId: "local", state: "local_only" }],
    };
    expect(emailSummary({ status })).toBe("no_external_delivery");
  });

  it("needs attention when degraded or the sender has warnings", () => {
    expect(emailSummary({ status: { ...READY, state: "degraded" } })).toBe("needs_attention");
    expect(emailSummary({ status: { ...READY, warnings: ["sender_unverified"] } })).toBe("needs_attention");
  });

  it("is configured when every lane is ready and nothing warns", () => {
    expect(emailSummary({ status: READY })).toBe("configured");
  });

  it("falls back to mailDeliveryAvailable on a server without `state`", () => {
    expect(emailSummary({ status: { mailDeliveryAvailable: true } })).toBe("configured");
    expect(emailSummary({ status: { mailDeliveryAvailable: false } })).toBe("no_external_delivery");
  });
});
