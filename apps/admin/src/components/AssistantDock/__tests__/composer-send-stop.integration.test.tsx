import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ChatTransport, RunHandlers } from "@jini-ai/chat/core";
import { DEFAULT_EXECUTION_CONFIG } from "@/lib/execution-settings";
import { emptyComposerCapabilityProjection } from "@/features/plugins/composer-capabilities";
import { AssistantDock } from "../AssistantDock";

// Exercise the actual dock wrapper, Jini composer and cancellation lifecycle. Only IO is fake.
function mountDock(acceptance?: Promise<void>) {
  const startRun = vi.fn<ChatTransport["startRun"]>();
  const stopRun = vi.fn<ChatTransport["stopRun"]>().mockResolvedValue(undefined);
  let handlers!: RunHandlers;
  startRun.mockImplementation(async (_input, nextHandlers) => {
    handlers = nextHandlers;
    await acceptance;
    return { runId: "run-double-click" };
  });
  const transport: ChatTransport = {
    startRun, stopRun, reattachRun: async () => {}, fetchRunStatus: async () => null,
  };
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
    conversations: [], activeId: null, paneKey: "send-stop-test", initialMessages: [],
    select: vi.fn(), create: vi.fn(), remove: vi.fn(), rename: vi.fn(),
    onMessagesChange: vi.fn(), persistUserTurn: async () => {}, ensureConversationId: async () => null,
  };
  render(<AssistantDock
    useChats={() => chats} useAdminLocale={() => "en"}
    useExecutionConfig={() => execution}
    useByokRuntime={() => ({ byokRuntime: { model: "test-model", models: [] }, handleByokModelChange: vi.fn() })}
    useLocalCliSelection={() => ({ localCliSelection: { agentId: "claude" }, handleLocalCliSelectionChange: vi.fn() })}
    useComposerCapabilities={() => ({ composerCapabilities: emptyComposerCapabilityProjection() })}
    useAssistantTransport={() => transport} useRuntimeAccess={() => runtimeAccess}
    useAttachmentUploader={() => async () => []} useAttachmentValidator={() => async () => []}
  />);
  return { startRun, stopRun, complete: () => {
    const events = [{ kind: "text" as const, text: 'Done: the draft "Double click" exists.' }];
    handlers.onEvent(events[0]);
    handlers.onDone(events);
  } };
}

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

it.each([
  { detail: 1, elapsed: 500 },
  { detail: 0, elapsed: 0 },
])("intentional Stop (detail=$detail, elapsed=$elapsed ms) still cancels after pointer Send", async ({ detail, elapsed }) => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const fake = mountDock();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Create a draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }), { detail: 1 });
  await waitFor(() => expect(fake.startRun).toHaveBeenCalledOnce());
  now = elapsed;
  fireEvent.click(screen.getByRole("button", { name: "Stop run" }), { detail });
  await waitFor(() => expect(fake.stopRun).toHaveBeenCalledExactlyOnceWith("run-double-click"));
  expect(screen.getByText("Stopped.").textContent).toBe("Stopped.");
});

it("a second click while startRun is awaiting acceptance neither cancels nor stops the eventual run", async () => {
  vi.spyOn(performance, "now").mockReturnValue(0);
  let accept!: () => void;
  const fake = mountDock(new Promise<void>(resolve => { accept = resolve; }));
  fireEvent.change(screen.getByRole("textbox"), { target: { value: 'Create a draft post titled "Double click"' } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }), { detail: 1 });
  await waitFor(() => expect(fake.startRun).toHaveBeenCalledOnce());
  const stop = screen.getByRole("button", { name: "Stop run" });
  fireEvent.click(stop, { detail: 2 });
  fireEvent.click(stop, { detail: 1 });
  expect(fake.startRun.mock.calls[0][0].signal.aborted).toBe(false);
  expect(fake.startRun.mock.calls[0][0].cancelSignal?.aborted).toBe(false);
  await act(async () => { accept(); });
  expect(fake.stopRun).not.toHaveBeenCalled();
  act(() => fake.complete());
  expect(screen.getByText('Done: the draft "Double click" exists.').textContent).toBe('Done: the draft "Double click" exists.');
  expect(fake.startRun).toHaveBeenCalledOnce();
});

it("an intentional Stop cancels a turn sent from the keyboard", async () => {
  const fake = mountDock();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Create a draft" } });
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
  await waitFor(() => expect(fake.startRun).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Stop run" }), { detail: 1 });
  await waitFor(() => expect(fake.stopRun).toHaveBeenCalledExactlyOnceWith("run-double-click"));
  expect(screen.getByText("Stopped.").textContent).toBe("Stopped.");
});

it.each([
  { detail: 2, elapsed: 100 },
  { detail: 1, elapsed: 100 },
  { detail: 2, elapsed: 700 },
])("Send followed by Stop (detail=$detail, elapsed=$elapsed ms) finishes exactly one turn", async ({ detail, elapsed }) => {
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const fake = mountDock();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: 'Create a draft post titled "Double click"' } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }), { detail: 1 });
  await waitFor(() => expect(fake.startRun).toHaveBeenCalledOnce());
  now = elapsed;
  // Target the icon too: browser clicks need not target the button element itself.
  const stop = screen.getByRole("button", { name: "Stop run" });
  fireEvent.click(stop.firstElementChild!, { detail });
  expect(fake.stopRun).not.toHaveBeenCalled();
  expect(fake.startRun.mock.calls[0][0].cancelSignal?.aborted).toBe(false);
  act(() => fake.complete());
  expect(screen.getByText('Done: the draft "Double click" exists.').textContent).toBe('Done: the draft "Double click" exists.');
  expect(fake.startRun).toHaveBeenCalledOnce();
  expect(fake.startRun.mock.calls[0][0].history.filter(message => message.role === "user").map(message => message.content))
    .toEqual(['Create a draft post titled "Double click"']);
  expect(screen.queryByText("Stopped.")).not.toBeInTheDocument();
});
