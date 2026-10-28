import { render as renderWithoutProvider, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { AssistantDock as RealAssistantDock } from "../AssistantDock/AssistantDock";
import { DEFAULT_CHAT_DISPLAY, type ChatDisplayPreferences } from "../AssistantDock/chat-display-preferences";
import type { ChatDisplayPreferencesController } from "../AssistantDock/hooks/use-chat-display-preferences.hooks";
import type { ChatAgentPlugins } from "../AssistantDock/chat-agent-plugin-preferences";
import type { ChatAgentPluginsController } from "../AssistantDock/hooks/use-chat-agent-plugins.hooks";
import { useChatDisplayPreferences as useStoredDisplayPreferences } from "../AssistantDock/hooks/use-chat-display-preferences.hooks";
import { DEFAULT_EXECUTION_CONFIG } from "../../lib/execution-settings";
import { useTovuExecutionPolicy } from "../../hooks/use-tovu-execution-policy.hooks";
import type { UseAssistantChats } from "../../hooks/use-assistant-chats.hooks";

/**
 * @file The dock's chat display settings wiring (owner, 2026-10-11): the header gear's menu holds
 * them directly, and More settings opens the advanced dialog bound to those exact same choices.
 * A choice made in either surface reaches `ChatPane` as its display props on the next render.
 * `ChatPane` is a recorder that renders the dock's `header` (where the gear lives), as in
 * `AssistantDock.runtime-access.unit.test.tsx`; the display-preferences hook is the dock's
 * `useChatDisplayPreferences` seam, faked with local state so no settings ledger is involved.
 */

const chatPaneSpy = vi.fn();

function PaneRecorder(props: ComponentProps<NonNullable<ComponentProps<typeof RealAssistantDock>["ChatPane"]>>) {
  chatPaneSpy(props);
  return <div data-testid="chat-pane">{props.header}</div>;
}

const executionController = {
  executionConfig: DEFAULT_EXECUTION_CONFIG,
  executionConfigRef: { current: DEFAULT_EXECUTION_CONFIG },
  setExecutionConfig: vi.fn(),
  handleExecutionModeChange: vi.fn(),
  hasStoredAdminKey: false,
  configLoaded: true,
};

function fakeChats(): UseAssistantChats {
  return {
    conversations: [],
    activeId: null,
    paneKey: "pane-1",
    initialMessages: [],
    select: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    rename: vi.fn(),
    onMessagesChange: vi.fn(),
    persistUserTurn: vi.fn(async () => undefined),
    ensureConversationId: vi.fn(async () => null),
  };
}

/** Local-state stand-in for the stored preferences: `update` merges and re-renders the dock. */
const updates: Partial<ChatDisplayPreferences>[] = [];
function useFakeChatDisplayPreferences(): ChatDisplayPreferencesController {
  const [preferences, setPreferences] = useState(DEFAULT_CHAT_DISPLAY);
  return {
    preferences,
    update: (patch) => {
      updates.push(patch);
      setPreferences((current) => ({ ...current, ...patch }));
    },
    saveFailed: false,
  };
}

/** Local-state stand-in for the stored Agent plugins mode (Auto until changed). */
const pluginModes: ChatAgentPlugins[] = [];
function useFakeChatAgentPlugins(): ChatAgentPluginsController {
  const [mode, setMode] = useState<ChatAgentPlugins>("auto");
  return { mode, update: (next) => { pluginModes.push(next); setMode(next); }, saveFailed: false };
}

function AssistantDock(props: ComponentProps<typeof RealAssistantDock>) {
  return <RealAssistantDock ChatPane={PaneRecorder} useExecutionConfig={() => executionController}
    useExecutionPolicy={(input) => useTovuExecutionPolicy(input, { desktop: true })}
    useByokRuntime={() => ({ byokRuntime: { model: "", models: [] }, handleByokModelChange: vi.fn() })}
    useChatDisplayPreferences={useFakeChatDisplayPreferences}
    useChatAgentPlugins={useFakeChatAgentPlugins}
    {...props} />;
}

function render(ui: ReactElement) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
}

function latestPaneProps(): { toolCallDisplay?: string; showUsageLine?: boolean; showThinking?: boolean; agentPluginsMode?: string } {
  return chatPaneSpy.mock.calls.at(-1)?.[0] ?? {};
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let fullCliBody: Record<string, unknown>;

beforeEach(() => {
  chatPaneSpy.mockReset();
  fullCliBody = { enabled: true, canEdit: true };
  updates.length = 0;
  pluginModes.length = 0;
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  // Unrelated dock effects (agents list, composer discovery) read over fetch; answer them benignly.
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => new Response(JSON.stringify(String(url).includes("assistant-full-cli")
    ? fullCliBody : {}), { status: 200, headers: { "Content-Type": "application/json" } })));
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe("AssistantDock Chat settings", () => {
  it("A8: dropdown and modal save through the same display owner and reload those values on remount", async () => {
    let stored: ChatDisplayPreferences = { toolCalls: "show", showUsageLine: true, showThinking: false };
    const port = {
      load: async () => ({ ...stored }),
      save: async (next: ChatDisplayPreferences) => { stored = { ...next }; },
      subscribeToSettingsRefresh: () => () => {},
    };
    const useStoredDisplay = () => useStoredDisplayPreferences(port);
    const user = userEvent.setup();
    const view = render(<AssistantDock useChats={fakeChats} useChatDisplayPreferences={useStoredDisplay} />);
    await waitFor(() => expect(latestPaneProps().toolCallDisplay).toBe("show"));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Hidden" }));
    await waitFor(() => expect(stored.toolCalls).toBe("hidden"));
    await user.click(await screen.findByRole("menuitem", { name: "More settings…" }));
    const modal = screen.getByRole("dialog", { name: "Chat settings" });
    expect(within(modal).getByRole("radio", { name: "Hidden" })).toBeChecked();
    await user.click(within(modal).getByRole("switch", { name: "Thinking" }));
    await waitFor(() => expect(stored).toEqual({ toolCalls: "hidden", showUsageLine: true, showThinking: true }));
    await user.click(within(modal).getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("menuitemcheckbox", { name: "Thinking" })).toHaveAttribute("aria-checked", "true");
    view.unmount();
    render(<AssistantDock useChats={fakeChats} useChatDisplayPreferences={useStoredDisplay} />);
    await waitFor(() => expect(latestPaneProps()).toMatchObject({ toolCallDisplay: "hidden", showUsageLine: true, showThinking: true }));
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("menuitemradio", { name: "Hidden" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: "Thinking" })).toHaveAttribute("aria-checked", "true");
  });

  it("keeps quick settings and the advanced modal in sync and restores gear focus", async () => {
    const user = userEvent.setup();
    render(<AssistantDock useChats={fakeChats} />);
    const gear = within(screen.getByTestId("chat-pane")).getByRole("button", { name: "Settings" });
    await user.click(gear);
    await user.click(screen.getByRole("menuitemradio", { name: "Hidden" }));
    await user.click(await screen.findByRole("menuitem", { name: "More settings…" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    const modal = screen.getByRole("dialog", { name: "Chat settings" });
    expect(within(modal).getByRole("radio", { name: "Hidden" })).toBeChecked();
    await user.click(within(modal).getByRole("radio", { name: "Show" }));
    await user.click(within(modal).getByRole("switch", { name: "Thinking" }));
    expect(latestPaneProps()).toMatchObject({ toolCallDisplay: "show", showThinking: true });
    await user.click(within(modal).getByRole("button", { name: "Close" }));
    expect(gear).toHaveFocus();
    await user.click(gear);
    expect(screen.getByRole("menuitemradio", { name: "Show" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: "Thinking" })).toHaveAttribute("aria-checked", "true");
  });

  it("hands ChatPane the stored display choices from the first render", () => {
    render(<AssistantDock useChats={fakeChats} />);

    expect(latestPaneProps()).toMatchObject({ toolCallDisplay: "collapsed", showUsageLine: true, showThinking: false });
  });

  it("changes the choices from the gear menu itself, reaching ChatPane at once, with no dialog", async () => {
    const user = userEvent.setup();
    render(<AssistantDock useChats={fakeChats} />);

    await user.click(within(screen.getByTestId("chat-pane")).getByRole("button", { name: "Settings" }));
    const menu = screen.getByRole("menu", { name: "Settings" });

    await user.click(within(menu).getByRole("menuitemradio", { name: "Hidden" }));
    expect(updates).toEqual([{ toolCalls: "hidden" }]);
    await waitFor(() => expect(latestPaneProps().toolCallDisplay).toBe("hidden"));
    expect(within(menu).getByRole("menuitemradio", { name: "Hidden" })).toHaveAttribute("aria-checked", "true");

    await user.click(within(menu).getByRole("menuitemcheckbox", { name: "Done line" }));
    await waitFor(() => expect(latestPaneProps().showUsageLine).toBe(false));
    await user.click(within(menu).getByRole("menuitemcheckbox", { name: "Thinking" }));
    await waitFor(() => expect(latestPaneProps().showThinking).toBe(true));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    // Closing keeps the choices.
    expect(latestPaneProps()).toMatchObject({ toolCallDisplay: "hidden", showUsageLine: false, showThinking: true });
  });

  it("offers Agent plugins in the gear and More settings, and Off reaches ChatPane at once", async () => {
    const user = userEvent.setup();
    render(<AssistantDock useChats={fakeChats} />);
    expect(latestPaneProps().agentPluginsMode).toBe("auto");
    const gear = within(screen.getByTestId("chat-pane")).getByRole("button", { name: "Settings" });
    await user.click(gear);
    const menuGroup = within(screen.getByRole("menu", { name: "Settings" })).getByRole("group", { name: "Agent plugins" });
    expect(within(menuGroup).getByRole("menuitemradio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
    await user.click(within(menuGroup).getByRole("menuitemradio", { name: "Off" }));
    expect(pluginModes).toEqual(["off"]);
    await waitFor(() => expect(latestPaneProps().agentPluginsMode).toBe("off"));
    await user.click(await screen.findByRole("menuitem", { name: "More settings…" }));
    const modalGroup = within(screen.getByRole("dialog", { name: "Chat settings" })).getByRole("group", { name: "Agent plugins" });
    expect(within(modalGroup).getByRole("radio", { name: "Off" })).toBeChecked();
    await user.click(within(modalGroup).getByRole("radio", { name: "Ask first" }));
    expect(pluginModes).toEqual(["off", "ask"]);
    await waitFor(() => expect(latestPaneProps().agentPluginsMode).toBe("ask"));
  });

  async function openPermissions(user: ReturnType<typeof userEvent.setup>) {
    render(<AssistantDock useChats={fakeChats} />);
    await user.click(within(screen.getByTestId("chat-pane")).getByRole("button", { name: "Settings" }));
    await user.click(await screen.findByRole("menuitem", { name: "More settings…" }));
    const modal = screen.getByRole("dialog", { name: "Chat settings" });
    await user.click(within(modal).getByRole("tab", { name: "Agent permissions" }));
    return modal;
  }

  it("keeps personal MCP opt-in and the master OFF while other local-owner permissions default ON", async () => {
    const modal = await openPermissions(userEvent.setup());
    // 4d39ba5232 requires an explicit grant for personal MCP, even with Full CLI enabled.
    await waitFor(() => expect(within(modal).getByRole("switch", { name: "Bash/shell" })).toBeEnabled());
    expect(within(modal).getByRole("switch", { name: "Full CLI access" })).not.toBeChecked();
    expect(within(modal).getByRole("switch", { name: "Your MCP servers" })).not.toBeChecked();
    for (const name of ["Bash/shell", "File edit/write", "Subagents/Task", "Your skills and settings", "Web fetch/search", "Workflows", "Your shell environment"]) {
      expect(within(modal).getByRole("switch", { name })).toBeChecked();
    }
    for (const toggle of within(modal).getAllByRole("switch")) expect(toggle).toBeEnabled();
  });

  // Regression (owner, 2026-10-17): an env kill switch made the server project every switch OFF
  // while they stayed clickable, so each click saved, re-read OFF and snapped back.
  it("locks the permission switches and says why when the server reports an env lock", async () => {
    fullCliBody = { enabled: false, canEdit: true, unavailableReason: "Turned off on this computer by TOVU_AGENT_FORBID_BASH." };
    const modal = await openPermissions(userEvent.setup());
    expect(await within(modal).findByText("Turned off on this computer by TOVU_AGENT_FORBID_BASH.")).toBeInTheDocument();
    for (const toggle of within(modal).getAllByRole("switch")) expect(toggle).toBeDisabled();
  });
});
