import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminRestorePoint } from "../../../lib/api";
import { useRestorePointsSection } from "../hooks/use-restore-points-section.hooks";

/**
 * @file `useRestorePointsSection` (the Database screen's restore-point list + create action).
 * Follows the fetch-mocking harness `Comments.unit.test.tsx`/`use-roles.unit.test.ts` established
 * for this package.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

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
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderLoaded() {
  fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT] }));
  const view = renderHook(() => useRestorePointsSection());
  await waitFor(() => expect(view.result.current.points).not.toBeNull());
  return view;
}

describe("initial load", () => {
  it("starts with points=null, then resolves to the raw items", async () => {
    const { result } = await renderLoaded();
    expect(result.current.points).toEqual([POINT]);
    expect(result.current.error).toBeNull();
  });

  it("sets the Database-specific fallback message on a failed load with no server message", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 500));
    const { result } = renderHook(() => useRestorePointsSection());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("failed to load restore points");
    expect(result.current.points).toBeNull();
  });
});

describe("createRestorePoint", () => {
  it("POSTs { trigger: 'manual', costAck: true } unconditionally", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ restorePoint: { id: "rp2", costClass: "cheap", kind: "full" } }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT] })); // reload

    await act(async () => {
      await result.current.createRestorePoint();
    });

    const createCall = fetchMock.mock.calls.at(-2)!;
    expect(String(createCall[0])).toContain("/database/restore-points");
    expect(JSON.parse(String((createCall[1] as RequestInit).body))).toEqual({ trigger: "manual", costAck: true });
  });

  it("sets creating=true during the request, reloads the list on success, then clears creating", async () => {
    const { result } = await renderLoaded();
    let resolveCreate: ((r: Response) => void) | undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveCreate = resolve)));

    let createPromise!: Promise<void>;
    act(() => {
      createPromise = result.current.createRestorePoint();
    });
    expect(result.current.creating).toBe(true);

    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT, { ...POINT, id: "rp2" }] })); // reload
    await act(async () => {
      resolveCreate?.(jsonResponse({ restorePoint: { id: "rp2", costClass: "cheap", kind: "full" } }));
      await createPromise;
    });

    expect(result.current.creating).toBe(false);
    expect(result.current.points).toHaveLength(2);
  });

  it("sets error with the Database-specific fallback and clears creating on failure — without reloading", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 409)); // RESTORE_POINT_UNAVAILABLE-shaped, no message

    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.createRestorePoint();
    });

    expect(result.current.creating).toBe(false);
    expect(result.current.error).toBe("Failed to create restore point");
    // Only the failed create call — no follow-up reload GET.
    expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);
  });

  it("uses the server's own error message when one is present", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "site is unavailable for snapshots" }, 409));

    await act(async () => {
      await result.current.createRestorePoint();
    });

    expect(result.current.error).toBe("site is unavailable for snapshots");
  });
});
