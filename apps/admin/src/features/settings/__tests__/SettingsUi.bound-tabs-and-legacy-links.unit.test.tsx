import { render, screen } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { bindSettingsUi } from "@jini-ai/admin/screens/settings/SettingsUi";
import { hooks as hostHooks, kit, deps } from "../SettingsUi";
import type { SettingsUiController } from "../hooks/use-settings-ui.hooks";
import type { SettingsSlice } from "@/hooks/use-settings-slice.hooks";
import { DEFAULT_EXECUTION_CONFIG } from "@/lib/execution-settings";
import { DEFAULT_INSTRUCTIONS, DEFAULT_INTERFACE, DEFAULT_LOCALE, DEFAULT_NOTIFICATIONS, DEFAULT_PRIVACY } from "@/lib/settings-tabs";
import { useTovuExecutionPolicy } from "@/hooks/use-tovu-execution-policy.hooks";

function slice<T>(value: T): SettingsSlice<T> {
  return { value, onChange: vi.fn(), loadError: null, saveState: { status: "idle" }, refresh: vi.fn(async () => {}) };
}

const controller: SettingsUiController = {
  memoryTopTab: "memories", setMemoryTopTab: vi.fn(),
  port: { detectLocalAgents: async () => [], testConnection: async () => ({ ok: true }) },
  execution: slice(DEFAULT_EXECUTION_CONFIG), instructions: slice(DEFAULT_INSTRUCTIONS),
  notifications: slice(DEFAULT_NOTIFICATIONS), privacy: slice(DEFAULT_PRIVACY),
  language: slice(DEFAULT_LOCALE), interface: slice(DEFAULT_INTERFACE),
  loading: false, loadError: null, save: { status: "idle" },
};
const hooks = {
  useSettingsUiHook: () => controller,
  useExecutionPolicy: (input: Parameters<typeof useTovuExecutionPolicy>[0]) => useTovuExecutionPolicy(input, { desktop: true }),
  useAdminExecutionCredentialHook: () => ({
    stored: null, apiKeyStoredExternally: false, apiKeyPlaceholder: undefined,
    storedKeyIsForOtherEndpoint: false, canDiscoverModels: true,
    saveState: { status: "idle" as const }, settingsSaveState: { status: "idle" as const },
    canSaveKey: false, saveKey: vi.fn(async () => {}), saveSettings: vi.fn(async () => {}),
    legacyKey: null, migrateLegacyKey: vi.fn(async () => {}), dismissLegacyPrompt: vi.fn(),
  }),
};

const SettingsUi = bindSettingsUi({ hooks: { ...hostHooks, ...hooks }, kit, deps });

afterEach(() => { window.history.replaceState(null, "", "/"); });

it("renders the bound tabs inline and keeps tab navigation in the current history entry", async () => {
  window.history.replaceState(null, "", "/admin/settings?tab=instructions");
  const length = window.history.length;
  const user = userEvent.setup();
  const { container } = render(<SettingsUi tabId="instructions" />);
  expect(container.querySelector(".settings-page")).toBeInTheDocument();
  expect(container.querySelector(".jini-tabbed-dialog--inline")).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /open as dialog/i })).not.toBeInTheDocument();
  expect(screen.getByTestId("settings-dialog-nav-instructions")).toBeInTheDocument();

  await user.click(screen.getByTestId("settings-dialog-nav-language"));

  expect(window.location.search).toBe("?tab=language");
  expect(window.history.length).toBe(length);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it.each([
  ["skills", "/admin/addons/skills", ""],
  ["appearance", "/admin/admin-ui", "?tab=appearance"],
])("replaces the legacy %s deep link", (tabId, pathname, search) => {
  window.history.replaceState(null, "", `/admin/settings?tab=${tabId}`);
  const length = window.history.length;

  render(<SettingsUi tabId={tabId} />);

  expect(window.location.pathname).toBe(pathname);
  expect(window.location.search).toBe(search);
  expect(window.history.length).toBe(length);
});
