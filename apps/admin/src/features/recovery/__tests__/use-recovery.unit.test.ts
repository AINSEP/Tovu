import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminRecoveryStatus, AdminRestorePoint } from "../../../lib/api";
import { useRecovery } from "../hooks/use-recovery.hooks";

/**
 * @file `useRecovery` — the Recovery screen's status/points load plus deep-link re-resolution
 * (design-spec.md §4.5, ADR-041 §7/ADR-045 §5, INV-04). Follows the fetch-mocking harness
 * `use-restore-points-section.unit.test.ts` established for this package.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const STATUS: AdminRecoveryStatus = { costClass: "cheap", banner: null };
const POINT: AdminRestorePoint = {
  id: "rp1",
  trigger: "manual",
  costClass: "cheap",
  kind: "full",
  watermarkAtCapture: 42,
  createdAt: "2026-08-01T00:00:00.000Z",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

async function renderLoaded(points: AdminRestorePoint[] = [POINT]) {
  fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
  fetchMock.mockResolvedValueOnce(jsonResponse({ items: points }));
  const view = renderHook(() => useRecovery());
  await waitFor(() => expect(view.result.current.points).not.toBeNull());
  return view;
}

describe("initial load", () => {
  it("starts with status=null, points=null, error=null", () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));
    const { result } = renderHook(() => useRecovery());
    expect(result.current.status).toBeNull();
    expect(result.current.points).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("resolves status and points.items on success", async () => {
    const { result } = await renderLoaded([POINT]);
    expect(result.current.status).toEqual(STATUS);
    expect(result.current.points).toEqual([POINT]);
    expect(result.current.error).toBeNull();
  });

  it("sets the Recovery-specific fallback error when either call fails with no server message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));
    const { result } = renderHook(() => useRecovery());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("failed to load Recovery");
    expect(result.current.status).toBeNull();
  });

  it("uses the server's own error message when one is present", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "database unreachable" }, 500));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));
    const { result } = renderHook(() => useRecovery());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("database unreachable");
  });
});

describe("selected", () => {
  it("starts null (plain list view)", async () => {
    const { result } = await renderLoaded();
    expect(result.current.selected).toBeNull();
  });

  it("setSelected swaps in the given point", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setSelected(POINT));
    expect(result.current.selected).toEqual(POINT);
  });

  it("setSelected(null) returns to the plain list", async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setSelected(POINT));
    act(() => result.current.setSelected(null));
    expect(result.current.selected).toBeNull();
  });
});

describe("deep-link re-resolution (sessionStorage envelope)", () => {
  it("does nothing when no envelope is stashed", async () => {
    const callsBefore = () => fetchMock.mock.calls.length;
    const before = 2; // status + points
    const { result } = await renderLoaded();
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(result.current.selected).toBeNull();
    void callsBefore;
  });

  it("removes the stashed envelope from sessionStorage immediately, even before the resolve call settles", async () => {
    sessionStorage.setItem("recovery-deep-link-envelope", JSON.stringify({ v: 1, restorePointId: "rp1" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ found: true, restorePoint: { restorePointId: "rp1", capturedAt: "2026-08-01T00:00:00.000Z" } }));
    renderHook(() => useRecovery());
    await waitFor(() => expect(sessionStorage.getItem("recovery-deep-link-envelope")).toBeNull());
  });

  it("selects the matching restore point when the server resolves found:true", async () => {
    sessionStorage.setItem("recovery-deep-link-envelope", JSON.stringify({ v: 1, restorePointId: "rp1" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ found: true, restorePoint: { restorePointId: "rp1", capturedAt: "2026-08-01T00:00:00.000Z" } }));
    const { result } = renderHook(() => useRecovery());
    await waitFor(() => expect(result.current.selected).toEqual(POINT));
  });

  it("leaves selected=null when the server resolves found:true but no local point matches the id", async () => {
    sessionStorage.setItem("recovery-deep-link-envelope", JSON.stringify({ v: 1, restorePointId: "does-not-exist" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ found: true, restorePoint: { restorePointId: "does-not-exist", capturedAt: "2026-08-01T00:00:00.000Z" } }));
    const { result } = renderHook(() => useRecovery());
    await waitFor(() => expect(result.current.points).not.toBeNull());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.selected).toBeNull();
  });

  it("leaves selected=null (falls back to the plain list) when the server resolves found:false — no error surfaced", async () => {
    sessionStorage.setItem("recovery-deep-link-envelope", JSON.stringify({ v: 1, restorePointId: "rp1" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ found: false, restorePoint: null }));
    const { result } = renderHook(() => useRecovery());
    await waitFor(() => expect(result.current.points).not.toBeNull());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.selected).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("falls back silently (no error, no alarm) when the deep-link resolve call itself fails", async () => {
    sessionStorage.setItem("recovery-deep-link-envelope", JSON.stringify({ v: 1, restorePointId: "rp1" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    const { result } = renderHook(() => useRecovery());
    await waitFor(() => expect(result.current.points).not.toBeNull());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.selected).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("does not attempt deep-link resolution when the stashed envelope is unparseable JSON (ok:false)", async () => {
    sessionStorage.setItem("recovery-deep-link-envelope", "{not json");
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT] }));
    const { result } = renderHook(() => useRecovery());
    await waitFor(() => expect(result.current.points).not.toBeNull());
    // Only the two initial-load calls — no third call attempting to resolve the bad envelope.
    expect(fetchMock.mock.calls.length).toBe(2);
    expect(result.current.selected).toBeNull();
  });
});
