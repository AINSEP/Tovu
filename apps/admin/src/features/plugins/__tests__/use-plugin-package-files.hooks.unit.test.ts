import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ApiError, type AdminPluginFiles } from "@/lib/api";
import { createFakePluginsPort } from "../hooks/plugins-dependencies.hooks";
import { usePluginPackageFiles } from "../hooks/use-plugin-package-files.hooks";
import { toPackageFileView } from "../rules";

/**
 * @file `usePluginPackageFiles` against the injected port — loading, mapping omitted files, selection,
 * failure text, the caps notice, and a late response for a previously inspected plugin being dropped.
 */

const LIMITS = { maxFiles: 200, maxEntries: 2000, maxFileBytes: 524288, maxTotalBytes: 4194304 };
const identity = (key: string) => key;

function listing(pluginId: string, overrides: Partial<AdminPluginFiles> = {}): AdminPluginFiles {
  return {
    pluginId,
    source: "site",
    files: [
      { relativePath: "tovu.plugin.json", sizeBytes: 2, content: "{}", omitted: null },
      { relativePath: "assets/logo.png", sizeBytes: 6, content: null, omitted: "binary" },
    ],
    truncated: false,
    limits: LIMITS,
    ...overrides,
  };
}

describe("usePluginPackageFiles", () => {
  it("reports loading, then maps the listing and selects the first file", async () => {
    const port = createFakePluginsPort({ packageFiles: { "site-fixture": listing("site-fixture") } });
    const { result } = renderHook(() => usePluginPackageFiles({ pluginId: "site-fixture", port, t: identity }));

    expect(result.current.status).toEqual({ text: "Loading package files…", role: "status" });
    await waitFor(() => expect(result.current.files).toHaveLength(2));

    expect(result.current.status).toBeNull();
    expect(result.current.listNotice).toBeNull();
    expect(result.current.selectedFile).toEqual({ relativePath: "tovu.plugin.json", content: "{}" });
    expect(result.current.files[1]).toEqual({ relativePath: "assets/logo.png", content: null, unavailableReason: "Binary file — not shown." });
  });

  it("selectFile moves the selection; an unknown path falls back to the first file", async () => {
    const port = createFakePluginsPort({ packageFiles: { p: listing("p") } });
    const { result } = renderHook(() => usePluginPackageFiles({ pluginId: "p", port, t: identity }));
    await waitFor(() => expect(result.current.files).toHaveLength(2));

    act(() => result.current.selectFile("assets/logo.png"));
    expect(result.current.selectedFile?.relativePath).toBe("assets/logo.png");

    act(() => result.current.selectFile("../../etc/passwd"));
    expect(result.current.selectedFile?.relativePath).toBe("tovu.plugin.json");
  });

  it("turns a refusal into an alert using the screen's own error text", async () => {
    const port = createFakePluginsPort();
    port.getPluginFiles = () => Promise.reject(new ApiError("plugin id or version is not a safe path", 400, "PLUGIN_ID_INVALID"));
    const { result } = renderHook(() => usePluginPackageFiles({ pluginId: "../escape", port, t: identity }));

    await waitFor(() => expect(result.current.status).toEqual({ text: "This plugin's id is invalid.", role: "alert" }));
    expect(result.current.files).toEqual([]);
    expect(result.current.selectedFile).toBeNull();
  });

  it("an empty package says so, and a truncated listing sets the caps notice", async () => {
    const port = createFakePluginsPort({
      packageFiles: { empty: listing("empty", { files: [] }), big: listing("big", { truncated: true }) },
    });

    const empty = renderHook(() => usePluginPackageFiles({ pluginId: "empty", port, t: identity }));
    await waitFor(() => expect(empty.result.current.status).toEqual({ text: "No files to show for this plugin.", role: "status" }));

    const big = renderHook(() => usePluginPackageFiles({ pluginId: "big", port, t: identity }));
    await waitFor(() =>
      expect(big.result.current.listNotice).toBe("Some files are not listed: this package is larger than the viewer's limits."),
    );
  });

  it("never shows a late response for the previously inspected plugin under the current one", async () => {
    let resolveFirst!: (value: AdminPluginFiles) => void;
    const port = createFakePluginsPort({ packageFiles: { second: listing("second", { files: [] }) } });
    const realGet = port.getPluginFiles.bind(port);
    port.getPluginFiles = (id) => (id === "first" ? new Promise((resolve) => (resolveFirst = resolve)) : realGet(id));

    const { result, rerender } = renderHook(({ pluginId }) => usePluginPackageFiles({ pluginId, port, t: identity }), {
      initialProps: { pluginId: "first" },
    });
    rerender({ pluginId: "second" });
    await waitFor(() => expect(result.current.status?.text).toBe("No files to show for this plugin."));

    await act(async () => resolveFirst(listing("first")));
    expect(result.current.files).toEqual([]);
    expect(result.current.status?.text).toBe("No files to show for this plugin.");
  });

  it("a listing already settled for the previous plugin reads as loading under the next one", async () => {
    const port = createFakePluginsPort({ packageFiles: { first: listing("first", { truncated: true }) } });
    const realGet = port.getPluginFiles.bind(port);
    port.getPluginFiles = (id) => (id === "second" ? new Promise(() => {}) : realGet(id));

    const { result, rerender } = renderHook(({ pluginId }) => usePluginPackageFiles({ pluginId, port, t: identity }), {
      initialProps: { pluginId: "first" },
    });
    await waitFor(() => expect(result.current.files).toHaveLength(2));
    rerender({ pluginId: "second" });

    expect(result.current.status).toEqual({ text: "Loading package files…", role: "status" });
    expect(result.current.files).toEqual([]);
    expect(result.current.selectedFile).toBeNull();
    expect(result.current.listNotice).toBeNull();
  });

  it("a failed load sets no caps notice", async () => {
    const port = createFakePluginsPort();
    port.getPluginFiles = () => Promise.reject(new Error("network down"));
    const { result } = renderHook(() => usePluginPackageFiles({ pluginId: "p", port, t: identity }));

    await waitFor(() => expect(result.current.status).toEqual({ text: "network down", role: "alert" }));
    expect(result.current.listNotice).toBeNull();
  });
});

describe("toPackageFileView", () => {
  it("reads an unknown omission reason, or null content with no reason, as unreadable", () => {
    const unknown = { relativePath: "x", sizeBytes: 0, content: null, omitted: "quarantined" } as unknown as Parameters<typeof toPackageFileView>[0];
    expect(toPackageFileView(unknown, identity).unavailableReason).toBe("This file could not be read.");
    expect(toPackageFileView({ relativePath: "y", sizeBytes: 0, content: null, omitted: null }, identity).unavailableReason).toBe(
      "This file could not be read.",
    );
  });
});
