import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "../../../lib/api";
import { createFakePluginsPort } from "../hooks/plugins-dependencies.hooks";
import { usePlugins } from "../hooks/use-plugins.hooks";

/**
 * @file `usePlugins` driven against the injected `PluginsPort`, no `fetch` stub and no
 * `vi.spyOn(api, ...)`. `Plugins.unit.test.tsx` already covers the real-client path via
 * `useWiredPlugins` (the component's default DI prop); this is the "injected port" half, proving
 * the conversion in this session's `refactor(admin): Plugins onto useWiredX + i18n hook-injection`
 * commit actually delivers testability, not just a relocated import.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("usePlugins — injected port (no fetch stub, no api spy)", () => {
  it("loads the list from the injected port and never touches the real api client", async () => {
    const listSpy = vi.spyOn(api, "listPlugins");
    const port = createFakePluginsPort({
      plugins: [{ id: "p1", name: "Word Count", version: "1.0.0", source: "built-in", tier: "tier-3", status: "valid", enabled: true, quarantine: null, errors: [] }],
    });
    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));

    await waitFor(() => expect(result.current.plugins).toHaveLength(1));
    expect(result.current.plugins?.[0]?.id).toBe("p1");
    expect(listSpy).not.toHaveBeenCalled();
  });

  it("routes onToggleEnabled through the injected port and never touches the real api client", async () => {
    const setEnabledSpy = vi.spyOn(api, "setPluginEnabled");
    const port = createFakePluginsPort({
      plugins: [{ id: "p1", name: "Word Count", version: "1.0.0", source: "built-in", tier: "tier-3", status: "valid", enabled: false, quarantine: null, errors: [] }],
    });
    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.plugins).toHaveLength(1));

    await act(async () => {
      await result.current.onToggleEnabled(result.current.plugins![0]!);
    });

    expect(result.current.plugins?.[0]?.enabled).toBe(true);
    expect(setEnabledSpy).not.toHaveBeenCalled();
  });

  /**
   * Negative verification (per this refactor's own required check, and per the sweep's "one spot
   * check on a sample" cadence — this is that sample): temporarily replacing `port.listPlugins(...)`
   * in `use-plugins.hooks.ts` with a direct call to the real `api.listPlugins(...)` and re-running
   * this suite fails the first test above (no real network in this test env, so `result.current
   * .plugins` never settles and `waitFor` times out) — confirmed live, then reverted. Recorded here
   * rather than left as a silent claim.
   */
  it("does not resolve `plugins` while the injected port's list call is still pending", () => {
    const port = createFakePluginsPort();
    port.listPlugins = () => new Promise(() => {});
    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));
    expect(result.current.plugins).toBeNull();
  });
});
