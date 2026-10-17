import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";

import { publishSettingsRefresh, resetSettingsRefreshBus } from "@/lib/settings-refresh-bus";
import { defaultChatDisplayPreferencesPort, useChatDisplayPreferences as useDefaultChatDisplayPreferences } from "../chat-display-preferences.adapter";
import { DEFAULT_CHAT_DISPLAY, type ChatDisplayPreferences } from "../chat-display-preferences";
import {
  useChatDisplayPreferences,
  type ChatDisplayPreferencesPort,
} from "../hooks/use-chat-display-preferences.hooks";

/**
 * @file `useChatDisplayPreferences` over a fake port (the hook's own DI seam): defaults until the
 * stored values arrive, an instant optimistic change, the diff save, a failed save, and the optimistic
 * copy giving way once the stored values agree — so a later change made elsewhere shows up again.
 * Rendered under the production fetch-query adapter (`@/__tests__/fetch-query-render`).
 */

afterEach(() => resetSettingsRefreshBus());

interface FakePort extends ChatDisplayPreferencesPort {
  stored: ChatDisplayPreferences;
  saves: { next: ChatDisplayPreferences; previous: ChatDisplayPreferences }[];
  failSaves: boolean;
  failLoads: boolean;
  loads: number;
  refresh: () => void;
  unsubscribed: number;
}

function fakePort(stored: ChatDisplayPreferences = DEFAULT_CHAT_DISPLAY): FakePort {
  const listeners = new Set<() => void>();
  const port: FakePort = {
    stored,
    saves: [],
    failSaves: false,
    failLoads: false,
    loads: 0,
    unsubscribed: 0,
    load: async () => {
      port.loads += 1;
      if (port.failLoads) throw new Error("settings read failed");
      return { ...port.stored };
    },
    save: async (next, previous) => {
      port.saves.push({ next, previous });
      if (port.failSaves) throw new Error("settings write failed");
      port.stored = { ...next };
    },
    subscribeToSettingsRefresh: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        port.unsubscribed += 1;
      };
    },
    refresh: () => listeners.forEach((listener) => listener()),
  };
  return port;
}

describe("useChatDisplayPreferences", () => {
  it("shows the defaults until the stored values arrive, then the stored values", async () => {
    const port = fakePort({ toolCalls: "show", showUsageLine: false, showThinking: true });
    const { result } = renderHook(() => useChatDisplayPreferences(port));

    expect(result.current.preferences).toEqual(DEFAULT_CHAT_DISPLAY);
    await waitFor(() => expect(result.current.preferences).toEqual({ toolCalls: "show", showUsageLine: false, showThinking: true }));
    expect(result.current.saveFailed).toBe(false);
  });

  it("keeps the defaults when the stored values cannot be read", async () => {
    const port = fakePort({ toolCalls: "hidden", showUsageLine: false, showThinking: true });
    port.failLoads = true;
    const { result } = renderHook(() => useChatDisplayPreferences(port));

    await act(async () => {});
    expect(result.current.preferences).toEqual(DEFAULT_CHAT_DISPLAY);
  });

  it("applies a change at once and saves it against the stored values", async () => {
    const port = fakePort();
    const { result } = renderHook(() => useChatDisplayPreferences(port));
    await waitFor(() => expect(port.loads).toBeGreaterThan(0));
    await act(async () => {});

    act(() => result.current.update({ toolCalls: "hidden" }));

    // Optimistic: the pane gets the new mode before the save settles.
    expect(result.current.preferences).toEqual({ ...DEFAULT_CHAT_DISPLAY, toolCalls: "hidden" });
    expect(port.saves).toEqual([{ next: { ...DEFAULT_CHAT_DISPLAY, toolCalls: "hidden" }, previous: DEFAULT_CHAT_DISPLAY }]);
    await waitFor(() => expect(result.current.preferences.toolCalls).toBe("hidden"));
    expect(result.current.saveFailed).toBe(false);
  });

  it.each([
    [{ toolCalls: "hidden" }, { toolCalls: "collapsed" }],
    [{ showUsageLine: false }, { showUsageLine: true }],
    [{ showThinking: true }, { showThinking: false }],
  ] satisfies [Partial<ChatDisplayPreferences>, Partial<ChatDisplayPreferences>][])(
    "persists a flip and reversal before the first save can re-read: %j",
    async (patch, reversal) => {
      const port = fakePort();
      const pending: (() => void)[] = [];
      port.save = (next, previous) => {
        port.saves.push({ next, previous });
        // Apply only the diff, like the real append-only settings ledger.
        for (const key of ["toolCalls", "showUsageLine", "showThinking"] as const) {
          if (next[key] !== previous[key]) port.stored = { ...port.stored, [key]: next[key] };
        }
        return new Promise<void>((resolve) => pending.push(resolve));
      };
      const { result } = renderHook(() => useChatDisplayPreferences(port));
      await act(async () => {});
      act(() => {
        result.current.update(patch);
        result.current.update(reversal);
      });
      expect(port.saves).toEqual([
        { next: { ...DEFAULT_CHAT_DISPLAY, ...patch }, previous: DEFAULT_CHAT_DISPLAY },
        { next: DEFAULT_CHAT_DISPLAY, previous: { ...DEFAULT_CHAT_DISPLAY, ...patch } },
      ]);
      await act(async () => pending.forEach((resolve) => resolve()));
      expect(port.stored).toEqual(DEFAULT_CHAT_DISPLAY);
      expect(result.current.preferences).toEqual(DEFAULT_CHAT_DISPLAY);
    },
  );

  it("merges a patch over the current choices, leaving the other fields alone", async () => {
    const port = fakePort({ toolCalls: "show", showUsageLine: true, showThinking: false });
    const { result } = renderHook(() => useChatDisplayPreferences(port));
    await waitFor(() => expect(result.current.preferences.toolCalls).toBe("show"));

    act(() => result.current.update({ showThinking: true }));

    expect(result.current.preferences).toEqual({ toolCalls: "show", showUsageLine: true, showThinking: true });
    expect(port.saves.at(-1)?.previous).toEqual({ toolCalls: "show", showUsageLine: true, showThinking: false });
  });

  it("reports a failed save and still applies the choice for the session", async () => {
    const port = fakePort();
    port.failSaves = true;
    const { result } = renderHook(() => useChatDisplayPreferences(port));
    await act(async () => {});

    await act(async () => result.current.update({ showUsageLine: false }));

    expect(result.current.saveFailed).toBe(true);
    expect(result.current.preferences).toEqual({ ...DEFAULT_CHAT_DISPLAY, showUsageLine: false });

    // The next save that works clears the error.
    port.failSaves = false;
    await act(async () => result.current.update({ showThinking: true }));
    await waitFor(() => expect(result.current.saveFailed).toBe(false));
  });

  it("drops the optimistic copy once stored values agree, so a change made elsewhere shows up", async () => {
    const port = fakePort();
    const { result } = renderHook(() => useChatDisplayPreferences(port));
    await act(async () => {});

    const loadsBeforeSave = port.loads;
    await act(async () => result.current.update({ toolCalls: "hidden" }));
    // The successful save re-reads; the stored "hidden" now matches the optimistic copy.
    await waitFor(() => expect(port.loads).toBeGreaterThan(loadsBeforeSave));
    await act(async () => {});
    expect(result.current.preferences.toolCalls).toBe("hidden");

    // Another tab saves "show"; the settings feed tells this one to re-read.
    port.stored = { ...port.stored, toolCalls: "show" };
    act(() => port.refresh());

    await waitFor(() => expect(result.current.preferences.toolCalls).toBe("show"));
  });

  it("unsubscribes from the settings feed on unmount", async () => {
    const port = fakePort();
    const { unmount } = renderHook(() => useChatDisplayPreferences(port));
    await act(async () => {});

    unmount();

    expect(port.unsubscribed).toBe(1);
  });
});

describe("defaultChatDisplayPreferencesPort.subscribeToSettingsRefresh", () => {
  it("re-reads for core.interface or an unknown scope, not for another namespace", () => {
    const listener = vi.fn();
    const unsubscribe = defaultChatDisplayPreferencesPort.subscribeToSettingsRefresh(listener);

    publishSettingsRefresh(["core.appearance"]);
    expect(listener).not.toHaveBeenCalled();

    publishSettingsRefresh(["core.appearance", "core.interface"]);
    expect(listener).toHaveBeenCalledTimes(1);

    publishSettingsRefresh();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    publishSettingsRefresh(["core.interface"]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

it("the composed preferences hook loads stored values and persists only the changed user setting", async () => {
  const stored = new Map<string, unknown>([["chatToolCalls", "show"], ["chatShowUsageLine", false], ["chatShowThinking", true]]);
  const writes: unknown[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/admin/v1/workspaces/workspace-local/settings/effective?namespace=core.interface" && init?.method === "GET") {
      return new Response(JSON.stringify({ data: Array.from(stored, ([key, value]) => ({ key, value, sourceLayer: "user", defVersion: 1 })) }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    if (url === "/api/admin/v1/workspaces/workspace-local/settings/value" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      expect(body).toEqual({ namespace: "core.interface", key: "chatToolCalls", scope: "user", valueJson: "hidden" });
      writes.push(body);
      stored.set(body.key, body.valueJson);
      return new Response(JSON.stringify({ key: body.key, scope: body.scope, value: body.valueJson, revisionSeq: 1 }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected settings request: ${init?.method} ${url}`);
  });
  try {
    const { result, unmount } = renderHook(() => useDefaultChatDisplayPreferences());
    try {
      await waitFor(() => expect(result.current.preferences).toEqual({ toolCalls: "show", showUsageLine: false, showThinking: true }));
      await act(async () => result.current.update({ toolCalls: "hidden" }));
      expect(writes).toEqual([{ namespace: "core.interface", key: "chatToolCalls", scope: "user", valueJson: "hidden" }]);
      expect(Object.fromEntries(stored)).toEqual({ chatToolCalls: "hidden", chatShowUsageLine: false, chatShowThinking: true });
      expect(result.current.preferences).toEqual({ toolCalls: "hidden", showUsageLine: false, showThinking: true });
      expect(result.current.saveFailed).toBe(false);
    } finally { unmount(); }
  } finally { vi.unstubAllGlobals(); }
});
