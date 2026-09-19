import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionConfig } from "@jini-ai/ui";
import type { FrontendSessionBridge } from "@jini-ai/chat/react";

/**
 * @file `AssistantDock`'s own prop-wiring to `ChatPane` through the DOM — the render layer only.
 * The three extracted hooks (`useExecutionConfig`, `useByokRuntime`, `useLocalCliSelection`) and the
 * two pure helpers (`shouldPublishOnMessagesChange`, `resolveRunContext`) they used to share this
 * file with moved to `AssistantDock.hooks.unit.test.tsx` (2026-08-06, mirroring the source split
 * into `AssistantDock.tsx` + `AssistantDock.hooks.tsx`) — see that file for their coverage.
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
    selection?: { agentId: string; model?: string };
    onSelectionChange?: (selection: { agentId: string; model?: string }) => void;
    runContext?: () => { model?: string; frontendBindToken?: string };
    conversationId?: string;
    initialMessages?: unknown[];
    composerSlots?: { discoveryGroups?: readonly unknown[] };
    attachmentAccept?: string;
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
        <button
          type="button"
          onClick={() => props.onSelectionChange?.({ agentId: "claude", model: "claude-sonnet-5" })}
        >
          pick-local-model
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
  // Module-scope value, not a function: `AssistantDock.tsx` reads it at import time for its
  // `registerExtEventRenderer(MCP_UI_EXT_EVENT_NAME, ...)` call, so omitting it from this factory
  // made the whole file throw on import ("No MCP_UI_EXT_EVENT_NAME export is defined") rather than
  // fail a single test. Kept as the literal the package exports rather than a placeholder, since
  // the registration key is the value under test if this ever grows an assertion.
  MCP_UI_EXT_EVENT_NAME: "mcp-ui",
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

// `publishSettingsRefresh` stays a spy (this file's own concern — a run-completion side effect);
// `subscribeToSettingsRefresh` keeps its real, side-effect-free in-memory pub/sub implementation
// (`importOriginal`) rather than being stubbed away, since `useAdminLocale()` (now called by
// `AssistantDock` for the dock's own translated chrome) subscribes through it on mount.
vi.mock("../../lib/settings-refresh-bus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/settings-refresh-bus")>();
  return { ...actual, publishSettingsRefresh: vi.fn() };
});

vi.mock("../../lib/router", () => ({ navigate: vi.fn() }));

import { AssistantDock } from "../AssistantDock/AssistantDock";
import {
  DEFAULT_EXECUTION_CONFIG,
  createExecutionPort,
  loadAdminExecutionCredential,
  loadExecutionConfig,
  saveExecutionConfig,
} from "../../lib/execution-settings";
import type { UseAssistantChats } from "../../hooks/use-assistant-chats.hooks";
import { navigate } from "../../lib/router";
import type { UseByokRuntime, UseExecutionConfig, UseLocalCliSelection } from "../AssistantDock/hooks/AssistantDock.hooks";
import { registerExtEventRenderer, type ExtEventRenderProps } from "@jini-ai/chat/react";
import { OverflowAwareMcpUiSurfaceCard } from "../AssistantDock/OverflowAwareMcpUiSurfaceCard";
import { RoutedA2uiSurfaceCard } from "../AssistantDock/RoutedA2uiSurfaceCard";
import { SlowRunNoticeCard } from "../AssistantDock/SlowRunNoticeCard";

const mockLoadExecutionConfig = vi.mocked(loadExecutionConfig);
const mockSaveExecutionConfig = vi.mocked(saveExecutionConfig);
const mockCreateExecutionPort = vi.mocked(createExecutionPort);
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
    persistUserTurn: vi.fn(async () => undefined),
    ensureConversationId: vi.fn(async () => null),
    ...overrides,
  };
}

/**
 * "Impossible" builders for the MSG-01 injection block below — each returns a value the REAL hook
 * could never produce given this suite's default mocks (`mockLoadExecutionConfig` resolves
 * `DEFAULT_EXECUTION_CONFIG`, `mockLoadAdminExecutionCredential` resolves "not stored"), so a test
 * asserting on one of these values can only pass if the injected fake is what actually rendered.
 */
function fakeExecutionConfig(overrides: Partial<UseExecutionConfig> = {}): UseExecutionConfig {
  const executionConfig = byokConfig({ apiKey: "impossible-key" });
  return {
    executionConfig,
    executionConfigRef: { current: executionConfig },
    setExecutionConfig: vi.fn(),
    handleExecutionModeChange: vi.fn(),
    hasStoredAdminKey: true,
    configLoaded: true,
    ...overrides,
  };
}

function fakeByokRuntime(overrides: Partial<UseByokRuntime> = {}): UseByokRuntime {
  return {
    byokRuntime: {
      providerLabel: "Impossible Provider",
      iconId: "impossible-icon",
      model: "impossible-model",
      models: [{ id: "impossible-model", label: "Impossible Model" }],
    },
    handleByokModelChange: vi.fn(),
    ...overrides,
  };
}

function fakeLocalCliSelection(overrides: Partial<UseLocalCliSelection> = {}): UseLocalCliSelection {
  return {
    localCliSelection: { agentId: "impossible-agent", model: "impossible-model" },
    handleLocalCliSelectionChange: vi.fn(),
    ...overrides,
  };
}

/**
 * A page-control bridge whose `bridgeAccess` is a plain spy object — no real `EventSource`, no real
 * daemon. Exercises exactly what `AssistantDock` is responsible for: forwarding this object onto
 * `<ChatPane agentControl={...}>` so `@jini-ai/chat/react`'s own `useChatPaneAgentControl` can call
 * `subscribe` on it. See the regression test below for why this specific wiring is load-bearing.
 */
function fakeAgentBridge(overrides: Partial<FrontendSessionBridge> = {}): FrontendSessionBridge {
  return {
    bridgeAccess: { subscribe: vi.fn(() => vi.fn()), respondSuccess: vi.fn(), respondError: vi.fn() },
    ready: Promise.resolve({ sessionId: "session-1", bindToken: "token-1" }),
    bindToken: () => "token-1",
    close: vi.fn(),
    ...overrides,
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockLoadExecutionConfig.mockReset().mockResolvedValue(DEFAULT_EXECUTION_CONFIG);
  // Resolves to `readonly string[]` (the changed ledger keys), not `void` — `undefined` does not
  // typecheck. No caller reads the value; `[]` is the neutral choice.
  mockSaveExecutionConfig.mockReset().mockResolvedValue([]);
  mockCreateExecutionPort.mockReset().mockReturnValue({ listModels: vi.fn().mockResolvedValue([]) } as never);
  mockLoadAdminExecutionCredential.mockReset().mockResolvedValue(storedCredential(false));
  vi.mocked(navigate).mockReset();
  chatPaneSpy.mockReset();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("AssistantDock", () => {
  it("renders ChatPane as the direct child, with no extra wrapper element around it", () => {
    const { container } = render(<AssistantDock useChats={() => fakeChats()} />);
    // JiniChatProvider is a passthrough and ChatPane is mocked to a bare div — a wrapper
    // reintroduced around it (the `display:contents` regression this file's dispatch calls out)
    // would show up here as an extra element between `container` and the chat-pane div.
    expect(container.firstElementChild).toBe(screen.getByTestId("chat-pane"));
  });

  /**
   * 2026-08-31 regression coverage for "a `.md` file cannot be added as a chat attachment". The
   * composer's file picker was driven entirely by an `attachmentAccept="image/*"` prop, so a
   * markdown file was greyed out in the OS dialog and there was no way to attach one at all. The
   * upload path itself never had this restriction — `@jini-ai/http-kit`'s `attachments.ts` sniffs
   * `detectAttachmentKind` from the leading bytes and stores `'image' | 'file'` regardless of
   * what the picker offered — and `accept` never applies to drag-and-drop in any browser either,
   * so the filter was pure friction on the cooperative path with no matching restriction on the
   * bypass. The fix is to pass no `attachmentAccept` at all rather than grow the allowlist, so the
   * property this test protects is "no file type is excluded from the picker" — not any particular
   * set of extensions, which would just be tomorrow's version of the same bug for the next
   * extension nobody thought to add.
   */
  it("applies no type filter to the composer's file picker, so no file type is excluded", () => {
    render(<AssistantDock useChats={() => fakeChats()} />);

    const props = chatPaneSpy.mock.calls.at(-1)?.[0] as { attachmentAccept?: string };

    expect(props.attachmentAccept).toBeUndefined();
  });

  /**
   * Starts empty and populates once `projectComposerCapabilities` resolves — the composer
   * discovery catalog is now an async projection (debate 2, "Composer slash commands"), replacing
   * the pre-2026-08-12 synchronous `TOVU_COMPOSER_DISCOVERY_GROUPS` import. `waitFor` is what
   * proves the empty-then-populated sequence rather than assuming a same-tick synchronous result.
   */
  it("injects the source-backed plugin, Agent Plugin, skill, and MCP catalog into ChatPane, asynchronously", async () => {
    render(<AssistantDock useChats={() => fakeChats()} />);

    const initialProps = chatPaneSpy.mock.calls.at(-1)?.[0] as {
      composerSlots: { discoveryGroups: readonly unknown[] };
    };
    expect(initialProps.composerSlots.discoveryGroups).toEqual([]);

    await waitFor(() => {
      const props = chatPaneSpy.mock.calls.at(-1)?.[0] as {
        composerSlots: { discoveryGroups: Array<{ id: string; items: Array<{ id: string; kind: string }> }> };
      };
      expect(props.composerSlots.discoveryGroups.map((group) => group.id)).toEqual([
        "regular-plugins",
        "agent-plugins",
        "skills",
        "mcp",
        "tools",
      ]);
    });

    const props = chatPaneSpy.mock.calls.at(-1)?.[0] as {
      composerSlots: { discoveryGroups: Array<{ id: string; items: Array<{ id: string; kind: string }> }> };
    };
    expect(props.composerSlots.discoveryGroups.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "regular-plugin:word-count",
      "agent-plugin:ui-ux-design",
      "skill:ui-ux-design",
      "mcp:settings",
      "tool:content-search",
    ]);
    expect(props.composerSlots.discoveryGroups.flatMap((group) => group.items.map((item) => item.kind))).toEqual([
      "plugin",
      "agent-plugin",
      "skill",
      "mcp",
      "tool",
    ]);
  });

  it("routes the truthful MCP navigation command to existing External MCP settings", async () => {
    render(<AssistantDock useChats={() => fakeChats()} />);
    await waitFor(() => {
      const props = chatPaneSpy.mock.calls.at(-1)?.[0] as {
        composerSlots: { discoveryGroups: Array<{ items: unknown[] }> };
      };
      expect(props.composerSlots.discoveryGroups.length).toBeGreaterThan(0);
    });

    const props = chatPaneSpy.mock.calls.at(-1)?.[0] as {
      composerSlots: {
        discoveryGroups: Array<{ items: Array<{ id: string }> }>;
        onDiscoverySelect: (selection: {
          item: { id: string };
          source: "slash";
        }) => void | Promise<{ draft?: string } | void>;
      };
    };
    const mcpItem = props.composerSlots.discoveryGroups.flatMap((group) => group.items)
      .find((item) => item.id === "mcp:settings");

    expect(mcpItem).toEqual(expect.objectContaining({ id: "mcp:settings" }));
    expect(mcpItem).not.toHaveProperty("argumentHint");
    await props.composerSlots.onDiscoverySelect({ item: mcpItem!, source: "slash" });
    expect(navigate).toHaveBeenCalledWith("/settings?tab=external-mcp");
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

  it("a Local CLI model pick round-trips into the next run's context — the dropdown actually works", async () => {
    const user = userEvent.setup();
    render(<AssistantDock useChats={() => fakeChats()} />);
    await waitFor(() => expect(chatPaneSpy).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "pick-local-model" }));

    await waitFor(() => {
      const lastProps = chatPaneSpy.mock.calls.at(-1)?.[0] as { runContext: () => { model?: string } };
      expect(lastProps.runContext()).toEqual(expect.objectContaining({ model: "claude-sonnet-5" }));
    });
  });

  it("a Local CLI model pick from the rendered picker also persists through saveExecutionConfig", async () => {
    const user = userEvent.setup();
    render(<AssistantDock useChats={() => fakeChats()} />);
    await waitFor(() => expect(chatPaneSpy).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "pick-local-model" }));

    await waitFor(() =>
      expect(mockSaveExecutionConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          localCli: expect.objectContaining({ agentId: "claude", modelByAgentId: { claude: "claude-sonnet-5" } }),
        }),
        expect.anything(),
      ),
    );
  });

  it("hydrates ChatPane's controlled selection from the ledger once the config load resolves — survives a reload", async () => {
    mockLoadExecutionConfig.mockResolvedValue(
      localCliConfig({ agentId: "codex", modelByAgentId: { codex: "o3" } }),
    );
    render(<AssistantDock useChats={() => fakeChats()} />);

    // Before the ledger settles: the dock still shows the hardcoded starting point, not a blank
    // or undefined selection — matches `useLocalCliSelection`'s own "no synthetic loading gate"
    // design (a fully controlled prop, not `initialSelection`).
    expect(chatPaneSpy).toHaveBeenCalledWith(expect.objectContaining({ selection: { agentId: "claude" } }));

    await waitFor(() =>
      expect(chatPaneSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({ selection: { agentId: "codex", model: "o3" } }),
      ),
    );
  });
});

/**
 * `useChats` was `AssistantDockProps`' original injectable seam, and the in-repo precedent MSG-01
 * (2026-08-06, owner directive) named explicitly when it made the same seam mandatory for
 * `useExecutionConfig`/`useByokRuntime`/`useLocalCliSelection` below — see each of their own prop
 * doc comments on `AssistantDockProps`. Every test above already renders against
 * `useChats={() => fakeChats()}` rather than the real `useWiredAssistantChats`, which is what makes
 * every one of them run with no `fetch` stubbing at all — this block just makes that fact explicit
 * and asserts on it directly, the way Jini's `ConfirmDialog.test.tsx`'s own
 * `describe('ConfirmDialog dialog-hook injection')` block does for its `useDialog` seam. The three
 * blocks that follow do the same for the three newer seams.
 */
describe("AssistantDock useChats injection", () => {
  it("renders ChatPane wired to the injected fake's own conversation state, not a hardcoded value", async () => {
    render(
      <AssistantDock
        useChats={() =>
          fakeChats({
            activeId: "conv-42",
            initialMessages: [{ id: "m1", role: "user", content: [] } as never],
          })
        }
      />,
    );

    await waitFor(() =>
      expect(chatPaneSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          conversationId: "conv-42",
          initialMessages: [{ id: "m1", role: "user", content: [] }],
        }),
      ),
    );
  });
});

/**
 * MSG-01 (2026-08-06, owner directive): `useExecutionConfig`, `useByokRuntime`, and
 * `useLocalCliSelection` each got the same injectable-seam treatment as `useChats` above. Each
 * fake below (`fakeExecutionConfig`/`fakeByokRuntime`/`fakeLocalCliSelection`) returns a value the
 * REAL hook could never produce given this suite's default mocks — see that comment for exactly
 * why — so each assertion can only pass if the injected fake is what actually rendered, not the
 * real hook silently winning back in.
 */
describe("AssistantDock useExecutionConfig injection", () => {
  it("wires ChatPane off the injected fake's config, not the real (mocked) load", () => {
    render(<AssistantDock useChats={() => fakeChats()} useExecutionConfig={() => fakeExecutionConfig()} />);

    // Synchronous: the fake returns already-settled state directly, with no load effect to await —
    // unlike the real hook, which starts at DEFAULT_EXECUTION_CONFIG (mode "local-cli") and only
    // reaches "byok" after `loadExecutionConfig` resolves.
    expect(chatPaneSpy).toHaveBeenCalledWith(
      expect.objectContaining({ executionMode: "api", apiModeAvailable: true }),
    );
  });
});

describe("AssistantDock useByokRuntime injection", () => {
  it("wires ChatPane off the injected fake's byokRuntime, not real model discovery", () => {
    render(<AssistantDock useChats={() => fakeChats()} useByokRuntime={() => fakeByokRuntime()} />);

    // The real hook's `byokRuntime.providerLabel` is resolved from `resolveSelectedPreset` against
    // `DEFAULT_EXECUTION_CONFIG.byok` (mode "local-cli", not byok) and can never be the literal
    // string "Impossible Provider" this fake invents.
    expect(chatPaneSpy).toHaveBeenCalledWith(
      expect.objectContaining({ byokRuntime: expect.objectContaining({ providerLabel: "Impossible Provider" }) }),
    );
  });
});

describe("AssistantDock useLocalCliSelection injection", () => {
  it("wires ChatPane off the injected fake's selection, not the hardcoded { agentId: 'claude' } default", () => {
    render(<AssistantDock useChats={() => fakeChats()} useLocalCliSelection={() => fakeLocalCliSelection()} />);

    // The real hook always starts at `{ agentId: "claude" }` (see its own doc) — "impossible-agent"
    // is not a value it can produce, hydrated or not.
    expect(chatPaneSpy).toHaveBeenCalledWith(
      expect.objectContaining({ selection: { agentId: "impossible-agent", model: "impossible-model" } }),
    );
  });
});

/**
 * The four blocks below cover the seams the 2026-08-18 inline-hook-extraction pass added
 * (`useAssistantTransport`, `useAttachmentUploader`, `useRuntimeAccess`, `useAdminLocale`) — same
 * "prove the real hook is not hardcoded" pattern as the four blocks above, extended to the newer
 * seams rather than leaving them component-injection-proof-free just because they were introduced
 * later.
 */
describe("AssistantDock useAssistantTransport injection", () => {
  it("wires ChatPane's transport prop off the injected fake, not a freshly built real transport", () => {
    const fakeTransport = { startRun: vi.fn() } as never;

    render(<AssistantDock useChats={() => fakeChats()} useAssistantTransport={() => fakeTransport} />);

    expect(chatPaneSpy).toHaveBeenCalledWith(expect.objectContaining({ transport: fakeTransport }));
  });
});

describe("AssistantDock useAttachmentUploader injection", () => {
  it("wires ChatPane's uploadAttachments prop off the injected fake, not the real daemon uploader", () => {
    const fakeUploader = vi.fn();

    render(<AssistantDock useChats={() => fakeChats()} useAttachmentUploader={() => fakeUploader} />);

    expect(chatPaneSpy).toHaveBeenCalledWith(expect.objectContaining({ uploadAttachments: fakeUploader }));
  });
});

describe("AssistantDock useAttachmentValidator injection", () => {
  it("keeps ChatPane's validateAttachments prop inert while the registry package is 0.3.7", () => {
    const fakeValidator = vi.fn();

    render(<AssistantDock useChats={() => fakeChats()} useAttachmentValidator={() => fakeValidator} />);

    expect(chatPaneSpy.mock.lastCall?.[0]).not.toHaveProperty("validateAttachments");
  });
});

describe("AssistantDock useRuntimeAccess injection", () => {
  it("wires ChatPane's runtimeAccess prop off the injected fake, not the real fetch-backed one", () => {
    const fakeRuntimeAccess = {
      listAgents: vi.fn().mockResolvedValue([]),
      rescanAgents: vi.fn().mockResolvedValue([]),
      daemonOnline: vi.fn().mockResolvedValue(true),
    };

    render(<AssistantDock useChats={() => fakeChats()} useRuntimeAccess={() => fakeRuntimeAccess} />);

    expect(chatPaneSpy).toHaveBeenCalledWith(expect.objectContaining({ runtimeAccess: fakeRuntimeAccess }));
  });
});

describe("AssistantDock useAdminLocale injection", () => {
  it("wires ChatPane's translated chrome off the injected fake's locale, not the real (unmocked) load", () => {
    render(<AssistantDock useChats={() => fakeChats()} useAdminLocale={() => "es"} />);

    // The real `useWiredAdminLocale` is NOT mocked in this file — it makes a genuine, unstubbed
    // fetch attempt that fails in jsdom and swallows to `DEFAULT_LOCALE` ("en"), which leaves
    // "Tovu assistant" unchanged (no "en" entry in `ASSISTANT_DOCK_DICT`). "Asistente de Tovu" is
    // reachable ONLY through the injected "es" override.
    expect(chatPaneSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Asistente de Tovu" }));
  });
});

/**
 * Regression coverage for the `chat.get_state` hang (production `agent_tool_attempts` rows:
 * `requested` -> 30.008s later -> `timed-out`, run `4ea23482-c7de-4402-8985-1b83470f4ff8`).
 *
 * Root cause, traced end to end: `useAgentPageBridge` (`App.hooks.tsx`) builds the page-control
 * bridge via `createFrontendSessionBridge({ pageDriver, onError })` with no `executors`. Jini's
 * `createFrontendSessionBridge` (`frontend-session-bridge.ts`) claims ALL seven `CHAT_CAPABILITIES`
 * ids unconditionally in its `attached` handshake (unlike `page.*`, gated behind `pageDriver`) — so
 * the daemon's `FrontendSessionRegistry` believes this tab can serve `chat.get_state` and delivers
 * the invocation to it over SSE. But nothing in Tovu ever called `bridgeAccess.subscribe` — this
 * component never passed a `ChatPane agentControl` prop at all — so the browser's own dispatcher
 * (`if (capabilityId.startsWith('chat.')) { for (const listener of chatListeners) listener(action); }`)
 * loops over an EMPTY listener set and silently drops the invocation: no `respondSuccess`, no
 * `respondError`, nothing. The daemon-side `FrontendSessionRegistry.invoke` promise is then never
 * settled, and the only thing that ever ends it is `ToolExecutor`'s own 30s `descriptor.timeoutMs`
 * (`DEFAULT_FRONTEND_CAPABILITY_TIMEOUT_MS`) — which reports the terminal status as `'timed-out'`
 * regardless of the real reason, exactly matching the production symptom.
 *
 * `chat.*` capabilities are claimed unconditionally by design (unlike `page.*`), so the fix has to
 * live on the consuming side: wiring `<ChatPane agentControl={{ enabled: true, bridgeAccess }}>` is
 * what makes `@jini-ai/chat/react`'s own `useChatPaneAgentControl` call `bridgeAccess.subscribe(...)`
 * and actually answer `chat.*` invocations — see that hook's own module doc
 * (`packages/chat/src/react/features/chat-pane/hooks/useChatPaneAgentControl.hooks.ts` in Jini) for
 * the handler side of this contract, which was already correct and unchanged by this fix.
 */
describe("AssistantDock agentControl wiring (chat.* frontend-control bridge)", () => {
  it("wires ChatPane's agentControl to the page bridge, so a claimed chat.* invocation reaches a live listener instead of parking until the daemon's 30s timeout", () => {
    const agentBridge = fakeAgentBridge();

    render(<AssistantDock useChats={() => fakeChats()} agentBridge={agentBridge} />);

    // Asserts the wiring directly rather than waiting out a real 30s daemon timeout: the cause of
    // the hang IS "nothing ever calls `bridgeAccess.subscribe`", so proving `subscribe` is reachable
    // through `AssistantDock`'s own `agentControl` prop is the precise, fast regression check for it.
    expect(chatPaneSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        agentControl: expect.objectContaining({ enabled: true, bridgeAccess: agentBridge.bridgeAccess }),
      }),
    );
  });

  it("does not crash and does not falsely claim agentControl when no page bridge has attached yet (agentBridge is null)", () => {
    render(<AssistantDock useChats={() => fakeChats()} agentBridge={null} />);

    const props = chatPaneSpy.mock.calls.at(-1)?.[0] as { agentControl?: { bridgeAccess?: unknown } };
    expect(props.agentControl?.bridgeAccess).toBeUndefined();
  });
});

/**
 * Coverage-gap-fill (2026-09-05). `registerExtEventRenderer` is mocked (`vi.fn()`) at the top of
 * this file — a real MCP-UI runtime is what would normally invoke the registered renderer, and this
 * file never runs one. That leaves the renderer callback itself (`AssistantDock.tsx`'s own
 * `registerExtEventRenderer(MCP_UI_EXT_EVENT_NAME, (props) => (...))`) captured by the mock but
 * never called. The registration runs once at module import time (this file's own `import {
 * AssistantDock } from "../AssistantDock/AssistantDock"` already triggered it), so the callback is
 * captured here and invoked directly with a fabricated `props` object — the same direct-invocation
 * treatment this repo gives a callback that only a framework/runtime, not a test, would otherwise
 * call.
 */
describe("AssistantDock — ext event renderer registrations", () => {
  /**
   * A complete `ExtEventRenderProps` plus whatever extra props one assertion wants to watch flow
   * through. Each registered renderer spreads its whole props object onto the card it renders,
   * which is the pass-through property these tests pin. `extra` goes in FIRST so it can never
   * clobber the five fields the contract actually declares, and `runId` — a real field of that
   * contract, not an extra — is its own parameter rather than a member of `extra`.
   */
  function extEventProps(extra: Record<string, unknown>, runId?: string): ExtEventRenderProps {
    return { ...extra, name: "ext", events: [], runStreaming: false, runSucceeded: true, runId };
  }

  /**
   * Narrows a renderer's declared `ReactNode` return down to the element shape these assertions
   * read. `isValidElement` is a real runtime check, not a cast: a renderer that returned anything
   * else fails here loudly instead of quietly satisfying `.type`/`.props`.
   */
  function renderedElement(node: ReactNode): { type: unknown; props: Record<string, unknown> } {
    if (!isValidElement<Record<string, unknown>>(node)) {
      throw new Error("the registered ext-event renderer did not return a React element");
    }
    return { type: node.type, props: node.props };
  }

  it("registers a renderer under MCP_UI_EXT_EVENT_NAME that renders OverflowAwareMcpUiSurfaceCard with every prop passed through, plus a real onToolCall", () => {
    const mockedRegister = vi.mocked(registerExtEventRenderer);
    const [, renderer] = mockedRegister.mock.calls[0];
    expect(renderer).toBeInstanceOf(Function);

    const element = renderedElement(renderer(extEventProps({ toolCallId: "tc-1", someProp: "value" })));

    expect(element.type).toBe(OverflowAwareMcpUiSurfaceCard);
    expect(element.props).toMatchObject({ toolCallId: "tc-1", someProp: "value" });
    expect(typeof element.props.onToolCall).toBe("function");
  });

  /**
   * Regression coverage (2026-09-05 Gemini audit finding 33, upgraded to confirmed live defect by
   * tracing into Jini's `useMcpUiHost.ts`). This renderer is re-invoked by `@jini-ai/chat/react` on
   * every transcript render of an active `mcp-ui` event, not just once at registration time. Before
   * the fix, `sandboxProxyUrl={buildAssistantMcpUiSandboxProxyUrl(globalThis.location.origin)}` ran
   * INSIDE the render-function body, so every call minted a fresh `new URL(...)` — same string value,
   * new object identity. That reference instability flows straight through
   * `OverflowAwareMcpUiSurfaceCard` -> `McpUiSurfaceCard` -> `McpUiHost` into `useMcpUiHost`'s own
   * `rendererProps = useMemo(..., [html, sandboxProxyUrl, ...])`: a `URL` that is a new object on
   * every call defeats that memo every render even when `html` (the real View content) is unchanged,
   * discarding the memoization Jini's hook is there to provide. The fix hoists the URL to a
   * module-scope constant (this file's existing pattern for `mcpUiToolCaller`/`postA2uiAction`), so
   * it is computed once and every renderer invocation reuses the same object. `toBe` (reference
   * identity), not a value/string comparison, is the property under test — the URL's string value is
   * identical either way, which is exactly why this bug can hide behind a weaker assertion.
   */
  it("passes the SAME sandboxProxyUrl object identity across repeated renderer invocations, not a fresh URL each time", () => {
    const mockedRegister = vi.mocked(registerExtEventRenderer);
    const [, renderer] = mockedRegister.mock.calls[0];

    const first = renderedElement(renderer(extEventProps({ toolCallId: "tc-1" })));
    const second = renderedElement(renderer(extEventProps({ toolCallId: "tc-2" })));

    expect(first.props.sandboxProxyUrl).toBe(second.props.sandboxProxyUrl);
  });

  /**
   * Coverage-gap-fill (2026-09-05). Same shape as the MCP-UI registration above, for the other two
   * module-scope-once `registerExtEventRenderer` calls in `AssistantDock.tsx`
   * (`"a2ui"` -> `RoutedA2uiSurfaceCard`, `"slow_running"` -> `SlowRunNoticeCard`) — neither renderer
   * callback had ever been invoked, since `registerExtEventRenderer` itself is mocked in this file.
   */
  it("registers a renderer under 'a2ui' that renders RoutedA2uiSurfaceCard with every prop passed through, plus a real onAgentAction", () => {
    const mockedRegister = vi.mocked(registerExtEventRenderer);
    const [eventName, renderer] = mockedRegister.mock.calls[1];
    expect(eventName).toBe("a2ui");

    const element = renderedElement(renderer(extEventProps({ actionId: "a-1", someProp: "value" })));

    expect(element.type).toBe(RoutedA2uiSurfaceCard);
    expect(element.props).toMatchObject({ actionId: "a-1", someProp: "value" });
    expect(typeof element.props.onAgentAction).toBe("function");
  });

  it("registers a renderer under 'slow_running' that renders SlowRunNoticeCard with every prop passed through", () => {
    const mockedRegister = vi.mocked(registerExtEventRenderer);
    const [eventName, renderer] = mockedRegister.mock.calls[2];
    expect(eventName).toBe("slow_running");

    const element = renderedElement(renderer(extEventProps({ someProp: "value" }, "r-1")));

    expect(element.type).toBe(SlowRunNoticeCard);
    expect(element.props).toMatchObject({ runId: "r-1", someProp: "value" });
  });
});

/**
 * Coverage-gap-fill (2026-09-05). Every test above uses `fakeChats()`'s default `conversations: []`
 * — `.find((c) => c.id === chats.activeId)`'s predicate is never invoked at all for an empty array
 * (`Array.prototype.find` skips the callback entirely), so the pane title's "look up the active
 * conversation's own title" path had never run; every prior assertion only exercised the `??
 * t("Tovu assistant")` fallback.
 */
describe("AssistantDock — pane title reads the active conversation's own title", () => {
  function conversation(overrides: Partial<UseAssistantChats["conversations"][number]> = {}): UseAssistantChats["conversations"][number] {
    return { id: "conv-1", title: "My chat", titleSource: "manual", messageCount: 1, createdAt: 0, updatedAt: 0, ...overrides };
  }

  /** `ChatPane` itself is mocked to a bare recorder that does not render its `header` prop (see
   *  this file's own `ChatPane` factory), so the title has to be read out of the captured prop and
   *  rendered separately, the same way this describe block's sibling tests read other captured
   *  props directly off `chatPaneSpy` rather than off the DOM. */
  function renderedHeader() {
    const props = chatPaneSpy.mock.calls.at(-1)?.[0] as { header: ReactNode };
    render(props.header);
  }

  it("shows the matching conversation's own title, not the default, when one is found", () => {
    render(
      <AssistantDock
        useChats={() => fakeChats({ conversations: [conversation({ id: "conv-1", title: "Find my posts" })], activeId: "conv-1" })}
      />,
    );
    renderedHeader();

    expect(screen.getByRole("heading", { level: 2, name: "Find my posts" })).toBeInTheDocument();
  });

  it("falls back to the default title when activeId matches no conversation in the list", () => {
    render(
      <AssistantDock
        useChats={() => fakeChats({ conversations: [conversation({ id: "conv-1", title: "Find my posts" })], activeId: "conv-does-not-exist" })}
      />,
    );
    renderedHeader();

    expect(screen.getByRole("heading", { level: 2, name: "Tovu assistant" })).toBeInTheDocument();
  });
});
