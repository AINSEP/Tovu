import { act, render, renderHook, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { ChatSettingsDialog } from "@jini-ai/chat/react";
import { describe, expect, it, vi } from "vitest";
import { assistantCliPermissions } from "@tovu/headless";
import { useDockAgentPermissions } from "../hooks/use-admin-subagents.hooks";
import type { AssistantSubagentsPort, AssistantSubagentsSettings } from "@/lib/assistant-subagents";

function fixture(initial: AssistantSubagentsSettings = { ...assistantCliPermissions({ enabled: true, capabilities: { userMcp: true } }), canEdit: true }) {
  let stored = initial;
  const write = vi.fn<AssistantSubagentsPort["write"]>(async input => {
    stored = { ...assistantCliPermissions(input), canEdit: true };
    return stored;
  });
  const port: AssistantSubagentsPort = { read: async () => stored, write };
  return { port, write };
}

describe("dock permission port", () => {
  it.each([
    ["shell", "Bash/shell"], ["fileWrite", "File edit/write"], ["userMcp", "Your MCP servers"],
    ["subagents", "Subagents/Task"], ["userSettings", "Your skills and settings"],
    ["web", "Web fetch/search"], ["workflows", "Workflows"], ["loginEnvironment", "Your shell environment"],
  ] as const)("A5: modal %s OFF persists only that capability and reads back OFF after remount", async (key, label) => {
    const f = fixture();
    const allOn = { shell: true, fileWrite: true, userMcp: true, subagents: true,
      userSettings: true, web: true, workflows: true, loginEnvironment: true };
    function Permissions() {
      const permissions = useDockAgentPermissions({ t: value => value, port: f.port });
      return <ChatSettingsDialog open onClose={() => {}} displaySections={[]} permissions={permissions} />;
    }
    const user = userEvent.setup();
    const view = render(<Permissions />);
    const dialog = screen.getByRole("dialog", { name: "Chat settings" });
    await user.click(within(dialog).getByRole("tab", { name: "Agent permissions" }));
    await waitFor(() => expect(within(dialog).getByRole("switch", { name: label })).toBeEnabled());
    expect(within(dialog).getByRole("switch", { name: label })).toBeChecked();
    await user.click(within(dialog).getByRole("switch", { name: label }));
    await waitFor(() => expect(within(dialog).getByRole("switch", { name: label })).not.toBeChecked());
    expect(f.write).toHaveBeenCalledOnce();
    expect(f.write.mock.calls[0][0].capabilities).toEqual({ ...allOn, [key]: false });
    expect(await f.port.read({})).toMatchObject({ capabilities: { ...allOn, [key]: false } });
    view.unmount();
    render(<Permissions />);
    await user.click(screen.getByRole("tab", { name: "Agent permissions" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: label })).toBeEnabled());
    expect(screen.getByRole("switch", { name: label })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "Full CLI access" })).not.toBeChecked();
  });

  it("persists one override, then lets the master restore capability defaults", async () => {
    const f = fixture();
    const { result } = renderHook(() => useDockAgentPermissions({ t: key => key, port: f.port }));
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    act(() => result.current.onChange({ key: "shell", enabled: false }));
    await waitFor(() => expect(result.current.capabilities.find(item => item.key === "shell")?.enabled).toBe(false));
    expect(result.current.capabilities.find(item => item.key === "fileWrite")?.enabled).toBe(true);
    expect(f.write.mock.calls[0][0].capabilities).toMatchObject({ shell: false, fileWrite: true });
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => result.current.onChange({ enabled: false }));
    await waitFor(() => expect(result.current.capabilities.every(item => !item.enabled)).toBe(true));
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => result.current.onChange({ key: "shell", enabled: true }));
    await waitFor(() => expect(result.current.capabilities.find(item => item.key === "shell")?.enabled).toBe(true));
    expect(result.current.capabilities.filter(item => item.key !== "shell").every(item => !item.enabled)).toBe(true);
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => result.current.onChange({ enabled: true }));
    await waitFor(() => expect(result.current.capabilities.filter(item => item.key !== "userMcp").every(item => item.enabled)).toBe(true));
    expect(result.current.capabilities.find(item => item.key === "userMcp")?.enabled).toBe(false);
  });
  it("personal MCP defaults OFF and the owner can persist both ON and OFF", async () => {
    const f = fixture({ ...assistantCliPermissions({ enabled: true }), canEdit: true });
    const { result } = renderHook(() => useDockAgentPermissions({ t: key => key, port: f.port }));
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    expect(result.current.capabilities.find(item => item.key === "userMcp")?.enabled).toBe(false);
    for (const enabled of [true, false]) {
      await waitFor(() => expect(result.current.busy).toBe(false));
      act(() => result.current.onChange({ key: "userMcp", enabled }));
      await waitFor(() => expect(result.current.capabilities.find(item => item.key === "userMcp")?.enabled).toBe(enabled));
      expect(await f.port.read({})).toMatchObject({ capabilities: { userMcp: enabled, shell: true } });
    }
  });
  it("retains server truth on write failure and denies non-owner changes", async () => {
    const f = fixture({ ...assistantCliPermissions({ enabled: false }), canEdit: false, unavailableReason: "Not available on hosted sites" });
    const { result } = renderHook(() => useDockAgentPermissions({ t: key => key, port: f.port }));
    await waitFor(() => expect(result.current.unavailableReason).toBe("Not available on hosted sites"));
    act(() => result.current.onChange({ key: "shell", enabled: true }));
    expect(f.write).not.toHaveBeenCalled();
    expect(result.current.capabilities.every(item => !item.enabled)).toBe(true);
  });
  it("reports failed persistence without turning the permission off optimistically", async () => {
    const f = fixture();
    f.write.mockRejectedValue(new Error("Permission save failed"));
    const { result } = renderHook(() => useDockAgentPermissions({ t: key => key, port: f.port }));
    await waitFor(() => expect(result.current.canEdit).toBe(true));
    act(() => result.current.onChange({ key: "shell", enabled: false }));
    await waitFor(() => expect(result.current.error).toBe("Permission save failed"));
    expect(result.current.capabilities.find(item => item.key === "shell")?.enabled).toBe(true);
  });
});
