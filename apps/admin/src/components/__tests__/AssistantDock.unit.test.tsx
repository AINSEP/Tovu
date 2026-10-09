import { act, fireEvent, render as renderWithoutProvider, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidElement, type ComponentProps, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionConfig } from "@jini-ai/ui";
import type { FrontendSessionBridge } from "@jini-ai/chat/react";
import { setBrowserAgentEnabled } from "../../features/webmcp/browser-agent-settings.hooks";
import { useTovuExecutionPolicy } from "../../hooks/use-tovu-execution-policy.hooks";

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

const chatPaneSpy = vi.fn();
const mcpUiFetch = vi.fn<typeof globalThis.fetch>();

// The caller captures its transport at composition time. Inject the fake before constructing it
// while retaining the real package's request construction and response handling.
// The typed-answer poster also binds fetch at module scope. Keeping the whole Jini barrel real
// preserves createAssistantChatsClient, MCP_UI_EXT_EVENT_NAME and mcpUiSurfaceSlotKey: omitting
// those module-scope exports from a mock made entire suites throw before running any tests.
vi.stubGlobal("fetch", mcpUiFetch);
const { AssistantDock: RealAssistantDock } = await import("../AssistantDock/AssistantDock");
vi.unstubAllGlobals();

function PaneRecorder(props: ComponentProps<typeof RealChatPane>) {
  chatPaneSpy(props);
  return (
    <section className="jini-chat-pane" data-testid="chat-pane">
      <button type="button" onClick={() => props.onExecutionModeChange?.("api")}>switch-to-api</button>
      <button type="button" onClick={() => props.onByokModelChange?.("gpt-5")}>pick-model</button>
      <button type="button" onClick={() => props.onSelectionChange?.({ agentId: "claude", model: "claude-sonnet-5" })}>
        pick-local-model
      </button>
    </section>
  );
}

// Existing hook seams supply IO fakes. The settings bus and router stay real, so locale
// subscriptions still work and the navigation test observes the resulting browser URL.
// These picker-wiring tests need an available CLI. Inject desktop capability into the real policy
// so unknown deployment discovery cannot close the gate (owner 2026-10-07).
function AssistantDock(props: ComponentProps<typeof RealAssistantDock>) {
  return <RealAssistantDock ChatPane={PaneRecorder} useExecutionConfig={useTestExecutionConfig}
    useExecutionPolicy={(input) => useTovuExecutionPolicy(input, { desktop: true })}
    useByokRuntime={useTestByokRuntime} useLocalCliSelection={useTestLocalCliSelection} {...props} />;
}

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { writeAgentsSnapshot } from "../../lib/assistant-agents-snapshot";

/** Every render sits under the app's query-cache provider, as `main.tsx` mounts the real dock:
 *  `useRuntimeAccess`/`useAgentsPlaceholder` read the agents list through that cache. */
function render(ui: ReactNode) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
}
import {
  DEFAULT_EXECUTION_CONFIG,
  createExecutionPort,
  loadAdminExecutionCredential,
  loadExecutionConfig,
  saveExecutionConfig,
} from "../../lib/execution-settings";
import type { UseAssistantChats } from "../../hooks/use-assistant-chats.hooks";
import { useByokRuntime, useExecutionConfig, useLocalCliSelection, type UseByokRuntime, type UseExecutionConfig, type UseLocalCliSelection } from "../AssistantDock/hooks/AssistantDock.hooks";
import { ChatPane as RealChatPane, MCP_UI_EXT_EVENT_NAME, getExtEventRenderer, type ExtEventRenderProps } from "@jini-ai/chat/react";
import { OverflowAwareMcpUiSurfaceCard } from "../AssistantDock/OverflowAwareMcpUiSurfaceCard";
import { RoutedA2uiSurfaceCard } from "../AssistantDock/RoutedA2uiSurfaceCard";
import { SlowRunNoticeCard } from "../AssistantDock/SlowRunNoticeCard";
import { zipFolderFiles } from "../InstallTabCard/folder-zip";

const mockLoadExecutionConfig = vi.fn<typeof loadExecutionConfig>();
const mockSaveExecutionConfig = vi.fn<typeof saveExecutionConfig>();
const mockCreateExecutionPort = vi.fn<typeof createExecutionPort>();
const mockLoadAdminExecutionCredential = vi.fn<typeof loadAdminExecutionCredential>();

const executionConfigPort = {
  loadConfig: mockLoadExecutionConfig,
  loadCredential: mockLoadAdminExecutionCredential,
  now: Date.now,
};
const persistWrite: typeof import("../AssistantDock/execution-config-write").persistExecutionConfigWrite = async (write) => {
  await mockSaveExecutionConfig(write.next, write.previous);
  return true;
};
function useTestExecutionConfig() {
  return useExecutionConfig({}, { port: executionConfigPort, persistWrite });
}
function useTestByokRuntime(input: Parameters<typeof useByokRuntime>[0]) {
  return useByokRuntime(input, { createPort: mockCreateExecutionPort, persistWrite });
}
function useTestLocalCliSelection(input: Parameters<typeof useLocalCliSelection>[0]) {
  return useLocalCliSelection(input, { persistWrite });
}

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
  window.history.replaceState(null, "", "/admin");
  chatPaneSpy.mockReset();
  mcpUiFetch.mockReset();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  vi.unstubAllGlobals();
});

describe("AssistantDock", () => {
  it("keeps ChatPane beneath the dock's explicitly targeted flex wrapper", () => {
    const { container } = render(<aside className="admin-chat-dock"><AssistantDock useChats={() => fakeChats()} /></aside>);
    // jsdom has no layout: protect the DOM relationship assistant.css targets instead.
    const dock = container.querySelector(".admin-chat-dock")!;
    expect(dock.firstElementChild).toHaveClass("admin-chat-dock-drop");
    expect(dock.querySelector(":scope > .admin-chat-dock-drop > .jini-chat-pane")).toBe(screen.getByTestId("chat-pane"));
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
  it("hands ChatPane a typed-answer deliverer that answers the pending assistant_ask_choice through the admin route", async () => {
    mcpUiFetch.mockResolvedValue(new Response(JSON.stringify({ delivered: true }), { status: 202 }));
    render(<AssistantDock useChats={() => fakeChats()} />);
    const deliver = chatPaneSpy.mock.calls.at(-1)?.[0].deliverTypedAnswer as ((input: { text: string }) => Promise<string>) & { toolName: string };

    // Without the tool id the pane would treat ANY pending card (a delete confirm) as this question.
    expect(deliver.toolName).toBe("assistant_ask_choice");
    await expect(deliver({ text: "deploy it" })).resolves.toBe("delivered");
    expect(mcpUiFetch).toHaveBeenCalledWith("/api/admin/v1/mcp-ui/tool-calls", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ toolName: "assistant_ask_choice", params: { __typedAnswer: "deploy it" } }),
    }));
  });

  it("hands ChatPane a mid-run deliverer that posts to the run's messages route, and draws what was sent inside the turn", async () => {
    mcpUiFetch.mockResolvedValue(new Response(JSON.stringify({ delivery: "delivered" }), { status: 202 }));
    render(<AssistantDock useChats={() => fakeChats()} />);
    const deliver = chatPaneSpy.mock.calls.at(-1)?.[0].deliverMidRunMessage as (input: { runId: string; text: string }) => Promise<string>;

    await expect(deliver({ runId: "run-1", text: "also fix the footer" })).resolves.toBe("delivered");
    expect(mcpUiFetch).toHaveBeenCalledWith("/api/runs/run-1/messages", expect.objectContaining({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ text: "also fix the footer" }),
    }));
    // The daemon records the sent message as a `user_message` run event; without a renderer it
    // would vanish from the transcript.
    expect(getExtEventRenderer({ name: "user_message" })).toBeDefined();
  });

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
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      skills: [{ toolId: "skill_ui_ux_design", name: "ui-ux-design", description: "Design interfaces.", enabled: true }],
    })));
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
        "mcp",
        "tools",
        "installed-skills",
      ]);
    });

    const props = chatPaneSpy.mock.calls.at(-1)?.[0] as {
      composerSlots: { discoveryGroups: Array<{ id: string; items: Array<{ id: string; kind: string }> }> };
    };
    expect(props.composerSlots.discoveryGroups.flatMap((group) => group.items.map((item) => item.id))).toEqual([
      "regular-plugin:word-count",
      "agent-plugin:ui-ux-design",
      "mcp:settings",
      "tool:content-search",
      "installed-skill:skill_ui_ux_design",
    ]);
    expect(props.composerSlots.discoveryGroups.flatMap((group) => group.items.map((item) => item.kind))).toEqual([
      "plugin",
      "agent-plugin",
      "mcp",
      "tool",
      "skill",
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
    expect(window.location.pathname).toBe("/admin/settings");
    expect(window.location.search).toBe("?tab=external-mcp");
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
    let resolveCredential!: (credential: ReturnType<typeof storedCredential>) => void;
    mockLoadAdminExecutionCredential.mockReturnValue(new Promise((resolve) => { resolveCredential = resolve; }));
    render(<AssistantDock useChats={() => fakeChats()} />);

    await waitFor(() =>
      expect(chatPaneSpy).toHaveBeenLastCalledWith(expect.objectContaining({ executionMode: "api", apiModeAvailable: false })),
    );
    await act(async () => { resolveCredential(storedCredential(false)); });
    expect(chatPaneSpy).toHaveBeenLastCalledWith(expect.objectContaining({ executionMode: "api", apiModeAvailable: false }));
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
  it("wires ChatPane's transport prop off the injected fake, not a freshly built real transport", async () => {
    const run = { runId: "impossible-run" };
    const startRun = vi.fn().mockResolvedValue(run);
    const fakeTransport = { startRun } as never;

    render(<AssistantDock useChats={() => fakeChats()} useAssistantTransport={() => fakeTransport} />);

    // The dock decorates the transport with the agent-failure projection (`withAgentFailureSurface`),
    // so ChatPane gets a wrapper, not the fake by identity. A freshly built real transport would never
    // reach this fake, so delegation through ChatPane's prop is still the proof.
    const props = chatPaneSpy.mock.calls.at(-1)?.[0] as { transport: { startRun: (input: unknown, handlers: unknown) => Promise<unknown> } };
    const input = { prompt: "impossible-prompt" };
    await act(async () => {
      await expect(props.transport.startRun(input, { onEvent: vi.fn(), onError: vi.fn(), onDone: vi.fn() })).resolves.toBe(run);
    });
    expect(startRun).toHaveBeenCalledWith(input, expect.objectContaining({ onEvent: expect.any(Function) }));
  });
});

describe("AssistantDock useAttachmentUploader injection", () => {
  it("forwards ordinary files through ChatPane's upload callback to the injected uploader", async () => {
    const attachments = [{ name: "notes.txt", path: "attachment:notes", kind: "file" as const }];
    const fakeUploader = vi.fn(async () => attachments);

    render(<AssistantDock useChats={() => fakeChats()} useAttachmentUploader={() => fakeUploader} />);

    const props = chatPaneSpy.mock.calls.at(-1)?.[0] as { uploadAttachments: (files: File[]) => Promise<unknown[]> };
    const files = [new File(["notes"], "notes.txt")];
    await expect(props.uploadAttachments(files)).resolves.toBe(attachments);
    expect(fakeUploader).toHaveBeenCalledWith(files);
  });

  // Since 02366180d a file-only drop is no longer captured by the dock: it falls through to ChatPane,
  // whose upload callback classifies ZIPs by their central-directory names (not by suffix).
  it.each([
    ["SKILL.md", async () => new File(["---\nname: example\ndescription: Example skill.\n---\nInstructions."], "SKILL.md")],
    ["skill.zip", () => zipFolderFiles({ files: [new File(["---\nname: example\n---\nInstructions."], "SKILL.md")], maxBytes: 1024 * 1024 })],
  ])("routes a dropped %s to installation before attachment upload", async (_name, makeFile) => {
    const fakeUploader = vi.fn();
    render(<AssistantDock useChats={() => fakeChats()} useAttachmentUploader={() => fakeUploader} />);
    const file = await makeFile();
    const notCancelled = fireEvent.drop(screen.getByTestId("chat-pane"), { dataTransfer: { files: [file], items: [], types: ["Files"] } });
    expect(notCancelled).toBe(true);
    const props = chatPaneSpy.mock.calls.at(-1)?.[0] as { uploadAttachments: (files: File[]) => Promise<unknown[]> };
    await act(async () => { await expect(props.uploadAttachments([file])).resolves.toEqual([]); });
    expect(await screen.findByRole("dialog", { name: "Install skill" })).toBeInTheDocument();
    expect(fakeUploader).not.toHaveBeenCalled();
  });
});

describe("AssistantDock useAttachmentValidator injection", () => {
  it("wires ChatPane's validateAttachments prop off the injected fake, not the real liveness prober", () => {
    const fakeValidator = vi.fn();

    render(<AssistantDock useChats={() => fakeChats()} useAttachmentValidator={() => fakeValidator} />);

    // Without this prop `@jini-ai/chat` restores a persisted draft's TEXT only and silently discards
    // its attachment references — it will not hand back a reference no host vouched for.
    expect(chatPaneSpy).toHaveBeenCalledWith(expect.objectContaining({ validateAttachments: fakeValidator }));
  });
});

describe("AssistantDock useRuntimeAccess injection", () => {
  it("wires ChatPane's runtimeAccess prop off the injected fake, not the real fetch-backed one", async () => {
    const fakeRuntimeAccess = {
      listAgents: vi.fn().mockResolvedValue([]),
      rescanAgents: vi.fn().mockResolvedValue([]),
      daemonOnline: vi.fn().mockResolvedValue(true),
    };

    const agents = [{ id: "impossible-agent", name: "Impossible Agent" }];
    fakeRuntimeAccess.listAgents.mockResolvedValue(agents);
    fakeRuntimeAccess.rescanAgents.mockResolvedValue(agents);

    render(<AssistantDock useChats={() => fakeChats()} useRuntimeAccess={() => fakeRuntimeAccess} />);

    // The dock wraps listAgents/rescanAgents to capture the live inventory the failure card's
    // "Switch to" action needs, so ChatPane gets a wrapper; every call must still reach the fake.
    const props = chatPaneSpy.mock.calls.at(-1)?.[0] as { runtimeAccess: typeof fakeRuntimeAccess };
    expect(props.runtimeAccess.daemonOnline).toBe(fakeRuntimeAccess.daemonOnline);
    await act(async () => {
      await expect(props.runtimeAccess.listAgents()).resolves.toBe(agents);
      await expect(props.runtimeAccess.rescanAgents()).resolves.toBe(agents);
    });
    expect(fakeRuntimeAccess.listAgents).toHaveBeenCalledTimes(1);
    expect(fakeRuntimeAccess.rescanAgents).toHaveBeenCalledTimes(1);
  });

  it("passes no placeholder agents when the runtime access is injected — a fake has no cache to seed from", () => {
    writeAgentsSnapshot([{ id: "gemini", name: "Gemini CLI" }]);
    const fakeRuntimeAccess = {
      listAgents: vi.fn().mockResolvedValue([]),
      rescanAgents: vi.fn().mockResolvedValue([]),
      daemonOnline: vi.fn().mockResolvedValue(true),
    };

    render(<AssistantDock useChats={() => fakeChats()} useRuntimeAccess={() => fakeRuntimeAccess} />);

    expect(chatPaneSpy.mock.calls.at(-1)?.[0]).not.toHaveProperty("agents");
    localStorage.clear();
  });

  it("seeds ChatPane's agents from the last live list this browser stored, before listAgents resolves", () => {
    writeAgentsSnapshot([{ id: "gemini", name: "Gemini CLI" }]);

    render(<AssistantDock useChats={() => fakeChats()} />);

    expect(chatPaneSpy).toHaveBeenCalledWith(expect.objectContaining({ agents: [{ id: "gemini", name: "Gemini CLI" }] }));
    localStorage.clear();
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
  it("the forwarded agentControl makes the real ChatPane subscribe to the bridge and unsubscribe on unmount", async () => {
    const agentBridge = fakeAgentBridge();
    render(<AssistantDock useChats={() => fakeChats()} agentBridge={agentBridge} />);
    const props = chatPaneSpy.mock.calls.at(-1)?.[0];
    const { unmount } = render(<RealChatPane agentControl={props.agentControl} transport={{
      startRun: vi.fn(), reattachRun: vi.fn(), fetchRunStatus: vi.fn(), stopRun: vi.fn(),
    }} />);

    expect(agentBridge.bridgeAccess.subscribe).toHaveBeenCalledWith(expect.any(Function));
    const unsubscribe = vi.mocked(agentBridge.bridgeAccess.subscribe).mock.results[0].value;
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

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

  /**
   * Publish-criteria plan §4 S5 ("WebMCP on") — the owner's 09-22 decision that WebMCP stays on by
   * default now that P0 (plan §3 item 2) has removed the Publish button's agent handle. Before this,
   * `agentControl` omitted `webmcp` entirely, which is what kept `useChatPaneAgentControl` from
   * registering the chat-pane's own WebMCP tools (see this file's own comment above `agentControl`).
   */
  it("passes webmcp: true to the chat pane", () => {
    render(<AssistantDock useChats={() => fakeChats()} />);

    const props = chatPaneSpy.mock.calls.at(-1)?.[0] as { agentControl?: { webmcp?: boolean } };
    expect(props.agentControl?.webmcp).toBe(true);
  });

  it("turns off only the chat pane's browser tools when the operator opts out", () => {
    render(<AssistantDock useChats={() => fakeChats()} />);
    try {
      act(() => setBrowserAgentEnabled({ enabled: false }));
      const props = chatPaneSpy.mock.calls.at(-1)?.[0] as { agentControl?: { enabled?: boolean; webmcp?: boolean } };
      expect(props.agentControl?.webmcp).toBe(false);
      expect(props.agentControl?.enabled).toBe(true);
      act(() => setBrowserAgentEnabled({ enabled: true }));
      const next = chatPaneSpy.mock.calls.at(-1)?.[0] as { agentControl?: { webmcp?: boolean } };
      expect(next.agentControl?.webmcp).toBe(true);
    } finally {
      act(() => setBrowserAgentEnabled({ enabled: true }));
    }
  });
});

/**
 * Coverage-gap-fill (2026-09-05). A real MCP-UI runtime would normally invoke the registered
 * renderer, and this file never runs one. That leaves the renderer callback itself (`AssistantDock.tsx`'s own
 * `registerExtEventRenderer({ name: MCP_UI_EXT_EVENT_NAME, renderer: (props) => (...) })`) registered but
 * never called. The registration runs once at module import time (this file's own `import {
 * AssistantDock } from "../AssistantDock/AssistantDock"` already triggered it), so the callback is
 * retrieved from the real registry here and invoked directly with a fabricated `props` object —
 * the same direct-invocation treatment this repo gives a callback that only a framework/runtime,
 * not a test, would otherwise call.
 */
describe("AssistantDock — ext event renderer registrations", () => {
  /**
   * Retrieves the callback from Jini's real registry for direct assertions.
   * @throws When the dock failed to register the requested event renderer.
   * @complexity Time/space O(1) for the registry lookup.
   */
  function rendererFor(eventName: string) {
    const renderer = getExtEventRenderer({ name: eventName });
    expect(renderer).toBeDefined();
    if (!renderer) throw new Error(`No ext-event renderer registered for ${eventName}`);
    return renderer;
  }

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
    const renderer = rendererFor(MCP_UI_EXT_EVENT_NAME);
    expect(renderer).toBeInstanceOf(Function);

    const element = renderedElement(renderer(extEventProps({ toolCallId: "tc-1", someProp: "value" })));

    expect(element.type).toBe(OverflowAwareMcpUiSurfaceCard);
    expect(element.props).toMatchObject({ toolCallId: "tc-1", someProp: "value" });
    expect(typeof element.props.onToolCall).toBe("function");
  });

  it("relays a rendered MCP tool call to the admin endpoint with the session cookie and payload", async () => {
    const fetchSpy = mcpUiFetch.mockResolvedValue(new Response(JSON.stringify({ deleted: true })));
    try {
      const element = renderedElement(rendererFor(MCP_UI_EXT_EVENT_NAME)(extEventProps({})));
      const onToolCall = element.props.onToolCall as (call: { name: string; arguments: Record<string, unknown> }) => Promise<unknown>;
      await expect(onToolCall({ name: "content_post_delete", arguments: { id: "post-1", confirmationToken: "confirm-1" } })).resolves.toEqual({ deleted: true });
      expect(fetchSpy).toHaveBeenCalledWith("/api/admin/v1/mcp-ui/tool-calls", expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolName: "content_post_delete", params: { id: "post-1", confirmationToken: "confirm-1" } }),
      }));
    } finally {
      fetchSpy.mockReset();
    }
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
    const renderer = rendererFor(MCP_UI_EXT_EVENT_NAME);

    const first = renderedElement(renderer(extEventProps({ toolCallId: "tc-1" })));
    const second = renderedElement(renderer(extEventProps({ toolCallId: "tc-2" })));

    expect(first.props.sandboxProxyUrl).toBeInstanceOf(URL);
    expect((first.props.sandboxProxyUrl as URL).protocol).toBe("data:");
    expect((first.props.sandboxProxyUrl as URL).href).toMatch(/^data:text\/html/);
    expect(first.props.sandboxProxyUrl).toBe(second.props.sandboxProxyUrl);
  });

  /**
   * Coverage-gap-fill (2026-09-05). Same shape as the MCP-UI registration above, for the other two
   * module-scope-once `registerExtEventRenderer` calls in `AssistantDock.tsx`
   * (`"a2ui"` -> `RoutedA2uiSurfaceCard`, `"slow_running"` -> `SlowRunNoticeCard`) — neither renderer
   * callback had ever been invoked, since this file does not run the transcript runtime.
   */
  it("registers a renderer under 'a2ui' that renders RoutedA2uiSurfaceCard with every prop passed through, plus a real onAgentAction", () => {
    const renderer = rendererFor("a2ui");

    const element = renderedElement(renderer(extEventProps({ actionId: "a-1", someProp: "value" })));

    expect(element.type).toBe(RoutedA2uiSurfaceCard);
    expect(element.props).toMatchObject({ actionId: "a-1", someProp: "value" });
    expect(typeof element.props.onAgentAction).toBe("function");
  });

  it("registers a renderer under 'slow_running' that renders SlowRunNoticeCard with every prop passed through", () => {
    const renderer = rendererFor("slow_running");

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

  /** `ChatPane` is injected as a bare recorder that does not render its `header` prop (see
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
