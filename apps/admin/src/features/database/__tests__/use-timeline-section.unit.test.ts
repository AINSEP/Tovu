import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminLedgerRow } from "../../../lib/api";
import { navigate } from "../../../lib/router";
import { navigateToRecoveryWithDeepLink, useTimelineSection } from "../hooks/use-timeline-section.hooks";

/**
 * @file `useTimelineSection` (the Database screen's ledger browser) and its sibling plain function
 * `navigateToRecoveryWithDeepLink`. Follows the fetch-mocking harness `Comments.unit.test.tsx`/
 * `use-roles.unit.test.ts` established for this package (mock global `fetch`, not the `api`
 * module — asserting the actual query string is part of the point for a cursor-paginated GET).
 */

vi.mock("../../../lib/router", () => ({ navigate: vi.fn() }));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ROW_WITH_RESTORE_POINT: AdminLedgerRow = {
  id: "row1",
  kind: "core.migration",
  createdAt: "2026-08-01T00:00:00.000Z",
  restorePointId: "rp1",
  outcome: "success",
};
const ROW_WITHOUT_RESTORE_POINT: AdminLedgerRow = { ...ROW_WITH_RESTORE_POINT, id: "row2", restorePointId: null };

describe("navigateToRecoveryWithDeepLink", () => {
  beforeEach(() => {
    vi.mocked(navigate).mockClear();
    sessionStorage.clear();
  });

  it("is a no-op — no sessionStorage write, no navigation — when the row carries no restorePointId", () => {
    navigateToRecoveryWithDeepLink(ROW_WITHOUT_RESTORE_POINT);
    expect(sessionStorage.getItem("recovery-deep-link-envelope")).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("stashes a v1 envelope carrying the row's own id/restorePointId/kind, and navigates to /recovery", () => {
    navigateToRecoveryWithDeepLink(ROW_WITH_RESTORE_POINT);

    expect(navigate).toHaveBeenCalledWith("/recovery");
    const raw = sessionStorage.getItem("recovery-deep-link-envelope");
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw!);
    expect(envelope).toMatchObject({
      v: 1,
      correlationId: "database-timeline-row1",
      siteId: "workspace-local",
      ledgerEventId: "row1",
      restorePointId: "rp1",
      drift: "core.migration",
      intent: "view",
    });
    expect(typeof envelope.issuedAt).toBe("string");
    expect(() => new Date(envelope.issuedAt).toISOString()).not.toThrow();
  });
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("initial load", () => {
  it("starts with rows=null, then resolves to the raw items + nextCursor", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [ROW_WITH_RESTORE_POINT], nextCursor: "c2" }));
    const { result } = renderHook(() => useTimelineSection());
    expect(result.current.rows).toBeNull();

    await waitFor(() => expect(result.current.rows).not.toBeNull());
    expect(result.current.rows).toEqual([ROW_WITH_RESTORE_POINT]);
    expect(result.current.nextCursor).toBe("c2");
  });

  it("requests with no query string when every filter is blank", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));
    renderHook(() => useTimelineSection());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/database\/timeline$/);
  });

  it("sets the ApiError's own message using the Database-specific fallback", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    const { result } = renderHook(() => useTimelineSection());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("failed to load the Database Timeline");
    expect(result.current.rows).toBeNull();
  });
});

describe("applyFilters", () => {
  it("prevents default, and reloads with kind/outcome/fromDate/toDate in the query string, REPLACING rows rather than appending", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [ROW_WITH_RESTORE_POINT], nextCursor: null }));
    const { result } = renderHook(() => useTimelineSection());
    await waitFor(() => expect(result.current.rows).not.toBeNull());

    act(() => {
      result.current.setKind("core.migration");
      result.current.setOutcome("success");
      result.current.setFromDate("2026-01-01");
      result.current.setToDate("2026-12-31");
    });

    const preventDefault = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [ROW_WITHOUT_RESTORE_POINT], nextCursor: null }));
    await act(async () => {
      result.current.applyFilters({ preventDefault } as unknown as React.FormEvent);
      await Promise.resolve();
    });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls.at(-1)![0]);
    expect(url).toContain("kind=core.migration");
    expect(url).toContain("outcome=success");
    expect(url).toContain("fromDate=2026-01-01");
    expect(url).toContain("toDate=2026-12-31");
    // Replaced, not appended — a filter change is a reset, not a continuation of the old page.
    expect(result.current.rows).toEqual([ROW_WITHOUT_RESTORE_POINT]);
  });
});

describe("loadMore", () => {
  it("sends the current nextCursor and APPENDS the new page to existing rows", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [ROW_WITH_RESTORE_POINT], nextCursor: "c2" }));
    const { result } = renderHook(() => useTimelineSection());
    await waitFor(() => expect(result.current.rows).not.toBeNull());

    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [ROW_WITHOUT_RESTORE_POINT], nextCursor: null }));
    await act(async () => {
      result.current.loadMore();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain("cursor=c2");
    expect(result.current.rows).toEqual([ROW_WITH_RESTORE_POINT, ROW_WITHOUT_RESTORE_POINT]);
    expect(result.current.nextCursor).toBeNull();
  });

  it("sets loadingMore true immediately, and false again once the page settles (success or failure)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [ROW_WITH_RESTORE_POINT], nextCursor: "c2" }));
    const { result } = renderHook(() => useTimelineSection());
    await waitFor(() => expect(result.current.rows).not.toBeNull());

    let resolveNext: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveNext = resolve)));
    act(() => result.current.loadMore());
    expect(result.current.loadingMore).toBe(true);

    await act(async () => {
      resolveNext?.(jsonResponse({ items: [], nextCursor: null }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.loadingMore).toBe(false);
  });

  it("sends no cursor param when loadMore is called with nextCursor already null", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [ROW_WITH_RESTORE_POINT], nextCursor: null }));
    const { result } = renderHook(() => useTimelineSection());
    await waitFor(() => expect(result.current.rows).not.toBeNull());
    expect(result.current.nextCursor).toBeNull();

    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));
    await act(async () => {
      result.current.loadMore();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(String(fetchMock.mock.calls.at(-1)![0])).not.toContain("cursor=");
  });

  it("on failure, sets error and still clears loadingMore, but does NOT touch existing rows", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [ROW_WITH_RESTORE_POINT], nextCursor: "c2" }));
    const { result } = renderHook(() => useTimelineSection());
    await waitFor(() => expect(result.current.rows).not.toBeNull());

    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));
    await act(async () => {
      result.current.loadMore();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.loadingMore).toBe(false);
    expect(result.current.error).toBe("boom");
    expect(result.current.rows).toEqual([ROW_WITH_RESTORE_POINT]);
  });
});
