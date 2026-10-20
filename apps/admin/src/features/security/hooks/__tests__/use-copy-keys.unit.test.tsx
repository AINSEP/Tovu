import { act, renderHook } from "@/__tests__/fetch-query-render";
import type { ChangeEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCopyKeys, useWiredCopyKeys, type CopyKeysPort } from "../use-copy-keys.hooks";
import { ApiError, type AdminCredentialCopySource } from "@/lib/api";
import { COPY_SOURCES as sources, fakeCopyKeysPort as port, t } from "../../__tests__/copy-keys.fixture";

/** Opens the controller over `api` and selects `siteId` once the inventory has loaded. */
async function openOn(api: CopyKeysPort, { siteId = "a", startSite, translate = t }: {
  siteId?: string; startSite?: (input: { id: string }) => Promise<unknown>; translate?: (key: string) => string;
} = {}) {
  const view = renderHook(() => useCopyKeys({ t: translate }, { port: api, startSite }));
  await act(async () => { view.result.current.show({ currentTarget: document.createElement("button") }); });
  act(() => view.result.current.changeSource({ currentTarget: { value: siteId } } as ChangeEvent<HTMLSelectElement>));
  return view;
}
function check(id: string, checked = true) {
  return { currentTarget: { value: id, checked } } as ChangeEvent<HTMLInputElement>;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("useCopyKeys", () => {
  it("starts a project only once while its desktop start is in flight", async () => {
    const api = port([{ ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade",
      actionHint: { action: "start-site", siteId: "a", desktopSiteId: "/registered/alpha" } }]);
    let finish!: () => void;
    const started = new Promise<void>(resolve => { finish = resolve; });
    const startSite = vi.fn(() => started);
    const { result } = renderHook(() => useCopyKeys({ t }, { port: api, startSite }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    act(() => result.current.changeSource({ currentTarget: { value: "a" } } as ChangeEvent<HTMLSelectElement>));
    expect(result.current.canStart).toBe(true);
    const start = result.current.start;
    let attempts!: Promise<void>[];
    // Call the controller twice before completion; the dialog disables its button after one click.
    act(() => { attempts = [start(), start()]; });
    await act(async () => { finish(); await Promise.all(attempts); });
    expect(startSite).toHaveBeenCalledExactlyOnceWith({ id: "/registered/alpha" });
  });

  it("shows a safe project-list failure and can load again after reopening", async () => {
    const api = port();
    vi.mocked(api.listCredentialCopySources).mockRejectedValueOnce(new Error("private inventory error"));
    const { result } = renderHook(() => useCopyKeys({ t }, { port: api }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    expect(result.current.error).toBe("Couldn't load projects. Try again.");
    expect(result.current.loading).toBe(false);
    act(() => result.current.cancel());
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    expect(result.current.sources).toEqual(sources);
    expect(result.current.error).toBe("");
  });

  it.each(["resolve", "reject"])("ignores a stale inventory %s after cancellation and reopening", async outcome => {
    let resolve!: (value: { sources: AdminCredentialCopySource[] }) => void;
    let reject!: (error: Error) => void;
    const oldRequest = new Promise<{ sources: AdminCredentialCopySource[] }>((yes, no) => { resolve = yes; reject = no; });
    let finishNew!: (value: { sources: AdminCredentialCopySource[] }) => void;
    const newRequest = new Promise<{ sources: AdminCredentialCopySource[] }>(yes => { finishNew = yes; });
    const api = port();
    vi.mocked(api.listCredentialCopySources).mockReturnValueOnce(oldRequest).mockReturnValueOnce(newRequest);
    const { result } = renderHook(() => useCopyKeys({ t }, { port: api }));
    act(() => result.current.show({ currentTarget: document.createElement("button") }));
    expect(result.current.loading).toBe(true);
    act(() => result.current.cancel());
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    expect(result.current.sources).toEqual([]);
    await act(async () => {
      if (outcome === "resolve") resolve({ sources: [{ ...sources[0]!, name: "Stale" }] });
      else reject(new Error("stale failure"));
      await oldRequest.catch(() => undefined);
    });
    expect(result.current.sources).toEqual([]);
    expect(result.current.error).toBe("");
    expect(result.current.loading).toBe(true);
    await act(async () => { finishNew({ sources }); await newRequest; });
    expect(result.current.sources).toEqual(sources);
    expect(result.current.loading).toBe(false);
  });

  it("removes unchecked keys, bounds selection at 100, and refuses concurrent submissions and cancellation", async () => {
    const keys = Array.from({ length: 101 }, (_, index) => ({ kind: "custom" as const, id: `k${index}`, label: `Key ${index}`, provider: null, worksFor: [] }));
    const api = port([{ ...sources[0]!, keys }]);
    let finish!: (value: { results: [] }) => void;
    vi.mocked(api.copyCredentials).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useCopyKeys({ t }, { port: api }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    act(() => result.current.changeSource({ currentTarget: { value: "a" } } as ChangeEvent<HTMLSelectElement>));
    act(() => { for (const key of keys) result.current.changeKey({ currentTarget: { value: key.id, checked: true } } as ChangeEvent<HTMLInputElement>); });
    expect(result.current.disabled).toBe(true);
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(api.copyCredentials).not.toHaveBeenCalled();
    act(() => result.current.changeKey({ currentTarget: { value: "k100", checked: false } } as ChangeEvent<HTMLInputElement>));
    expect(result.current.keys.find(key => key.id === "k100")?.checked).toBe(false);
    expect(result.current.keys.find(key => key.id === "k0")?.text).toBe("Key 0 · custom");
    expect(result.current.disabled).toBe(false);
    const submit = result.current.submit;
    let attempts!: Promise<void>[];
    act(() => { attempts = [submit({ preventDefault() {} }), submit({ preventDefault() {} })]; result.current.cancel(); });
    expect(result.current.open).toBe(true);
    expect(result.current.pending).toBe(true);
    await act(async () => { finish({ results: [] }); await Promise.all(attempts); });
    expect(api.copyCredentials).toHaveBeenCalledExactlyOnceWith({ sourceSiteId: "a", ids: keys.slice(0, 100).map(key => key.id), overwrite: false });
    expect(result.current.results).toEqual([]);
    expect(result.current.pending).toBe(false);
    act(() => result.current.cancel());
    expect(result.current.open).toBe(false);
  });

  it("uses the default HTTP port and exposes a selected empty project's message", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url, init) => {
      expect(url).toBe("/api/admin/v1/workspaces/workspace-local/system/credential-copy");
      expect(init.method).toBe("GET");
      return Response.json({ sources: [
        { siteId: "empty", name: "Empty", keys: [], message: "No eligible keys in this project." },
      ] });
    }));
    const { result } = renderHook(() => useCopyKeys({ t }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    act(() => result.current.changeSource({ currentTarget: { value: "empty" } } as ChangeEvent<HTMLSelectElement>));
    expect(result.current.empty).toBe(true);
    expect(result.current.keys).toEqual([]);
    expect(result.current.sourceMessage).toBe("No eligible keys in this project.");
    expect(result.current.disabled).toBe(true);
  });

  it("does not offer or perform desktop start for a mismatched route hint", async () => {
    const api = port([{ ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade",
      actionHint: { action: "start-site", siteId: "b", desktopSiteId: "/registered/beta" } }]);
    const startSite = vi.fn();
    const { result } = renderHook(() => useCopyKeys({ t }, { port: api, startSite }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    act(() => result.current.changeSource({ currentTarget: { value: "a" } } as ChangeEvent<HTMLSelectElement>));
    expect(result.current.canStart).toBe(false);
    await act(async () => { await result.current.start(); });
    expect(startSite).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(false);
  });

  it("retains the other source when an upgrade refusal changes the selected source", async () => {
    const api = port();
    vi.mocked(api.copyCredentials).mockRejectedValue(new ApiError("private", 409, undefined, { reasonCode: "source-needs-upgrade" }));
    const { result } = renderHook(() => useCopyKeys({ t }, { port: api }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    act(() => result.current.changeSource({ currentTarget: { value: "a" } } as ChangeEvent<HTMLSelectElement>));
    act(() => result.current.changeKey({ currentTarget: { value: "one", checked: true } } as ChangeEvent<HTMLInputElement>));
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(result.current.sources).toEqual([{ ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade" }, sources[1]]);
    expect(result.current.keys).toEqual([]);
    expect(result.current.disabled).toBe(true);
  });

  it.each([undefined, {}, { startSite: vi.fn(async () => ({})) }])("wires the HTTP inventory and optional desktop bridge: %s", async bridge => {
    vi.stubGlobal("tovuRunner", bridge);
    const fetch = vi.fn(async (url, init) => {
      expect(url).toBe("/api/admin/v1/workspaces/workspace-local/system/credential-copy");
      expect(init.method).toBe("GET");
      return Response.json({ sources: [{ ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade",
        actionHint: { action: "start-site", siteId: "a", desktopSiteId: "/registered/alpha" } }] });
    });
    vi.stubGlobal("fetch", fetch);
    const { result } = renderHook(() => useWiredCopyKeys({ t }));
    await act(async () => { result.current.show({ currentTarget: document.createElement("button") }); });
    expect(result.current.sources[0]?.name).toBe("Alpha");
    act(() => result.current.changeSource({ currentTarget: { value: "a" } } as ChangeEvent<HTMLSelectElement>));
    expect(result.current.canStart).toBe(!!bridge && "startSite" in bridge);
    await act(async () => { await result.current.start(); });
    if (bridge && "startSite" in bridge) {
      expect(bridge.startSite).toHaveBeenCalledExactlyOnceWith("/registered/alpha");
      expect(fetch).toHaveBeenCalledTimes(2);
    } else expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.sourceMessage).toBe("Start Alpha once in Tovu to upgrade it, then copy.");
  });

  it("exposes an inert controller before any project is chosen", async () => {
    const { result } = await openOn(port(), { siteId: "" });
    expect(result.current.keys).toEqual([]);
    expect(result.current.empty).toBe(false);
    expect(result.current.sourceMessage).toBeUndefined();
    expect(result.current.canStart).toBe(false);
    expect(result.current.disabled).toBe(true);
  });

  it("focuses the opening button without scrolling", async () => {
    const button = document.createElement("button");
    const focus = vi.spyOn(button, "focus");
    const { result } = renderHook(() => useCopyKeys({ t }, { port: port() }));
    await act(async () => { result.current.show({ currentTarget: button }); });
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(result.current.open).toBe(true);
  });

  it("shows a key hint only when the server sent exactly four characters", async () => {
    const { result } = await openOn(port([{ ...sources[0]!, keys: [
      { kind: "vendor", id: "short", label: "Short", provider: "OpenAI", last4: "123" },
      { kind: "vendor", id: "long", label: "Long", provider: "OpenAI", last4: "12345" },
      { kind: "vendor", id: "exact", label: "Exact", provider: "OpenAI", last4: "fake" },
    ] }]));
    expect(result.current.keys.map(key => key.text)).toEqual(["Short · OpenAI", "Long · OpenAI", "Exact · OpenAI · …fake"]);
  });

  it("leaves works-for empty when neither works-for nor publish hosts are present", async () => {
    const { result } = await openOn(port([{ ...sources[0]!, keys: [{ kind: "vendor", id: "one", label: "Main", provider: "OpenAI" }] }]));
    expect(result.current.keys).toEqual([{ id: "one", checked: false, text: "Main · OpenAI", worksFor: "" }]);
  });

  it("translates the works-for label and fixed error copy through the injected translator", async () => {
    const api = port([{ ...sources[0]!, keys: [{ kind: "vendor", id: "one", label: "Main", provider: "OpenAI", worksFor: ["github"] }] }]);
    vi.mocked(api.copyCredentials).mockRejectedValue(new Error("private failure"));
    const { result } = await openOn(api, { translate: key => `T:${key}` });
    expect(result.current.keys[0]?.worksFor).toBe("T:Works for: github");
    act(() => result.current.changeKey(check("one")));
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(result.current.error).toBe("T:Copying keys failed. Try again.");
  });

  it("disables copying for a refused project even with a key selected, and shows its message", async () => {
    const api = port([{ ...sources[0]!, reasonCode: "source-locked", message: "Unlock this project first." }]);
    const { result } = await openOn(api, { startSite: vi.fn() });
    act(() => result.current.changeKey(check("one")));
    expect(result.current.keys[0]?.checked).toBe(true);
    expect(result.current.disabled).toBe(true);
    expect(result.current.empty).toBe(false);
    expect(result.current.canStart).toBe(false);
    expect(result.current.sourceMessage).toBe("Unlock this project first.");
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(api.copyCredentials).not.toHaveBeenCalled();
  });

  it("keys results by id and position and labels only ids known to the source", async () => {
    const api = port();
    vi.mocked(api.copyCredentials).mockResolvedValue({ results: [
      { kind: "vendor", id: "one", status: "copied" },
      { kind: "vendor", id: "one", status: "skipped", reasonCode: "target-exists" },
      { kind: "custom", id: "elsewhere", status: "failed", reasonCode: "conflict" },
    ] });
    const { result } = await openOn(api);
    act(() => result.current.changeKey(check("one")));
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(result.current.results).toEqual([
      { key: "one:0", text: "Main · copied ✓" },
      { key: "one:1", text: "Main · skipped (already there)" },
      { key: "elsewhere:2", text: "Changed during copy; try again." },
    ]);
  });

  it.each([
    ["an ApiError with another reason", new ApiError("private", 409, undefined, { reasonCode: "conflict" })],
    ["a non-ApiError carrying the upgrade reason", Object.assign(new Error("private"), { body: { reasonCode: "source-needs-upgrade" } })],
  ])("treats %s as a generic copy failure and keeps the source eligible", async (_label, failure) => {
    const api = port();
    vi.mocked(api.copyCredentials).mockRejectedValue(failure);
    const { result } = await openOn(api);
    act(() => result.current.changeKey(check("one")));
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(result.current.error).toBe("Copying keys failed. Try again.");
    expect(result.current.sources).toEqual(sources);
    expect(result.current.keys[0]?.checked).toBe(true);
  });

  it("clears a previous copy failure when a new copy starts", async () => {
    const api = port();
    vi.mocked(api.copyCredentials).mockRejectedValueOnce(new Error("private"));
    const { result } = await openOn(api);
    act(() => result.current.changeKey(check("one")));
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(result.current.error).toBe("Copying keys failed. Try again.");
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(result.current.error).toBe("");
    expect(result.current.results).toEqual([{ key: "one:0", text: "Main · copied ✓ …1234" }]);
  });

  it("refuses to start a project while a copy is in flight", async () => {
    const upgrade = { ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade",
      actionHint: { action: "start-site" as const, siteId: "a", desktopSiteId: "/registered/alpha" } };
    const api = port([sources[1]!, upgrade]);
    let finish!: (value: { results: [] }) => void;
    vi.mocked(api.copyCredentials).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const startSite = vi.fn(async () => ({}));
    const { result } = await openOn(api, { siteId: "b", startSite });
    act(() => result.current.changeKey(check("two")));
    let copying!: Promise<void>;
    act(() => { copying = result.current.submit({ preventDefault() {} }); });
    act(() => result.current.changeSource({ currentTarget: { value: "a" } } as ChangeEvent<HTMLSelectElement>));
    expect(result.current.canStart).toBe(true);
    await act(async () => { await result.current.start(); });
    expect(startSite).not.toHaveBeenCalled();
    await act(async () => { finish({ results: [] }); await copying; });
  });
});
