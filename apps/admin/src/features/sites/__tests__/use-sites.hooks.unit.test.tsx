import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, type AdminSiteActivation, type AdminSitesSnapshot } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";
import { createFakeSitesPort } from "../hooks/sites-dependencies.hooks";
import { useSites } from "../hooks/use-sites.hooks";

/**
 * @file `useSites` — the Sites screen's one read and two writes, driven against
 * `createFakeSitesPort` with real `fetch` stubbed, so no assertion here is about a URL or an HTTP
 * method. Same shape as `use-deployment-overview.unit.test.tsx`.
 *
 * The load-bearing case is the last describe block: an Activate must NOT move the serving marker.
 */

function wrapper({ children }: { children: React.ReactNode }) {
  return <FetchQueryProvider>{children}</FetchQueryProvider>;
}

const fakeT = (key: string): string => key;

function snapshotFixture(overrides: Partial<AdminSitesSnapshot> = {}): AdminSitesSnapshot {
  return {
    switchingEnabled: true,
    sites: [
      { name: "alpha", dir: "/repo/sites/alpha", displayName: "Alpha", createdAt: "2026-01-01T00:00:00.000Z", active: true },
      { name: "beta", dir: "/repo/sites/beta", displayName: "Beta", createdAt: "2026-02-01T00:00:00.000Z", active: false },
    ],
    currentSite: { dir: "/repo/sites/alpha", name: "alpha", dirOverridden: false, listed: true },
    persistedSiteName: null,
    ...overrides,
  };
}

describe("useSites — list", () => {
  it("loads through the injected port, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeSitesPort(snapshotFixture());

    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });

    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());
    expect(result.current.sites.map((site) => site.name)).toEqual(["alpha", "beta"]);
    expect(result.current.switchingEnabled).toBe(true);
    expect(networkMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("reports a first-load failure without inventing an empty site list", async () => {
    const port = createFakeSitesPort(() => Promise.reject(new Error("server down")));

    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });

    await waitFor(() => expect(result.current.listStatus).toBe("error"));
    expect(result.current.snapshot).toBeUndefined();
    expect(result.current.sites).toEqual([]);
    // Never `true` on a failed load — a mid-load screen must not offer a write it cannot know is allowed.
    expect(result.current.switchingEnabled).toBe(false);
  });
});

describe("useSites — create", () => {
  it("creates through the port, clears the field, and names what it made", async () => {
    const createSite = vi.fn().mockResolvedValue({ site: { name: "gamma", dir: "/repo/sites/gamma", siteId: "id-1" } });
    const port = createFakeSitesPort(snapshotFixture(), { createSite });

    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setCreateName("gamma"));
    await act(async () => {
      result.current.createSite();
    });

    await waitFor(() => expect(result.current.createdName).toBe("gamma"));
    expect(createSite).toHaveBeenCalledWith({ name: "gamma" });
    expect(result.current.createName).toBe("");
  });

  it("refuses to submit an invalid name — the port is never called", async () => {
    const createSite = vi.fn();
    const port = createFakeSitesPort(snapshotFixture(), { createSite });

    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setCreateName("Bad Name!"));
    expect(result.current.createNameError).toBe("Use lowercase letters, digits, and dashes only.");

    await act(async () => {
      result.current.createSite();
    });
    expect(createSite).not.toHaveBeenCalled();
  });

  it("says nothing about an untouched empty field", async () => {
    const port = createFakeSitesPort(snapshotFixture());
    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());
    expect(result.current.createNameError).toBeNull();
  });

  it("surfaces the occupied-folder conflict in this feature's own words", async () => {
    const createSite = vi.fn().mockRejectedValue(new ApiError("dir not empty", 409, "SITE_ALREADY_EXISTS"));
    const port = createFakeSitesPort(snapshotFixture(), { createSite });

    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setCreateName("alpha"));
    await act(async () => {
      result.current.createSite();
    });

    await waitFor(() => expect(result.current.writeError).toBe("A folder with that name already exists under sites/."));
  });

  it("falls back to the server's own message for a code it has no copy for", async () => {
    const createSite = vi.fn().mockRejectedValue(new ApiError("internal error", 500, "INTERNAL_ERROR"));
    const port = createFakeSitesPort(snapshotFixture(), { createSite });

    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setCreateName("gamma"));
    await act(async () => {
      result.current.createSite();
    });

    await waitFor(() => expect(result.current.writeError).toBe("internal error"));
  });

  it("ignores a second createSite call while the first is still in flight — a genuine no-op, not a second request", async () => {
    let resolveCreate!: (value: { site: { name: string; dir: string; siteId: string } }) => void;
    const createSite = vi.fn(
      () =>
        new Promise<{ site: { name: string; dir: string; siteId: string } }>((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const port = createFakeSitesPort(snapshotFixture(), { createSite });

    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setCreateName("gamma"));
    // Two clicks before the first request ever resolves — the doc comment on `createSite` already
    // claims this is a no-op; this test is what actually proves it. Both clicks are synchronous
    // (same tick) — `mutateAsync` only reaches the port on a later microtask, so the guard has to be
    // a synchronous check-then-set, not a wait for `creating`/`status` to reflect the first click.
    act(() => result.current.createSite());
    act(() => result.current.createSite());

    // The port call itself is a microtask away — wait for it, then confirm there is only ever one.
    await waitFor(() => expect(createSite).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveCreate({ site: { name: "gamma", dir: "/repo/sites/gamma", siteId: "id-1" } });
    });
    await waitFor(() => expect(result.current.createdName).toBe("gamma"));
    // Still just the one request — the second click never reached the port at all.
    expect(createSite).toHaveBeenCalledTimes(1);
  });
});

describe("useSites — activate does NOT switch anything", () => {
  it("keeps the serving marker on the site the server is still bound to, and marks the choice pending", async () => {
    // The server re-derives `currentSite` from what it actually booted with, so the refetch after
    // an activate returns the SAME `currentSite` and only gains `persistedSiteName`. This fixture is
    // that exact sequence — an optimistic hook would fail here.
    let listCall = 0;
    const port = createFakeSitesPort(
      () => {
        listCall += 1;
        return Promise.resolve(listCall === 1 ? snapshotFixture() : snapshotFixture({ persistedSiteName: "beta" }));
      },
      {
        activateSite: (name: string) =>
          Promise.resolve({ ok: true, activeSiteName: name, restartRequired: true, restartInstructions: "Restart `npm run dev`." }),
      },
    );

    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());
    expect(result.current.outlook).toEqual({ kind: "none" });

    await act(async () => {
      result.current.activate("beta");
    });

    await waitFor(() => expect(result.current.outlook).toEqual({ kind: "pending", name: "beta" }));
    // The load-bearing assertion: the live binding did not move.
    expect(result.current.snapshot?.currentSite.name).toBe("alpha");
    expect(result.current.activation?.activeSiteName).toBe("beta");
    expect(result.current.restartInstructions).toBe("Restart `npm run dev`.");
    expect(result.current.activatingName).toBeNull();
  });

  it("reports a pending choice TOVU_SITE_DIR would defeat as ignored, not as queued", async () => {
    const port = createFakeSitesPort(
      snapshotFixture({
        persistedSiteName: "beta",
        currentSite: { dir: "/elsewhere/alpha", name: "alpha", dirOverridden: true, listed: false },
      }),
    );

    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });

    await waitFor(() => expect(result.current.outlook).toEqual({ kind: "pending-ignored", name: "beta" }));
  });

  it("surfaces the capability refusal rather than pretending the choice was saved", async () => {
    const port = createFakeSitesPort(snapshotFixture({ switchingEnabled: false }), {
      activateSite: () => Promise.reject(new ApiError("disabled", 403, "SITE_SWITCHING_DISABLED")),
    });

    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    await act(async () => {
      result.current.activate("beta");
    });

    await waitFor(() => expect(result.current.writeError).toBe("Site switching is turned off on this deployment."));
    expect(result.current.activation).toBeNull();
    expect(result.current.outlook).toEqual({ kind: "none" });
  });
});

describe("useSites — activate race safety", () => {
  it("the LAST-clicked activate wins even when an earlier click's response arrives after it", async () => {
    const deferred: Record<string, { promise: Promise<AdminSiteActivation>; resolve: (value: AdminSiteActivation) => void }> = {};
    const activateSite = vi.fn((name: string) => {
      let resolve!: (value: AdminSiteActivation) => void;
      const promise = new Promise<AdminSiteActivation>((r) => {
        resolve = r;
      });
      deferred[name] = { promise, resolve };
      return promise;
    });
    const port = createFakeSitesPort(snapshotFixture(), { activateSite });

    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    // Two rapid clicks on different rows: alpha first, beta second — beta is the operator's actual,
    // final choice.
    act(() => result.current.activate("alpha"));
    act(() => result.current.activate("beta"));
    // `mutateAsync` invokes the mutation function on a microtask, not synchronously inside `act`'s
    // callback — wait for both to actually reach the port before either is resolved.
    await waitFor(() => expect(activateSite).toHaveBeenCalledTimes(2));

    // Network settles OUT of click order: beta (clicked LAST) resolves first; alpha (clicked first)
    // resolves after it.
    await act(async () => {
      deferred.beta.resolve({ ok: true, activeSiteName: "beta", restartRequired: true, restartInstructions: "Restart beta." });
      await deferred.beta.promise;
    });
    await waitFor(() => expect(result.current.activation?.activeSiteName).toBe("beta"));

    await act(async () => {
      deferred.alpha.resolve({ ok: true, activeSiteName: "alpha", restartRequired: true, restartInstructions: "Restart alpha." });
      await deferred.alpha.promise;
    });
    // Give alpha's now-stale settlement a chance to land before asserting nothing changed.
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The operator's LAST click (beta) must still be what is shown — alpha's late-arriving response
    // must not overwrite it just because it settled second.
    expect(result.current.activation?.activeSiteName).toBe("beta");
    expect(result.current.activatingName).toBeNull();
  });
});

describe("useSites — write error precedence", () => {
  it("does not let a stale Create failure mask a later, successful Activate", async () => {
    const createSite = vi.fn().mockRejectedValue(new ApiError("dir not empty", 409, "SITE_ALREADY_EXISTS"));
    const activateSite = vi
      .fn()
      .mockResolvedValue({ ok: true, activeSiteName: "beta", restartRequired: true, restartInstructions: "Restart beta." });
    const port = createFakeSitesPort(snapshotFixture(), { createSite, activateSite });

    const { result } = renderHook(() => useSites(port, fakeT), { wrapper });
    await waitFor(() => expect(result.current.snapshot).not.toBeUndefined());

    act(() => result.current.setCreateName("alpha"));
    await act(async () => {
      result.current.createSite();
    });
    await waitFor(() => expect(result.current.writeError).not.toBeNull());

    await act(async () => {
      result.current.activate("beta");
    });

    await waitFor(() => expect(result.current.activation?.activeSiteName).toBe("beta"));
    // The earlier Create failure must not still be latched over this later, successful Activate.
    expect(result.current.writeError).toBeNull();
  });
});
