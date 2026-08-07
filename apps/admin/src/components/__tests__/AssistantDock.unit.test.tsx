import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutionConfig } from "@jini-ai/ui";

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

import { AssistantDock } from "../AssistantDock/AssistantDock";
import {
  DEFAULT_EXECUTION_CONFIG,
  createExecutionPort,
  loadAdminExecutionCredential,
  loadExecutionConfig,
  saveExecutionConfig,
} from "../../lib/execution-settings";
import type { UseAssistantChats } from "../../hooks/use-assistant-chats.hooks";
import type { UseByokRuntime, UseExecutionConfig, UseLocalCliSelection } from "../AssistantDock/AssistantDock.hooks";

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

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockLoadExecutionConfig.mockReset().mockResolvedValue(DEFAULT_EXECUTION_CONFIG);
  // Resolves to `readonly string[]` (the changed ledger keys), not `void` — `undefined` does not
  // typecheck. No caller reads the value; `[]` is the neutral choice.
  mockSaveExecutionConfig.mockReset().mockResolvedValue([]);
  mockCreateExecutionPort.mockReset().mockReturnValue({ listModels: vi.fn().mockResolvedValue([]) } as never);
  mockLoadAdminExecutionCredential.mockReset().mockResolvedValue(storedCredential(false));
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
