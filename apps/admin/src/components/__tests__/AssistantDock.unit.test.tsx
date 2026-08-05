import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode, SetStateAction } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@jini-ai/chat/core";
import type { ExecutionConfig } from "@jini-ai/ui";

/**
 * @file `AssistantDock` — covers the two extracted hooks directly (`useExecutionConfig`,
 * `useByokRuntime`), the two pure helpers (`shouldPublishOnMessagesChange`, `resolveRunContext`),
 * and the dock's own prop-wiring to `ChatPane` through the DOM.
 *
 * `@jini-ai/chat/react`'s `ChatPane` is a full streaming chat UI with its own daemon-facing
 * lifecycle — mounting the real thing here would test that package, not this host's wiring of it.
 * It is replaced with a thin recorder that exposes exactly the props this file is responsible for
 * (`executionMode`, `apiModeAvailable`, `byokRuntime`, the two change handlers), which is also what
 * lets the config-load-failure, discovery-failure, and mode-switch branches be driven directly
 * instead of only reachable by pushing a real dock through a live daemon connection.
 */

const chatPaneSpy = vi.hoisted(() => vi.fn());

vi.mock("@jini-ai/chat/react", () => ({
  JiniChatProvider: ({ children }: { children: ReactNode }) => children,
  ChatPane: (props: {
    executionMode: string;
    apiModeAvailable: boolean;
    byokRuntime: { model: string; providerLabel?: string };
    onExecutionModeChange: (mode: "local" | "api") => void;
    onByokModelChange: (model: string) => void;
  }) => {
    chatPaneSpy(props);
    return (
      <div data-testid="chat-pane">
        <button type="button" onClick={() => props.onExecutionModeChange("api")}>
          switch-to-api
        </button>
        <button type="button" onClick={() => props.onByokModelChange("gpt-5")}>
          pick-model
        </button>
      </div>
    );
  },
  ConversationList: () => null,
  A2uiSurfaceCard: () => null,
  createDaemonAttachmentUploader: () => vi.fn(),
  createMcpUiToolCaller: () => vi.fn(),
  registerExtEventRenderer: vi.fn(),
  registerMcpUiSurfaceRenderer: vi.fn(),
}));

vi.mock("../../lib/execution-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/execution-settings")>();
  return {
    ...actual,
    loadExecutionConfig: vi.fn(),
    saveExecutionConfig: vi.fn(),
    createExecutionPort: vi.fn(),
    loadAdminExecutionCredential: vi.fn(),
  };
});

vi.mock("../../lib/settings-refresh-bus", () => ({ publishSettingsRefresh: vi.fn() }));

import {
  AssistantDock,
  resolveRunContext,
  shouldPublishOnMessagesChange,
  useByokRuntime,
  useExecutionConfig,
} from "../AssistantDock";
import {
  DEFAULT_EXECUTION_CONFIG,
  createExecutionPort,
  loadAdminExecutionCredential,
  loadExecutionConfig,
  saveExecutionConfig,
} from "../../lib/execution-settings";
import { publishSettingsRefresh } from "../../lib/settings-refresh-bus";
import type { UseAssistantChats } from "../../hooks/use-assistant-chats.hooks";

const mockLoadExecutionConfig = vi.mocked(loadExecutionConfig);
const mockSaveExecutionConfig = vi.mocked(saveExecutionConfig);
const mockCreateExecutionPort = vi.mocked(createExecutionPort);
const mockPublishSettingsRefresh = vi.mocked(publishSettingsRefresh);
const mockLoadAdminExecutionCredential = vi.mocked(loadAdminExecutionCredential);

/** Neutral "nothing stored" default — most tests here care about the LOCAL `apiKey` field and
 *  should not have to think about the server-side credential state to get a stable result. */
function storedCredential(isSet: boolean) {
  return { isSet, masked: isSet ? "••••test" : null, protocol: "anthropic", providerId: "anthropic", baseUrl: null, model: null, maxTokens: null, updatedAt: isSet ? "2026-08-05T00:00:00.000Z" : null };
}

function byokConfig(overrides: Partial<ExecutionConfig["byok"]> = {}): ExecutionConfig {
  return {
    ...DEFAULT_EXECUTION_CONFIG,
    mode: "byok",
    byok: { ...DEFAULT_EXECUTION_CONFIG.byok, apiKey: "sk-test", ...overrides },
  };
}

/**
 * A `setExecutionConfig` double typed as the REAL `Dispatch<SetStateAction<…>>` the hook declares,
 * rather than the updater-only shape these tests happen to exercise. The narrower signature is what
 * the two model-change tests originally used, and it does not typecheck: a `Dispatch` must accept a
 * bare value as well as an updater, so a function that only accepts an updater is not assignable to
 * it. Applying the updater against `previous` is the load-bearing part — `useByokRuntime` builds
 * `next` (and fires the save) INSIDE the callback, so a bare `vi.fn()` that never invokes it would
 * make the write-back unobservable and the assertions below vacuous.
 */
function stubSetExecutionConfig(previous: ExecutionConfig) {
  return vi.fn((action: SetStateAction<ExecutionConfig>) => {
    if (typeof action === "function") action(previous);
  });
}

function fakeChats(overrides: Partial<UseAssistantChats> = {}): UseAssistantChats {
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
    ...overrides,
  };
}

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return { id: "m1", role: "assistant", content: [], ...overrides } as ChatMessage;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockLoadExecutionConfig.mockReset().mockResolvedValue(DEFAULT_EXECUTION_CONFIG);
  // Resolves to `readonly string[]` (the changed ledger keys), not `void` — `undefined` does not
  // typecheck. No caller reads the value; `[]` is the neutral choice.
  mockSaveExecutionConfig.mockReset().mockResolvedValue([]);
  mockCreateExecutionPort.mockReset().mockReturnValue({ listModels: vi.fn().mockResolvedValue([]) } as never);
  mockPublishSettingsRefresh.mockReset();
  mockLoadAdminExecutionCredential.mockReset().mockResolvedValue(storedCredential(false));
  chatPaneSpy.mockReset();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("useExecutionConfig", () => {
  it("starts on the default config and adopts the loaded one once the fetch resolves", async () => {
    const loaded: ExecutionConfig = { ...DEFAULT_EXECUTION_CONFIG, mode: "byok" };
    mockLoadExecutionConfig.mockResolvedValue(loaded);

    const { result } = renderHook(() => useExecutionConfig());
    expect(result.current.executionConfig).toEqual(DEFAULT_EXECUTION_CONFIG);

    await waitFor(() => expect(result.current.executionConfig).toEqual(loaded));
  });

  it("falls back to the default config and logs, rather than throwing, when the load rejects", async () => {
    mockLoadExecutionConfig.mockRejectedValue(new Error("server down"));

    const { result } = renderHook(() => useExecutionConfig());

    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[AssistantDock] failed to load execution config",
      expect.any(Error),
    ));
    expect(result.current.executionConfig).toEqual(DEFAULT_EXECUTION_CONFIG);
  });

  it("does not update state after unmount, once the load resolves late", async () => {
    let resolveLoad!: (config: ExecutionConfig) => void;
    mockLoadExecutionConfig.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve; }));

    const { result, unmount } = renderHook(() => useExecutionConfig());
    unmount();
    await act(async () => {
      resolveLoad({ ...DEFAULT_EXECUTION_CONFIG, mode: "byok" });
      await Promise.resolve();
    });

    // Reading `result.current` post-unmount reflects the last committed render, which must still
    // be the default — the cancellation guard is what stops the late resolve from touching it.
    expect(result.current.executionConfig).toEqual(DEFAULT_EXECUTION_CONFIG);
  });

  it("keeps an operator's mode switch when the mount-load resolves late with the stale pre-switch value", async () => {
    // Reproduces the race `localWriteRef` (AssistantDock.tsx) closes: the mount-load and a
    // just-made mode switch are both in-flight network calls with no ordering guarantee, so the
    // load can resolve AFTER the switch with whatever the server held BEFORE it —
    // `DEFAULT_EXECUTION_CONFIG` here stands in for that stale value. The sibling test above
    // ("persists a real mode switch…") asserts synchronously and never lets a pending load resolve
    // at all, so it cannot see this — this test is the one that actually drives the race.
    let resolveLoad!: (config: ExecutionConfig) => void;
    mockLoadExecutionConfig.mockReturnValue(new Promise((resolve) => { resolveLoad = resolve; }));

    const { result } = renderHook(() => useExecutionConfig());

    act(() => result.current.handleExecutionModeChange("api"));
    expect(result.current.executionConfig.mode).toBe("byok");

    await act(async () => {
      resolveLoad(DEFAULT_EXECUTION_CONFIG); // the stale, pre-switch value
      await Promise.resolve();
    });

    // The operator's own choice must survive — a load that started before it must not silently
    // revert it once the two race to resolve out of order.
    expect(result.current.executionConfig.mode).toBe("byok");
  });

  it("is a no-op — no save call, no state change — when the picked mode is already active", () => {
    const { result } = renderHook(() => useExecutionConfig());
    const before = result.current.executionConfig;

    act(() => result.current.handleExecutionModeChange("local")); // DEFAULT_EXECUTION_CONFIG.mode is "local-cli"

    expect(result.current.executionConfig).toBe(before);
    expect(mockSaveExecutionConfig).not.toHaveBeenCalled();
  });

  it("persists a real mode switch through saveExecutionConfig and updates state immediately", () => {
    const { result } = renderHook(() => useExecutionConfig());

    act(() => result.current.handleExecutionModeChange("api"));

    expect(result.current.executionConfig.mode).toBe("byok");
    expect(mockSaveExecutionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "byok" }),
      DEFAULT_EXECUTION_CONFIG,
    );
  });

  it("logs rather than throwing when the mode-switch save rejects", async () => {
    mockSaveExecutionConfig.mockRejectedValue(new Error("write failed"));
    const { result } = renderHook(() => useExecutionConfig());

    act(() => result.current.handleExecutionModeChange("api"));

    await waitFor(() => expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[AssistantDock] failed to save execution mode",
      expect.any(Error),
    ));
    // The optimistic switch itself is not rolled back on a save failure.
    expect(result.current.executionConfig.mode).toBe("byok");
  });
});

describe("useByokRuntime", () => {
  it("stays empty and never calls listModels outside BYOK mode", () => {
    const listModels = vi.fn();
    mockCreateExecutionPort.mockReturnValue({ listModels } as never);

    const { result } = renderHook(() =>
      useByokRuntime({ executionConfig: DEFAULT_EXECUTION_CONFIG, setExecutionConfig: vi.fn() }),
    );

    expect(listModels).not.toHaveBeenCalled();
    expect(result.current.byokRuntime.models).toEqual([]);
  });

  it("stays empty and never calls listModels when BYOK mode has no saved API key", () => {
    const listModels = vi.fn();
    mockCreateExecutionPort.mockReturnValue({ listModels } as never);

    renderHook(() =>
      useByokRuntime({ executionConfig: byokConfig({ apiKey: "" }), setExecutionConfig: vi.fn() }),
    );

    expect(listModels).not.toHaveBeenCalled();
  });

  it("discovers models once a BYOK credential is present and maps them into id/label options", async () => {
    const listModels = vi.fn().mockResolvedValue(["claude-opus-4-5", "claude-sonnet-4-5"]);
    mockCreateExecutionPort.mockReturnValue({ listModels } as never);

    const { result } = renderHook(() =>
      useByokRuntime({ executionConfig: byokConfig(), setExecutionConfig: vi.fn() }),
    );

    await waitFor(() =>
      expect(result.current.byokRuntime.models).toEqual([
        { id: "claude-opus-4-5", label: "claude-opus-4-5" },
        { id: "claude-sonnet-4-5", label: "claude-sonnet-4-5" },
      ]),
    );
  });

  it("leaves models empty, without throwing, when discovery rejects", async () => {
    const listModels = vi.fn().mockRejectedValue(new Error("401"));
    mockCreateExecutionPort.mockReturnValue({ listModels } as never);

    const { result } = renderHook(() =>
      useByokRuntime({ executionConfig: byokConfig(), setExecutionConfig: vi.fn() }),
    );

    // Nothing to await-and-fail on: the assertion is that this settles at `[]` and never throws
    // into the test, matching the "silent" contract documented on the hook's discovery effect.
    await waitFor(() => expect(listModels).toHaveBeenCalled());
    expect(result.current.byokRuntime.models).toEqual([]);
  });

  it("resolves the preset's label and icon for a known provider, from protocol+baseUrl alone", () => {
    mockCreateExecutionPort.mockReturnValue({ listModels: vi.fn().mockResolvedValue([]) } as never);

    // `providerId: null` is NOT "no id match, fall back to protocol+baseUrl" — it is
    // `resolveSelectedPreset`'s own explicit "custom, resolve nothing" sentinel
    // (`packages/ui/src/features/execution/rules.ts`: `if (config.providerId === null) return
    // null;`, matched by that package's own "returns null when the config is on custom" test).
    // This test used to pass `providerId: null` and a comment claiming the protocol+baseUrl
    // fallback would still kick in; it did not — that guard returns before the fallback is ever
    // reached, which is exactly why this assertion failed with `undefined`. The fallback is for a
    // STALE id (e.g. a config written by an older catalog that renamed/removed a preset id) whose
    // protocol/baseUrl still match a current preset, so a made-up unmatched id is what exercises it.
    const { result } = renderHook(() =>
      useByokRuntime({
        executionConfig: byokConfig({ providerId: "anthropic-legacy-id" }),
        setExecutionConfig: vi.fn(),
      }),
    );

    expect(result.current.byokRuntime.providerLabel).toBe("Anthropic");
    expect(result.current.byokRuntime.iconId).toBe("claude");
  });

  it("yields no label or icon when the config is on the custom sentinel, regardless of baseUrl", () => {
    mockCreateExecutionPort.mockReturnValue({ listModels: vi.fn().mockResolvedValue([]) } as never);

    // This USED TO carry `baseUrl: "https://example.com/v1"` and be named for an "endpoint that
    // matches no preset" — but `providerId === null` returns out of `resolveSelectedPreset` before
    // `baseUrl` is ever compared (see the "known provider" test above), so that override was inert:
    // the assertion below passes identically whether `baseUrl` is a nonsense value OR — as here —
    // left at `DEFAULT_EXECUTION_CONFIG`'s real anthropic default. That is the empirical proof this
    // test only pins the custom-sentinel branch, not an unmatched-endpoint fallback comparison. The
    // genuine "reaches the fallback and finds nothing" case is the next test.
    const { result } = renderHook(() =>
      useByokRuntime({
        executionConfig: byokConfig({ providerId: null }),
        setExecutionConfig: vi.fn(),
      }),
    );

    expect(result.current.byokRuntime.providerLabel).toBeUndefined();
    expect(result.current.byokRuntime.iconId).toBeUndefined();
  });

  it("yields no label or icon for a hand-typed endpoint that matches no preset", () => {
    mockCreateExecutionPort.mockReturnValue({ listModels: vi.fn().mockResolvedValue([]) } as never);

    // A non-null, unmatched id (so the `providerId === null` short-circuit above does not apply)
    // paired with a `baseUrl` no preset owns — this is what actually reaches and exhausts
    // `resolveSelectedPreset`'s protocol+baseUrl fallback comparison, the real complement to the
    // "known provider... from protocol+baseUrl alone" test.
    const { result } = renderHook(() =>
      useByokRuntime({
        executionConfig: byokConfig({ providerId: "some-unknown-id", baseUrl: "https://example.com/v1" }),
        setExecutionConfig: vi.fn(),
      }),
    );

    expect(result.current.byokRuntime.providerLabel).toBeUndefined();
    expect(result.current.byokRuntime.iconId).toBeUndefined();
  });

  it("is a no-op when the picked model is already the active one", () => {
    mockCreateExecutionPort.mockReturnValue({ listModels: vi.fn().mockResolvedValue([]) } as never);
    // `handleByokModelChange` always calls `setExecutionConfig` — the equality guard lives INSIDE
    // its updater (`if (previous.byok.model === model) return previous;`), not around the call
    // itself. Returning the identical reference is what makes this a no-op: React bails out on an
    // unchanged updater result and does not re-render, and — the actually observable half of "no
    // save fires" — `saveExecutionConfig` never runs. Asserting `setExecutionConfig`'s call count
    // pins an implementation detail this hook was never written to guarantee; the previous version
    // of this test did that and failed for exactly that reason (`setExecutionConfig` was called
    // once, as designed). `stubSetExecutionConfig` applies the updater like the real `Dispatch`
    // does, so the returned reference is assertable too.
    const config = byokConfig({ model: "gpt-5" });
    const setExecutionConfig = stubSetExecutionConfig(config);

    const { result } = renderHook(() => useByokRuntime({ executionConfig: config, setExecutionConfig }));
    act(() => result.current.handleByokModelChange("gpt-5"));

    const [updater] = setExecutionConfig.mock.calls[0] as [(previous: ExecutionConfig) => ExecutionConfig];
    expect(updater(config)).toBe(config);
    expect(mockSaveExecutionConfig).not.toHaveBeenCalled();
    expect(mockPublishSettingsRefresh).not.toHaveBeenCalled();
  });

  it("persists a real model change and publishes a settings refresh on success", async () => {
    mockCreateExecutionPort.mockReturnValue({ listModels: vi.fn().mockResolvedValue([]) } as never);
    const config = byokConfig({ model: "" });
    const setExecutionConfig = stubSetExecutionConfig(config);

    const { result } = renderHook(() => useByokRuntime({ executionConfig: config, setExecutionConfig }));
    act(() => result.current.handleByokModelChange("gpt-5"));

    expect(mockSaveExecutionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ byok: expect.objectContaining({ model: "gpt-5" }) }),
      config,
    );
    await waitFor(() => expect(mockPublishSettingsRefresh).toHaveBeenCalledWith(["core.execution"]));
  });

  it("logs rather than throwing when the model-change save rejects", async () => {
    mockCreateExecutionPort.mockReturnValue({ listModels: vi.fn().mockResolvedValue([]) } as never);
    mockSaveExecutionConfig.mockRejectedValue(new Error("write failed"));
    const config = byokConfig({ model: "" });
    const setExecutionConfig = stubSetExecutionConfig(config);

    const { result } = renderHook(() => useByokRuntime({ executionConfig: config, setExecutionConfig }));
    act(() => result.current.handleByokModelChange("gpt-5"));

    await waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith("[AssistantDock] failed to save BYOK model", expect.any(Error)),
    );
    expect(mockPublishSettingsRefresh).not.toHaveBeenCalled();
  });
});

describe("shouldPublishOnMessagesChange", () => {
  it("does not publish on an empty transcript", () => {
    expect(shouldPublishOnMessagesChange({ messages: [], settledRunMessageId: null })).toEqual({
      publish: false,
      nextSettledRunMessageId: null,
    });
  });

  it("does not publish while the last message is a user turn", () => {
    const messages = [assistantMessage({ role: "user", runStatus: "succeeded" })];
    expect(shouldPublishOnMessagesChange({ messages, settledRunMessageId: null })).toEqual({
      publish: false,
      nextSettledRunMessageId: null,
    });
  });

  it("does not publish while the run is still streaming (non-terminal status)", () => {
    const messages = [assistantMessage({ runStatus: "running" })];
    expect(shouldPublishOnMessagesChange({ messages, settledRunMessageId: null })).toEqual({
      publish: false,
      nextSettledRunMessageId: null,
    });
  });

  it("publishes once a run reaches a terminal status, and reports that message id as settled", () => {
    const messages = [assistantMessage({ id: "run-1", runStatus: "succeeded" })];
    expect(shouldPublishOnMessagesChange({ messages, settledRunMessageId: null })).toEqual({
      publish: true,
      nextSettledRunMessageId: "run-1",
    });
  });

  it("does not re-publish for a terminal message already recorded as settled", () => {
    const messages = [assistantMessage({ id: "run-1", runStatus: "succeeded" })];
    expect(shouldPublishOnMessagesChange({ messages, settledRunMessageId: "run-1" })).toEqual({
      publish: false,
      nextSettledRunMessageId: "run-1",
    });
  });

  it("treats failed and canceled as terminal too", () => {
    for (const runStatus of ["failed", "canceled"] as const) {
      const messages = [assistantMessage({ id: `run-${runStatus}`, runStatus })];
      expect(shouldPublishOnMessagesChange({ messages, settledRunMessageId: null }).publish).toBe(true);
    }
  });
});

describe("resolveRunContext", () => {
  it("omits frontendBindToken entirely when there is no bind token", () => {
    expect(resolveRunContext({ bindToken: undefined })).toEqual({});
  });

  it("carries the bind token through when one exists", () => {
    expect(resolveRunContext({ bindToken: "tok-123" })).toEqual({ frontendBindToken: "tok-123" });
  });
});

describe("AssistantDock", () => {
  it("renders ChatPane as the direct child, with no extra wrapper element around it", () => {
    const { container } = render(<AssistantDock useChats={() => fakeChats()} />);
    // JiniChatProvider is a passthrough and ChatPane is mocked to a bare div — a wrapper
    // reintroduced around it (the `display:contents` regression this file's dispatch calls out)
    // would show up here as an extra element between `container` and the chat-pane div.
    expect(container.firstElementChild).toBe(screen.getByTestId("chat-pane"));
  });

  it("wires executionMode/apiModeAvailable off the loaded config, not a hardcoded default", async () => {
    mockLoadExecutionConfig.mockResolvedValue(byokConfig({ apiKey: "sk-real" }));
    render(<AssistantDock useChats={() => fakeChats()} />);

    await waitFor(() =>
      expect(chatPaneSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ executionMode: "api", apiModeAvailable: true }),
      ),
    );
  });

  it("reports apiModeAvailable false when BYOK mode is active, no local key is typed, and none is stored server-side", async () => {
    mockLoadExecutionConfig.mockResolvedValue(byokConfig({ apiKey: "  " }));
    mockLoadAdminExecutionCredential.mockResolvedValue(storedCredential(false));
    render(<AssistantDock useChats={() => fakeChats()} />);

    await waitFor(() =>
      expect(chatPaneSpy).toHaveBeenLastCalledWith(expect.objectContaining({ apiModeAvailable: false })),
    );
  });

  /**
   * 2026-08-05 regression coverage: the admin's own BYOK credential is write-only server-side, so
   * `executionConfig.byok.apiKey` is EMPTY on every fresh load even when a credential IS stored —
   * before this fix, the picker's "API · BYOK" row would stay permanently disabled for exactly the
   * admin the server-side store exists to serve. `hasStoredAdminKey` (from a separate GET) is what
   * makes the row selectable again without requiring the key to round-trip back to the browser.
   */
  it("reports apiModeAvailable TRUE when BYOK mode is active, no local key is typed, but a credential IS stored server-side", async () => {
    mockLoadExecutionConfig.mockResolvedValue(byokConfig({ apiKey: "" }));
    mockLoadAdminExecutionCredential.mockResolvedValue(storedCredential(true));
    render(<AssistantDock useChats={() => fakeChats()} />);

    await waitFor(() =>
      expect(chatPaneSpy).toHaveBeenLastCalledWith(expect.objectContaining({ apiModeAvailable: true })),
    );
  });

  it("a mode switch from the rendered picker round-trips into the next ChatPane render", async () => {
    const user = userEvent.setup();
    render(<AssistantDock useChats={() => fakeChats()} />);
    await waitFor(() => expect(chatPaneSpy).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "switch-to-api" }));

    await waitFor(() =>
      expect(chatPaneSpy).toHaveBeenLastCalledWith(expect.objectContaining({ executionMode: "api" })),
    );
    expect(mockSaveExecutionConfig).toHaveBeenCalled();
  });
});
