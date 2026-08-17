import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../lib/api";
import { useAssistantDaemonRestart } from "../hooks/use-assistant-daemon-restart.hooks";
import { createFakeAssistantDaemonRestartPort } from "../hooks/assistant-daemon-restart-dependencies.hooks";
import type { AssistantDaemonRestartPort } from "../hooks/assistant-daemon-restart-port.hooks";

/**
 * @file First test file for `useAssistantDaemonRestart` — the "Restart assistant" button's state
 * hook. Regression evidence for the wiring this pass adds: a status check on mount, a follow-up
 * status check after every `restart()` (accepted or refused), and the two error paths kept
 * separate (`restartError` for an unexpected `restart()` failure vs. `restartResult.reason` for an
 * ordinary server refusal). Also covers the 2026-08-17 source-control-ui finding: the post-restart
 * re-check must wait `postRestartCheckDelayMs`, not fire immediately.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("useAssistantDaemonRestart — status check on mount", () => {
  it("calls getReadyz() once on mount and reports knownFailed:true when the server latches a failure", async () => {
    const port = createFakeAssistantDaemonRestartPort({ readyz: { ready: false, assistantDaemonKnownFailed: true } });
    const { result } = renderHook(() => useAssistantDaemonRestart({ port }));

    await waitFor(() => expect(result.current.knownFailed).toBe(true));
    expect(port.readyzCallCount).toBe(1);
    expect(result.current.statusError).toBeNull();
  });

  it("reports knownFailed:false (never 'healthy') when the server has nothing latched", async () => {
    const port = createFakeAssistantDaemonRestartPort({ readyz: { ready: true } });
    const { result } = renderHook(() => useAssistantDaemonRestart({ port }));

    await waitFor(() => expect(result.current.knownFailed).toBe(false));
  });

  it("knownFailed starts null (not yet checked), distinct from false (checked, no failure)", () => {
    const port = createFakeAssistantDaemonRestartPort();
    const { result } = renderHook(() => useAssistantDaemonRestart({ port }));
    expect(result.current.knownFailed).toBeNull();
  });
});

describe("useAssistantDaemonRestart — restart()", () => {
  it("calls port.restart() and stores the server's own {ok:true} answer verbatim", async () => {
    const port = createFakeAssistantDaemonRestartPort({ restartResult: { ok: true } });
    const { result } = renderHook(() => useAssistantDaemonRestart({ port }));
    await waitFor(() => expect(result.current.knownFailed).not.toBeNull());

    await act(async () => {
      await result.current.restart();
    });

    expect(port.restartCallCount).toBe(1);
    expect(result.current.restartResult).toEqual({ ok: true });
    expect(result.current.restartError).toBeNull();
    expect(result.current.restarting).toBe(false);
  });

  it("stores an ordinary {ok:false, reason} refusal in restartResult, NOT in restartError", async () => {
    const port = createFakeAssistantDaemonRestartPort({ restartResult: { ok: false, reason: "shutting down" } });
    const { result } = renderHook(() => useAssistantDaemonRestart({ port }));
    await waitFor(() => expect(result.current.knownFailed).not.toBeNull());

    await act(async () => {
      await result.current.restart();
    });

    expect(result.current.restartResult).toEqual({ ok: false, reason: "shutting down" });
    expect(result.current.restartError).toBeNull();
  });

  it("re-checks status after restart() settles, regardless of ok/refused — proving the caller can see live status after the click", async () => {
    const port = createFakeAssistantDaemonRestartPort({ restartResult: { ok: true } });
    const { result } = renderHook(() => useAssistantDaemonRestart({ port }));
    await waitFor(() => expect(port.readyzCallCount).toBe(1)); // the mount-time check

    await act(async () => {
      await result.current.restart();
    });

    expect(port.readyzCallCount).toBe(2); // the post-restart follow-up check
  });

  it("waits postRestartCheckDelayMs before firing the post-restart re-check — an immediate read would almost certainly re-report the OLD state", async () => {
    vi.useFakeTimers();
    const port = createFakeAssistantDaemonRestartPort({ restartResult: { ok: true } });
    const { result } = renderHook(() => useAssistantDaemonRestart({ port, postRestartCheckDelayMs: 2500 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // let the mount-time checkStatus() settle
    });
    expect(port.readyzCallCount).toBe(1);

    let restartPromise!: Promise<void>;
    act(() => {
      restartPromise = result.current.restart();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0); // let restart()'s own port.restart() microtask settle
    });
    expect(result.current.restarting).toBe(false); // the mutation itself has already resolved...
    expect(port.readyzCallCount).toBe(1); // ...but the follow-up read has NOT fired yet

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2499);
    });
    expect(port.readyzCallCount).toBe(1); // still not yet, one millisecond short of the delay

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await restartPromise;
    });
    expect(port.readyzCallCount).toBe(2); // fires once the full delay has elapsed
  });

  it("an UNEXPECTED restart() failure (network/403/500) lands in restartError, and restartResult is left untouched", async () => {
    const port: AssistantDaemonRestartPort = {
      restart: vi.fn(async () => {
        throw new ApiError("forbidden", 403, "FORBIDDEN");
      }),
      getReadyz: vi.fn(async () => ({ ready: true })),
    };
    const { result } = renderHook(() => useAssistantDaemonRestart({ port }));
    await waitFor(() => expect(result.current.knownFailed).not.toBeNull());

    await act(async () => {
      await result.current.restart();
    });

    expect(result.current.restartError).toBe("forbidden");
    expect(result.current.restartResult).toBeNull();
    expect(result.current.restarting).toBe(false);
    // The status re-check still happens even though restart() itself threw.
    expect(port.getReadyz).toHaveBeenCalledTimes(2);
  });

  it("restarting is true only while the call is in flight", async () => {
    let resolveRestart: (value: { ok: boolean }) => void = () => undefined;
    const port: AssistantDaemonRestartPort = {
      restart: vi.fn(() => new Promise<{ ok: boolean }>((resolve) => (resolveRestart = resolve))),
      getReadyz: vi.fn(async () => ({ ready: true })),
    };
    const { result } = renderHook(() => useAssistantDaemonRestart({ port }));
    await waitFor(() => expect(result.current.knownFailed).not.toBeNull());

    let restartPromise!: Promise<void>;
    act(() => {
      restartPromise = result.current.restart();
    });
    expect(result.current.restarting).toBe(true);

    await act(async () => {
      resolveRestart({ ok: true });
      await restartPromise;
    });
    expect(result.current.restarting).toBe(false);
  });
});

describe("useAssistantDaemonRestart — checkStatus() error path", () => {
  it("an unexpected getReadyz() failure lands in statusError, not knownFailed", async () => {
    const port: AssistantDaemonRestartPort = {
      restart: vi.fn(async () => ({ ok: true })),
      getReadyz: vi.fn(async () => {
        throw new Error("network down");
      }),
    };
    const { result } = renderHook(() => useAssistantDaemonRestart({ port }));

    await waitFor(() => expect(result.current.statusError).toBe("network down"));
    expect(result.current.knownFailed).toBeNull();
  });
});
