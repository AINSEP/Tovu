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
  // `useRestorePointsSection` now also calls `useAdminLocale()` (real `fetch`, not this hook's
  // own concern), which would otherwise consume one of this file's strictly-ordered
  // `mockResolvedValueOnce` slots and shift every later assertion by one call. Routed to a fixed
  // default-locale response outside `fetchMock`'s own call queue — same interceptor pattern
  // `Members.unit.test.tsx` uses.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return fetchMock(url, init);
  });
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

describe("t (2026-08-11, standing i18n rule)", () => {
  /** `Database.tsx` no longer imports `useAdminLocale`/`database-i18n` for this section — `t` must
   *  reflect this hook's OWN already-resolved locale (the same one it already used for its own
   *  error strings), not a hardcoded English pass-through. */
  it("t reflects the locale settings fetch's resolved value, not the DEFAULT_LOCALE this hook starts with", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [POINT] }));
    // Cast rather than calling `fetchMock` directly — this vitest version's `Mock` type is not
    // itself callable without narrowing (a pre-existing tsc gap this whole file's `beforeEach`
    // already carries; scoped locally here rather than touching that shared declaration).
    const network = fetchMock as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
        return Promise.resolve(jsonResponse({ data: [{ key: "locale", value: "es" }] }));
      }
      return network(url, init);
    });

    const { result } = renderHook(() => useRestorePointsSection());

    await waitFor(() => expect(result.current.t("Restore points")).toBe("Puntos de restauración"));
  });
});
