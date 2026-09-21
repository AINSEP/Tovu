import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
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

  /**
   * `onToggleEnabled(plugin, {enabled: true})` on a currently-disabled plugin — this exact call is
   * what the pre-split table's AC-19 exercised through the rendered UI. The Installed/Downloaded tab
   * split (2026-09-09) removed every UI path that can reach it (Installed pre-filters to
   * `enabled: true`; Downloaded's action slot is Remove, not the toggle — see `Plugins.unit
   * .test.tsx`'s own header for the full reasoning), but the underlying mechanism in this hook is
   * unchanged and still correct. Proven directly here so that fact stays covered even though no
   * component test can reach it anymore.
   */
  it("still correctly enables a disabled plugin via the injected port, even though no tab in the rebuilt UI can trigger this direction anymore", async () => {
    const port = createFakePluginsPort({
      plugins: [{ id: "p1", name: "Valid Site Plugin", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: false, quarantine: null, errors: [] }],
    });
    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.plugins).toHaveLength(1));

    await act(async () => {
      await result.current.onToggleEnabled(result.current.plugins![0]!);
    });

    expect(result.current.plugins?.[0]?.enabled).toBe(true);
  });
});

describe("usePlugins — the Remove confirm dialog's target", () => {
  it("onRequestRemove opens it for that row; onCancelRemove closes it without removing anything", async () => {
    const port = createFakePluginsPort({
      plugins: [{ id: "p1", name: "Valid Site Plugin", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: true, quarantine: null, errors: [] }],
    });
    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.plugins).toHaveLength(1));
    expect(result.current.pendingRemovePlugin).toBeNull();

    act(() => result.current.onRequestRemove(result.current.plugins![0]!));
    expect(result.current.pendingRemovePlugin?.id).toBe("p1");

    act(() => result.current.onCancelRemove());
    expect(result.current.pendingRemovePlugin).toBeNull();
    expect(result.current.plugins).toHaveLength(1);
  });

  it("onConfirmRemove closes it, then removes the plugin and re-fetches", async () => {
    // `enabled: false`: the fake port enforces the real route's PLUGIN_ENABLED refusal.
    const port = createFakePluginsPort({
      plugins: [{ id: "p1", name: "Valid Site Plugin", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: false, quarantine: null, errors: [] }],
    });
    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.plugins).toHaveLength(1));
    act(() => result.current.onRequestRemove(result.current.plugins![0]!));

    act(() => result.current.onConfirmRemove(result.current.pendingRemovePlugin!));
    expect(result.current.pendingRemovePlugin).toBeNull();
    await waitFor(() => expect(result.current.plugins).toHaveLength(0));
    expect(result.current.rowError).toBeNull();
  });
});

describe("usePlugins — onRemovePlugin (PLUGIN_UNINSTALL)", () => {
  it("removes the plugin via the injected port and re-fetches the list", async () => {
    const port = createFakePluginsPort({
      plugins: [{ id: "p1", name: "Valid Site Plugin", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: false, quarantine: null, errors: [] }],
    });
    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.plugins).toHaveLength(1));

    await act(async () => {
      await result.current.onRemovePlugin(result.current.plugins![0]!);
    });

    expect(result.current.plugins).toHaveLength(0);
    expect(result.current.rowError).toBeNull();
  });

  it("surfaces a built-in plugin's refusal as rowError and leaves the list unchanged", async () => {
    const port = createFakePluginsPort({
      plugins: [{ id: "p1", name: "Word Count", version: "1.0.0", source: "built-in", tier: "tier-3", status: "valid", enabled: false, quarantine: null, errors: [] }],
    });
    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.plugins).toHaveLength(1));

    await act(async () => {
      await result.current.onRemovePlugin(result.current.plugins![0]!);
    });

    expect(result.current.rowError).toBe("This plugin ships with Tovu and cannot be removed.");
    expect(result.current.plugins).toHaveLength(1);
  });

  it("EC-11-style single-flight: a second removal request for the same row while one is outstanding is a no-op", async () => {
    const port = createFakePluginsPort({
      plugins: [{ id: "p1", name: "Valid Site Plugin", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: false, quarantine: null, errors: [] }],
    });
    let resolveUninstall!: () => void;
    const uninstallCalls: string[] = [];
    const realUninstall = port.uninstallPlugin.bind(port);
    port.uninstallPlugin = (id: string) => {
      uninstallCalls.push(id);
      return new Promise((resolve) => {
        resolveUninstall = () => resolve(realUninstall(id));
      });
    };

    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.plugins).toHaveLength(1));

    const plugin = result.current.plugins![0]!;
    let firstCall!: Promise<void>;
    act(() => {
      firstCall = result.current.onRemovePlugin(plugin);
    });
    await act(async () => {
      await result.current.onRemovePlugin(plugin);
    });

    expect(uninstallCalls).toHaveLength(1);
    resolveUninstall();
    await act(async () => {
      await firstCall;
    });
  });

  /**
   * Unwired sink of the same S4b bug fixed in `use-posts.hooks.ts` (26fbe22c5) and
   * `use-pages.hooks.ts` (f4f2fe899): `onToggleEnabled` and `onRemovePlugin` share ONE `rowSavingId`,
   * and the EC-11 single-flight guard above is per-row (`rowSavingId === plugin.id`), so a second
   * row's action starts freely while the first is still outstanding. Both `finally` blocks then
   * cleared the field unconditionally, so whichever request settled FIRST unlocked the other row too
   * — `Plugins.tsx` reads `rowSavingId === plugin.id` for both the toggle's busy state
   * (`pluginToggleControl`, `rules.ts`) and the Downloaded tab's Remove button, so that row's control
   * became clickable again while its own request was still on the wire.
   */
  it("an unrelated row's action settling does not unlock a DIFFERENT row's still-outstanding action", async () => {
    const port = createFakePluginsPort({
      plugins: [
        { id: "p1", name: "Removable", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: false, quarantine: null, errors: [] },
        { id: "p2", name: "Togglable", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: true, quarantine: null, errors: [] },
      ],
    });
    let resolveUninstall!: () => void;
    const realUninstall = port.uninstallPlugin.bind(port);
    port.uninstallPlugin = (id: string) => new Promise((resolve) => (resolveUninstall = () => resolve(realUninstall(id))));
    let resolveToggle!: () => void;
    const realSetEnabled = port.setPluginEnabled.bind(port);
    port.setPluginEnabled = (id, patch) => new Promise((resolve) => (resolveToggle = () => resolve(realSetEnabled(id, patch))));

    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.plugins).toHaveLength(2));

    let removeCall!: Promise<void>;
    act(() => {
      removeCall = result.current.onRemovePlugin(result.current.plugins![0]!);
    });
    await waitFor(() => expect(result.current.rowSavingId).toBe("p1"));

    let toggleCall!: Promise<void>;
    act(() => {
      toggleCall = result.current.onToggleEnabled(result.current.plugins![1]!);
    });
    await waitFor(() => expect(result.current.rowSavingId).toBe("p2"));

    await act(async () => {
      resolveUninstall();
      await removeCall;
    });

    // p1's uninstall settling must not unlock p2, whose PATCH is still on the wire.
    expect(result.current.rowSavingId).toBe("p2");

    await act(async () => {
      resolveToggle();
      await toggleCall;
    });
    expect(result.current.rowSavingId).toBeNull();
  });
});
