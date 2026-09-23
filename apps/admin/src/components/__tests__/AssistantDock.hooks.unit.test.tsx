import { act, renderHook, waitFor } from "@testing-library/react";
import type { SetStateAction } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@jini-ai/chat/core";
import type { FrontendSessionBridge } from "@jini-ai/chat/react";
import type { ExecutionConfig } from "@jini-ai/ui";

/**
 * @file `AssistantDock.hooks.tsx` — the three extracted hooks (`useExecutionConfig`,
 * `useByokRuntime`, `useLocalCliSelection`) and the two pure helpers
 * (`shouldPublishOnMessagesChange`, `resolveRunContext`), each driven directly with `renderHook`
 * rather than through a mounted `AssistantDock`.
 *
 * Split out of `AssistantDock.unit.test.tsx` (2026-08-06, mirroring the source split into
 * `AssistantDock.tsx` + `AssistantDock.hooks.tsx`) — these `describe` blocks are unmodified from
 * that file, moved wholesale rather than re-authored, so no coverage is lost in the split. Only the
 * import path for the hooks themselves changed, plus the scaffolding (mocks, fixtures) each block
 * actually needs is duplicated here rather than shared with the sibling component-test file, since
 * the two files no longer share a module scope.
 */

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

// A minimal fake bus, hoisted so both the mock factory and test bodies can reach the same listener
// array — tests below trigger a publish by calling the captured listeners directly, the same shape
// `settings-refresh-bus.ts`'s own real `publishSettingsRefresh` uses internally.
const { settingsRefreshListeners } = vi.hoisted(() => ({
  settingsRefreshListeners: [] as Array<(scope: readonly string[] | null) => void>,
}));

vi.mock("../../lib/settings-refresh-bus", () => ({
  publishSettingsRefresh: vi.fn(),
  subscribeToSettingsRefresh: vi.fn((listener: (scope: readonly string[] | null) => void) => {
    settingsRefreshListeners.push(listener);
    return () => {
      const index = settingsRefreshListeners.indexOf(listener);
      if (index >= 0) settingsRefreshListeners.splice(index, 1);
    };
  }),
}));

// `useAssistantTransport`'s own concern is wiring — that it defers to `createTovuAssistantTransport`
// with fresh-read execution config and the AG-UI canary, and that the result is memoized. Mocked
// (rather than driven for real) so the exact call args are directly assertable, the same reason
// `execution-settings.ts` is mocked above.
const mockCreateTovuAssistantTransport = vi.hoisted(() => vi.fn((_options?: unknown) => ({ startRun: vi.fn() })));
vi.mock("../../lib/assistant-transport", () => ({
  createTovuAssistantTransport: mockCreateTovuAssistantTransport,
}));
const mockIsAgUiTransportEnabled = vi.hoisted(() => vi.fn(() => false));
vi.mock("../../lib/assistant-transport-ag-ui", () => ({
  isAgUiTransportEnabled: mockIsAgUiTransportEnabled,
}));

// `useComposerDiscoverySelect` forwards to the real (unmocked) `resolveComposerDiscoveryOutcome`,
// which resolves the existing client-local `/mcp` route through `navigate` — mocked here so that
// branch is assertable without a real `router.ts`/history dependency.
const mockNavigate = vi.hoisted(() => vi.fn());
vi.mock("../../lib/router", () => ({ navigate: mockNavigate }));

// `useAssistantDockChrome`'s default falls back to `useWiredAdminLocale`, whose real binding calls
// `port.loadLanguage()` — a real `fetch` to the settings-effective endpoint. Mocked so its own
// describe block below can assert the "default to the real hook" path without that network call.
const mockUseWiredAdminLocale = vi.hoisted(() => vi.fn(() => "en"));
vi.mock("../../hooks/use-admin-locale.hooks", () => ({
  useWiredAdminLocale: mockUseWiredAdminLocale,
}));

// `useChatsSeam`'s default falls back to `useWiredAssistantChats`, whose real binding is a
// `fetch`-backed persistence port (`assistant-chats-dependencies.hooks.ts`) — mocked here for the
// same "assert the default without the real network call" reason as `useWiredAdminLocale` above.
const mockUseWiredAssistantChats = vi.hoisted(() => vi.fn());
vi.mock("../../hooks/use-assistant-chats.hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../hooks/use-assistant-chats.hooks")>();
  return { ...actual, useWiredAssistantChats: mockUseWiredAssistantChats };
});

// `useFolderDropBridge` (SPEC-053) only wires `useFolderDrop`'s return value to a callback prop —
// its own logic (composer insertion, custom-root set/retry/dismiss) is `useFolderDrop`'s, already
// covered directly by `features/fs-files/hooks/__tests__/use-folder-drop.hooks.unit.test.ts`. Mocked
// here, by the SAME specifier `AssistantDock.hooks.tsx` itself imports it through, so this suite can
// assert the bridging in isolation without re-driving every `useFolderDrop` branch.
const mockUseFolderDrop = vi.hoisted(() => vi.fn());
vi.mock("@/features/fs-files/hooks/use-folder-drop.hooks", () => ({
  useFolderDrop: mockUseFolderDrop,
}));

import {
  resolveRunContext,
  shouldPublishContentOnToolProgress,
  shouldPublishOnMessagesChange,
  useAssistantDockChrome,
  useAssistantTransport,
  useAttachmentUploader,
  useByokRuntime,
  useChatI18n,
  useChatsSeam,
  useComposerDiscoverySelect,
  useExecutionConfig,
  useLocalCliSelection,
  useMessagesChangeHandler,
  useRunContext,
  useAgentsPlaceholder,
  getResumeCapableAgentIds,
  useRuntimeAccess,
  useSelectedAgentPlugins,
  useSelectedPluginChips,
  useWorkingDirectoryAccess,
  useWorkingDirectoryAccessSeam,
  useFolderDropBridge,
} from "../AssistantDock/hooks/AssistantDock.hooks";
import {
  DEFAULT_EXECUTION_CONFIG,
  createExecutionPort,
  loadAdminExecutionCredential,
  loadExecutionConfig,
  saveExecutionConfig,
} from "../../lib/execution-settings";
import { publishSettingsRefresh } from "../../lib/settings-refresh-bus";
import { FetchQueryProvider } from "../../lib/fetch-query";
import { writeAgentsSnapshot } from "../../lib/assistant-agents-snapshot";
import {
  emptyComposerCapabilityProjection,
  projectComposerCapabilities,
} from "../../features/plugins/composer-capabilities";
import type { TovuComposerCapability } from "../../features/plugins/composer-capabilities";
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

function localCliConfig(overrides: Partial<ExecutionConfig["localCli"]> = {}): ExecutionConfig {
  return {
    ...DEFAULT_EXECUTION_CONFIG,
    localCli: { ...DEFAULT_EXECUTION_CONFIG.localCli, ...overrides },
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
  mockCreateTovuAssistantTransport.mockClear().mockReturnValue({ startRun: vi.fn() } as never);
  mockIsAgUiTransportEnabled.mockClear().mockReturnValue(false);
  mockNavigate.mockClear();
  mockUseWiredAdminLocale.mockClear().mockReturnValue("en");
  mockUseWiredAssistantChats.mockClear();
  mockUseFolderDrop.mockClear();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  settingsRefreshListeners.length = 0;
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  vi.unstubAllGlobals();
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
    // Reproduces the race `localWriteRef` (AssistantDock.hooks.tsx) closes: the mount-load and a
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

  it("publishes a settings refresh once the mode-switch save succeeds", async () => {
    const { result } = renderHook(() => useExecutionConfig());

    act(() => result.current.handleExecutionModeChange("api"));

    await waitFor(() => expect(mockPublishSettingsRefresh).toHaveBeenCalledWith(["core.execution"]));
  });

  it("does not publish a settings refresh when the picked mode is already active", () => {
    const { result } = renderHook(() => useExecutionConfig());

    act(() => result.current.handleExecutionModeChange("local")); // DEFAULT_EXECUTION_CONFIG.mode is "local-cli"

    expect(mockPublishSettingsRefresh).not.toHaveBeenCalled();
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

  it("configLoaded starts false and flips true once the mount-load settles successfully", async () => {
    const { result } = renderHook(() => useExecutionConfig());
    expect(result.current.configLoaded).toBe(false);

    await waitFor(() => expect(result.current.configLoaded).toBe(true));
  });

  it("configLoaded still flips true when the mount-load rejects — settled, not succeeded", async () => {
    mockLoadExecutionConfig.mockRejectedValue(new Error("server down"));
    const { result } = renderHook(() => useExecutionConfig());

    await waitFor(() => expect(result.current.configLoaded).toBe(true));
  });

  it("configLoaded stays false while the load is still in flight", async () => {
    mockLoadExecutionConfig.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useExecutionConfig());

    // Give any microtask queue a chance to run before asserting the negative.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.configLoaded).toBe(false);
  });

  // Finding 2 (cross-mount staleness): this dock mounts once at the app shell and never remounts for
  // the session (`AssistantDock.tsx`'s own header comment), so `hasStoredAdminKey` used to be able to
  // sit on a stale answer for the entire session once a settings screen's OWN, independently mounted
  // `useAdminExecutionCredential` saved/rotated/migrated the same server-side credential row.
  it("hasStoredAdminKey re-reads on a core.execution settings refresh, without remounting", async () => {
    const { result } = renderHook(() => useExecutionConfig());
    await waitFor(() => expect(result.current.hasStoredAdminKey).toBe(false));

    // A key was saved from elsewhere (a settings screen's own mount) — nothing here changed except
    // what the next GET returns, modeling a real server's state having moved.
    mockLoadAdminExecutionCredential.mockResolvedValue(storedCredential(true));
    await act(async () => {
      for (const listener of settingsRefreshListeners) listener(["core.execution"]);
    });

    await waitFor(() => expect(result.current.hasStoredAdminKey).toBe(true));
  });

  it("hasStoredAdminKey ignores a settings refresh for an unrelated namespace", async () => {
    const { result } = renderHook(() => useExecutionConfig());
    await waitFor(() => expect(result.current.hasStoredAdminKey).toBe(false));
    mockLoadAdminExecutionCredential.mockClear().mockResolvedValue(storedCredential(true));

    await act(async () => {
      for (const listener of settingsRefreshListeners) listener(["core.presentation"]);
      await Promise.resolve();
    });

    expect(mockLoadAdminExecutionCredential).not.toHaveBeenCalled();
    expect(result.current.hasStoredAdminKey).toBe(false);
  });

  it("hasStoredAdminKey falls back to false and logs, rather than throwing, when the credential load rejects", async () => {
    mockLoadAdminExecutionCredential.mockRejectedValue(new Error("credential fetch failed"));

    const { result } = renderHook(() => useExecutionConfig());

    await waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[AssistantDock] failed to load stored BYOK credential state",
        expect.any(Error),
      ),
    );
    expect(result.current.hasStoredAdminKey).toBe(false);
  });

  it("does not update hasStoredAdminKey after unmount, once a rejected credential load settles late", async () => {
    let rejectLoad!: (error: Error) => void;
    mockLoadAdminExecutionCredential.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectLoad = reject;
      }),
    );

    const { result, unmount } = renderHook(() => useExecutionConfig());
    unmount();
    await act(async () => {
      rejectLoad(new Error("credential fetch failed"));
      await Promise.resolve();
    });

    // The console.error itself is unconditional (see the hook's own doc); only the state write is
    // cancellation-guarded, so the assertion here is on `hasStoredAdminKey` staying at its
    // pre-unmount value, not on whether the error was logged.
    expect(result.current.hasStoredAdminKey).toBe(null);
  });

  it("setExecutionConfig also accepts a plain value, not only an updater function", () => {
    const { result } = renderHook(() => useExecutionConfig());

    const next = byokConfig();
    act(() => result.current.setExecutionConfig(next));

    expect(result.current.executionConfig).toBe(next);
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

  it("does not update byokModels after unmount, once a successful discovery settles late", async () => {
    let resolveModels!: (models: string[]) => void;
    const listModels = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveModels = resolve;
      }),
    );
    mockCreateExecutionPort.mockReturnValue({ listModels } as never);

    const { result, unmount } = renderHook(() =>
      useByokRuntime({ executionConfig: byokConfig(), setExecutionConfig: vi.fn() }),
    );
    unmount();
    await act(async () => {
      resolveModels(["claude-opus-4-5"]);
      await Promise.resolve();
    });

    expect(result.current.byokRuntime.models).toEqual([]);
  });

  it("does not update byokModels after unmount, once a failed discovery settles late", async () => {
    let rejectModels!: (error: Error) => void;
    const listModels = vi.fn().mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectModels = reject;
      }),
    );
    mockCreateExecutionPort.mockReturnValue({ listModels } as never);

    const { result, unmount } = renderHook(() =>
      useByokRuntime({ executionConfig: byokConfig(), setExecutionConfig: vi.fn() }),
    );
    unmount();
    await act(async () => {
      rejectModels(new Error("401"));
      await Promise.resolve();
    });

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

describe("useLocalCliSelection", () => {
  it("starts at the hardcoded { agentId: 'claude' } default before the ledger has settled", () => {
    const { result } = renderHook(() =>
      useLocalCliSelection({
        executionConfig: DEFAULT_EXECUTION_CONFIG,
        setExecutionConfig: vi.fn(),
        configLoaded: false,
      }),
    );

    expect(result.current.localCliSelection).toEqual({ agentId: "claude" });
  });

  it("hydrates once configLoaded flips true, from executionConfig.localCli", () => {
    const config = localCliConfig({ agentId: "codex", modelByAgentId: { codex: "o3" } });
    const { result, rerender } = renderHook(
      ({ configLoaded }) => useLocalCliSelection({ executionConfig: config, setExecutionConfig: vi.fn(), configLoaded }),
      { initialProps: { configLoaded: false } },
    );
    expect(result.current.localCliSelection).toEqual({ agentId: "claude" });

    rerender({ configLoaded: true });

    expect(result.current.localCliSelection).toEqual({ agentId: "codex", model: "o3" });
  });

  it("hydrates to the hardcoded default when the ledger has nothing saved (agentId null)", () => {
    const { result, rerender } = renderHook(
      ({ configLoaded }) =>
        useLocalCliSelection({ executionConfig: DEFAULT_EXECUTION_CONFIG, setExecutionConfig: vi.fn(), configLoaded }),
      { initialProps: { configLoaded: false } },
    );

    rerender({ configLoaded: true });

    expect(result.current.localCliSelection).toEqual({ agentId: "claude" });
  });

  it("does not re-hydrate on a later, unrelated executionConfig change — applies the ledger value at most once", () => {
    const first = localCliConfig({ agentId: "codex", modelByAgentId: { codex: "o3" } });
    const { result, rerender } = renderHook(
      ({ executionConfig }) =>
        useLocalCliSelection({ executionConfig, setExecutionConfig: vi.fn(), configLoaded: true }),
      { initialProps: { executionConfig: first } },
    );
    expect(result.current.localCliSelection).toEqual({ agentId: "codex", model: "o3" });

    // A later, unrelated write (e.g. a BYOK model change) changes `executionConfig` identity but
    // leaves `localCli` alone — this must not re-run the hydration and stomp an operator's own
    // subsequent pick (not exercised directly here, but the guard is what protects it).
    const second = { ...first, byok: { ...first.byok, model: "gpt-5" } };
    rerender({ executionConfig: second });

    expect(result.current.localCliSelection).toEqual({ agentId: "codex", model: "o3" });
  });

  it("does not overwrite an operator's own pick made before the ledger's GET settles", () => {
    const { result, rerender } = renderHook(
      ({ configLoaded }) =>
        useLocalCliSelection({ executionConfig: DEFAULT_EXECUTION_CONFIG, setExecutionConfig: vi.fn(), configLoaded }),
      { initialProps: { configLoaded: false } },
    );

    act(() => result.current.handleLocalCliSelectionChange({ agentId: "gemini", model: "gemini-2.5-pro" }));
    expect(result.current.localCliSelection).toEqual({ agentId: "gemini", model: "gemini-2.5-pro" });

    // The GET resolves late, with a DIFFERENT saved selection — must not silently revert the pick
    // the operator already made, same race `useExecutionConfig`'s own `localWriteRef` guards.
    rerender({ configLoaded: true });

    expect(result.current.localCliSelection).toEqual({ agentId: "gemini", model: "gemini-2.5-pro" });
  });

  it("persists a pick through saveExecutionConfig, keyed by the newly selected agent", () => {
    const config = DEFAULT_EXECUTION_CONFIG;
    const setExecutionConfig = stubSetExecutionConfig(config);
    const { result } = renderHook(() =>
      useLocalCliSelection({ executionConfig: config, setExecutionConfig, configLoaded: true }),
    );

    act(() => result.current.handleLocalCliSelectionChange({ agentId: "claude", model: "claude-sonnet-5" }));

    expect(result.current.localCliSelection).toEqual({ agentId: "claude", model: "claude-sonnet-5" });
    expect(mockSaveExecutionConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        localCli: { agentId: "claude", modelByAgentId: { claude: "claude-sonnet-5" } },
      }),
      config,
    );
  });

  it("reverting to no explicit model (undefined) persists an empty string for that agent, not a dropped key", () => {
    const config = localCliConfig({ agentId: "claude", modelByAgentId: { claude: "claude-sonnet-5" } });
    const setExecutionConfig = stubSetExecutionConfig(config);
    const { result } = renderHook(() =>
      useLocalCliSelection({ executionConfig: config, setExecutionConfig, configLoaded: true }),
    );

    act(() => result.current.handleLocalCliSelectionChange({ agentId: "claude" }));

    expect(mockSaveExecutionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ localCli: { agentId: "claude", modelByAgentId: { claude: "" } } }),
      config,
    );
  });

  it("logs rather than throwing when the selection-change save rejects", async () => {
    mockSaveExecutionConfig.mockRejectedValue(new Error("write failed"));
    const config = DEFAULT_EXECUTION_CONFIG;
    const setExecutionConfig = stubSetExecutionConfig(config);
    const { result } = renderHook(() =>
      useLocalCliSelection({ executionConfig: config, setExecutionConfig, configLoaded: true }),
    );

    act(() => result.current.handleLocalCliSelectionChange({ agentId: "claude", model: "claude-sonnet-5" }));

    await waitFor(() =>
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[AssistantDock] failed to save Local CLI selection",
        expect.any(Error),
      ),
    );
    // The optimistic UI pick itself is not rolled back on a save failure — same posture as
    // `useByokRuntime`'s equivalent test.
    expect(result.current.localCliSelection).toEqual({ agentId: "claude", model: "claude-sonnet-5" });
  });

  it("persists a cleared agent (empty agentId) as null, leaving the saved per-agent model map untouched", () => {
    const config = localCliConfig({ agentId: "claude", modelByAgentId: { claude: "claude-sonnet-5" } });
    const setExecutionConfig = stubSetExecutionConfig(config);
    const { result } = renderHook(() =>
      useLocalCliSelection({ executionConfig: config, setExecutionConfig, configLoaded: true }),
    );

    // `agentId: ""` is falsy — the same "cleared the picker" shape `ChatPane`'s own selection
    // model uses when nothing is chosen. `nextAgentId` must become `null` (not `""`), and the
    // untouched `modelByAgentId` map (not a fresh per-agent write) is what proves the ternary's
    // false branch, not the true one, is what ran.
    act(() => result.current.handleLocalCliSelectionChange({ agentId: "" }));

    expect(mockSaveExecutionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ localCli: { agentId: null, modelByAgentId: config.localCli.modelByAgentId } }),
      config,
    );
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

describe("shouldPublishContentOnToolProgress", () => {
  function toolResultEvents(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      kind: "tool_result" as const,
      toolUseId: `t${i}`,
      content: "ok",
      isError: false,
    }));
  }

  it("does not publish on an empty transcript", () => {
    expect(
      shouldPublishContentOnToolProgress({ messages: [], publishedToolProgress: null }),
    ).toEqual({ publish: false, nextPublishedToolProgress: null });
  });

  it("does not publish while the last message is a user turn", () => {
    const messages = [assistantMessage({ role: "user" })];
    expect(
      shouldPublishContentOnToolProgress({ messages, publishedToolProgress: null }),
    ).toEqual({ publish: false, nextPublishedToolProgress: null });
  });

  it("does not publish for an assistant message with no tool_result events", () => {
    const messages = [assistantMessage({ runStatus: "running" })];
    expect(
      shouldPublishContentOnToolProgress({ messages, publishedToolProgress: null }),
    ).toEqual({ publish: false, nextPublishedToolProgress: null });
  });

  it("publishes on the first tool result returned mid-run", () => {
    const messages = [assistantMessage({ id: "m1", runStatus: "running", events: toolResultEvents(1) })];
    expect(
      shouldPublishContentOnToolProgress({ messages, publishedToolProgress: null }),
    ).toEqual({ publish: true, nextPublishedToolProgress: { messageId: "m1", toolResultCount: 1 } });
  });

  it("does not re-publish when the tool result count for the same message has not grown", () => {
    const messages = [assistantMessage({ id: "m1", runStatus: "running", events: toolResultEvents(1) })];
    const publishedToolProgress = { messageId: "m1", toolResultCount: 1 };
    expect(
      shouldPublishContentOnToolProgress({ messages, publishedToolProgress }),
    ).toEqual({ publish: false, nextPublishedToolProgress: publishedToolProgress });
  });

  it("publishes again when the same message's tool result count grows", () => {
    const messages = [assistantMessage({ id: "m1", runStatus: "running", events: toolResultEvents(2) })];
    const publishedToolProgress = { messageId: "m1", toolResultCount: 1 };
    expect(
      shouldPublishContentOnToolProgress({ messages, publishedToolProgress }),
    ).toEqual({ publish: true, nextPublishedToolProgress: { messageId: "m1", toolResultCount: 2 } });
  });

  it("publishes for a new run's first tool result even though the previous mark held a higher count", () => {
    const messages = [assistantMessage({ id: "m2", runStatus: "running", events: toolResultEvents(1) })];
    const publishedToolProgress = { messageId: "m1", toolResultCount: 3 };
    expect(
      shouldPublishContentOnToolProgress({ messages, publishedToolProgress }),
    ).toEqual({ publish: true, nextPublishedToolProgress: { messageId: "m2", toolResultCount: 1 } });
  });

  it("publishes for a retried run's first tool result, which restarts the count under the SAME message id", () => {
    // `useConversation`'s `retry` rebuilds the failed assistant message in place — same `id`, with
    // `events: []` — so a retry's counts restart at 1 under an id whose mark still holds the failed
    // run's higher count. Keyed on the id alone, every tool call up to that count reads as "already
    // announced" and the retry's writes are never announced at all: `shouldPublishOnMessagesChange`
    // cannot cover for it either, because its own `settledRunMessageId` already holds `m1`.
    const messages = [assistantMessage({ id: "m1", runStatus: "running", events: toolResultEvents(1) })];
    const publishedToolProgress = { messageId: "m1", toolResultCount: 3 };
    expect(
      shouldPublishContentOnToolProgress({ messages, publishedToolProgress }),
    ).toEqual({ publish: true, nextPublishedToolProgress: { messageId: "m1", toolResultCount: 1 } });
  });
});

describe("resolveRunContext", () => {
  it("omits frontendBindToken entirely when there is no bind token", () => {
    expect(resolveRunContext({ bindToken: undefined })).toEqual({});
  });

  it("carries the bind token through when one exists", () => {
    expect(resolveRunContext({ bindToken: "tok-123" })).toEqual({ frontendBindToken: "tok-123" });
  });

  it("carries the live model selection through when one exists", () => {
    expect(resolveRunContext({ bindToken: undefined, model: "sonnet" })).toEqual({ model: "sonnet" });
  });

  it("omits model entirely when absent — including the empty-string case", () => {
    expect(resolveRunContext({ bindToken: undefined, model: undefined })).toEqual({});
    expect(resolveRunContext({ bindToken: undefined, model: "" })).toEqual({});
  });

  it("carries bindToken and model together without either shadowing the other", () => {
    expect(resolveRunContext({ bindToken: "tok-123", model: "opus" })).toEqual({
      frontendBindToken: "tok-123",
      model: "opus",
    });
  });

  it("carries pinned pluginRefIds through when at least one is pinned", () => {
    expect(resolveRunContext({ bindToken: undefined, pluginRefIds: ["ui-ux-design"] })).toEqual({
      pluginRefIds: ["ui-ux-design"],
    });
  });

  it("omits pluginRefIds entirely when the array is empty or absent", () => {
    expect(resolveRunContext({ bindToken: undefined, pluginRefIds: [] })).toEqual({});
    expect(resolveRunContext({ bindToken: undefined })).toEqual({});
  });

  it("carries the active conversation id through when one exists", () => {
    expect(resolveRunContext({ bindToken: undefined, conversationId: "c1" })).toEqual({ conversationId: "c1" });
  });

  it("omits conversationId entirely when absent, null, or empty — no conversation is active yet", () => {
    expect(resolveRunContext({ bindToken: undefined, conversationId: undefined })).toEqual({});
    expect(resolveRunContext({ bindToken: undefined, conversationId: null })).toEqual({});
    expect(resolveRunContext({ bindToken: undefined, conversationId: "" })).toEqual({});
  });

  // Same round trip the model already makes, for the value the Execution tab's "Reasoning effort"
  // control persists. Without it the level is stored in the ledger and never reaches argv, which
  // reads to an operator as the setting silently doing nothing.
  it("carries the selected reasoning effort through when one exists", () => {
    expect(resolveRunContext({ bindToken: undefined, reasoning: "high" })).toEqual({ reasoning: "high" });
  });

  it("omits reasoning entirely when absent or empty — '' is the ledger's 'no explicit effort'", () => {
    expect(resolveRunContext({ bindToken: undefined, reasoning: undefined })).toEqual({});
    expect(resolveRunContext({ bindToken: undefined, reasoning: "" })).toEqual({});
  });

  it("carries model and reasoning together without either shadowing the other", () => {
    expect(resolveRunContext({ bindToken: "tok-123", model: "opus", reasoning: "max" })).toEqual({
      frontendBindToken: "tok-123",
      model: "opus",
      reasoning: "max",
    });
  });
});

/**
 * The seven hooks below were extracted out of `AssistantDock.tsx`'s component body (2026-08-18
 * inline-hook-extraction pass) — see that file's own header and `AssistantDock.hooks.tsx`'s header
 * for which of these carry an `INFO.md` rule-3 injectable seam and why.
 */

describe("useChatI18n", () => {
  it("builds an adapter matching createChatI18nAdapter's own contract for the given locale", () => {
    const { result } = renderHook(() => useChatI18n("es"));

    expect(result.current.locale).toBe("es");
    expect(result.current.t("Conversations")).toBe("Conversaciones");
    // Falls through an unmapped key unchanged — the same passthrough `createChatI18nAdapter` documents.
    expect(result.current.t("Some unmapped key")).toBe("Some unmapped key");
  });

  it("memoizes the adapter across re-renders while locale is unchanged", () => {
    const { result, rerender } = renderHook(({ locale }) => useChatI18n(locale), {
      initialProps: { locale: "es" },
    });
    const first = result.current;

    rerender({ locale: "es" });

    expect(result.current).toBe(first);
  });

  it("rebuilds the adapter when locale changes", () => {
    const { result, rerender } = renderHook(({ locale }) => useChatI18n(locale), {
      initialProps: { locale: "es" },
    });
    const first = result.current;

    rerender({ locale: "fr" });

    expect(result.current).not.toBe(first);
    expect(result.current.locale).toBe("fr");
  });
});

describe("useAssistantDockChrome", () => {
  it("defaults to the real useWiredAdminLocale when no override is passed", () => {
    mockUseWiredAdminLocale.mockReturnValue("fr");

    const { result } = renderHook(() => useAssistantDockChrome(undefined));

    expect(mockUseWiredAdminLocale).toHaveBeenCalled();
    expect(result.current.locale).toBe("fr");
  });

  it("uses the injected override instead of the real hook when one is passed", () => {
    const override = vi.fn(() => "xx-TEST"); // not a real locale any dictionary or fetch could produce
    const { result } = renderHook(() => useAssistantDockChrome(override));

    expect(override).toHaveBeenCalled();
    expect(mockUseWiredAdminLocale).not.toHaveBeenCalled();
    expect(result.current.locale).toBe("xx-TEST");
  });

  it("t() translates a dictionary-covered key for the resolved locale", () => {
    const { result } = renderHook(() => useAssistantDockChrome(() => "es"));

    expect(result.current.t("Tovu assistant")).toBe("Asistente de Tovu");
  });

  it("t() falls back to the raw key for a locale/key combination the dictionary does not cover", () => {
    const { result } = renderHook(() => useAssistantDockChrome(() => "es"));

    expect(result.current.t("Some unmapped key")).toBe("Some unmapped key");
  });

  it("t() falls back to the raw key entirely for a locale with no dictionary entry at all", () => {
    const { result } = renderHook(() => useAssistantDockChrome(() => "xx-TEST"));

    expect(result.current.t("Tovu assistant")).toBe("Tovu assistant");
  });

  it("chatI18n is the same adapter useChatI18n(locale) would build — composed, not reimplemented", () => {
    const { result } = renderHook(() => useAssistantDockChrome(() => "es"));

    expect(result.current.chatI18n.locale).toBe("es");
    expect(result.current.chatI18n.t("Conversations")).toBe("Conversaciones");
  });
});

describe("useAssistantTransport", () => {
  it("builds the transport via createTovuAssistantTransport, reading execution config fresh through the ref", () => {
    const executionConfigRef = { current: DEFAULT_EXECUTION_CONFIG };
    renderHook(() => useAssistantTransport({ executionConfigRef }));

    expect(mockCreateTovuAssistantTransport).toHaveBeenCalledTimes(1);
    const options = mockCreateTovuAssistantTransport.mock.calls[0]?.[0] as {
      getExecutionConfig: () => unknown;
      getAgUiEnabled: () => boolean;
    };

    // Read fresh, not captured by value — mutating the ref after the hook renders must be visible
    // to the NEXT `getExecutionConfig()` call, proving the closure reads `.current` live.
    executionConfigRef.current = { ...DEFAULT_EXECUTION_CONFIG, mode: "byok" };
    expect(options.getExecutionConfig()).toEqual(expect.objectContaining({ mode: "byok" }));
    expect(options.getAgUiEnabled).toBe(mockIsAgUiTransportEnabled);
  });

  it("memoizes the transport across re-renders while the ref identity is stable — rebuilding it would drop in-flight runs", () => {
    const executionConfigRef = { current: DEFAULT_EXECUTION_CONFIG };
    const { result, rerender } = renderHook(() => useAssistantTransport({ executionConfigRef }));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
    expect(mockCreateTovuAssistantTransport).toHaveBeenCalledTimes(1);
  });
});

describe("useAttachmentUploader", () => {
  it("returns a callable uploader — the real createDaemonAttachmentUploader output", () => {
    const { result } = renderHook(() => useAttachmentUploader());

    expect(typeof result.current).toBe("function");
  });

  it("memoizes the uploader across re-renders — rebuilding it would reset a turn's running batch quota", () => {
    const { result, rerender } = renderHook(() => useAttachmentUploader());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

describe("useRuntimeAccess", () => {
  it("listAgents fetches /api/agents and returns the agents array", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ agents: [{ id: "claude" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });

    await expect(result.current.listAgents()).resolves.toEqual([{ id: "claude" }]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/agents", expect.objectContaining({ credentials: "same-origin" }));
  });

  it("listAgents returns an empty array, without throwing, when the GET is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });

    await expect(result.current.listAgents()).resolves.toEqual([]);
  });

  it("rescanAgents returns the freshly rescanned agents when the POST succeeds", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ agents: [{ id: "codex" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });

    await expect(result.current.rescanAgents()).resolves.toEqual([{ id: "codex" }]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/agents/rescan", expect.objectContaining({ method: "POST" }));
  });

  /**
   * The one branch neither this file nor `AssistantDock.runtime-access.unit.test.tsx` (which covers
   * `daemonOnline`'s in-flight-reuse/abort-signal behavior against the mounted component) previously
   * exercised: a rescan POST that does not report success must not surface an error into the
   * picker — it falls back to a plain `listAgents()` re-fetch instead.
   */
  it("rescanAgents falls back to a plain listAgents() re-fetch when the rescan POST is not ok", async () => {
    const fetchSpy = vi.fn((url: string) => {
      if (url === "/api/agents/rescan") return Promise.resolve(new Response(null, { status: 500 }));
      return Promise.resolve(new Response(JSON.stringify({ agents: [{ id: "gemini" }] }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { result } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });

    await expect(result.current.rescanAgents()).resolves.toEqual([{ id: "gemini" }]);
    // Two real fetches: the failed rescan POST, then the listAgents() fallback GET.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[1]?.[0]).toBe("/api/agents");
  });

  it("memoizes the returned object across re-renders", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { result, rerender } = renderHook(() => useRuntimeAccess(), { wrapper: FetchQueryProvider });
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

/**
 * The picker's client-side cache (2026-09-22): `listAgents` reads through the shared fetch-query
 * cache, a rescan writes into it, and `useAgentsPlaceholder` seeds a pane from it (or from the
 * localStorage snapshot of the last live list) before `listAgents` resolves. Both hooks render
 * under ONE provider here, the way every screen shares `main.tsx`'s single client.
 */
describe("agents cache (useRuntimeAccess + useAgentsPlaceholder)", () => {
  const okAgents = (agents: readonly { id: string; name: string }[]) =>
    Promise.resolve(new Response(JSON.stringify({ agents }), { status: 200 }));

  function renderAgents() {
    return renderHook(() => ({ access: useRuntimeAccess(), placeholder: useAgentsPlaceholder() }), {
      wrapper: FetchQueryProvider,
    });
  }

  afterEach(() => {
    localStorage.clear();
  });

  it("serves a second listAgents() from the cache without another request", async () => {
    const fetchSpy = vi.fn(() => okAgents([{ id: "claude", name: "Claude Code" }]));
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderAgents();

    await result.current.access.listAgents();
    await expect(result.current.access.listAgents()).resolves.toEqual([{ id: "claude", name: "Claude Code" }]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps serving the cached list long after the app-wide 10s staleTime and 5-minute idle eviction", async () => {
    vi.useFakeTimers();
    try {
      const fetchSpy = vi.fn(() => okAgents([{ id: "claude", name: "Claude Code" }]));
      vi.stubGlobal("fetch", fetchSpy);
      const { result } = renderAgents();
      await result.current.access.listAgents();

      await vi.advanceTimersByTimeAsync(60 * 60_000);

      await expect(result.current.access.listAgents()).resolves.toEqual([{ id: "claude", name: "Claude Code" }]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not cache a non-ok answer — the next listAgents() asks the server again", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockImplementationOnce(() => okAgents([{ id: "codex", name: "Codex" }]));
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderAgents();

    await expect(result.current.access.listAgents()).resolves.toEqual([]);
    await expect(result.current.access.listAgents()).resolves.toEqual([{ id: "codex", name: "Codex" }]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("a successful rescan replaces the cached list", async () => {
    const fetchSpy = vi.fn((url: string) =>
      url === "/api/agents/rescan" ? okAgents([{ id: "codex", name: "Codex" }]) : okAgents([{ id: "claude", name: "Claude Code" }]),
    );
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderAgents();

    await result.current.access.listAgents();
    await result.current.access.rescanAgents();

    await expect(result.current.access.listAgents()).resolves.toEqual([{ id: "codex", name: "Codex" }]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("a rescan whose POST and fallback GET both fail keeps the cached list", async () => {
    const fetchSpy = vi
      .fn()
      .mockImplementationOnce(() => okAgents([{ id: "claude", name: "Claude Code" }]))
      .mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderAgents();

    await result.current.access.listAgents();
    await expect(result.current.access.rescanAgents()).resolves.toEqual([]);

    await expect(result.current.access.listAgents()).resolves.toEqual([{ id: "claude", name: "Claude Code" }]);
  });

  it("a rescan that lands while the first GET is still in flight is not overwritten by that GET's older list", async () => {
    let releaseGet!: () => void;
    const getGate = new Promise<void>((resolve) => {
      releaseGet = resolve;
    });
    const fetchSpy = vi.fn(async (url: string) => {
      if (url === "/api/agents/rescan") return okAgents([{ id: "codex", name: "Codex" }]);
      await getGate;
      return new Response(JSON.stringify({ agents: [{ id: "claude", name: "Claude Code", carriesOwnMemory: true }] }));
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { result } = renderAgents();

    const firstList = result.current.access.listAgents();
    await result.current.access.rescanAgents();
    releaseGet();
    await firstList;

    await expect(result.current.access.listAgents()).resolves.toEqual([{ id: "codex", name: "Codex" }]);
    expect(renderAgents().result.current.placeholder).toEqual([{ id: "codex", name: "Codex" }]);
    expect(getResumeCapableAgentIds()).toEqual(new Set());
  });

  it("placeholder is undefined with no cache and no stored snapshot", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { result } = renderAgents();

    expect(result.current.placeholder).toBeUndefined();
  });

  it("placeholder falls back to the stored snapshot of the last live list", () => {
    writeAgentsSnapshot([{ id: "gemini", name: "Gemini CLI" }]);
    vi.stubGlobal("fetch", vi.fn());
    const { result } = renderAgents();

    expect(result.current.placeholder).toEqual([{ id: "gemini", name: "Gemini CLI" }]);
  });

  it("placeholder prefers the cached live list over the snapshot once one has loaded", async () => {
    writeAgentsSnapshot([{ id: "gemini", name: "Gemini CLI" }]);
    vi.stubGlobal("fetch", vi.fn(() => okAgents([{ id: "claude", name: "Claude Code" }])));
    const { result, rerender } = renderAgents();

    await result.current.access.listAgents();
    rerender();

    expect(result.current.placeholder).toEqual([{ id: "claude", name: "Claude Code" }]);
  });

  it("a live list is stored as the next cold load's snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn(() => okAgents([{ id: "claude", name: "Claude Code" }])));
    const { result } = renderAgents();

    await result.current.access.listAgents();

    const next = renderAgents();
    expect(next.result.current.placeholder).toEqual([{ id: "claude", name: "Claude Code" }]);
  });
});

describe("useComposerDiscoverySelect", () => {
  async function projectionWith(capabilities: readonly TovuComposerCapability[]) {
    return projectComposerCapabilities([{ id: "test", list: async () => capabilities }]);
  }

  it("navigates for the existing client-local /mcp route via the injected navigate", async () => {
    const capabilities = await projectionWith([]);
    const { result } = renderHook(() =>
      useComposerDiscoverySelect({ composerCapabilities: capabilities, callAllowlistedTool: vi.fn() }),
    );

    const outcome = await result.current({ item: { id: "mcp:settings", label: "mcp" }, source: "slash" });

    expect(mockNavigate).toHaveBeenCalledWith("/settings?tab=external-mcp");
    expect(outcome).toBeUndefined();
  });

  it("resolves a compose-text binding through the projected capability", async () => {
    const resolve = () => ({ kind: "compose-text" as const, text: "hello" });
    const capabilities = await projectionWith([
      { groupId: "g", groupLabel: "G", item: { id: "search:web", label: "/search" }, resolve },
    ]);
    const { result } = renderHook(() =>
      useComposerDiscoverySelect({ composerCapabilities: capabilities, callAllowlistedTool: vi.fn() }),
    );

    const outcome = await result.current({ item: { id: "search:web", label: "/search" }, source: "slash" });

    expect(outcome).toEqual({ draft: "hello" });
  });

  it("forwards an allowlisted-tool-call binding to the injected callAllowlistedTool", async () => {
    const resolve = () => ({
      kind: "allowlisted-tool-call" as const,
      toolName: "content_post_delete",
      params: { postId: "1" },
    });
    const capabilities = await projectionWith([
      { groupId: "g", groupLabel: "G", item: { id: "danger:delete", label: "/delete" }, resolve },
    ]);
    const callAllowlistedTool = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() =>
      useComposerDiscoverySelect({ composerCapabilities: capabilities, callAllowlistedTool }),
    );

    await result.current({ item: { id: "danger:delete", label: "/delete" }, source: "slash" });

    expect(callAllowlistedTool).toHaveBeenCalledWith({ name: "content_post_delete", arguments: { postId: "1" } });
  });

  it("memoizes the callback across re-renders while composerCapabilities/callAllowlistedTool are unchanged", async () => {
    const capabilities = await projectionWith([]);
    const callAllowlistedTool = vi.fn();
    const { result, rerender } = renderHook(() =>
      useComposerDiscoverySelect({ composerCapabilities: capabilities, callAllowlistedTool }),
    );
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it("rebuilds the callback when composerCapabilities changes", async () => {
    const capabilities = await projectionWith([]);
    const { result, rerender } = renderHook(
      ({ capabilities: c }) =>
        useComposerDiscoverySelect({ composerCapabilities: c, callAllowlistedTool: vi.fn() }),
      { initialProps: { capabilities } },
    );
    const first = result.current;
    const nextCapabilities = await projectionWith([]);

    rerender({ capabilities: nextCapabilities });

    expect(result.current).not.toBe(first);
  });

  /**
   * 2026-08-21: the "UI/UX Design (Agent Plugin)" row used to carry `insertText` and no
   * `pluginRefId` — selecting it typed an inert string into the draft. This is the regression
   * test proving the replacement: a `pluginRefId` capability pins a chip via `addPluginRef`
   * instead of composing arbitrary text. It still clears the draft (`{ draft: "" }`, added
   * 2026-08-24 to cover the `command`-bearing slash path — see the source's own comment on this
   * branch) rather than leaving text behind.
   */
  it("pins a pluginRefId capability via addPluginRef instead of composing draft text", async () => {
    const capabilities = await projectionWith([
      {
        groupId: "agent-plugins",
        groupLabel: "Agent Plugins",
        item: { id: "agent-plugin:ui-ux-design", label: "UI/UX Design (Agent Plugin)" },
        pluginRefId: "ui-ux-design",
      },
    ]);
    const addPluginRef = vi.fn();
    const { result } = renderHook(() =>
      useComposerDiscoverySelect({ composerCapabilities: capabilities, callAllowlistedTool: vi.fn(), addPluginRef }),
    );

    const outcome = await result.current({
      item: { id: "agent-plugin:ui-ux-design", label: "UI/UX Design (Agent Plugin)" },
      source: "plus",
    });

    expect(addPluginRef).toHaveBeenCalledWith("ui-ux-design");
    expect(outcome).toEqual({ draft: "" });
  });

  it("does not throw when addPluginRef is omitted for a pluginRefId capability — a documented no-op", async () => {
    const capabilities = await projectionWith([
      {
        groupId: "agent-plugins",
        groupLabel: "Agent Plugins",
        item: { id: "agent-plugin:ui-ux-design", label: "UI/UX Design (Agent Plugin)" },
        pluginRefId: "ui-ux-design",
      },
    ]);
    const { result } = renderHook(() =>
      useComposerDiscoverySelect({ composerCapabilities: capabilities, callAllowlistedTool: vi.fn() }),
    );

    const outcome = await result.current({
      item: { id: "agent-plugin:ui-ux-design", label: "UI/UX Design (Agent Plugin)" },
      source: "plus",
    });

    expect(outcome).toEqual({ draft: "" });
  });
});

describe("useMessagesChangeHandler", () => {
  function fakeChats(): Pick<UseAssistantChats, "onMessagesChange"> {
    return { onMessagesChange: vi.fn() };
  }

  afterEach(() => {
    delete window.__tovuAssistantMessages;
  });

  it("mirrors every messages-change delta onto window.__tovuAssistantMessages", () => {
    const chats = fakeChats();
    const { result } = renderHook(() => useMessagesChangeHandler({ chats }));
    const messages = [{ id: "m1", role: "user", content: [] }] as unknown as ChatMessage[];

    act(() => result.current(messages));

    expect(window.__tovuAssistantMessages).toBe(messages);
  });

  it("forwards every delta to chats.onMessagesChange", () => {
    const chats = fakeChats();
    const { result } = renderHook(() => useMessagesChangeHandler({ chats }));
    const messages = [{ id: "m1", role: "user", content: [] }] as unknown as ChatMessage[];

    act(() => result.current(messages));

    expect(chats.onMessagesChange).toHaveBeenCalledWith(messages);
  });

  it("publishes a settings refresh once a run reaches a terminal status", () => {
    const chats = fakeChats();
    const { result } = renderHook(() => useMessagesChangeHandler({ chats }));
    const messages = [
      { id: "run-1", role: "assistant", runStatus: "succeeded", content: [] },
    ] as unknown as ChatMessage[];

    act(() => result.current(messages));

    expect(mockPublishSettingsRefresh).toHaveBeenCalledWith();
  });

  it("does not publish while a run is still streaming (non-terminal status)", () => {
    const chats = fakeChats();
    const { result } = renderHook(() => useMessagesChangeHandler({ chats }));
    const messages = [
      { id: "run-1", role: "assistant", runStatus: "running", content: [] },
    ] as unknown as ChatMessage[];

    act(() => result.current(messages));

    expect(mockPublishSettingsRefresh).not.toHaveBeenCalled();
  });

  it("does not re-publish for the same settled run across repeated deltas", () => {
    const chats = fakeChats();
    const { result } = renderHook(() => useMessagesChangeHandler({ chats }));
    const messages = [
      { id: "run-1", role: "assistant", runStatus: "succeeded", content: [] },
    ] as unknown as ChatMessage[];

    act(() => result.current(messages));
    act(() => result.current(messages));

    expect(mockPublishSettingsRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("useRunContext", () => {
  it("builds context by reading the bind token fresh at call time, not captured at build time", () => {
    let token = "tok-1";
    const agentBridge = { bindToken: () => token } as unknown as FrontendSessionBridge;
    const { result } = renderHook(() => useRunContext({ agentBridge, model: "sonnet" }));

    expect(result.current()).toEqual({ frontendBindToken: "tok-1", model: "sonnet" });

    token = "tok-2"; // simulates an EventSource reconnect minting a new bind token
    expect(result.current()).toEqual({ frontendBindToken: "tok-2", model: "sonnet" });
  });

  it("omits frontendBindToken when there is no agentBridge", () => {
    const { result } = renderHook(() => useRunContext({ agentBridge: null, model: "sonnet" }));

    expect(result.current()).toEqual({ model: "sonnet" });
  });

  // 2026-09-16 owner report: in the page editor for "Landing sample — xai", the assistant could not
  // say which page was open. The screen must be read when Send is pressed — the callback is memoized
  // and outlives navigation, so a value captured at build time would describe a screen already left.
  it("carries the screen the operator is on, read fresh at call time", () => {
    const pageEditor = {
      path: "/pages/4f22",
      section: "pages",
      view: "page-editor",
      entry: { kind: "page", id: "4f22", title: "Landing sample — xai" },
    };
    let screen: typeof pageEditor | { path: string; section: string } | undefined = pageEditor;
    const { result } = renderHook(() => useRunContext({ agentBridge: null, readScreenContext: () => screen }));

    expect(result.current()).toEqual({ pageContext: pageEditor });

    screen = { path: "/pages", section: "pages" };
    expect(result.current()).toEqual({ pageContext: { path: "/pages", section: "pages" } });

    screen = undefined;
    expect(result.current()).toEqual({});
  });

  it("memoizes the callback while agentBridge and model are unchanged", () => {
    const agentBridge = { bindToken: () => "tok" } as unknown as FrontendSessionBridge;
    const { result, rerender } = renderHook(() => useRunContext({ agentBridge, model: "sonnet" }));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it("rebuilds the callback when model changes", () => {
    const agentBridge = { bindToken: () => "tok" } as unknown as FrontendSessionBridge;
    const { result, rerender } = renderHook(
      ({ model }: { model: string | undefined }) => useRunContext({ agentBridge, model }),
      { initialProps: { model: "sonnet" as string | undefined } },
    );
    const first = result.current;

    rerender({ model: "opus" });

    expect(result.current).not.toBe(first);
  });

  it("carries pluginRefIds through, read fresh at call time like the bind token", () => {
    const agentBridge = { bindToken: () => "tok" } as unknown as FrontendSessionBridge;
    const { result, rerender } = renderHook(
      ({ pluginRefIds }: { pluginRefIds: readonly string[] }) =>
        useRunContext({ agentBridge, model: "sonnet", pluginRefIds }),
      { initialProps: { pluginRefIds: [] as readonly string[] } },
    );

    expect(result.current()).toEqual({ frontendBindToken: "tok", model: "sonnet" });

    rerender({ pluginRefIds: ["ui-ux-design"] });

    expect(result.current()).toEqual({ frontendBindToken: "tok", model: "sonnet", pluginRefIds: ["ui-ux-design"] });
  });

  it("carries conversationId through, and rebuilds the callback when it changes (a conversation switch)", () => {
    const agentBridge = { bindToken: () => "tok" } as unknown as FrontendSessionBridge;
    const { result, rerender } = renderHook(
      ({ conversationId }: { conversationId: string | null }) => useRunContext({ agentBridge, model: "sonnet", conversationId }),
      { initialProps: { conversationId: null as string | null } },
    );
    const first = result.current;

    expect(result.current()).toEqual({ frontendBindToken: "tok", model: "sonnet" });

    rerender({ conversationId: "c1" });

    expect(result.current()).toEqual({ frontendBindToken: "tok", model: "sonnet", conversationId: "c1" });
    expect(result.current).not.toBe(first);
  });
});

describe("useSelectedAgentPlugins", () => {
  it("starts with no pinned plugin refs", () => {
    const { result } = renderHook(() => useSelectedAgentPlugins());
    expect(result.current.selectedPluginRefIds).toEqual([]);
  });

  it("pins a plugin ref, in pin order", () => {
    const { result } = renderHook(() => useSelectedAgentPlugins());

    act(() => result.current.addPluginRef("ui-ux-design"));
    act(() => result.current.addPluginRef("second-plugin"));

    expect(result.current.selectedPluginRefIds).toEqual(["ui-ux-design", "second-plugin"]);
  });

  it("de-duplicates: pinning an already-pinned ref is a no-op, not a second chip", () => {
    const { result } = renderHook(() => useSelectedAgentPlugins());

    act(() => result.current.addPluginRef("ui-ux-design"));
    act(() => result.current.addPluginRef("ui-ux-design"));

    expect(result.current.selectedPluginRefIds).toEqual(["ui-ux-design"]);
  });

  it("removes a pinned ref by id", () => {
    const { result } = renderHook(() => useSelectedAgentPlugins());

    act(() => result.current.addPluginRef("ui-ux-design"));
    act(() => result.current.addPluginRef("second-plugin"));
    act(() => result.current.removePluginRef("ui-ux-design"));

    expect(result.current.selectedPluginRefIds).toEqual(["second-plugin"]);
  });

  it("removing a ref that was never pinned is a no-op", () => {
    const { result } = renderHook(() => useSelectedAgentPlugins());

    act(() => result.current.removePluginRef("never-pinned"));

    expect(result.current.selectedPluginRefIds).toEqual([]);
  });
});

describe("useSelectedPluginChips", () => {
  it("labels a pinned ref from the projection when a matching capability exists", () => {
    const capability: TovuComposerCapability = {
      groupId: "agent-plugins",
      groupLabel: "Agent Plugins",
      item: { id: "ui-ux-design", label: "UI/UX Design" },
      pluginRefId: "ui-ux-design",
    };
    const composerCapabilities = {
      ...emptyComposerCapabilityProjection(),
      byPluginRefId: new Map([["ui-ux-design", capability]]),
    };

    const { result } = renderHook(() => useSelectedPluginChips(["ui-ux-design"], composerCapabilities));

    expect(result.current).toEqual([{ pluginRefId: "ui-ux-design", label: "UI/UX Design" }]);
  });

  it("falls back to the bare id when the projection has no matching capability — e.g. a stale chip from a catalog that changed shape", () => {
    const { result } = renderHook(() =>
      useSelectedPluginChips(["stale-ref"], emptyComposerCapabilityProjection()),
    );

    expect(result.current).toEqual([{ pluginRefId: "stale-ref", label: "stale-ref" }]);
  });
});

describe("useWorkingDirectoryAccess", () => {
  it("returns undefined on a browser with no native directory picker — jsdom never implements showDirectoryPicker", () => {
    const { result } = renderHook(() => useWorkingDirectoryAccess());

    expect(result.current).toBeUndefined();
  });
});

describe("useWorkingDirectoryAccessSeam", () => {
  it("defaults to the real useWorkingDirectoryAccess when no override is given", () => {
    const { result } = renderHook(() => useWorkingDirectoryAccessSeam(undefined));

    expect(result.current).toBeUndefined();
  });

  it("uses the override instead of the real hook when one is given", () => {
    const fakeAccess = { pickWorkingDirectory: vi.fn() } as never;

    const { result } = renderHook(() => useWorkingDirectoryAccessSeam(() => fakeAccess));

    expect(result.current).toBe(fakeAccess);
  });
});

describe("useChatsSeam", () => {
  it("defaults to the real useWiredAssistantChats when no override is given", () => {
    const fakeChats = { activeId: null } as unknown as UseAssistantChats;
    mockUseWiredAssistantChats.mockReturnValue(fakeChats);

    const { result } = renderHook(() => useChatsSeam(undefined));

    expect(result.current).toBe(fakeChats);
    expect(mockUseWiredAssistantChats).toHaveBeenCalled();
  });

  it("uses the override instead of the real hook when one is given", () => {
    const fakeChats = { activeId: "conv-1" } as unknown as UseAssistantChats;
    const override = vi.fn(() => fakeChats);

    const { result } = renderHook(() => useChatsSeam(override));

    expect(result.current).toBe(fakeChats);
    expect(mockUseWiredAssistantChats).not.toHaveBeenCalled();
  });
});

describe("useFolderDropBridge", () => {
  it("publishes handleDropCapture to onReady once it is available", () => {
    const handleDropCapture = vi.fn();
    mockUseFolderDrop.mockReturnValue({ notice: null, dismiss: vi.fn(), retry: vi.fn(), handleDropCapture });
    const onReady = vi.fn();
    const composerHandle = { current: null };

    renderHook(() => useFolderDropBridge({ composerHandle }, onReady));

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledWith(handleDropCapture);
  });

  it("does not throw when no onReady callback is given (a test rendering AssistantDock without one)", () => {
    mockUseFolderDrop.mockReturnValue({ notice: null, dismiss: vi.fn(), retry: vi.fn(), handleDropCapture: vi.fn() });
    const composerHandle = { current: null };

    expect(() => renderHook(() => useFolderDropBridge({ composerHandle }, undefined))).not.toThrow();
  });

  it("re-publishes only when handleDropCapture's identity actually changes", () => {
    const handleDropCaptureA = vi.fn();
    const handleDropCaptureB = vi.fn();
    mockUseFolderDrop.mockReturnValue({ notice: null, dismiss: vi.fn(), retry: vi.fn(), handleDropCapture: handleDropCaptureA });
    const onReady = vi.fn();
    const composerHandle = { current: null };

    const { rerender } = renderHook(() => useFolderDropBridge({ composerHandle }, onReady));
    expect(onReady).toHaveBeenCalledTimes(1);

    // Same identity on a re-render — no redundant re-publish.
    rerender();
    expect(onReady).toHaveBeenCalledTimes(1);

    mockUseFolderDrop.mockReturnValue({ notice: null, dismiss: vi.fn(), retry: vi.fn(), handleDropCapture: handleDropCaptureB });
    rerender();
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(onReady).toHaveBeenLastCalledWith(handleDropCaptureB);
  });

  it("returns useFolderDrop's own result unchanged, for AssistantDock.tsx to render notice/dismiss/retry from", () => {
    const fake = { notice: { kind: "confirmation", path: "/x", replacedPreviousPath: null }, dismiss: vi.fn(), retry: vi.fn(), handleDropCapture: vi.fn() };
    mockUseFolderDrop.mockReturnValue(fake);
    const composerHandle = { current: null };

    const { result } = renderHook(() => useFolderDropBridge({ composerHandle }, undefined));

    expect(result.current).toBe(fake);
  });
});
