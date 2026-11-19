import type { ChatPaneAgent, ChatTransport } from "@jini-ai/chat/react";
import { renderHook } from "@/__tests__/fetch-query-render";
import type { CreateTovuAssistantTransportOptions } from "@/lib/assistant-transport";
import { DEFAULT_EXECUTION_CONFIG } from "@/lib/execution-settings";
import type { CachedLoader } from "@jini-ai/core/fetch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentsLoader, replaceAgents, resetResumeCapableAgentIds } from "../hooks/agents-inventory.hooks";
import { useAssistantTransport } from "../hooks/assistant-transport.hooks";

/**
 * @file The agents inventory's deadline rules (`createAgentsLoader`, `replaceAgents`) over a plain
 * `CachedLoader` object rather than the provider's. `CachedLoader.peek` is allowed to answer
 * `undefined` at any time; the provider's never does right after a write, so these are the only
 * tests that pin what happens when a cache does: the deadline still lands on the array the call
 * itself holds, and a snapshot the cache holds without a recorded deadline still gets a cooldown.
 */

const BASE = Date.parse("2026-10-22T00:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(BASE);
});

afterEach(() => {
  resetResumeCapableAgentIds();
  localStorage.clear();
  vi.useRealTimers();
});

function agentsList(): ChatPaneAgent[] {
  return [{ id: "codex", name: "Codex" } as ChatPaneAgent];
}

/** A cache whose snapshot is whatever `snapshot()` answers — `undefined` included. */
function fakeLoader(snapshot: () => ChatPaneAgent[] | undefined, load: CachedLoader<ChatPaneAgent[]>["load"] = vi.fn()): CachedLoader<ChatPaneAgent[]> {
  return { peek: snapshot, load, replace: vi.fn() };
}

/** The refresh deadline recorded for `agents`, read the way the pane reads it. */
function deadlineOf(agents: ChatPaneAgent[]): number | undefined {
  return createAgentsLoader(fakeLoader(() => agents)).refreshAt();
}

describe("replaceAgents", () => {
  it("keeps the transport factory's captured resume getter live across inventory replacement", () => {
    resetResumeCapableAgentIds();
    const createTransport = vi.fn((_options: CreateTovuAssistantTransportOptions = {}): ChatTransport => ({
      startRun: async () => ({ runId: "unused" }), stopRun: async () => {},
      reattachRun: async () => {}, fetchRunStatus: async () => null,
    }));
    const { rerender } = renderHook(() => useAssistantTransport({
      executionConfigRef: { current: DEFAULT_EXECUTION_CONFIG },
    }, { createTransport }));
    const getter = createTransport.mock.calls[0]![0]!.getResumeCapableAgentIds!;
    expect([...getter()]).toEqual([]);
    const agents = [{ id: "codex", name: "Codex", carriesOwnMemory: true }];
    replaceAgents({ loader: fakeLoader(() => agents), agents });
    expect([...getter()]).toEqual(["codex"]);
    rerender();
    expect(createTransport.mock.calls.at(-1)![0]!.getResumeCapableAgentIds).toBe(getter);
  });

  it("writes the inventory and dates it from the written array when the cache answers nothing back", () => {
    const agents = agentsList();
    const loader = fakeLoader(() => undefined);

    expect(replaceAgents({ loader, agents })).toBe(agents);

    expect(loader.replace).toHaveBeenCalledWith({ value: agents });
    expect(deadlineOf(agents)).toBe(BASE + 15 * 60_000);
  });
});

describe("createAgentsLoader", () => {
  it("accepts the transport's own array when the cache answers nothing after a read", async () => {
    const agents = agentsList();
    const load = vi.fn<CachedLoader<ChatPaneAgent[]>["load"]>().mockResolvedValue(agents);
    const loader = createAgentsLoader(fakeLoader(() => undefined, load));

    await expect(loader.load()).resolves.toBe(agents);

    // A due read always bypasses freshness; the provider joins any request already in flight.
    expect(load).toHaveBeenCalledWith(undefined, { staleTime: 0 });
    expect(loader.refreshAt()).toBeUndefined();
    expect(deadlineOf(agents)).toBe(BASE + 15 * 60_000);
  });

  it("puts a cached snapshot with no recorded deadline on the failure cooldown when its read fails", async () => {
    const cached = agentsList();
    const failure = new Error("GET /api/agents answered 503");
    const load = vi.fn<CachedLoader<ChatPaneAgent[]>["load"]>().mockRejectedValue(failure);
    const loader = createAgentsLoader(fakeLoader(() => cached, load));
    expect(loader.refreshAt()).toBeUndefined();

    await expect(loader.load()).rejects.toBe(failure);

    expect(loader.refreshAt()).toBe(BASE + 30_000);
    // Inside that cooldown the snapshot is served without another request.
    await expect(loader.load()).resolves.toBe(cached);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
