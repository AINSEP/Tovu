import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, type AdminPlugin } from "@/lib/api";
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

  /** The reverse order, so BOTH `finally` guards are proven rather than just the one that happens to
   *  settle first above (verified by mutation: unguarding `onToggleEnabled`'s arm survived the test
   *  above, and dies on this one). */
  it("a toggle settling first does not unlock a different row's still-outstanding removal", async () => {
    const port = createFakePluginsPort({
      plugins: [
        { id: "p1", name: "Removable", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: false, quarantine: null, errors: [] },
        { id: "p2", name: "Togglable", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: true, quarantine: null, errors: [] },
      ],
    });
    let resolveToggle!: () => void;
    const realSetEnabled = port.setPluginEnabled.bind(port);
    port.setPluginEnabled = (id, patch) => new Promise((resolve) => (resolveToggle = () => resolve(realSetEnabled(id, patch))));
    let resolveUninstall!: () => void;
    const realUninstall = port.uninstallPlugin.bind(port);
    port.uninstallPlugin = (id: string) => new Promise((resolve) => (resolveUninstall = () => resolve(realUninstall(id))));

    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.plugins).toHaveLength(2));

    let toggleCall!: Promise<void>;
    act(() => {
      toggleCall = result.current.onToggleEnabled(result.current.plugins![1]!);
    });
    await waitFor(() => expect(result.current.rowSavingId).toBe("p2"));

    let removeCall!: Promise<void>;
    act(() => {
      removeCall = result.current.onRemovePlugin(result.current.plugins![0]!);
    });
    await waitFor(() => expect(result.current.rowSavingId).toBe("p1"));

    await act(async () => {
      resolveToggle();
      await toggleCall;
    });

    expect(result.current.rowSavingId).toBe("p1");

    await act(async () => {
      resolveUninstall();
      await removeCall;
    });
    expect(result.current.rowSavingId).toBeNull();
  });
});

/**
 * X1 (2026-09-20 platform review, not in the original review — found while triaging it):
 * `reload()` has no generation guard and never calls `setError(null)` anywhere. Two consequences:
 * a transient failure of a post-write reload sticks forever (nothing ever clears `error` again), and
 * two reloads in flight at once (from two different rows' toggles — the single-flight guard is
 * per-row, see the `describe` above) can let an OLDER response overwrite a NEWER one if it settles
 * last.
 */
describe("X1: reload() generation guard", () => {
  it("a later successful reload clears a failed reload's error", async () => {
    const pluginA: AdminPlugin = { id: "p1", name: "A", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: true, quarantine: null, errors: [] };
    const pluginB: AdminPlugin = { id: "p2", name: "B", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: true, quarantine: null, errors: [] };
    const port = createFakePluginsPort({ plugins: [pluginA, pluginB] });

    let listCall = 0;
    const listResponses: Array<() => Promise<{ plugins: AdminPlugin[] }>> = [
      () => Promise.resolve({ plugins: [pluginA, pluginB] }), // initial mount load
      () => Promise.reject(new Error("reload failed")), // after toggling A
      () => Promise.resolve({ plugins: [pluginA, pluginB] }), // after toggling B
    ];
    port.listPlugins = () => listResponses[listCall++]!();

    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.plugins).toHaveLength(2));

    await act(async () => {
      await result.current.onToggleEnabled(pluginA);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());

    await act(async () => {
      await result.current.onToggleEnabled(pluginB);
    });
    // RED today: the error set by A's failed reload is never cleared, even though B's reload
    // that follows it succeeds.
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  it("an older reload that settles last does not overwrite a newer one", async () => {
    const pluginA: AdminPlugin = { id: "p1", name: "A", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: false, quarantine: null, errors: [] };
    const pluginB: AdminPlugin = { id: "p2", name: "B", version: "1.0.0", source: "site", tier: "tier-1", status: "valid", enabled: false, quarantine: null, errors: [] };
    const port = createFakePluginsPort({ plugins: [pluginA, pluginB] });

    let listCall = 0;
    let resolveD1!: (v: { plugins: AdminPlugin[] }) => void;
    let resolveD2!: (v: { plugins: AdminPlugin[] }) => void;
    const d1 = new Promise<{ plugins: AdminPlugin[] }>((resolve) => (resolveD1 = resolve));
    const d2 = new Promise<{ plugins: AdminPlugin[] }>((resolve) => (resolveD2 = resolve));
    port.listPlugins = () => {
      listCall += 1;
      if (listCall === 1) return Promise.resolve({ plugins: [pluginA, pluginB] }); // initial mount load
      if (listCall === 2) return d1; // A's post-toggle reload
      return d2; // B's post-toggle reload
    };

    const { result } = renderHook(() => usePlugins({ port, locale: "en", t: (key: string) => key }));
    await waitFor(() => expect(result.current.plugins).toHaveLength(2));

    act(() => {
      void result.current.onToggleEnabled(pluginA);
    });
    await waitFor(() => expect(listCall).toBe(2));

    act(() => {
      void result.current.onToggleEnabled(pluginB);
    });
    await waitFor(() => expect(listCall).toBe(3));

    const aOn = { ...pluginA, enabled: true };
    const bOn = { ...pluginB, enabled: true };
    const bOff = { ...pluginB, enabled: false };

    // The NEWER reload (B's, d2) settles first...
    await act(async () => {
      resolveD2({ plugins: [aOn, bOn] });
      await Promise.resolve();
    });
    // ...then the OLDER reload (A's, d1) settles last. RED today: `d1`'s stale list wins and
    // overwrites `d2`'s newer one.
    await act(async () => {
      resolveD1({ plugins: [aOn, bOff] });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.plugins).toEqual([aOn, bOn]));
  });
});
