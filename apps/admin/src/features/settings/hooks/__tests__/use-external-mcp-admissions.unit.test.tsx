import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, type AdminExternalMcpAdmissionsSnapshot } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";

import {
  isAssistantStartingError,
  UNAVAILABLE_RETRY_ATTEMPTS,
  UNAVAILABLE_RETRY_INTERVAL_MS,
  useExternalMcpAdmissions,
  type ExternalMcpAdmissionsPort,
} from "../use-external-mcp-admissions.hooks";
import type { SavedConnectionIntent } from "../../external-mcp-admissions-rules";

/**
 * @file ADM-002 (2026-09-07): the banner permanently reported the PREVIOUS daemon.
 *
 * The restart mutation carried no `invalidates`, and the admissions query has no polling and
 * `refetchOnWindowFocus: false` — so after an operator ticked "may write" and clicked Restart, the
 * `admissions.data` behind the banner stayed the pre-restart snapshot for the whole mounted
 * session, and "Restarting…" stayed on screen forever beside it. The operator's evidence that their
 * fix worked never arrived, from the one surface built to give it to them.
 *
 * The fix has to be a bounded WATCH rather than an invalidation: the restart route returns as soon
 * as a restart is INITIATED and structurally cannot wait for the new daemon to be healthy (its own
 * header says so), so a refetch fired on the 200 is guaranteed to read either the dying daemon or a
 * 503. Every test here is written against elapsed time for that reason.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const SAVED: Record<string, SavedConnectionIntent> = {
  higgsfield: { allowedToolNames: "generate_image", enabled: true },
};

/** The pre-restart daemon: `generate_image` refused for want of a write grant. */
const STALE: AdminExternalMcpAdmissionsSnapshot = {
  connections: [
    {
      connectionId: "higgsfield",
      admitted: [],
      refused: [{ remoteName: "generate_image", reason: "remote-declares-not-read-only" }],
      allowlistedButAbsent: [],
      writeAllowedButNotAllowlisted: [],
    },
  ],
};

/** The daemon after the restart picked up the operator's new write grant. */
const FIXED: AdminExternalMcpAdmissionsSnapshot = {
  connections: [
    {
      connectionId: "higgsfield",
      admitted: [{ remoteName: "generate_image", writeAuthorized: true }],
      refused: [],
      allowlistedButAbsent: [],
      writeAllowedButNotAllowlisted: [],
    },
  ],
};

/**
 * A port whose admissions read answers `STALE` until `restartAssistantDaemon` is called and
 * `bootDelayMs` has elapsed — the real timing, not an instant swap: the whole point of the finding
 * is that the correct snapshot is unavailable at the moment the restart is accepted.
 */
function fakePort(options: { bootDelayMs?: number } = {}) {
  const bootDelayMs = options.bootDelayMs ?? 5_000;
  let restartedAt: number | null = null;
  const getAdmissions = vi.fn(async (): Promise<AdminExternalMcpAdmissionsSnapshot> => {
    if (restartedAt !== null && Date.now() - restartedAt >= bootDelayMs) return FIXED;
    return STALE;
  });

  const port: ExternalMcpAdmissionsPort = {
    getAdmissions,
    me: async () => ({ effectivePermissions: ["system.write"] }),
    restartAssistantDaemon: async () => {
      restartedAt = Date.now();
      return { ok: true };
    },
  };

  return { port, getAdmissions };
}

describe("useExternalMcpAdmissions — post-restart freshness (ADM-002)", () => {
  it("re-reads admissions after a restart it triggered, so the banner stops reporting the previous daemon", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { port } = fakePort({ bootDelayMs: 5_000 });
      const { result } = renderHook(() => useExternalMcpAdmissions({ port, savedAllowedToolNamesById: SAVED }), { wrapper });

      await waitFor(() => expect(result.current.connections).toHaveLength(1));
      expect(result.current.connections[0]?.entries[0]?.kind).toBe("needs-write-grant");

      await act(async () => {
        result.current.restart();
      });
      expect(result.current.restartAccepted).toBe(true);

      // Long enough for the new daemon to be up and for the watch to have read it.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });

      expect(result.current.connections).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops claiming 'Restarting…' once the watch window closes — the flag was never cleared before", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { port } = fakePort({ bootDelayMs: 5_000 });
      const { result } = renderHook(() => useExternalMcpAdmissions({ port, savedAllowedToolNamesById: SAVED }), { wrapper });

      await waitFor(() => expect(result.current.connections).toHaveLength(1));
      await act(async () => {
        result.current.restart();
      });
      expect(result.current.restartAccepted).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });

      expect(result.current.restartAccepted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not re-read admissions on its own without a restart — the watch is bounded to the action that needs it", async () => {
    // The negative control. A blanket `refetchInterval` would make the first test pass while
    // polling the daemon forever on a settings tab nobody is looking at.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { port, getAdmissions } = fakePort();
      const { result } = renderHook(() => useExternalMcpAdmissions({ port, savedAllowedToolNamesById: SAVED }), { wrapper });

      await waitFor(() => expect(result.current.connections).toHaveLength(1));
      const readsAfterLoad = getAdmissions.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });

      expect(getAdmissions.mock.calls.length).toBe(readsAfterLoad);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not watch after a REFUSED restart — nothing was restarted, so there is nothing to catch up to", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { port, getAdmissions } = fakePort();
      port.restartAssistantDaemon = async () => ({ ok: false, reason: "shutting down" });
      const { result } = renderHook(() => useExternalMcpAdmissions({ port, savedAllowedToolNamesById: SAVED }), { wrapper });

      await waitFor(() => expect(result.current.connections).toHaveLength(1));
      const readsAfterLoad = getAdmissions.mock.calls.length;

      await act(async () => {
        result.current.restart();
      });
      expect(result.current.restartError).toBe("shutting down");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });

      expect(getAdmissions.mock.calls.length).toBe(readsAfterLoad);
      expect(result.current.restartAccepted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a watch in flight does not outlive the panel — no timer fires after unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { port, getAdmissions } = fakePort();
      const { result, unmount } = renderHook(() => useExternalMcpAdmissions({ port, savedAllowedToolNamesById: SAVED }), { wrapper });

      await waitFor(() => expect(result.current.connections).toHaveLength(1));
      await act(async () => {
        result.current.restart();
      });

      unmount();
      const readsAtUnmount = getAdmissions.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });

      expect(getAdmissions.mock.calls.length).toBe(readsAtUnmount);
    } finally {
      vi.useRealTimers();
    }
  });
});

/** The admissions route's own 503 body for a daemon that is not listening yet. */
function daemonUnavailable(): ApiError {
  return new ApiError("the agent daemon is not reachable — the assistant may not be running", 503, "AGENT_DAEMON_UNAVAILABLE", {
    error: "the agent daemon is not reachable — the assistant may not be running",
    code: "AGENT_DAEMON_UNAVAILABLE",
  });
}

/** A port whose admissions read fails with `failure()` for the first `failures` reads, then answers. */
function startingPort(failures: number, failure: () => Error = daemonUnavailable) {
  let reads = 0;
  const getAdmissions = vi.fn(async (): Promise<AdminExternalMcpAdmissionsSnapshot> => {
    reads += 1;
    if (reads <= failures) throw failure();
    return STALE;
  });
  const port: ExternalMcpAdmissionsPort = {
    getAdmissions,
    me: async () => ({ effectivePermissions: ["system.write"] }),
    restartAssistantDaemon: async () => ({ ok: true }),
  };
  return { port, getAdmissions };
}

// 2026-09-29: the owner saw "the agent daemon is not reachable" while the assistant was plainly
// running. The daemon binds its port only after connecting every saved server (~80s on this box),
// the dev API respawns it on every source save, and the tab read admissions ONCE on mount. Owner
// rule: users never fix anything by hand — wait and retry, don't show a scary error.
describe("useExternalMcpAdmissions — waits for a starting assistant instead of reporting it down", () => {
  it("does not surface the 503 while the daemon is starting, and loads the real answer once it is up", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { port } = startingPort(5);
      const { result } = renderHook(() => useExternalMcpAdmissions({ port, savedAllowedToolNamesById: SAVED }), { wrapper });

      await waitFor(() => expect(result.current.waitingForAssistant).toBe(true));
      expect(result.current.unavailable).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(UNAVAILABLE_RETRY_INTERVAL_MS * 8);
      });

      expect(result.current.waitingForAssistant).toBe(false);
      expect(result.current.unavailable).toBeNull();
      expect(result.current.connections).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports the daemon as unavailable only after the whole wait is spent", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { port, getAdmissions } = startingPort(Number.POSITIVE_INFINITY);
      const { result } = renderHook(() => useExternalMcpAdmissions({ port, savedAllowedToolNamesById: SAVED }), { wrapper });

      await waitFor(() => expect(result.current.waitingForAssistant).toBe(true));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(UNAVAILABLE_RETRY_INTERVAL_MS * (UNAVAILABLE_RETRY_ATTEMPTS + 5));
      });

      expect(result.current.waitingForAssistant).toBe(false);
      expect(result.current.unavailable).toBe("the agent daemon is not reachable — the assistant may not be running");
      // One mount read plus exactly the bounded retries — never an unbounded poll.
      expect(getAdmissions).toHaveBeenCalledTimes(UNAVAILABLE_RETRY_ATTEMPTS + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not wait on an error that waiting cannot fix (403)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { port, getAdmissions } = startingPort(Number.POSITIVE_INFINITY, () => new ApiError("forbidden", 403, "FORBIDDEN"));
      const { result } = renderHook(() => useExternalMcpAdmissions({ port, savedAllowedToolNamesById: SAVED }), { wrapper });

      await waitFor(() => expect(result.current.unavailable).toBe("forbidden"));
      expect(result.current.waitingForAssistant).toBe(false);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(UNAVAILABLE_RETRY_INTERVAL_MS * 10);
      });

      expect(getAdmissions).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops retrying when the panel unmounts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { port, getAdmissions } = startingPort(Number.POSITIVE_INFINITY);
      const { result, unmount } = renderHook(() => useExternalMcpAdmissions({ port, savedAllowedToolNamesById: SAVED }), { wrapper });

      await waitFor(() => expect(result.current.waitingForAssistant).toBe(true));
      unmount();
      const readsAtUnmount = getAdmissions.mock.calls.length;

      await act(async () => {
        await vi.advanceTimersByTimeAsync(UNAVAILABLE_RETRY_INTERVAL_MS * 10);
      });

      expect(getAdmissions.mock.calls.length).toBe(readsAtUnmount);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("isAssistantStartingError", () => {
  it.each([
    ["the admissions route's 503", new ApiError("x", 503, "AGENT_DAEMON_UNAVAILABLE")],
    ["an API that is itself restarting", new ApiError("x", 0, "API_UNREACHABLE")],
    ["a request that timed out", new ApiError("x", 0, "REQUEST_TIMEOUT")],
    ["a bare 500 from the dev proxy", new ApiError("", 500)],
  ])("treats %s as 'still starting'", (_label, error) => {
    expect(isAssistantStartingError(error)).toBe(true);
  });

  it.each([
    ["a 401", new ApiError("x", 401, "UNAUTHENTICATED")],
    ["a 403", new ApiError("x", 403, "FORBIDDEN")],
    ["a plain Error", new Error("x")],
    ["nothing", null],
  ])("does not wait on %s", (_label, error) => {
    expect(isAssistantStartingError(error)).toBe(false);
  });
});
