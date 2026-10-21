import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LedgerCandidate } from "@/lib/ledger-slice";
import type { SettingsRefreshScope } from "@/lib/settings-refresh-bus";
import { CHAT_DISPLAY_NAMESPACE } from "../chat-display-preferences";
import { CHAT_AGENT_PLUGINS_KEY } from "../chat-agent-plugin-preferences";
import {
  createChatAgentPluginsPreferencePort,
  useChatAgentPluginsPreference,
  type ChatAgentPluginsPreferenceDeps,
} from "../chat-agent-plugin-preferences.adapter";

/**
 * @file The Agent plugins preference port over a fake ledger and a fake settings feed: it reads and
 * writes the chat-display namespace at user scope, and re-reads only for refreshes that may have
 * touched that namespace.
 */

function fakeDeps(stored: Map<string, unknown> = new Map()) {
  const loads: string[] = [];
  const saves: Array<{ namespace: string; scope: string; candidates: readonly LedgerCandidate[] }> = [];
  const listeners: Array<(scope: SettingsRefreshScope) => void> = [];
  let unsubscribed = 0;
  const deps: ChatAgentPluginsPreferenceDeps = {
    loadValues: async (namespace) => {
      loads.push(namespace);
      return stored;
    },
    saveEntries: async (namespace, scope, candidates) => {
      saves.push({ namespace, scope, candidates });
      return [];
    },
    subscribe: (listener) => {
      listeners.push(listener);
      return () => {
        unsubscribed += 1;
      };
    },
  };
  return { deps, loads, saves, listeners, unsubscribedCount: () => unsubscribed };
}

describe("createChatAgentPluginsPreferencePort", () => {
  it("loads the stored choice from the chat-display namespace", async () => {
    const fake = fakeDeps(new Map([[CHAT_AGENT_PLUGINS_KEY, "ask"]]));
    expect(await createChatAgentPluginsPreferencePort(fake.deps).load()).toBe("ask");
    expect(fake.loads).toEqual([CHAT_DISPLAY_NAMESPACE]);
  });

  it("falls back to Auto for nothing stored", async () => {
    expect(await createChatAgentPluginsPreferencePort(fakeDeps().deps).load()).toBe("auto");
  });

  it("saves the choice at user scope, marking it changed only when it differs", async () => {
    const fake = fakeDeps();
    const port = createChatAgentPluginsPreferencePort(fake.deps);
    await port.save({ next: "off", previous: "auto" });
    await port.save({ next: "off", previous: "off" });
    expect(fake.saves).toEqual([
      { namespace: CHAT_DISPLAY_NAMESPACE, scope: "user", candidates: [{ key: CHAT_AGENT_PLUGINS_KEY, valueJson: "off", changed: true }] },
      { namespace: CHAT_DISPLAY_NAMESPACE, scope: "user", candidates: [{ key: CHAT_AGENT_PLUGINS_KEY, valueJson: "off", changed: false }] },
    ]);
  });

  it("propagates a ledger failure", async () => {
    const fake = fakeDeps();
    fake.deps.saveEntries = async () => {
      throw new Error("ledger down");
    };
    await expect(createChatAgentPluginsPreferencePort(fake.deps).save({ next: "ask", previous: "auto" })).rejects.toThrow("ledger down");
  });

  it("notifies for a refresh-all or one naming its namespace, ignores others, and unsubscribes", () => {
    const fake = fakeDeps();
    let notified = 0;
    const unsubscribe = createChatAgentPluginsPreferencePort(fake.deps).subscribe({ listener: () => (notified += 1) });
    const [feed] = fake.listeners;
    feed!(null);
    feed!(["core.other", CHAT_DISPLAY_NAMESPACE]);
    feed!(["core.other"]);
    expect(notified).toBe(2);
    unsubscribe();
    expect(fake.unsubscribedCount()).toBe(1);
  });
});

describe("useChatAgentPluginsPreference (production wiring)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the stored choice through the real settings API and saves a change at user scope", async () => {
    const stored = new Map<string, unknown>([[CHAT_AGENT_PLUGINS_KEY, "ask"]]);
    const writes: unknown[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/admin/v1/workspaces/workspace-local/settings/effective?namespace=${CHAT_DISPLAY_NAMESPACE}` && init?.method === "GET") {
        return new Response(JSON.stringify({ data: Array.from(stored, ([key, value]) => ({ key, value, sourceLayer: "user", defVersion: 1 })) }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      if (url === "/api/admin/v1/workspaces/workspace-local/settings/value" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        writes.push(body);
        stored.set(body.key, body.valueJson);
        return new Response(JSON.stringify({ key: body.key, scope: body.scope, value: body.valueJson, revisionSeq: 1 }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected settings request: ${init?.method} ${url}`);
    });
    const { result, unmount } = renderHook(() => useChatAgentPluginsPreference());
    try {
      await waitFor(() => expect(result.current.mode).toBe("ask"));
      await act(async () => result.current.update("off"));
      await waitFor(() => expect(writes).toEqual([{ namespace: CHAT_DISPLAY_NAMESPACE, key: CHAT_AGENT_PLUGINS_KEY, scope: "user", valueJson: "off" }]));
      expect(result.current.mode).toBe("off");
      expect(result.current.saveFailed).toBe(false);
    } finally {
      unmount();
    }
  });
});
