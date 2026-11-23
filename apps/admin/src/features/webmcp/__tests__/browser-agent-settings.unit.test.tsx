import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { BrowserAgentSettingsPanel } from "@jini-ai/admin/screens/webmcp/BrowserAgentSettingsPanel";
import { WEBMCP_PREFERENCE_KEY, browserAgentSettingsPort, useAdminBrowserAgentSettings, webMcpT } from "../browser-agent-settings.hooks";
import { WEBMCP_DICT, WEBMCP_KEYS } from "@jini-ai/admin/screens/webmcp/webmcp-i18n";
import { ADMIN_LOCALES } from "../../../lib/settings-tabs";

/** @file The admin's binding of Jini's browser-agent opt-out: its storage key, shared port and locale coverage.
 * The port, hook and panel behaviour are tested where they live, in `@jini-ai/admin/screens/webmcp`. */

afterEach(() => { act(() => browserAgentSettingsPort.setEnabled({ enabled: true })); localStorage.clear(); });

describe("admin browser-agent opt-out binding", () => {
  it("keeps the admin's original storage key so a saved opt-out still applies", () => {
    expect(WEBMCP_PREFERENCE_KEY).toBe("tovu.admin.webmcp.enabled");
    localStorage.setItem(WEBMCP_PREFERENCE_KEY, "false");
    expect(browserAgentSettingsPort.getEnabled({})).toBe(false);
  });

  it("renders the panel through the bound hook and every mount shares the one port", async () => {
    const other = renderHook(() => useAdminBrowserAgentSettings({}));
    render(<BrowserAgentSettingsPanel locale="en" t={webMcpT} useBrowserAgentSettingsHook={useAdminBrowserAgentSettings} />);
    const toggle = screen.getByRole("checkbox", { name: "Browser-agent access (WebMCP)" });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(other.result.current.enabled).toBe(false);
    expect(localStorage.getItem(WEBMCP_PREFERENCE_KEY)).toBe("false");
  });

  it("supplies all new UI and confirmation strings in every admin locale", () => {
    for (const { code } of ADMIN_LOCALES) {
      for (const key of WEBMCP_KEYS) expect(WEBMCP_DICT[code]?.[key], `${code}: ${key}`).toBeTruthy();
    }
  });
});
