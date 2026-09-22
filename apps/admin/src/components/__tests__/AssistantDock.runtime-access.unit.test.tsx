import { render as renderWithoutProvider } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * @file `AssistantDock`'s `runtimeAccess.daemonOnline` — the callback
 * `@jini-ai/chat/react`'s `useChatPaneRuntimeInventory` polls on a bare 5s `setInterval` for the
 * whole time a dock is mounted, with no cancellation of a still-pending previous call (its own
 * de-dup only ignores a stale RESULT, never aborts the fetch). Under the admin app's known
 * per-origin connection-pool exhaustion (every open tab holds one `EventSource` forever — see
 * `lib/settings-events.ts`), a `fetch` that queues forever meant every 5s tick added ONE MORE
 * permanently-stuck request on top of the ones still stuck from earlier ticks — unbounded growth
 * for as long as the tab stayed open, not the fixed one-connection-per-tab cost the settings feed
 * alone would cost. See `ADS-memory/reports/2026-08-17-vite-proxy-pool-saturation-investigation.md`.
 *
 * `ChatPane` is mocked the same way `AssistantDock.unit.test.tsx` mocks it (a full streaming chat
 * UI with its own daemon-facing lifecycle — mounting the real thing would test that package, not
 * this host's wiring), but this file captures the `runtimeAccess` prop itself and calls its
 * functions directly, since that object's fetch behavior is exactly what regressed.
 */

const chatPaneSpy = vi.hoisted(() => vi.fn());

vi.mock("@jini-ai/chat/react", () => ({
  JiniChatProvider: ({ children }: { children: ReactNode }) => children,
  ChatPane: (props: Record<string, unknown>) => {
    chatPaneSpy(props);
    return <div data-testid="chat-pane" />;
  },
  ConversationList: () => null,
  A2uiSurfaceCard: () => null,
  createDaemonAttachmentUploader: () => vi.fn(),
  createMcpUiToolCaller: () => vi.fn(),
  registerExtEventRenderer: vi.fn(),
  registerMcpUiSurfaceRenderer: vi.fn(),
  // `AssistantDock.tsx` imports this at module scope and calls
  // `registerExtEventRenderer(MCP_UI_EXT_EVENT_NAME, ...)`, so a factory that omits it makes the
  // module throw at import — which vitest reports as a FILE failure while the run's headline test
  // count still looks healthy, silently skipping every test in here. The real
  // `@jini-ai/chat/react` does export it; only the mock was short.
  MCP_UI_EXT_EVENT_NAME: "mcp-ui",
}));

vi.mock("../../lib/execution-settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/execution-settings")>();
  return {
    ...actual,
    loadExecutionConfig: vi.fn().mockResolvedValue(actual.DEFAULT_EXECUTION_CONFIG),
    saveExecutionConfig: vi.fn(),
    createExecutionPort: vi.fn().mockReturnValue({ listModels: vi.fn().mockResolvedValue([]) }),
    loadAdminExecutionCredential: vi.fn().mockResolvedValue({
      isSet: false,
      masked: null,
      protocol: "anthropic",
      providerId: "anthropic",
      baseUrl: null,
      model: null,
      maxTokens: null,
      updatedAt: null,
    }),
  };
});

vi.mock("../../lib/settings-refresh-bus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/settings-refresh-bus")>();
  return { ...actual, publishSettingsRefresh: vi.fn() };
});

vi.mock("../../lib/router", () => ({ navigate: vi.fn() }));

import { AssistantDock } from "../AssistantDock/AssistantDock";
import { FetchQueryProvider } from "../../lib/fetch-query";

/** Every render sits under the app's query-cache provider, as `main.tsx` mounts the real dock:
 *  `useRuntimeAccess`/`useAgentsPlaceholder` read the agents list through that cache. */
function render(ui: ReactElement) {
  return renderWithoutProvider(ui, { wrapper: FetchQueryProvider });
}
import type { UseAssistantChats } from "../../hooks/use-assistant-chats.hooks";

interface RuntimeAccess {
  listAgents: () => Promise<unknown[]>;
  rescanAgents: () => Promise<unknown[]>;
  daemonOnline: () => Promise<boolean>;
}

function fakeChats(): UseAssistantChats {
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
  };
}

function latestRuntimeAccess(): RuntimeAccess {
  const props = chatPaneSpy.mock.calls.at(-1)?.[0] as { runtimeAccess: RuntimeAccess };
  return props.runtimeAccess;
}

/** `AssistantDock` mounts other real `fetch`-backed effects too (composer discovery catalog,
 *  etc.) unrelated to this file's concern — a bare global call-count would double-count them, so
 *  every assertion here filters to exactly `GET /api/agents` calls. */
function agentsCalls(fetchSpy: ReturnType<typeof vi.fn>): unknown[][] {
  return fetchSpy.mock.calls.filter(([url]) => url === "/api/agents");
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  chatPaneSpy.mockReset();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  vi.unstubAllGlobals();
});

/** A benign, immediately-resolved response for any URL other than `/api/agents` — `AssistantDock`
 *  mounts other real `fetch`-backed effects (composer discovery catalog, etc.) this file doesn't
 *  care about, and they should not hang or log noise just because the global `fetch` is stubbed. */
function benignResponse(): Response {
  return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("AssistantDock runtimeAccess.daemonOnline", () => {
  it("reuses one in-flight fetch across overlapping calls instead of starting a new one per call", async () => {
    let resolveAgentsFetch!: (value: Response) => void;
    const fetchSpy = vi.fn((url: string) => {
      if (url !== "/api/agents") return Promise.resolve(benignResponse());
      return new Promise<Response>((resolve) => { resolveAgentsFetch = resolve; });
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<AssistantDock useChats={fakeChats} />);
    const { daemonOnline } = latestRuntimeAccess();

    // Two overlapping calls, exactly what a 5s poll tick firing again before the previous request
    // ever resolves looks like under connection-pool exhaustion.
    const first = daemonOnline();
    const second = daemonOnline();

    // The bug this regresses: without single-flight reuse, this would be 2 — one real `fetch` per
    // call — which is how the pending-request backlog grew by one every tick, unbounded, for as
    // long as the tab stayed open.
    expect(agentsCalls(fetchSpy)).toHaveLength(1);

    resolveAgentsFetch(new Response(null, { status: 200 }));
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it("starts a fresh fetch for the next call once the previous one has settled", async () => {
    const fetchSpy = vi.fn((url: string): Promise<Response> => {
      if (url !== "/api/agents") return Promise.resolve(benignResponse());
      // `mock.calls` already includes the in-progress call by the time this body runs, so the
      // first `/api/agents` call sees a length of 1, not 0.
      const isFirstAgentsCall = agentsCalls(fetchSpy).length === 1;
      return Promise.resolve(new Response(null, { status: isFirstAgentsCall ? 200 : 503 }));
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<AssistantDock useChats={fakeChats} />);
    const { daemonOnline } = latestRuntimeAccess();

    await expect(daemonOnline()).resolves.toBe(true);
    await expect(daemonOnline()).resolves.toBe(false);
    expect(agentsCalls(fetchSpy)).toHaveLength(2);
  });

  it("passes an AbortSignal so a request stuck behind an exhausted connection pool cannot hang forever", async () => {
    const fetchSpy = vi.fn((url: string) =>
      url !== "/api/agents" ? Promise.resolve(benignResponse()) : new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", fetchSpy);

    render(<AssistantDock useChats={fakeChats} />);
    const { daemonOnline } = latestRuntimeAccess();
    void daemonOnline();

    const init = agentsCalls(fetchSpy)[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
