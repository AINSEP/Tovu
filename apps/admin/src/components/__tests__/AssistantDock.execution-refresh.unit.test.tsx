import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatTransport, RunHandlers, StartRunInput } from "@jini-ai/chat/react";
import type { ExecutionConfig } from "@jini-ai/ui";

import {
  EXECUTION_CONFIG_MAX_AGE_MS,
  useAssistantTransport,
  useExecutionConfig,
  useLocalCliSelection,
} from "../AssistantDock/hooks/AssistantDock.hooks";
import type { ExecutionConfigWrite } from "../AssistantDock/execution-config-write";
import { DEFAULT_EXECUTION_CONFIG, EXECUTION_NAMESPACE } from "../../lib/execution-settings";
import { publishSettingsRefresh, resetSettingsRefreshBus } from "../../lib/settings-refresh-bus";
import { SAVE_DEBOUNCE_MS, useSettingsSlice } from "../../hooks/use-settings-slice.hooks";
import { writeAgentsSnapshot } from "../../lib/assistant-agents-snapshot";

// Extends the dock hook contracts using IO fakes and the real settings bus; no module mocks.
function savedAgent(agentId: string, model?: string): ExecutionConfig {
  return {
    ...DEFAULT_EXECUTION_CONFIG,
    localCli: {
      ...DEFAULT_EXECUTION_CONFIG.localCli,
      agentId,
      modelByAgentId: model ? { [agentId]: model } : {},
      reasoningByAgentId: agentId === "codex" ? { codex: "high" } : {},
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  let saved = savedAgent("aider", "aider-model");
  let now = 0;
  const loadConfig = vi.fn(async () => saved);
  const port = { loadConfig, loadCredential: async () => ({ isSet: false }), now: () => now };
  const persistWrite = vi.fn(async (write: ExecutionConfigWrite, _failureLog: string) => {
    saved = write.next;
    publishSettingsRefresh([EXECUTION_NAMESPACE]);
    return true;
  });
  const startRun = vi.fn<ChatTransport["startRun"]>().mockResolvedValue({ runId: "run-codex" });
  const createTransport = vi.fn((): ChatTransport => ({
    startRun,
    reattachRun: async () => {},
    fetchRunStatus: async () => null,
    stopRun: async () => {},
  }));
  function useDock() {
    const execution = useExecutionConfig({}, { port });
    const selection = useLocalCliSelection(execution, { persistWrite });
    const transport = useAssistantTransport({ ...execution, ...selection }, { createTransport });
    return { ...execution, ...selection, transport };
  }
  return {
    useDock, port, loadConfig, persistWrite, startRun,
    saveExternally(config: ExecutionConfig) { saved = config; },
    advanceClock(ms: number) { now += ms; },
    loadSaved: async () => saved,
    saveSettings: vi.fn(async (next: ExecutionConfig, _previous: ExecutionConfig) => {
      saved = next;
      return ["localCli.agentId"];
    }),
  };
}

async function flush() {
  await act(async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); });
}

const handlers: RunHandlers = { onEvent: () => {}, onDone: () => {}, onError: () => {} };
const runInput: StartRunInput = {
  agentId: "aider",
  history: [{ id: "user-1", role: "user", content: "hello" }],
  signal: new AbortController().signal,
  context: { model: "aider-model", reasoning: "old-effort", conversationId: "conversation-1" },
};

afterEach(() => {
  cleanup();
  resetSettingsRefreshBus();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("dock execution config freshness", () => {
  it("focus re-reads the saved agent/model and updates the controlled picker", async () => {
    const fake = harness();
    const { result } = renderHook(fake.useDock);
    await flush();
    expect(result.current.localCliSelection).toEqual({ agentId: "aider", model: "aider-model" });

    fake.saveExternally(savedAgent("codex", "gpt-5"));
    act(() => window.dispatchEvent(new Event("focus")));
    await flush();

    expect(fake.loadConfig).toHaveBeenCalledTimes(2);
    expect(result.current.localCliSelection).toEqual({ agentId: "codex", model: "gpt-5" });
    expect(fake.persistWrite).not.toHaveBeenCalled();
  });

  it("becoming visible re-reads, while becoming hidden does not", async () => {
    const fake = harness();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const { result } = renderHook(fake.useDock);
    await flush();
    fake.saveExternally(savedAgent("codex"));
    visibility.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await flush();
    expect(fake.loadConfig).toHaveBeenCalledTimes(1);

    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await flush();
    expect(fake.loadConfig).toHaveBeenCalledTimes(2);
    expect(result.current.localCliSelection).toEqual({ agentId: "codex" });
  });

  it("a successful same-tab Settings execution slice save updates the dock", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fake = harness();
    const { result } = renderHook(() => ({
      dock: fake.useDock(),
      // Exactly the execution slice wiring used by useSettingsUi, with fake ledger IO.
      settings: useSettingsSlice({
        load: fake.loadSaved, save: fake.saveSettings,
        defaultValue: DEFAULT_EXECUTION_CONFIG, namespaces: [EXECUTION_NAMESPACE],
      }),
    }));
    await flush();
    expect(result.current.dock.localCliSelection).toEqual({ agentId: "aider", model: "aider-model" });
    const next = savedAgent("codex", "gpt-5");
    act(() => result.current.settings.onChange(next));
    expect(result.current.dock.localCliSelection.agentId).toBe("aider");

    await act(async () => { await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS); });
    await flush();
    expect(fake.saveSettings).toHaveBeenCalledExactlyOnceWith(next, savedAgent("aider", "aider-model"));
    expect(result.current.dock.localCliSelection).toEqual({ agentId: "codex", model: "gpt-5" });
    expect(result.current.settings.saveState).toEqual({ status: "saved" });
  });

  it("a refetch cannot overwrite an unsaved local dock pick", async () => {
    const fake = harness();
    const pending = deferred<boolean>();
    fake.persistWrite.mockImplementation(() => pending.promise);
    const { result } = renderHook(fake.useDock);
    await flush();
    act(() => result.current.handleLocalCliSelectionChange({ agentId: "claude", model: "sonnet" }));
    fake.saveExternally(savedAgent("codex", "gpt-5"));
    act(() => window.dispatchEvent(new Event("focus")));
    await flush();
    expect(result.current.executionConfig.localCli.agentId).toBe("codex");
    expect(result.current.localCliSelection).toEqual({ agentId: "claude", model: "sonnet" });

    await act(async () => { await result.current.transport.startRun(runInput, handlers); });
    expect(fake.startRun.mock.calls[0]![0].agentId).toBe("claude");
    expect(fake.startRun.mock.calls[0]![0].context).toEqual({ model: "sonnet", conversationId: "conversation-1" });
  });

  it("a failed local save remains protected, and a later successful pick unlocks external sync", async () => {
    const fake = harness();
    fake.persistWrite.mockResolvedValueOnce(false);
    const { result } = renderHook(fake.useDock);
    await flush();
    act(() => result.current.handleLocalCliSelectionChange({ agentId: "claude", model: "sonnet" }));
    await flush();
    fake.saveExternally(savedAgent("codex", "gpt-5"));
    act(() => window.dispatchEvent(new Event("focus")));
    await flush();
    expect(result.current.localCliSelection).toEqual({ agentId: "claude", model: "sonnet" });

    act(() => result.current.handleLocalCliSelectionChange({ agentId: "claude", model: "opus" }));
    await flush();
    fake.saveExternally(savedAgent("aider", "new-model"));
    act(() => window.dispatchEvent(new Event("focus")));
    await flush();
    expect(result.current.localCliSelection).toEqual({ agentId: "aider", model: "new-model" });
  });

  it("an older successful save cannot unlock a newer unsaved dock pick", async () => {
    const fake = harness();
    const older = deferred<boolean>();
    const newer = deferred<boolean>();
    fake.persistWrite.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
    const { result } = renderHook(fake.useDock);
    await flush();
    act(() => {
      result.current.handleLocalCliSelectionChange({ agentId: "claude", model: "sonnet" });
      result.current.handleLocalCliSelectionChange({ agentId: "claude", model: "opus" });
    });
    await act(async () => { older.resolve(true); });
    fake.saveExternally(savedAgent("codex", "gpt-5"));
    act(() => window.dispatchEvent(new Event("focus")));
    await flush();
    expect(result.current.localCliSelection).toEqual({ agentId: "claude", model: "opus" });
    expect(fake.persistWrite).toHaveBeenCalledTimes(2);
    await act(async () => { newer.resolve(false); });
  });

  it("saved aider → external codex → immediate send awaits the focus refresh and dispatches codex", async () => {
    const fake = harness();
    const pending = deferred<ExecutionConfig>();
    const { result } = renderHook(fake.useDock);
    await flush();
    fake.loadConfig.mockImplementationOnce(() => pending.promise);
    act(() => window.dispatchEvent(new Event("focus")));
    let send!: Promise<{ runId: string }>;
    act(() => { send = result.current.transport.startRun(runInput, handlers); });
    expect(fake.startRun).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve(savedAgent("codex", "gpt-5"));
      await send;
    });
    expect(fake.startRun).toHaveBeenCalledExactlyOnceWith({
      ...runInput, agentId: "codex",
      context: { model: "gpt-5", reasoning: "high", conversationId: "conversation-1" },
    }, handlers);
    expect(fake.loadConfig).toHaveBeenCalledTimes(2);
    expect(result.current.localCliSelection).toEqual({ agentId: "codex", model: "gpt-5" });
  });

  it("fresh sends reuse the cached read; a five-second-old read reloads before dispatch", async () => {
    const fake = harness();
    const { result } = renderHook(fake.useDock);
    await flush();
    await act(async () => { await result.current.transport.startRun(runInput, handlers); });
    expect(fake.loadConfig).toHaveBeenCalledTimes(1);
    expect(fake.startRun.mock.calls[0]![0].agentId).toBe("aider");

    fake.advanceClock(EXECUTION_CONFIG_MAX_AGE_MS);
    fake.saveExternally(savedAgent("codex"));
    await act(async () => { await result.current.transport.startRun(runInput, handlers); });
    expect(fake.loadConfig).toHaveBeenCalledTimes(2);
    expect(fake.startRun.mock.calls[1]![0]).toEqual({
      ...runInput, agentId: "codex", context: { reasoning: "high", conversationId: "conversation-1" },
    });
  });

  it("a failed stale pre-send read rejects and dispatches no run", async () => {
    const fake = harness();
    const { result } = renderHook(fake.useDock);
    await flush();
    fake.advanceClock(EXECUTION_CONFIG_MAX_AGE_MS);
    fake.loadConfig.mockRejectedValueOnce(new Error("cannot read saved execution config"));
    await act(async () => {
      await expect(result.current.transport.startRun(runInput, handlers)).rejects.toThrow("cannot read saved execution config");
    });
    expect(fake.startRun).not.toHaveBeenCalled();
  });

  it("a failed notification refresh invalidates even a recent cached read before send", async () => {
    const fake = harness();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(fake.useDock);
    await flush();
    fake.saveExternally(savedAgent("codex", "gpt-5"));
    const failure = new Error("refresh failed");
    fake.loadConfig.mockRejectedValueOnce(failure);
    act(() => publishSettingsRefresh([EXECUTION_NAMESPACE]));
    await flush();
    expect(log).toHaveBeenCalledExactlyOnceWith("[AssistantDock] failed to load execution config", failure);

    await act(async () => { await result.current.transport.startRun(runInput, handlers); });
    expect(fake.loadConfig).toHaveBeenCalledTimes(3);
    expect(fake.startRun.mock.calls[0]![0]).toEqual({
      ...runInput, agentId: "codex",
      context: { model: "gpt-5", reasoning: "high", conversationId: "conversation-1" },
    });
  });

  it("an older focus read resolving last cannot overwrite the newer saved selection", async () => {
    const fake = harness();
    const old = deferred<ExecutionConfig>();
    const { result } = renderHook(fake.useDock);
    await flush();
    fake.loadConfig.mockImplementationOnce(() => old.promise);
    act(() => window.dispatchEvent(new Event("focus")));
    fake.saveExternally(savedAgent("codex", "gpt-5"));
    act(() => publishSettingsRefresh([EXECUTION_NAMESPACE]));
    await flush();
    expect(result.current.localCliSelection).toEqual({ agentId: "codex", model: "gpt-5" });
    await act(async () => { old.resolve(savedAgent("aider", "stale-model")); });
    expect(result.current.localCliSelection).toEqual({ agentId: "codex", model: "gpt-5" });
    expect(result.current.executionConfigRef.current.localCli.agentId).toBe("codex");
  });

  it("a local write rejects an older read without blocking a subsequent external change", async () => {
    const fake = harness();
    const old = deferred<ExecutionConfig>();
    const { result } = renderHook(fake.useDock);
    await flush();
    fake.loadConfig.mockImplementationOnce(() => old.promise);
    act(() => window.dispatchEvent(new Event("focus")));
    act(() => result.current.handleLocalCliSelectionChange({ agentId: "claude", model: "sonnet" }));
    await flush();
    await act(async () => { old.resolve(savedAgent("aider", "stale-model")); });
    expect(result.current.localCliSelection).toEqual({ agentId: "claude", model: "sonnet" });

    fake.saveExternally(savedAgent("codex", "gpt-5"));
    act(() => window.dispatchEvent(new Event("focus")));
    await flush();
    expect(result.current.localCliSelection).toEqual({ agentId: "codex", model: "gpt-5" });
  });

  it("an unrelated execution refresh preserves the picker's normalized default model", async () => {
    const fake = harness();
    fake.saveExternally(savedAgent("claude"));
    writeAgentsSnapshot([{ id: "claude", name: "Claude", models: [{ id: "default", label: "Default" }] }]);
    const { result } = renderHook(fake.useDock);
    await flush();
    act(() => result.current.handleLocalCliSelectionChange({ agentId: "claude", model: "default" }));
    act(() => publishSettingsRefresh([EXECUTION_NAMESPACE]));
    await flush();
    expect(result.current.localCliSelection).toEqual({ agentId: "claude", model: "default" });
    expect(fake.persistWrite).not.toHaveBeenCalled();
  });

  it("unrelated namespaces and events after unmount trigger no config read", async () => {
    const fake = harness();
    const { unmount } = renderHook(fake.useDock);
    await flush();
    act(() => publishSettingsRefresh(["core.language"]));
    await flush();
    expect(fake.loadConfig).toHaveBeenCalledTimes(1);
    unmount();
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    publishSettingsRefresh([EXECUTION_NAMESPACE]);
    await flush();
    expect(fake.loadConfig).toHaveBeenCalledTimes(1);
  });
});
