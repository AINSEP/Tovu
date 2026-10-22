import { fireEvent, render, screen, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, expect, it, vi } from "vitest";
import type { ChatTransport } from "@jini-ai/chat/core";
import { DEFAULT_EXECUTION_CONFIG } from "@/lib/execution-settings";
import { emptyComposerCapabilityProjection } from "@/features/plugins/composer-capabilities";
import { AssistantDock } from "../AssistantDock";

/**
 * @file A run start the server refuses (`POST /api/runs` → 500) must not silently drop the user's
 * turn (desktop `global-chat.desktop.ts`: "a run start that fails shows an error inside the guest
 * dock"). Real dock, Jini composer and failure surface; only the transport is fake.
 */
function mountDock(startRun: ChatTransport["startRun"]) {
  const transport: ChatTransport = { startRun, stopRun: vi.fn().mockResolvedValue(undefined), reattachRun: async () => {}, fetchRunStatus: async () => null };
  const config = { ...DEFAULT_EXECUTION_CONFIG, mode: "byok" as const };
  const execution = {
    executionConfig: config, executionConfigRef: { current: config },
    setExecutionConfig: vi.fn(), handleExecutionModeChange: vi.fn(),
    hasStoredAdminKey: true, configLoaded: true,
  };
  const runtimeAccess = {
    listAgents: async () => [{ id: "claude", name: "Claude", available: true }],
    rescanAgents: async () => [], daemonOnline: async () => true,
  };
  const chats = {
    conversations: [], activeId: null, paneKey: "run-start-failure-test", initialMessages: [],
    select: vi.fn(), create: vi.fn(), remove: vi.fn(), rename: vi.fn(),
    onMessagesChange: vi.fn(), persistUserTurn: async () => {}, ensureConversationId: async () => null,
  };
  return render(<AssistantDock
    useChats={() => chats} useAdminLocale={() => "en"}
    useExecutionConfig={() => execution}
    useByokRuntime={() => ({ byokRuntime: { model: "test-model", models: [] }, handleByokModelChange: vi.fn() })}
    useLocalCliSelection={() => ({ localCliSelection: { agentId: "claude" }, handleLocalCliSelectionChange: vi.fn() })}
    useComposerCapabilities={() => ({ composerCapabilities: emptyComposerCapabilityProjection() })}
    useAssistantTransport={() => transport} useRuntimeAccess={() => runtimeAccess}
    useAttachmentUploader={() => async () => []} useAttachmentValidator={() => async () => []}
  />);
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it("a refused run start keeps the user's message and shows the failure inside the dock, without retrying", async () => {
  const startRun = vi.fn<ChatTransport["startRun"]>().mockRejectedValue(new Error("agent run failed to start (500): Internal Server Error"));
  const { container } = mountDock(startRun);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "This start will fail" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }), { detail: 1 });
  await waitFor(() => expect(container.querySelector(".jini-message-error")?.textContent).toContain("agent run failed to start (500)"));
  expect(screen.getByText("This start will fail").textContent).toBe("This start will fail");
  expect(startRun).toHaveBeenCalledOnce();
});
