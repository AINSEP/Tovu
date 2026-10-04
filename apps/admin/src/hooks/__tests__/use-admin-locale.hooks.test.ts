import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { publishSettingsRefresh, resetSettingsRefreshBus } from "../../lib/settings-refresh-bus";
import { createFakeAdminLocalePort, DEFAULT_LOCALE } from "../admin-locale-dependencies.hooks";
import type { AdminLocalePort } from "../admin-locale-port.hooks";
import { useAdminLocale, useWiredAdminLocale } from "../use-admin-locale.hooks";

/**
 * @file `useAdminLocale` — converted (2026-08-14) to accept an injected `AdminLocalePort` instead
 * of importing `lib/settings-tabs`/`lib/settings-refresh-bus` directly. These tests drive the bare
 * `useAdminLocale` against `createFakeAdminLocalePort`, with no `vi.mock` at all — the seam this
 * conversion exists to provide. `useWiredAdminLocale` also resolves and refreshes through the real
 * settings adapter, with only its outbound fetch replaced.
 *
 * `resetSettingsRefreshBus()` in `afterEach` matters only for the module-level bus the real port
 * binds to — unrelated to the fakes above, which hold their own private listener set — but is kept
 * here as a defensive habit for any test file that imports `lib/settings-refresh-bus` at all, per
 * `use-admin-execution-credential.hooks.test.ts`'s identical precedent.
 */

afterEach(() => {
  resetSettingsRefreshBus();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useAdminLocale — initial load", () => {
  it("starts at DEFAULT_LOCALE before the fetch resolves", () => {
    const port = createFakeAdminLocalePort({ initialLocale: "fr" });
    const { result } = renderHook(() => useAdminLocale(port));
    expect(result.current).toBe(DEFAULT_LOCALE);
  });

  it("resolves to the port's locale once the initial fetch settles", async () => {
    const port = createFakeAdminLocalePort({ initialLocale: "fr" });
    const { result } = renderHook(() => useAdminLocale(port));
    await waitFor(() => expect(result.current).toBe("fr"));
  });

  it("swallows a failed fetch and stays at DEFAULT_LOCALE rather than throwing — screens mounted without a stubbed settings endpoint must degrade to English, not break", async () => {
    const port = createFakeAdminLocalePort({ loadLanguageError: new Error("network down") });
    const { result } = renderHook(() => useAdminLocale(port));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(DEFAULT_LOCALE);
  });
});

describe("useAdminLocale — refresh on a relevant settings-refresh notification", () => {
  it("re-fetches and updates when the port announces a refresh", async () => {
    const port = createFakeAdminLocalePort({ initialLocale: "en" });
    const { result } = renderHook(() => useAdminLocale(port));
    await waitFor(() => expect(result.current).toBe("en"));

    act(() => port.publishLocaleChange("de"));
    await waitFor(() => expect(result.current).toBe("de"));
  });

  // Replaces a deleted vacuous test that asserted only `not.toThrow()` on the publish call, which
  // passed identically whether or not the effect's `unsubscribe()` ran — a stray setState on an
  // unmounted instance surfaces as an act warning, never a throw. This one observes the hook's own
  // cleanup instead: the listener the hook subscribes calls `port.loadLanguage()`, so if unsubscribe
  // never ran, a post-unmount refresh would call `loadLanguage()` again and the spy's count would
  // grow. No production or fake changes — `vi.spyOn` wraps the fake's own method for this test only.
  it("stops calling the port's loadLanguage after unmount — proves the hook's own cleanup actually unsubscribes", async () => {
    const port = createFakeAdminLocalePort({ initialLocale: "en" });
    const loadLanguageSpy = vi.spyOn(port, "loadLanguage");
    const { result, unmount } = renderHook(() => useAdminLocale(port));
    await waitFor(() => expect(result.current).toBe("en"));
    const callsBeforeUnmount = loadLanguageSpy.mock.calls.length;

    unmount();
    act(() => port.publishLocaleChange("de"));

    expect(loadLanguageSpy.mock.calls.length).toBe(callsBeforeUnmount);
  });
});

describe("useAdminLocale — StrictMode effect replay", () => {
  it("initial loading and refresh survive cleanup and setup on the same hook instance", async () => {
    const port = createFakeAdminLocalePort({ initialLocale: "fr" });
    const load = vi.spyOn(port, "loadLanguage");
    const { result } = renderHook(() => useAdminLocale(port), { reactStrictMode: true });
    expect(load).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current).toBe("fr"));

    // If the effect's `cancelled` flag were declared outside the effect body (or otherwise failed
    // to reset on this second mount), this update would be silently dropped — the real bug shape
    // StrictMode's dev-only mount→unmount→mount would expose.
    act(() => port.publishLocaleChange("ja"));
    await waitFor(() => expect(result.current).toBe("ja"));
    expect(load).toHaveBeenCalledTimes(3);
  });
});

/**
 * F3 (plan-components.md, 2026-09-20): `fetchLocale` had no ordering between successive calls —
 * every refresh started another unordered load, and whichever one SETTLED last won, regardless of
 * which one was started last. A hand-built port (not `createFakeAdminLocalePort`, whose
 * `loadLanguage` resolves synchronously) is needed here so two loads can be left pending at once.
 */
describe("useAdminLocale — an older read never overwrites a newer one", () => {
  it("a refresh's load that resolves LAST does not win if it was not the newest refresh", async () => {
    const loads: Array<(locale: string) => void> = [];
    let listener: (() => void) | null = null;
    const port: AdminLocalePort = {
      loadLanguage() {
        return new Promise<string>((resolve) => {
          loads.push(resolve);
        });
      },
      subscribeToSettingsRefresh(l) {
        listener = l;
        return () => {
          listener = null;
        };
      },
    };
    const { result } = renderHook(() => useAdminLocale(port));
    await waitFor(() => expect(loads.length).toBe(1)); // the mount load, left pending

    // A newer refresh starts a second, also-pending load.
    act(() => listener?.());
    await waitFor(() => expect(loads.length).toBe(2));

    // The NEWER load (load #2) settles first.
    loads[1]!("es");
    await waitFor(() => expect(result.current).toBe("es"));

    // The OLDER load (load #1, the original mount fetch) settles last, and must not win just
    // because it happened to resolve after the newer one.
    await act(async () => {
      loads[0]!("en");
      await Promise.resolve();
    });

    expect(result.current).toBe("es");
  });
});

describe("useWiredAdminLocale", () => {
  it("is exported as the zero-argument pair every screen composes", () => {
    expect(typeof useWiredAdminLocale).toBe("function");
  });
});

it("useWiredAdminLocale loads and refreshes the locale through the real settings binding", async () => {
  let locale = "de";
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(String(url)).toContain("/settings/effective?namespace=core.language");
    expect(init?.method ?? "GET").toBe("GET");
    return new Response(JSON.stringify({ data: [{ key: "locale", value: locale }] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() => useWiredAdminLocale());
  await waitFor(() => expect(result.current).toBe("de"));
  locale = "fr";
  act(() => publishSettingsRefresh(["core.language"]));
  await waitFor(() => expect(result.current).toBe("fr"));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
