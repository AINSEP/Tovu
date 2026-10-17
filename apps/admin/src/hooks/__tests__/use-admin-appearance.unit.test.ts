import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, expect, it, vi } from "vitest";
import { useFetchQuery } from "@jini-ai/ui/fetch-query";
import { useAdminAppearance, useSettingsAppearance } from "../use-admin-appearance.hooks";
import { APPEARANCE_NAMESPACE, DEFAULT_APPEARANCE } from "../../lib/settings-tabs";
import { publishSettingsRefresh } from "../../lib/settings-refresh-bus";

const primary = () => document.documentElement.style.getPropertyValue("--jini-theme-light-primary");
afterEach(() => document.documentElement.removeAttribute("style"));
afterEach(() => vi.unstubAllGlobals());

it("applies the saved accent on load and follows settings refreshes", async () => {
  let accentColor = "#a855f7";
  let refresh = () => {};
  const port = {
    loadAppearance: async () => ({ ...DEFAULT_APPEARANCE, accentColor }),
    subscribeToSettingsRefresh: (listener: () => void) => {
      refresh = listener;
      return () => { refresh = () => {}; };
    },
  };
  const { unmount } = renderHook(() => useAdminAppearance({}, { port }));
  await waitFor(() => expect(primary()).toBe("#a855f7"));
  expect(document.documentElement.style.getPropertyValue("--jini-theme-dark-primary")).toBe("#a855f7");
  accentColor = "#123456";
  await act(async () => refresh());
  await waitFor(() => expect(primary()).toBe("#123456"));
  unmount();
});

it("the unchosen ledger default leaves the stylesheet's brand mapping in charge, in any case", async () => {
  let accentColor = "#a855f7";
  let refresh = () => {};
  const port = {
    loadAppearance: async () => ({ ...DEFAULT_APPEARANCE, accentColor }),
    subscribeToSettingsRefresh: (listener: () => void) => { refresh = listener; return () => {}; },
  };
  renderHook(() => useAdminAppearance({}, { port }));
  await waitFor(() => expect(primary()).toBe("#a855f7"));
  accentColor = DEFAULT_APPEARANCE.accentColor.toUpperCase();
  await act(async () => refresh());
  await waitFor(() => expect(primary()).toBe(""));
  expect(document.documentElement.style.getPropertyValue("--jini-theme-dark-primary")).toBe("");
});

it("previews edits immediately and skips unloaded values", async () => {
  const { rerender } = renderHook(({ accentColor, ready }) => useSettingsAppearance({ accentColor, ready }, {}), {
    initialProps: { accentColor: "#2563eb", ready: false },
  });
  expect(primary()).toBe("");
  rerender({ accentColor: "#e11d48", ready: true });
  expect(primary()).toBe("#e11d48");
  rerender({ accentColor: "#123456", ready: true });
  expect(primary()).toBe("#123456");
});

it("rejects an older settings read after a newer refresh and ignores unmounted reads", async () => {
  const pending: Array<(value: typeof DEFAULT_APPEARANCE) => void> = [];
  let refresh = () => {};
  const port = {
    loadAppearance: () => new Promise<typeof DEFAULT_APPEARANCE>((resolve) => pending.push(resolve)),
    subscribeToSettingsRefresh: (listener: () => void) => { refresh = listener; return () => {}; },
  };
  const { unmount } = renderHook(() => useAdminAppearance({}, { port }));
  await waitFor(() => expect(pending).toHaveLength(1));
  act(() => refresh());
  await waitFor(() => expect(pending).toHaveLength(2));
  await act(async () => pending[1]({ ...DEFAULT_APPEARANCE, accentColor: "#123456" }));
  await waitFor(() => expect(primary()).toBe("#123456"));
  await act(async () => pending[0]({ ...DEFAULT_APPEARANCE, accentColor: "#ffffff" }));
  expect(primary()).toBe("#123456");
  act(() => refresh());
  await waitFor(() => expect(pending).toHaveLength(3));
  unmount();
  await act(async () => pending[2]({ ...DEFAULT_APPEARANCE, accentColor: "#ffffff" }));
  expect(primary()).toBe("#123456");
});

it("a pending shell read cannot repaint an accent the operator has just previewed", async () => {
  let resolve!: (value: typeof DEFAULT_APPEARANCE) => void;
  const port = {
    loadAppearance: () => new Promise<typeof DEFAULT_APPEARANCE>((done) => { resolve = done; }),
    subscribeToSettingsRefresh: () => () => {},
  };
  const { result, rerender } = renderHook(({ ready }) => {
    useAdminAppearance({}, { port });
    useSettingsAppearance({ ready, accentColor: "#e11d48" }, {});
    // Observe the same read reaching React before asserting that the preview survived it.
    return useFetchQuery({ key: ["settings", APPEARANCE_NAMESPACE, "anonymous"], fetch: port.loadAppearance }, { staleTime: Infinity });
  }, { initialProps: { ready: false } });
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  rerender({ ready: true });
  expect(primary()).toBe("#e11d48");
  await act(async () => resolve({ ...DEFAULT_APPEARANCE, accentColor: "#2563eb" }));
  await waitFor(() => expect(result.current.data?.accentColor).toBe("#2563eb"));
  expect(primary()).toBe("#e11d48");
});

it("the live port follows appearance and unscoped refreshes and ignores unrelated namespaces", async () => {
  let accentColor = "#a855f7";
  const fetch = vi.fn(async (url: string) => {
    expect(url).toBe("/api/admin/v1/workspaces/workspace-local/settings/effective?namespace=core.appearance");
    return new Response(JSON.stringify({ data: [{ key: "accentColor", value: accentColor }] }));
  });
  vi.stubGlobal("fetch", fetch);
  const { unmount } = renderHook(() => useAdminAppearance({}));
  await waitFor(() => expect(primary()).toBe("#a855f7"));
  expect(fetch).toHaveBeenCalledTimes(1);
  accentColor = "#123456";
  await act(async () => publishSettingsRefresh(["core.execution"]));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(primary()).toBe("#a855f7");
  await act(async () => publishSettingsRefresh([APPEARANCE_NAMESPACE]));
  await waitFor(() => expect(primary()).toBe("#123456"));
  accentColor = "#e11d48";
  await act(async () => publishSettingsRefresh());
  await waitFor(() => expect(primary()).toBe("#e11d48"));
  expect(fetch).toHaveBeenCalledTimes(3);
  unmount();
  await act(async () => publishSettingsRefresh([APPEARANCE_NAMESPACE]));
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("settings previews use the document root when options are omitted", () => {
  const { rerender } = renderHook(({ accentColor }) => useSettingsAppearance({ accentColor, ready: true }), {
    initialProps: { accentColor: "#a855f7" },
  });
  expect(primary()).toBe("#a855f7");
  rerender({ accentColor: "#123456" });
  expect(primary()).toBe("#123456");
});

it("loaded accents and draft previews apply to the supplied root", async () => {
  const root = document.createElement("main");
  const port = {
    loadAppearance: async () => ({ ...DEFAULT_APPEARANCE, accentColor: "#a855f7" }),
    subscribeToSettingsRefresh: () => () => {},
  };
  renderHook(() => useAdminAppearance({}, { port, root }));
  await waitFor(() => expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#a855f7"));
  renderHook(() => useSettingsAppearance({ accentColor: "#123456", ready: true }, { root }));
  expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#123456");
  expect(root.style.getPropertyValue("--jini-theme-dark-primary")).toBe("#123456");
  expect(primary()).toBe("");
});
