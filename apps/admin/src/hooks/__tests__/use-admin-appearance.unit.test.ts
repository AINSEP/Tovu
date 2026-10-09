import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useAdminAppearance, useSettingsAppearance } from "../use-admin-appearance.hooks";
import { DEFAULT_APPEARANCE } from "../../lib/settings-tabs";

const primary = () => document.documentElement.style.getPropertyValue("--jini-theme-light-primary");
afterEach(() => document.documentElement.removeAttribute("style"));

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
  expect(primary()).toBe("#123456");
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
  expect(primary()).toBe("");
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
  act(() => refresh());
  await act(async () => pending[1]({ ...DEFAULT_APPEARANCE, accentColor: "#123456" }));
  await act(async () => pending[0]({ ...DEFAULT_APPEARANCE, accentColor: "#ffffff" }));
  expect(primary()).toBe("#123456");
  act(() => refresh());
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
  const { rerender } = renderHook(({ ready }) => {
    useAdminAppearance({}, { port });
    useSettingsAppearance({ ready, accentColor: "#e11d48" }, {});
  }, { initialProps: { ready: false } });
  rerender({ ready: true });
  expect(primary()).toBe("#e11d48");
  await act(async () => resolve({ ...DEFAULT_APPEARANCE, accentColor: "#2563eb" }));
  expect(primary()).toBe("#e11d48");
});
