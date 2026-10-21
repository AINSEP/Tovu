/** Folder install consent: no write before confirmation; stale previews never authorize install. */
import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { usePluginInstall } from "../hooks/use-plugin-install.hooks";
import { createFakePluginInstallPort } from "../hooks/plugin-install-dependencies.hooks";
import type { PluginInstallPreview } from "../hooks/plugin-install-port.hooks";

const preview: PluginInstallPreview = { id: "fixture", name: "Fixture", version: "1.0.0", tier: "tier-3", capabilities: [], hooks: [], hasCode: true, contentTypes: [], conflicts: [], digest: "sha256-" + "a".repeat(64) };

describe("folder install hook", () => {
  it("only installs reviewed digest after confirm, then reloads and clears the form", async () => {
    const port = createFakePluginInstallPort({ preview }); const onInstalled = vi.fn(async () => {});
    const { result } = renderHook(() => usePluginInstall({ port, t: (key) => key, onInstalled }));
    act(() => { result.current.setFolder("/server/package"); });
    await act(async () => { await result.current.install(); });
    expect(port.installed).toHaveLength(0);
    await act(async () => { await result.current.review(); });
    expect(port.installed).toHaveLength(0); expect(result.current.preview?.digest).toBe(preview.digest);
    expect(result.current.previewDisplay).toMatchObject({ title: "Fixture (fixture)", codeNotice: "This plugin runs code with full access to this computer and every site on it.", conflicts: null });
    await act(async () => { await result.current.install(); });
    expect(port.installed).toHaveLength(1); expect(onInstalled).toHaveBeenCalledOnce();
    expect(result.current.folder).toBe(""); expect(result.current.preview).toBeNull();
    expect(result.current.installedMessage).toBe("{name} is installed and switched off. Turn it on in Downloaded.".replace("{name}", "Fixture"));
  });

  it("changing folder or replacement option invalidates consent", async () => {
    const port = createFakePluginInstallPort({ preview });
    const { result } = renderHook(() => usePluginInstall({ port, t: (key) => key, onInstalled: async () => {} }));
    act(() => { result.current.setFolder("/one"); });
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
    act(() => { result.current.setFolder("/one"); });
    let pending!: Promise<void>;
    act(() => { pending = result.current.review(); void result.current.review(); });
    expect(read).toHaveBeenCalledOnce();
    act(() => result.current.setFolder("/two"));
    await act(async () => { finish({ plugin: preview }); await pending; });
    expect(result.current.preview).toBeNull();
  });

  it("digest rejection keeps the chosen folder and requires a new preview", async () => {
    const port = createFakePluginInstallPort({ preview });
    vi.spyOn(port, "install").mockRejectedValue(new ApiError("changed", 409, "PLUGIN_CHANGED_SINCE_PREVIEW"));
    const { result } = renderHook(() => usePluginInstall({ port, t: (key) => `translated:${key}`, onInstalled: async () => {} }));
    act(() => { result.current.setFolder("/one"); });
    await act(async () => { await result.current.review(); });
    await act(async () => { await result.current.install(); });
    expect(result.current.preview).toBeNull(); expect(result.current.folder).toBe("/one");
    expect(result.current.error).toBe("translated:Package changed. Review it again before installing.");
  });
});

describe("folder install hook — refusal copy, late results and input plumbing", () => {
  function setup(port = createFakePluginInstallPort({ preview }), onInstalled: () => Promise<void> = async () => {}) {
    const hook = renderHook(() => usePluginInstall({ port, t: (key) => key, onInstalled }));
    act(() => { hook.result.current.setFolder("/server/package"); });
    return { port, ...hook };
  }

  it.each([
    ["a non-API failure", new Error("socket hang up"), "Failed to preview plugin."],
    ["an unknown code with a known status", new ApiError("bad", 400, "SOMETHING_NEW"), "Invalid plugin package. Check its manifest, integrity and folder."],
    ["a known status without a code", new ApiError("conflict", 409), "Installation conflicts with an existing plugin. Check its version and replacement option."],
    ["an unknown code and status", new ApiError("boom", 500, "SOMETHING_NEW"), "Failed to preview plugin."],
  ])("maps %s on preview to operator copy", async (_name, failure, expected) => {
    const { port, result } = setup();
    vi.spyOn(port, "preview").mockRejectedValue(failure);
    await act(async () => { await result.current.review(); });
    expect(result.current.error).toBe(expected);
  });

  it("falls back to the install-specific copy when an install fails for an unknown reason", async () => {
    const { port, result } = setup();
    await act(async () => { await result.current.review(); });
    vi.spyOn(port, "install").mockRejectedValue(new Error("offline"));
    await act(async () => { await result.current.install(); });
    expect(result.current.error).toBe("Failed to install plugin.");
  });

  it("drops a late preview failure once the folder changed", async () => {
    const { port, result } = setup();
    let fail!: () => void;
    vi.spyOn(port, "preview").mockImplementation(() => new Promise((_resolve, reject) => { fail = () => reject(new Error("late")); }));
    let reviewing!: Promise<void>;
    act(() => { reviewing = result.current.review(); });
    act(() => result.current.setFolder("/other"));
    await act(async () => { fail(); await reviewing; });
    expect(result.current.error).toBeNull();
  });

  it("does not reload or announce an install whose inputs changed while it was in flight", async () => {
    const onInstalled = vi.fn(async () => {});
    const { port, result } = setup(undefined, onInstalled);
    await act(async () => { await result.current.review(); });
    let finish!: () => void;
    vi.spyOn(port, "install").mockImplementation(() => new Promise((resolve) => { finish = () => resolve({ plugin: preview }); }));
    let installing!: Promise<void>;
    act(() => { installing = result.current.install(); });
    act(() => result.current.setFolder("/other"));
    await act(async () => { finish(); await installing; });
    expect(onInstalled).not.toHaveBeenCalled();
    expect(result.current.installedMessage).toBeNull();
  });

  it("does not announce an install whose inputs changed while the list reloaded", async () => {
    let reloaded!: () => void;
    const onInstalled = vi.fn(() => new Promise<void>((resolve) => { reloaded = resolve; }));
    const { result } = setup(undefined, onInstalled);
    await act(async () => { await result.current.review(); });
    let installing!: Promise<void>;
    act(() => { installing = result.current.install(); });
    await vi.waitFor(() => expect(onInstalled).toHaveBeenCalledOnce());
    act(() => result.current.setFolder("/other"));
    await act(async () => { reloaded(); await installing; });
    expect(result.current.installedMessage).toBeNull();
    expect(result.current.folder).toBe("/other");
  });

  it("ignores Cancel while a request is running, and clears the review otherwise", async () => {
    const { port, result } = setup();
    await act(async () => { await result.current.review(); });
    let finish!: () => void;
    vi.spyOn(port, "install").mockImplementation(() => new Promise((resolve) => { finish = () => resolve({ plugin: preview }); }));
    let installing!: Promise<void>;
    act(() => { installing = result.current.install(); });
    act(() => result.current.cancelReview());
    expect(result.current.preview).not.toBeNull();
    await act(async () => { finish(); await installing; });
    act(() => { result.current.setFolder("/again"); });
    await act(async () => { await result.current.review(); });
    act(() => result.current.cancelReview());
    expect(result.current.preview).toBeNull();
  });

  it("opens the hidden zip picker, and treats an empty pick or empty drop as no zip", () => {
    const { result } = setup();
    const input = document.createElement("input");
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    result.current.zipInputRef.current = input;
    act(() => result.current.onChooseZip());
    expect(click).toHaveBeenCalledOnce();
    act(() => result.current.onZipChange({ target: { files: null } } as never));
    expect(result.current.zipFile).toBeNull();
    act(() => result.current.drop.onDrop({ preventDefault() {}, dataTransfer: { files: [] } } as never));
    expect(result.current.zipFile).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
