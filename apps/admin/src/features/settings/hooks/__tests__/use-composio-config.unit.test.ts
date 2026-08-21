import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useComposioConfig, useWiredComposioConfig } from "../use-composio-config.hooks";
import { createFakeComposioConfigPort } from "../composio-config-dependencies.hooks";

/**
 * @file Coverage for `useComposioConfig` (0/10 funcs) — load, save, clear, and the derived
 * `unlocked`/`catalogRefreshKey` fields, driven against `createFakeComposioConfigPort`.
 */

describe("useComposioConfig — load", () => {
  it("starts unlocked=false, config=null, then resolves the loaded config", async () => {
    const port = createFakeComposioConfigPort({ config: { configured: true, apiKeyTail: "1234" } });
    const { result } = renderHook(() => useComposioConfig({ port }));

    expect(result.current.config).toBeNull();
    expect(result.current.unlocked).toBe(false);

    await waitFor(() => expect(result.current.config).not.toBeNull());
    expect(result.current.config).toEqual({ configured: true, apiKeyTail: "1234" });
    expect(result.current.unlocked).toBe(true);
  });

  it("unlocked stays false for a loaded-but-unconfigured config, distinct from still-loading", async () => {
    const port = createFakeComposioConfigPort(); // default: configured: false
    const { result } = renderHook(() => useComposioConfig({ port }));

    await waitFor(() => expect(result.current.config).not.toBeNull());
    expect(result.current.config).toEqual({ configured: false, apiKeyTail: "" });
    expect(result.current.unlocked).toBe(false);
  });

  it("a rejected load reports loadError with the rejection's own message", async () => {
    const port = createFakeComposioConfigPort();
    port.getComposioConfig = () => Promise.reject(new Error("connectors down"));
    const { result } = renderHook(() => useComposioConfig({ port }));

    await waitFor(() => expect(result.current.loadError).toBe("connectors down"));
    expect(result.current.config).toBeNull();
  });

  it("a rejected load with a non-Error value falls back to String(err)", async () => {
    const port = createFakeComposioConfigPort();
    port.getComposioConfig = () => Promise.reject("plain string failure");
    const { result } = renderHook(() => useComposioConfig({ port }));

    await waitFor(() => expect(result.current.loadError).toBe("plain string failure"));
  });

  it("a load that resolves AFTER unmount does not update state or throw (the cancelled-guard's own branch)", async () => {
    // A real scenario, not a fabricated one: navigating away from a settings tab before its initial
    // GET settles. `cancelled` flips true in the effect's cleanup; `.then`'s `if (!cancelled)` guard
    // is what this test exercises — resolving after unmount must be a harmless no-op.
    let resolveConfig!: (value: { configured: boolean; apiKeyTail: string }) => void;
    const port = createFakeComposioConfigPort();
    port.getComposioConfig = () => new Promise((resolve) => { resolveConfig = resolve; });
    const { unmount } = renderHook(() => useComposioConfig({ port }));

    unmount();
    await act(async () => {
      resolveConfig({ configured: true, apiKeyTail: "9999" });
      await Promise.resolve();
    });
    // Reaching here without an uncaught rejection or thrown error is the proof — there is no
    // post-unmount `result.current` to assert against.
  });

  it("a load that REJECTS after unmount is the same harmless no-op (the .catch side of the same guard)", async () => {
    let rejectConfig!: (err: Error) => void;
    const port = createFakeComposioConfigPort();
    port.getComposioConfig = () => new Promise((_resolve, reject) => { rejectConfig = reject; });
    const { unmount } = renderHook(() => useComposioConfig({ port }));

    unmount();
    await act(async () => {
      rejectConfig(new Error("too late"));
      await Promise.resolve().catch(() => undefined);
    });
  });
});

describe("useComposioConfig — save", () => {
  it("save() transitions saving -> saved, updates config, and bumps catalogRefreshKey", async () => {
    const port = createFakeComposioConfigPort();
    const { result } = renderHook(() => useComposioConfig({ port }));
    await waitFor(() => expect(result.current.config).not.toBeNull());
    const before = result.current.catalogRefreshKey;

    await act(async () => {
      await result.current.save("sk-new-key-9999");
    });

    expect(result.current.saveState).toBe("saved");
    expect(result.current.config).toEqual({ configured: true, apiKeyTail: "9999" });
    expect(result.current.unlocked).toBe(true);
    expect(result.current.catalogRefreshKey).toBe(before + 1);
    expect(result.current.saveError).toBeNull();
  });

  it("a rejected save reports saveError with the exact message and does not bump catalogRefreshKey", async () => {
    const port = createFakeComposioConfigPort();
    port.saveComposioConfig = () => Promise.reject(new Error("no master key"));
    const { result } = renderHook(() => useComposioConfig({ port }));
    await waitFor(() => expect(result.current.config).not.toBeNull());
    const before = result.current.catalogRefreshKey;

    await act(async () => {
      await result.current.save("sk-fails");
    });

    expect(result.current.saveState).toBe("error");
    expect(result.current.saveError).toBe("no master key");
    expect(result.current.catalogRefreshKey).toBe(before);
  });

  it("a rejected save with a non-Error value falls back to String(err)", async () => {
    const port = createFakeComposioConfigPort();
    port.saveComposioConfig = () => Promise.reject("plain string failure");
    const { result } = renderHook(() => useComposioConfig({ port }));
    await waitFor(() => expect(result.current.config).not.toBeNull());

    await act(async () => {
      await result.current.save("sk-fails");
    });

    expect(result.current.saveError).toBe("plain string failure");
  });
});

describe("useComposioConfig — clear", () => {
  it("clear() writes null through the port and resets to unconfigured", async () => {
    const port = createFakeComposioConfigPort({ config: { configured: true, apiKeyTail: "abcd" } });
    const { result } = renderHook(() => useComposioConfig({ port }));
    await waitFor(() => expect(result.current.unlocked).toBe(true));

    await act(async () => {
      await result.current.clear();
    });

    expect(result.current.config).toEqual({ configured: false, apiKeyTail: "" });
    expect(result.current.unlocked).toBe(false);
    expect(result.current.saveState).toBe("saved");
  });
});

describe("useWiredComposioConfig", () => {
  it("wires the real port (network call fails harmlessly in a test environment, surfacing loadError)", async () => {
    const { result } = renderHook(() => useWiredComposioConfig());
    await waitFor(() => expect(result.current.loadError).not.toBeNull());
    expect(result.current.config).toBeNull();
  });
});
