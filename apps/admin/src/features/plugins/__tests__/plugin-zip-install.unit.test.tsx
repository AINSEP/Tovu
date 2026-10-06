/** ZIP input shares the folder trust step; changing the package always invalidates consent. */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { usePluginInstall } from "../hooks/use-plugin-install.hooks";
import { createFakePluginInstallPort, defaultPluginInstallPort } from "../hooks/plugin-install-dependencies.hooks";
import { AddPluginPanel } from "../AddPluginPanel";
import { t } from "../plugins-i18n";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const preview = { id: "zip", name: "ZIP", version: "1.0.0", tier: "tier-3" as const, capabilities: [], hooks: [], hasCode: true, contentTypes: [], conflicts: [], digest: "sha256-" + "a".repeat(64) };

it("reviews uploaded bytes and only installs them with reviewed consent", async () => {
  const port = createFakePluginInstallPort({ preview });
  const inspect = vi.spyOn(port, "preview"); const install = vi.spyOn(port, "install");
  const file = new File(["archive"], "package.zip", { type: "application/zip" });
  const { result } = renderHook(() => usePluginInstall({ port, t: (key) => key, onInstalled: async () => {} }));
  act(() => { result.current.setZipFile(file); });
  await act(async () => { await result.current.install(); });
  expect(install).not.toHaveBeenCalled();
  await act(async () => { await result.current.review(); });
  expect(inspect).toHaveBeenCalledWith({ source: { kind: "zip", file }, replace: false });
  await act(async () => { await result.current.install(); });
  expect(install).toHaveBeenCalledWith({ source: { kind: "zip", file }, replace: false, expectedDigest: preview.digest });
});

it("changing ZIP, choosing a folder, or replacement options invalidates review", async () => {
  const port = createFakePluginInstallPort({ preview });
  const { result } = renderHook(() => usePluginInstall({ port, t: (key) => key, onInstalled: async () => {} }));
  const file = new File(["archive"], "one.zip");
  act(() => { result.current.setZipFile(file); });
  await act(async () => { await result.current.review(); });
  act(() => result.current.setZipFile(new File(["changed"], "two.zip")));
  expect(result.current.preview).toBeNull();
  await act(async () => { await result.current.review(); });
  act(() => result.current.setReplace(true));
  expect(result.current.preview).toBeNull();
  await act(async () => { await result.current.review(); });
  act(() => result.current.setFolder("/server/package"));
  expect(result.current.zipFile).toBeNull(); expect(result.current.preview).toBeNull();
  act(() => result.current.setZipFile(file));
  expect(result.current.folder).toBe("");
});

it("rejects oversized browser files before an upload", async () => {
  const port = createFakePluginInstallPort({ preview }); const read = vi.spyOn(port, "preview");
  const { result } = renderHook(() => usePluginInstall({ port, t: (key) => key, onInstalled: async () => {} }));
  const file = new File([], "huge.zip"); Object.defineProperty(file, "size", { value: 32 * 1024 * 1024 + 1 });
  act(() => { result.current.setZipFile(file); });
  await act(async () => { await result.current.review(); });
  expect(read).not.toHaveBeenCalled(); expect(result.current.reviewDisabled).toBe(true);
  expect(result.current.error).toBe("ZIP exceeds the upload or expanded package size limit.");
});

it("renders a styled ZIP drop zone (no raw file input) and requires the same full-access review before installation", async () => {
  const port = createFakePluginInstallPort({ preview });
  function Harness() {
    const controller = usePluginInstall({ port, t: (key) => key, onInstalled: async () => {} });
    return <AddPluginPanel controller={controller} canInstall />;
  }
  render(<Harness />); const user = userEvent.setup();
  const picker = screen.getByLabelText("Upload .zip (max 32 MiB)") as HTMLInputElement;
  expect(picker.hidden).toBe(true);
  expect(screen.getByText("Drop a .zip here")).toBeTruthy();
  await user.upload(picker, new File(["zip"], "plugin.zip", { type: "application/zip" }));
  expect(screen.getByText("plugin.zip")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Install (stays off)" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Preview plugin" }));
  expect(await screen.findByText("This plugin runs code with full access to this computer and every site on it.")).toBeTruthy();
  expect(port.installed).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Install (stays off)" }));
  expect(port.installed).toHaveLength(1);
});

it("a dropped .zip is chosen like a picked one; a drop is ignored while a preview is in flight", async () => {
  const port = createFakePluginInstallPort({ preview });
  const { result } = renderHook(() => usePluginInstall({ port, t: (key) => key, onInstalled: async () => {} }));
  const file = new File(["zip"], "dropped.zip");
  const dropEvent = (files: File[]) => ({ preventDefault: vi.fn(), dataTransfer: { files } }) as unknown as Parameters<typeof result.current.drop.onDrop>[0];
  act(() => result.current.drop.onDragOver({ preventDefault: vi.fn() } as unknown as Parameters<typeof result.current.drop.onDragOver>[0]));
  expect(result.current.drop.dragging).toBe(true);
  act(() => result.current.drop.onDrop(dropEvent([file])));
  expect(result.current.drop.dragging).toBe(false);
  expect(result.current.zipFile).toBe(file);
  let pending!: Promise<void>;
  act(() => { pending = result.current.review(); });
  act(() => result.current.drop.onDrop(dropEvent([new File(["other"], "other.zip")])));
  await act(async () => { await pending; });
  expect(result.current.zipFile).toBe(file);
});

it("uploads raw ZIP bytes through the authenticated API seam for review and confirm", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ plugin: preview }), { status: 200, headers: { "content-type": "application/json" } }));
  const file = new File(["ZIP bytes"], "plugin.zip", { type: "" });
  expect(await defaultPluginInstallPort.preview({ source: { kind: "zip", file }, replace: true })).toEqual({ plugin: preview });
  expect(await defaultPluginInstallPort.install({ source: { kind: "zip", file }, replace: true, expectedDigest: preview.digest })).toEqual({ plugin: preview });
  const [reviewUrl, reviewOptions] = fetch.mock.calls[0];
  const [installUrl, installOptions] = fetch.mock.calls[1];
  expect(String(reviewUrl)).toContain("/plugins/install/zip/preview?replace=true");
  expect(String(installUrl)).toContain(`/plugins/install/zip?replace=true&expectedDigest=${preview.digest}`);
  for (const options of [reviewOptions, installOptions]) {
    expect(options?.body).toBeInstanceOf(Blob);
    expect((options?.body as Blob).size).toBe(file.size);
    expect(new Headers(options?.headers).get("content-type")).toBe("application/zip");
    expect(options?.credentials).toBe("same-origin");
  }
});

it("ZIP labels and size errors are translated in every supported locale", () => {
  for (const locale of ["es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn"]) {
    for (const key of ["Upload .zip (max 32 MiB)", "ZIP exceeds the upload or expanded package size limit."]) expect(t(locale, key)).not.toBe(key);
  }
});
