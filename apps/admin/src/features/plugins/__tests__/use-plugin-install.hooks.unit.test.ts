/** Folder install consent: no write before confirmation; stale previews never authorize install. */
import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { usePluginInstall } from "../hooks/use-plugin-install.hooks";
import { createFakePluginInstallPort } from "../hooks/plugin-install-dependencies.hooks";
import type { PluginInstallPreview } from "../hooks/plugin-install-port.hooks";

const preview: PluginInstallPreview = { id: "fixture", name: "Fixture", version: "1.0.0", tier: "tier-3", capabilities: [], hooks: [], hasCode: true, digest: "sha256-" + "a".repeat(64) };

describe("folder install hook", () => {
  it("only installs reviewed digest after confirm, then reloads and closes", async () => {
    const port = createFakePluginInstallPort({ preview }); const onInstalled = vi.fn(async () => {});
    const { result } = renderHook(() => usePluginInstall({ port, t: (key) => key, onInstalled }));
    act(() => { result.current.open(); result.current.setFolder("/server/package"); });
    await act(async () => { await result.current.install(); });
    expect(port.installed).toHaveLength(0);
    await act(async () => { await result.current.review(); });
    expect(port.installed).toHaveLength(0); expect(result.current.preview?.digest).toBe(preview.digest);
    await act(async () => { await result.current.install(); });
    expect(port.installed).toHaveLength(1); expect(onInstalled).toHaveBeenCalledOnce(); expect(result.current.isOpen).toBe(false);
  });

  it("changing folder or replacement option invalidates consent", async () => {
    const port = createFakePluginInstallPort({ preview });
    const { result } = renderHook(() => usePluginInstall({ port, t: (key) => key, onInstalled: async () => {} }));
    act(() => { result.current.open(); result.current.setFolder("/one"); });
    await act(async () => { await result.current.review(); });
    act(() => result.current.setFolder("/two"));
    await act(async () => { await result.current.install(); });
    expect(result.current.preview).toBeNull(); expect(port.installed).toHaveLength(0);
    await act(async () => { await result.current.review(); });
    act(() => result.current.setReplace(true));
    expect(result.current.preview).toBeNull();
  });

  it("drops a late preview after folder changes and prevents duplicate requests", async () => {
    let finish!: (value: { plugin: PluginInstallPreview }) => void;
    const port = createFakePluginInstallPort({ preview });
    const read = vi.spyOn(port, "preview").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => usePluginInstall({ port, t: (key) => key, onInstalled: async () => {} }));
    act(() => { result.current.open(); result.current.setFolder("/one"); });
    let pending!: Promise<void>;
    act(() => { pending = result.current.review(); void result.current.review(); });
    expect(read).toHaveBeenCalledOnce();
    act(() => result.current.setFolder("/two"));
    await act(async () => { finish({ plugin: preview }); await pending; });
    expect(result.current.preview).toBeNull();
  });

  it("digest rejection keeps the dialog open and requires a new preview", async () => {
    const port = createFakePluginInstallPort({ preview });
    vi.spyOn(port, "install").mockRejectedValue(new ApiError("changed", 409, "PLUGIN_CHANGED_SINCE_PREVIEW"));
    const { result } = renderHook(() => usePluginInstall({ port, t: (key) => `translated:${key}`, onInstalled: async () => {} }));
    act(() => { result.current.open(); result.current.setFolder("/one"); });
    await act(async () => { await result.current.review(); });
    await act(async () => { await result.current.install(); });
    expect(result.current.preview).toBeNull(); expect(result.current.isOpen).toBe(true);
    expect(result.current.error).toBe("translated:Package changed. Review it again before installing.");
  });
});
