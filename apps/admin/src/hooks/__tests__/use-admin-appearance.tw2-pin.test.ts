import { act, renderHook } from "@/__tests__/fetch-query-render";
import { beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE, type AppearanceConfig } from "../../lib/settings-tabs";
import { useAdminAppearance, useSettingsAppearance, type AdminAppearancePort } from "../use-admin-appearance.hooks";

const state = vi.hoisted(() => ({
  themeId: "classic",
  version: 0,
  data: undefined as { appearance: AppearanceConfig; readPreviewVersion: number } | undefined,
}));
vi.mock("../../admin-themes/use-admin-theme.hooks", () => ({ useAdminThemeState: () => ({ themeId: state.themeId }) }));
vi.mock("../use-admin-appearance-snapshot.hooks", () => ({
  useAdminAppearanceSnapshot: () => ({ data: state.data }),
  advanceAppearancePreview: () => ++state.version,
}));
const port: AdminAppearancePort = {
  loadAppearance: async () => DEFAULT_APPEARANCE,
  subscribeToSettingsRefresh: () => () => {},
};
beforeEach(() => { state.themeId = "classic"; state.version = 0; state.data = undefined; });

it("retains an unloaded theme's paint, clears on a switch without a draft, and restores a switched draft", () => {
  const root = document.createElement("main");
  root.style.setProperty("--jini-theme-light-primary", "#123456");
  const shell = renderHook(() => useAdminAppearance({}, { root, port }));
  expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#123456");
  const preview = renderHook(() => useSettingsAppearance({ ready: true, accentColor: "#e11d48" }, { root }));
  preview.unmount();
  state.themeId = "other";
  shell.rerender();
  expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("");
  expect(root.hasAttribute("data-admin-accent")).toBe(false);
  state.themeId = "classic";
  shell.rerender();
  expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#e11d48");
});

it.each([0, 1, 2])("retires drafts only at or below the accepted cutoff %s, across themes", (cutoff) => {
  const root = document.createElement("main");
  const shell = renderHook(() => useAdminAppearance({}, { root, port }));
  const first = renderHook(() => useSettingsAppearance({ ready: true, accentColor: "#e11d48" }, { root }));
  first.unmount();
  state.themeId = "other";
  const second = renderHook(() => useSettingsAppearance({ ready: true, accentColor: "#059669" }, { root }));
  second.unmount();
  state.data = { appearance: { ...DEFAULT_APPEARANCE, accentColor: "#123456", accentColors: { other: "#123456" } }, readPreviewVersion: cutoff };
  act(() => shell.rerender());
  expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe(cutoff < 2 ? "#059669" : "#123456");
  state.themeId = "classic";
  shell.rerender();
  expect(root.style.getPropertyValue("--jini-theme-dark-primary")).toBe(cutoff < 1 ? "#e11d48" : "#123456");
});

it("accepts a saved accent without drafts and preserves a newer explicit default preview", () => {
  const root = document.createElement("main");
  state.data = { appearance: { ...DEFAULT_APPEARANCE, accentColor: "#123456" }, readPreviewVersion: 0 };
  const shell = renderHook(() => useAdminAppearance({}, { root, port }));
  expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("#123456");
  const preview = renderHook(() => useSettingsAppearance({ ready: true, accentColor: undefined }, { root }));
  preview.unmount();
  state.data = { ...state.data };
  shell.rerender();
  expect(root.style.getPropertyValue("--jini-theme-light-primary")).toBe("");
  expect(root.style.getPropertyValue("--jini-theme-dark-primary")).toBe("");
  expect(root.hasAttribute("data-admin-accent")).toBe(false);
});
