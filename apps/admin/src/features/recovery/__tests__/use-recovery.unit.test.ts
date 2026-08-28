import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminRecoveryStatus, AdminRestorePoint } from "@/lib/api";
import { useRecovery, useWiredRecovery } from "../hooks/use-recovery.hooks";
import { createFakeRecoveryPort } from "../hooks/recovery-dependencies.hooks";

/**
 * @file `useRecovery` — the Recovery screen's status/points load plus deep-link re-resolution
 * (design-spec.md §4.5, ADR-041 §7/ADR-045 §5, INV-04). Follows the fetch-mocking harness
 * `use-restore-points-section.unit.test.ts` established for this package. The bodies below drive
 * the WIRED hook (real `fetch`); the "injected port" describe block at the bottom (2026-08-14,
 * Orc-BASH pass) proves the pure hook is independently testable against `createFakeRecoveryPort`
 * with no `fetch` stub for the data itself.
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

let fetchMock: ReturnType<typeof vi.fn<(...args: any[]) => any>>;

beforeEach(() => {
  fetchMock = vi.fn();
  // `useRecovery` now also calls `useAdminLocale()` (real `fetch`, not this hook's own concern),
  // which would otherwise consume one of this file's strictly-ordered `mockResolvedValueOnce`
  // slots and shift every later assertion by one call. Routed to a fixed default-locale response
  // outside `fetchMock`'s own call queue — same interceptor pattern `Members.unit.test.tsx` uses.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return fetchMock(url, init);
  });
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

async function renderLoaded(points: AdminRestorePoint[] = [POINT]) {
  fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
  fetchMock.mockResolvedValueOnce(jsonResponse({ items: points }));
  const view = renderHook(() => useWiredRecovery());
  await waitFor(() => expect(view.result.current.points).not.toBeNull());
  return view;
}

describe("initial load", () => {
  it("starts with status=null, points=null, error=null", () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));
    const { result } = renderHook(() => useWiredRecovery());
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
    const { result } = renderHook(() => useWiredRecovery());
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("failed to load Recovery");
    expect(result.current.status).toBeNull();
  });

  it("uses the server's own error message when one is present", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "database unreachable" }, 500));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));
    const { result } = renderHook(() => useWiredRecovery());
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
    renderHook(() => useWiredRecovery());
    await waitFor(() => expect(sessionStorage.getItem("recovery-deep-link-envelope")).toBeNull());
  });

  it("selects the matching restore point when the server resolves found:true", async () => {
    sessionStorage.setItem("recovery-deep-link-envelope", JSON.stringify({ v: 1, restorePointId: "rp1" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ found: true, restorePoint: { restorePointId: "rp1", capturedAt: "2026-08-01T00:00:00.000Z" } }));
    const { result } = renderHook(() => useWiredRecovery());
    await waitFor(() => expect(result.current.selected).toEqual(POINT));
  });

  it("leaves selected=null when the server resolves found:true but no local point matches the id", async () => {
    sessionStorage.setItem("recovery-deep-link-envelope", JSON.stringify({ v: 1, restorePointId: "does-not-exist" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ found: true, restorePoint: { restorePointId: "does-not-exist", capturedAt: "2026-08-01T00:00:00.000Z" } }));
    const { result } = renderHook(() => useWiredRecovery());
    await waitFor(() => expect(result.current.points).not.toBeNull());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.selected).toBeNull();
  });

  it("leaves selected=null (falls back to the plain list) when the server resolves found:false — no error surfaced", async () => {
    sessionStorage.setItem("recovery-deep-link-envelope", JSON.stringify({ v: 1, restorePointId: "rp1" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT] }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ found: false, restorePoint: null }));
    const { result } = renderHook(() => useWiredRecovery());
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
    const { result } = renderHook(() => useWiredRecovery());
    await waitFor(() => expect(result.current.points).not.toBeNull());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.selected).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("does not attempt deep-link resolution when the stashed envelope is unparseable JSON (ok:false)", async () => {
    sessionStorage.setItem("recovery-deep-link-envelope", "{not json");
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT] }));
    const { result } = renderHook(() => useWiredRecovery());
    await waitFor(() => expect(result.current.points).not.toBeNull());
    // Only the two initial-load calls — no third call attempting to resolve the bad envelope.
    expect(fetchMock.mock.calls.length).toBe(2);
    expect(result.current.selected).toBeNull();
  });
});

describe("t/locale (2026-08-11, standing i18n rule)", () => {
  /** `Recovery.tsx` no longer imports `useAdminLocale`/`recovery-i18n` for the top-level screen —
   *  `t`/`locale` must reflect this hook's OWN already-resolved locale (the same one it already
   *  used for its own error strings), not a hardcoded English pass-through. */
  it("t/locale reflect the locale settings fetch's resolved value, not the DEFAULT_LOCALE this hook starts with", async () => {
    const network = fetchMock as unknown as (url: string, init?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      if (String(url).includes("/settings/effective") && String(url).includes("namespace=core.language")) {
        return Promise.resolve(jsonResponse({ data: [{ key: "locale", value: "es" }] }));
      }
      return network(url, init);
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(STATUS));
    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [] }));

    const { result } = renderHook(() => useWiredRecovery());

    await waitFor(() => expect(result.current.locale).toBe("es"));
    expect(result.current.t("Recovery")).toBe("Recuperación");
  });
});

describe("injected port (2026-08-14, Orc-BASH pass)", () => {
  /** Drives the pure hook directly against `createFakeRecoveryPort` — `fetchMock` (the real
   *  network `useWiredRecovery` above goes through) is asserted NEVER called for the Recovery data
   *  itself; only this file's own `beforeEach` locale-settings shim still uses real `fetch`, since
   *  `useAdminLocale()` is a separate, un-injected concern from this port. */
  it("loads status and points from the fake port with no real fetch call for the data itself", async () => {
    const port = createFakeRecoveryPort({ status: STATUS, points: [POINT] });
    const { result } = renderHook(() => useRecovery({ port }));

    await waitFor(() => expect(result.current.points).not.toBeNull());
    expect(result.current.status).toEqual(STATUS);
    expect(result.current.points).toEqual([POINT]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a load failure from the fake port's rejected calls", async () => {
    const port = createFakeRecoveryPort({ loadError: new Error("boom from fake") });
    const { result } = renderHook(() => useRecovery({ port }));
    await waitFor(() => expect(result.current.error).toBe("boom from fake"));
    expect(result.current.status).toBeNull();
  });

  it("resolves a stashed deep-link envelope through the fake port's own call log", async () => {
    sessionStorage.setItem("recovery-deep-link-envelope", JSON.stringify({ v: 1, restorePointId: "rp1" }));
    const port = createFakeRecoveryPort({
      points: [POINT],
      deepLinkResult: { found: true, restorePoint: { restorePointId: "rp1", capturedAt: "2026-08-01T00:00:00.000Z" } },
    });
    const { result } = renderHook(() => useRecovery({ port }));

    await waitFor(() => expect(result.current.selected).toEqual(POINT));
    expect(port.deepLinkCalls).toHaveLength(1);
    expect(port.deepLinkCalls[0]).toMatchObject({ restorePointId: "rp1" });
    sessionStorage.clear();
  });
});
