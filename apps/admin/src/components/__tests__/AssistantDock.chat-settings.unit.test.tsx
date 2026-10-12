import { render as renderWithoutProvider, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { AssistantDock as RealAssistantDock } from "../AssistantDock/AssistantDock";
import { DEFAULT_CHAT_DISPLAY, type ChatDisplayPreferences } from "../AssistantDock/chat-display-preferences";
import type { ChatDisplayPreferencesController } from "../AssistantDock/hooks/use-chat-display-preferences.hooks";
import { DEFAULT_EXECUTION_CONFIG } from "../../lib/execution-settings";
import { useTovuExecutionPolicy } from "../../hooks/use-tovu-execution-policy.hooks";
import type { UseAssistantChats } from "../../hooks/use-assistant-chats.hooks";

/**
 * @file The dock's chat display settings wiring (owner, 2026-10-11): the header gear's menu holds
 * them directly (no dialog), and a choice made there reaches `ChatPane` as its display props on the
 * next render.
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

function AssistantDock(props: ComponentProps<typeof RealAssistantDock>) {
  return <RealAssistantDock ChatPane={PaneRecorder} useExecutionConfig={() => executionController}
    useExecutionPolicy={(input) => useTovuExecutionPolicy(input, { desktop: true })}
    useByokRuntime={() => ({ byokRuntime: { model: "", models: [] }, handleByokModelChange: vi.fn() })}
    useChatDisplayPreferences={useFakeChatDisplayPreferences}
    {...props} />;
}

function render(ui: ReactElement) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
}

function latestPaneProps(): { toolCallDisplay?: string; showUsageLine?: boolean; showThinking?: boolean } {
  return chatPaneSpy.mock.calls.at(-1)?.[0] ?? {};
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  chatPaneSpy.mockReset();
  updates.length = 0;
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  // Unrelated dock effects (agents list, composer discovery) read over fetch; answer them benignly.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } })));
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe("AssistantDock Chat settings", () => {
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
});
