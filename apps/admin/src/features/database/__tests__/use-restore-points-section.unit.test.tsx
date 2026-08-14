import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AdminRestorePoint } from "../../../lib/api";
import { FetchQueryProvider } from "../../../lib/fetch-query";
import { useRestorePointsSection, useWiredRestorePointsSection } from "../hooks/use-restore-points-section.hooks";
import { createFakeRestorePointsSectionPort } from "../hooks/restore-points-section-dependencies.hooks";

/**
 * @file `useRestorePointsSection` (the Database screen's restore-point list + create action).
 * Follows the fetch-mocking harness `Comments.unit.test.tsx`/`use-roles.unit.test.ts` established
 * for this package. The bodies below drive the WIRED hook (real `fetch`); the "injected port"
 * describe block at the bottom (2026-08-14, Orc-BASH pass) proves the pure hook is independently
 * testable against `createFakeRestorePointsSectionPort` with no `fetch` stub for the data itself.
 *
 * `fetch-query` migration (2026-08-12): every `renderHook` now needs `wrapper: FetchQueryProvider`
 * — see `redirects/__tests__/use-redirects.hooks.unit.test.tsx`'s identical wrapper for the pilot
 * precedent.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

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
  const view = renderHook(() => useWiredRestorePointsSection(), { wrapper });
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
    const { result } = renderHook(() => useWiredRestorePointsSection(), { wrapper });
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
    // `creating` reads TanStack's own `mutation.status`, whose observer notification is scheduled
    // via a real `setTimeout(0)` (`notifyManager`'s `flush`) rather than a microtask — a bare read
    // here races that timer. `waitFor` polls with real timers, so it reliably sees the flip.
    await waitFor(() => expect(result.current.creating).toBe(true));

    fetchMock.mockResolvedValueOnce(jsonResponse({ items: [POINT, { ...POINT, id: "rp2" }] })); // reload
    await act(async () => {
      resolveCreate?.(jsonResponse({ restorePoint: { id: "rp2", costClass: "cheap", kind: "full" } }));
      await createPromise;
    });

    // Same deferred-notification race as the `creating=true` wait above — the pending -> success
    // transition is also observed through `mutation.status`, not local state.
    await waitFor(() => expect(result.current.creating).toBe(false));
    expect(result.current.points).toHaveLength(2);
  });

  it("sets error with the Database-specific fallback and clears creating on failure — without reloading", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "" }, 409)); // RESTORE_POINT_UNAVAILABLE-shaped, no message

    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.createRestorePoint();
    });

    // `error`/`creating` both read TanStack's own `mutation.error`/`.status` — same deferred
    // observer-notification race as the `creating=true` assertion above, so `waitFor` on the value
    // that only settles once the mutation reaches `error` status, then plain reads once settled.
    await waitFor(() => expect(result.current.error).toBe("Failed to create restore point"));
    expect(result.current.creating).toBe(false);
    // Only the failed create call — no follow-up reload GET.
    expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);
  });

  it("uses the server's own error message when one is present", async () => {
    const { result } = await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "site is unavailable for snapshots" }, 409));

    await act(async () => {
      await result.current.createRestorePoint();
    });

    await waitFor(() => expect(result.current.error).toBe("site is unavailable for snapshots"));
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

    const { result } = renderHook(() => useWiredRestorePointsSection(), { wrapper });

    await waitFor(() => expect(result.current.t("Restore points")).toBe("Puntos de restauración"));
  });
});

describe("injected port (2026-08-14, Orc-BASH pass)", () => {
  /** Drives the pure hook directly against `createFakeRestorePointsSectionPort` — `fetchMock` (the
   *  real network `useWiredRestorePointsSection` above goes through) is asserted NEVER called for
   *  the restore-points data itself; only this file's own `beforeEach` locale-settings shim still
   *  uses real `fetch`, since `useAdminLocale()` is a separate, un-injected concern from this port. */
  it("loads points from the fake port with no real fetch call for the data itself", async () => {
    const port = createFakeRestorePointsSectionPort({ points: [POINT] });
    const { result } = renderHook(() => useRestorePointsSection({ port }), { wrapper });

    await waitFor(() => expect(result.current.points).not.toBeNull());
    expect(result.current.points).toEqual([POINT]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("createRestorePoint appends to the fake port's store, visible on the next list read", async () => {
    const port = createFakeRestorePointsSectionPort({ points: [] });
    const { result } = renderHook(() => useRestorePointsSection({ port }), { wrapper });
    await waitFor(() => expect(result.current.points).toEqual([]));

    await act(async () => {
      await result.current.createRestorePoint();
    });

    await waitFor(() => expect(result.current.points).toHaveLength(1));
  });

  it("surfaces a create failure from the fake port's rejected createDatabaseRestorePoint", async () => {
    const port = createFakeRestorePointsSectionPort({ points: [], createError: new Error("boom from fake") });
    const { result } = renderHook(() => useRestorePointsSection({ port }), { wrapper });
    await waitFor(() => expect(result.current.points).toEqual([]));

    await act(async () => {
      await result.current.createRestorePoint();
    });

    await waitFor(() => expect(result.current.error).toBe("boom from fake"));
  });
});
