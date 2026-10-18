import { cleanup, fireEvent, render, screen, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DEFAULT_EXECUTION_CONFIG } from "@/lib/execution-settings";
import { emptyComposerCapabilityProjection } from "@/features/plugins/composer-capabilities";
import { AssistantDock } from "../AssistantDock";

/** Real dock header and Jini editor, with existing hook seams replacing IO. */
function mountDock(title: string | null = "Original title", activeId: string | null = "chat") {
  const rename = vi.fn().mockResolvedValue(undefined);
  const chats = {
    conversations: [{ id: "chat", title, titleSource: "manual" as const, createdAt: 1, updatedAt: 1, messageCount: 0 }],
    activeId, paneKey: "rename-test", initialMessages: [],
    select: vi.fn(), create: vi.fn(), remove: vi.fn(), rename,
    onMessagesChange: vi.fn(), persistUserTurn: async () => {}, ensureConversationId: async () => null,
  };
  const config = { ...DEFAULT_EXECUTION_CONFIG, mode: "byok" as const };
  const execution = {
    executionConfig: config, executionConfigRef: { current: config },
    setExecutionConfig: vi.fn(), handleExecutionModeChange: vi.fn(), hasStoredAdminKey: true, configLoaded: true,
  };
  render(<AssistantDock
    ChatPane={({ header }) => <>{header}</>}
    useChats={() => chats} useAdminLocale={() => "en"}
    useExecutionConfig={() => execution}
    useByokRuntime={() => ({ byokRuntime: { model: "test", models: [] }, handleByokModelChange: vi.fn() })}
    useLocalCliSelection={() => ({ localCliSelection: { agentId: "claude" }, handleLocalCliSelectionChange: vi.fn() })}
    useComposerCapabilities={() => ({ composerCapabilities: emptyComposerCapabilityProjection() })}
    useAssistantTransport={() => ({ startRun: async () => ({ runId: "run" }), stopRun: async () => {}, reattachRun: async () => {}, fetchRunStatus: async () => null })}
    useRuntimeAccess={() => ({ listAgents: async () => [], rescanAgents: async () => [], daemonOnline: async () => true })}
    useAttachmentUploader={() => async () => []} useAttachmentValidator={() => async () => []}
  />);
  return { rename };
}

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

it.each(["Enter", "blur"])("clicking the dock title saves a trimmed rename once on %s", async (finish) => {
  const { rename } = mountDock();
  const user = userEvent.setup();
  const heading = screen.getByRole("heading", { level: 2 });
  await user.click(within(heading).getByRole("button", { name: "Rename chat" }));
  const input = within(heading).getByRole("textbox", { name: "Rename chat" });
  expect(input).toHaveValue("Original title");
  expect(input).toHaveFocus();
  await user.clear(input);
  await user.type(input, "  Renamed chat  ");
  if (finish === "Enter") await user.keyboard("{Enter}");
  else fireEvent.blur(input);
  expect(rename).toHaveBeenCalledExactlyOnceWith("chat", "Renamed chat");
  expect(within(heading).queryByRole("textbox")).not.toBeInTheDocument();
});

it.each(["Escape", "empty", "unchanged"])("cancels the dock title editor for %s", async (finish) => {
  const { rename } = mountDock();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Rename chat" }));
  const input = screen.getByRole("textbox", { name: "Rename chat" });
  if (finish !== "unchanged") {
    await user.clear(input);
    await user.type(input, finish === "empty" ? "   " : "Discard this");
  }
  await user.keyboard(finish === "Escape" ? "{Escape}" : "{Enter}");
  expect(rename).not.toHaveBeenCalled();
  expect(screen.queryByRole("textbox", { name: "Rename chat" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Original title");
});

it("caps the dock editor at 50 characters", async () => {
  const { rename } = mountDock();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Rename chat" }));
  const input = screen.getByRole("textbox", { name: "Rename chat" });
  expect(input).toHaveAttribute("maxlength", "50");
  await user.clear(input);
  await user.type(input, "x".repeat(51));
  await user.keyboard("{Enter}");
  expect(rename).toHaveBeenCalledExactlyOnceWith("chat", "x".repeat(50));
});

it("seeds an untitled chat with an empty draft instead of the visible fallback", async () => {
  const { rename } = mountDock(null);
  await userEvent.setup().click(screen.getByRole("button", { name: "Rename chat" }));
  const input = screen.getByRole("textbox", { name: "Rename chat" });
  expect(input).toHaveValue("");
  fireEvent.blur(input);
  expect(rename).not.toHaveBeenCalled();
});

it("disables title rename until a conversation exists", () => {
  mountDock(null, null);
  expect(screen.getByRole("button", { name: "Rename chat" })).toBeDisabled();
});
