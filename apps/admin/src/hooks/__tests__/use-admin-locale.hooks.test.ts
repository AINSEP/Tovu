import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { resetSettingsRefreshBus } from "../../lib/settings-refresh-bus";
import { createFakeAdminLocalePort, DEFAULT_LOCALE } from "../admin-locale-dependencies.hooks";
import { useAdminLocale, useWiredAdminLocale } from "../use-admin-locale.hooks";

/**
 * @file `useAdminLocale` — converted (2026-08-14) to accept an injected `AdminLocalePort` instead
 * of importing `lib/settings-tabs`/`lib/settings-refresh-bus` directly. These tests drive the bare
 * `useAdminLocale` against `createFakeAdminLocalePort`, with no `vi.mock` at all — the seam this
 * conversion exists to provide. `useWiredAdminLocale` gets one smoke test that it is callable; its
 * real binding is exercised by every screen's own render test, same as `useWiredThemePages`.
 *
 * `resetSettingsRefreshBus()` in `afterEach` matters only for the module-level bus the real port
 * binds to — unrelated to the fakes above, which hold their own private listener set — but is kept
 * here as a defensive habit for any test file that imports `lib/settings-refresh-bus` at all, per
 * `use-admin-execution-credential.hooks.test.ts`'s identical precedent.
 */

afterEach(() => {
  resetSettingsRefreshBus();
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

  it("unsubscribes on unmount — a refresh after teardown does not touch a torn-down instance", async () => {
    const port = createFakeAdminLocalePort({ initialLocale: "en" });
    const { result, unmount } = renderHook(() => useAdminLocale(port));
    await waitFor(() => expect(result.current).toBe("en"));
    unmount();

    // A stray `setState` on the unmounted instance would surface as an RTL/React `act` warning
    // rather than a thrown error, so the pass condition is "this does not throw and produces no
    // warning" — the fake's own subscriber-count behaviour (see
    // `admin-locale-dependencies.hooks.test.ts`) is what proves the listener was actually removed,
    // not re-inspectable through `result.current` post-unmount.
    expect(() => port.publishLocaleChange("de")).not.toThrow();
  });
});

describe("useAdminLocale — mount → unmount → mount (StrictMode shape)", () => {
  it("a fresh mount after unmount still updates on refresh — the cancelled flag resets on mount, not only on unmount", async () => {
    const port = createFakeAdminLocalePort({ initialLocale: "en" });
    const first = renderHook(() => useAdminLocale(port));
    await waitFor(() => expect(first.result.current).toBe("en"));
    first.unmount();

    const second = renderHook(() => useAdminLocale(port));
    await waitFor(() => expect(second.result.current).toBe("en"));

    // If the effect's `cancelled` flag were declared outside the effect body (or otherwise failed
    // to reset on this second mount), this update would be silently dropped — the real bug shape
    // StrictMode's dev-only mount→unmount→mount would expose.
    act(() => port.publishLocaleChange("ja"));
    await waitFor(() => expect(second.result.current).toBe("ja"));
  });
});

describe("useWiredAdminLocale", () => {
  it("is exported as the zero-argument pair every screen composes", () => {
    expect(typeof useWiredAdminLocale).toBe("function");
  });
});
