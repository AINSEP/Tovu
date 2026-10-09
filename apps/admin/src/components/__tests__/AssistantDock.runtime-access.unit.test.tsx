import { act, render as renderWithoutProvider } from "@testing-library/react";
import type { ComponentProps, ReactElement } from "react";
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
 * `ChatPane` is injected as a recorder the same way `AssistantDock.unit.test.tsx` injects it (a full streaming chat
 * UI with its own daemon-facing lifecycle — mounting the real thing would test that package, not
 * this host's wiring), but this file captures the `runtimeAccess` prop itself and calls its
 * functions directly, since that object's fetch behavior is exactly what regressed.
 */

const chatPaneSpy = vi.fn();

import { AssistantDock as RealAssistantDock } from "../AssistantDock/AssistantDock";
import { DEFAULT_EXECUTION_CONFIG } from "../../lib/execution-settings";
import { useTovuExecutionPolicy } from "../../hooks/use-tovu-execution-policy.hooks";

// The pane recorder replaces only the render dependency, leaving Jini's clients and factories
// real. Static execution/BYOK controllers avoid unrelated ledger and model-discovery IO.
function PaneRecorder(props: ComponentProps<NonNullable<ComponentProps<typeof RealAssistantDock>["ChatPane"]>>) {
  chatPaneSpy(props);
  return <div data-testid="chat-pane" />;
}
const executionController = {
  executionConfig: DEFAULT_EXECUTION_CONFIG,
  executionConfigRef: { current: DEFAULT_EXECUTION_CONFIG },
  setExecutionConfig: vi.fn(),
  handleExecutionModeChange: vi.fn(),
  hasStoredAdminKey: false,
  configLoaded: true,
};
// Exercise the live runtime port with desktop capability; unknown deployment discovery correctly
// disables CLI probes (owner 2026-10-07) and would otherwise mask the single-flight behavior.
function AssistantDock(props: ComponentProps<typeof RealAssistantDock>) {
  return <RealAssistantDock ChatPane={PaneRecorder} useExecutionConfig={() => executionController}
    useExecutionPolicy={(input) => useTovuExecutionPolicy(input, { desktop: true })}
    useByokRuntime={() => ({ byokRuntime: { model: "", models: [] }, handleByokModelChange: vi.fn() })}
    {...props} />;
}

import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";

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
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    // Node's native AbortSignal.timeout uses internal timers that Vitest cannot advance.
    // Supply the same deadline semantics on the controlled clock, using a real abort signal.
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("The operation timed out.", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    try {
      const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
        if (url !== "/api/agents") return Promise.resolve(benignResponse());
        if (agentsCalls(fetchSpy).length > 1) return Promise.resolve(new Response(null, { status: 200 }));
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
        });
      });
      vi.stubGlobal("fetch", fetchSpy);

      render(<AssistantDock useChats={fakeChats} />);
      const { daemonOnline } = latestRuntimeAccess();
      const first = daemonOnline();
      const overlapping = daemonOnline();
      // Attach rejection handlers before advancing time to avoid unhandled rejections.
      const firstSettles = first.catch((error: unknown) => error);
      const overlappingSettles = overlapping.catch((error: unknown) => error);
      const init = agentsCalls(fetchSpy)[0]?.[1] as RequestInit;
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(timeout).toHaveBeenCalledWith(60_000);
      expect(agentsCalls(fetchSpy)).toHaveLength(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
      expect(init.signal!.aborted).toBe(false);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(init.signal!.aborted).toBe(true);
      expect(await firstSettles).toMatchObject({ name: "TimeoutError" });
      expect(await overlappingSettles).toMatchObject({ name: "TimeoutError" });

      await expect(daemonOnline()).resolves.toBe(true);
      expect(agentsCalls(fetchSpy)).toHaveLength(2);
    } finally {
      timeout.mockRestore();
      vi.useRealTimers();
    }
  });
});
