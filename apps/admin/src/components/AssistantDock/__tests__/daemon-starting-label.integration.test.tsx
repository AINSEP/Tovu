import type { ComponentProps } from "react";
import { act, cleanup, render } from "@/__tests__/fetch-query-render";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatPane, FrontendSessionBridge } from "@jini-ai/chat/react";
import type { ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat/core";
import { emptyComposerCapabilityProjection } from "@/features/plugins/composer-capabilities";
import { useTovuExecutionPolicy } from "@/hooks/use-tovu-execution-policy.hooks";
import { prepareAssistantPageBinding, type activateAssistantDaemon } from "@/lib/assistant-daemon-activation";
import { resetAssistantDockBus } from "@/lib/assistant-dock-bus";
import { DEFAULT_EXECUTION_CONFIG } from "@/lib/execution-settings";
import { AssistantDock } from "../AssistantDock";
import { useAssistantTransport } from "../hooks/AssistantDock.hooks";

const STARTING = "Starting assistant…";
type PaneProps = ComponentProps<typeof ChatPane> & { sendingLabel?: string };

function deferred<T>(_required = {}, _options = {}) {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function advance({ ms = 0 } = {}, _options = {}) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

// The recorder is the consumer of the actual ChatPane host contract. Both the dock and its
// transport hook stay real; only activation/network IO and the package's rendering are replaced.
// Jini's sending-label suite independently exercises ChatPane -> MessageList -> RunActivityLine.
function mountDock({ locale = "en", attached = true } = {}, _options = {}) {
  const activation = deferred<void>();
  const acceptance = deferred<void>();
  const attachment = deferred<{ sessionId: string; bindToken: string }>();
  if (attached) attachment.resolve({ sessionId: "tab", bindToken: "current-bind" });
  const activate = vi.fn<typeof activateAssistantDaemon>(() => activation.promise);
  const startRun = vi.fn<ChatTransport["startRun"]>(async () => {
    await acceptance.promise;
    return { runId: "accepted-run" };
  });
  const base: ChatTransport = {
    startRun, stopRun: vi.fn(async () => {}), reattachRun: async () => {}, fetchRunStatus: async () => null,
  };
  const bridge: FrontendSessionBridge = {
    ready: attachment.promise, bindToken: () => "current-bind", close: vi.fn(),
    bridgeAccess: { subscribe: vi.fn(() => vi.fn()), respondSuccess: vi.fn(), respondError: vi.fn() },
  };
  const panes: PaneProps[] = [];
  function PaneRecorder(props: PaneProps) { panes.push(props); return <></>; }
  const config = { ...DEFAULT_EXECUTION_CONFIG, mode: "local-cli" as const };
  const execution = {
    executionConfig: config, executionConfigRef: { current: config },
    setExecutionConfig: vi.fn(), handleExecutionModeChange: vi.fn(),
    hasStoredAdminKey: true, configLoaded: true,
  };
  const chats = {
    conversations: [], activeId: null, paneKey: "daemon-starting-label", initialMessages: [],
    select: vi.fn(), create: vi.fn(), remove: vi.fn(), rename: vi.fn(), onMessagesChange: vi.fn(),
    persistUserTurn: async () => {}, ensureConversationId: async () => null,
  };
  render(<AssistantDock ChatPane={PaneRecorder} agentBridge={bridge}
    useAdminLocale={() => locale} useChats={() => chats} useExecutionConfig={() => execution}
    useExecutionPolicy={(input, options = {}) => useTovuExecutionPolicy(input, { ...options, desktop: true })}
    useByokRuntime={() => ({ byokRuntime: { model: "test-model", models: [] }, handleByokModelChange: vi.fn() })}
    useLocalCliSelection={() => ({ localCliSelection: { agentId: "claude" }, handleLocalCliSelectionChange: vi.fn() })}
    useComposerCapabilities={() => ({ composerCapabilities: emptyComposerCapabilityProjection() })}
    useAssistantTransport={(input, options = {}) => useAssistantTransport(input, {
      ...options, createTransport: () => base,
      prepareBinding: (required, optional = {}) => prepareAssistantPageBinding(required, { ...optional, activate }),
    })}
    useRuntimeAccess={() => ({ listAgents: async () => [], rescanAgents: async () => [], daemonOnline: async () => true })}
    useAttachmentUploader={() => async () => []} useAttachmentValidator={() => async () => []}
  />);
  const pane = () => panes.at(-1)!;
  function begin({ controller = new AbortController() } = {}, _optional = {}) {
    const input: StartRunInput = {
      agentId: "claude", history: [{ id: "user", role: "user", content: "Hello" }],
      signal: new AbortController().signal, cancelSignal: controller.signal,
    };
    const handlers: RunHandlers = { onEvent: vi.fn(), onError: vi.fn(), onDone: vi.fn() };
    let result!: ReturnType<ChatTransport["startRun"]>;
    act(() => { result = pane().transport!.startRun(input, handlers); });
    // Observe rejection immediately without swallowing an assertion or leaving an unhandled
    // promise. The Stop test checks the exact error through this outcome.
    const outcome = result.then(value => ({ value }), error => ({ error }));
    return { controller, outcome };
  }
  return { activation, acceptance, attachment, activate, startRun, pane, begin,
    labels: () => panes.map(props => props.sendingLabel) };
}

beforeEach(() => { vi.useFakeTimers(); resetAssistantDockBus(); });
afterEach(() => {
  cleanup(); resetAssistantDockBus(); localStorage.clear();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});

describe("daemon activation sendingLabel at the dock's ChatPane boundary", () => {
  it("passes Starting assistant… only after an unresolved activation reaches 500 ms", async () => {
    const dock = mountDock();
    dock.begin();
    await advance();
    expect(dock.activate).toHaveBeenCalledOnce();
    expect(dock.pane().sendingLabel).toBeUndefined();
    await advance({ ms: 499 });
    expect(dock.labels()).not.toContain(STARTING);
    await advance({ ms: 1 });
    expect(dock.pane().sendingLabel).toBe(STARTING);
    expect(dock.startRun).not.toHaveBeenCalled();
  });

  it.each([0, 499])("a warm activation resolving at %i ms never flashes the label; the next cold send still shows it", async ms => {
    const dock = mountDock();
    const cold = deferred<void>();
    dock.activate.mockImplementationOnce(() => dock.activation.promise).mockImplementationOnce(() => cold.promise);
    const first = dock.begin();
    await advance({ ms });
    act(() => dock.activation.resolve());
    await advance();
    expect(dock.startRun).toHaveBeenCalledOnce();
    await advance({ ms: 1_000 });
    expect(dock.labels()).not.toContain(STARTING);
    act(() => dock.acceptance.resolve());
    await expect(first.outcome).resolves.toEqual({ value: { runId: "accepted-run" } });
    dock.begin();
    await advance();
    await advance({ ms: 499 });
    expect(dock.labels()).not.toContain(STARTING);
    await advance({ ms: 1 });
    expect(dock.pane().sendingLabel).toBe(STARTING);
    expect(dock.activate).toHaveBeenCalledTimes(2);
  });

  it("clears on activation resolve, before page attachment or run acceptance resolves", async () => {
    const dock = mountDock({ attached: false });
    const send = dock.begin();
    await advance();
    await advance({ ms: 500 });
    expect(dock.pane().sendingLabel).toBe(STARTING);
    act(() => dock.activation.resolve());
    await advance();
    expect(dock.pane().sendingLabel).toBeUndefined();
    expect(dock.startRun).not.toHaveBeenCalled();
    act(() => dock.attachment.resolve({ sessionId: "tab", bindToken: "current-bind" }));
    await advance();
    expect(dock.startRun).toHaveBeenCalledOnce();
    expect(dock.pane().sendingLabel).toBeUndefined();
    act(() => dock.acceptance.resolve());
    await expect(send.outcome).resolves.toEqual({ value: { runId: "accepted-run" } });
  });

  it("clears on activation rejection and preserves the existing send fallback", async () => {
    const dock = mountDock();
    const send = dock.begin();
    await advance();
    await advance({ ms: 500 });
    expect(dock.pane().sendingLabel).toBe(STARTING);
    act(() => dock.activation.reject(new Error("the assistant could not start")));
    await advance();
    expect(dock.pane().sendingLabel).toBeUndefined();
    expect(dock.startRun).toHaveBeenCalledOnce();
    expect(dock.startRun.mock.calls[0]![0].context).toMatchObject({ frontendBindToken: "current-bind" });
    await advance({ ms: 1_000 });
    expect(dock.pane().sendingLabel).toBeUndefined();
    act(() => dock.acceptance.resolve());
    await expect(send.outcome).resolves.toEqual({ value: { runId: "accepted-run" } });
  });

  it("clears immediately on Stop even while activation remains pending, and stays clear after late completion", async () => {
    const dock = mountDock();
    const send = dock.begin();
    await advance();
    await advance({ ms: 500 });
    expect(dock.pane().sendingLabel).toBe(STARTING);
    act(() => send.controller.abort(new DOMException("Stopped by user", "AbortError")));
    await advance();
    expect(dock.pane().sendingLabel).toBeUndefined();
    await advance({ ms: 1_000 });
    expect(dock.pane().sendingLabel).toBeUndefined();
    expect(dock.startRun).not.toHaveBeenCalled();
    act(() => dock.activation.resolve());
    await advance();
    // The dock's failure surface re-wraps the abort; the caller's own Stop reason must still be what surfaces.
    const stopped = await send.outcome;
    expect(String((stopped as { error?: unknown }).error)).toMatch(/Stopped by user/);
    expect(dock.pane().sendingLabel).toBeUndefined();
    expect(dock.startRun).not.toHaveBeenCalled();
  });

  it("passes localized startup copy to the ChatPane sendingLabel prop", async () => {
    const dock = mountDock({ locale: "es" });
    dock.begin();
    await advance();
    await advance({ ms: 500 });
    expect(dock.pane().sendingLabel).toBe("Iniciando el asistente…");
  });
});
