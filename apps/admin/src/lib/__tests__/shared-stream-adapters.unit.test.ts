import { describe, expect, it } from "vitest";
import { createFrontendSessionBridge } from "@jini-ai/chat/react";
import type { ChatMessage, ChatTransport, RunHandlers } from "@jini-ai/chat/core";
import { subscribeToSettingsChanges } from "../settings-events";
import { openTabEventSource } from "../tab-event-source";
import { createStreamActivity, trackTransportActivity } from "../stream-activity";
import { browserDurableSubscriptionPorts, followDurableRun } from "../durable-run-subscription";
import { createTovuAssistantTransport } from "../assistant-transport";
import { fakeBrowserOrigin, settleLocks, StreamFake } from "./browser-stream.fakes";

/** sseshare: real consumer adapters with independent tab ports; no module replacement. */
describe("shared settings EventSource adapter", () => {
  it("two tabs share one source, preserve both channels, and hand off the settings/theme cursors", async () => {
    const origin = fakeBrowserOrigin();
    const tabs = [origin.tab(), origin.tab()];
    const sources: StreamFake[] = [];
    const settings: unknown[][] = [[], []];
    const previews: unknown[][] = [[], []];
    const stops = tabs.map((tab, index) => subscribeToSettingsChanges("ws", {
      principalId: "owner", ports: tab.ports,
      open: (url) => { const source = new StreamFake(url); sources.push(source); return source; },
      publishSettings: (namespaces) => { settings[index]!.push(namespaces); },
      publishPreview: (frame) => { previews[index]!.push(frame); },
    }));
    await settleLocks();
    expect(sources).toHaveLength(1);
    sources[0]!.emit("settings-changed", '{"namespaces":["appearance"]}', "42");
    sources[0]!.emit("theme-preview-refresh", '{"revision":"theme-7","path":"/"}', "42");
    await settleLocks();
    expect(settings).toEqual([[ ["appearance"] ], [ ["appearance"] ]]);
    expect(previews).toEqual([[{ revision: "theme-7", path: "/" }], [{ revision: "theme-7", path: "/" }]]);
    stops[0]!();
    await settleLocks();
    expect(sources[0]!.closed).toBe(true);
    expect(sources).toHaveLength(2);
    expect(sources[1]!.url).toBe("/api/admin/v1/workspaces/ws/settings/events?themePreview=1&afterRevision=42&themeRevision=theme-7");
    sources[1]!.emit("settings-changed", '{"namespaces":["seo"]}', "43");
    expect(settings[1]).toEqual([["appearance"], ["seo"]]);
    stops[1]!();
  });

  it("fallback releases its source after 30s hidden and resumes its cursor without changing native retries", () => {
    const tab = fakeBrowserOrigin().tab();
    const sources: StreamFake[] = [];
    const received: unknown[] = [];
    const stop = subscribeToSettingsChanges("ws", {
      ports: { ...tab.ports, requestLock: undefined },
      open: (url) => { const source = new StreamFake(url); sources.push(source); return source; },
      publishSettings: (frame) => { received.push(frame); },
    });
    sources[0]!.emit("settings-changed", '{"namespaces":["seo"]}', "12");
    sources[0]!.readyState = 0;
    sources[0]!.emit("error");
    expect(sources[0]!.closed).toBe(false);
    expect(sources).toHaveLength(1);
    tab.hide(); tab.advance(30_000);
    expect(sources[0]!.closed).toBe(true);
    tab.show();
    expect(sources[1]!.url).toContain("afterRevision=12");
    sources[1]!.emit("open");
    expect(received).toEqual([["seo"], undefined]);
    stop();
  });

  it("isolates principals even in the same workspace", async () => {
    const origin = fakeBrowserOrigin();
    const sources: StreamFake[] = [];
    const received: string[][] = [[], []];
    const stops = ["a", "b"].map((principalId, index) => subscribeToSettingsChanges("ws", {
      principalId, ports: origin.tab().ports,
      open: (url) => { const source = new StreamFake(url); sources.push(source); return source; },
      publishSettings: (namespaces) => { received[index]!.push(...namespaces ?? []); },
    }));
    await settleLocks();
    expect(sources).toHaveLength(2);
    sources[0]!.emit("settings-changed", '{"namespaces":["user-private"]}', "7");
    await settleLocks();
    expect(received).toEqual([["user-private"], []]);
    stops.forEach((stop) => stop());
  });
});

describe("page-bound bridge stream", () => {
  it("executes a page command only on its bound tab, even when both tabs have the same URL", async () => {
    const origin = fakeBrowserOrigin();
    const sources: StreamFake[] = [];
    const calls: number[] = [0, 0];
    const bridges = [origin.tab(), origin.tab()].map((tab, index) => createFrontendSessionBridge({
      baseUrl: "", fetch: async () => new Response("{}"),
      openStream: ({ url }) => openTabEventSource({ url }, {
        ports: tab.ports, activity: createStreamActivity({}),
        open: (value) => { const source = new StreamFake(value); sources.push(source); return source; },
      }),
    }, { executors: { "admin.": async () => { calls[index] = calls[index]! + 1; return {}; } } }));
    expect(sources).toHaveLength(2);
    sources.forEach((source, index) => source.emit("message", JSON.stringify({ type: "attached", sessionId: String(index), bindToken: String(index) })));
    sources[0]!.emit("message", '{"type":"invocation","invocationId":"one","capabilityId":"admin.test","input":{}}');
    await settleLocks();
    expect(calls).toEqual([1, 0]);
    bridges.forEach((bridge) => bridge.close());
  });

  it("invalidates its bind token when hidden idle, then attaches to the same bridge on visible", async () => {
    const tab = fakeBrowserOrigin().tab();
    const sources: StreamFake[] = [];
    const errors: unknown[] = [];
    const bridge = createFrontendSessionBridge({ baseUrl: "", fetch: async () => new Response("{}"),
      openStream: ({ url }) => openTabEventSource({ url }, {
        ports: tab.ports, activity: createStreamActivity({}),
        open: (value) => { const source = new StreamFake(value); sources.push(source); return source; },
      }),
    }, { onError: (error) => { errors.push(error); } });
    sources[0]!.emit("message", '{"type":"attached","sessionId":"a","bindToken":"token-a"}');
    await bridge.ready;
    expect(bridge.bindToken()).toBe("token-a");
    tab.hide(); tab.advance(29_999);
    expect(sources[0]!.closed).toBe(false);
    tab.advance(1);
    expect(sources[0]!.closed).toBe(true);
    expect(bridge.bindToken()).toBeUndefined();
    expect(errors).toHaveLength(1);
    tab.show();
    sources[1]!.emit("message", '{"type":"attached","sessionId":"b","bindToken":"token-b"}');
    expect(bridge.bindToken()).toBe("token-b");
    bridge.close();
    tab.show();
    expect(sources).toHaveLength(2);
    expect(sources[1]!.closed).toBe(true);
    expect(tab.listenerCount()).toBe(0);
  });

  it("keeps page control and the durable run connected while hidden; terminal recovery closes both", async () => {
    const tab = fakeBrowserOrigin().tab();
    const activity = createStreamActivity({});
    const pageSources: StreamFake[] = [];
    const runSources: StreamFake[] = [];
    let saved: ChatMessage = { id: "answer", role: "assistant", content: "", runId: "run", runStatus: "running" };
    const page = openTabEventSource({ url: "/page" }, { ports: tab.ports, activity,
      open: (url) => { const source = new StreamFake(url); pageSources.push(source); return source; } });
    const ports = browserDurableSubscriptionPorts({}, {
      request: async () => new Response(JSON.stringify({ message: saved }), { status: 200 }),
      open: (url) => { const source = new StreamFake(url); runSources.push(source); return source; },
      schedule: tab.ports.schedule,
    });
    const base: ChatTransport = {
      startRun: async (input, handlers) => { followDurableRun({ runId: "run", signal: input.signal, handlers, ports }); return { runId: "run" }; },
      reattachRun: async () => {}, fetchRunStatus: async () => "running", stopRun: async () => {},
    };
    const transport = trackTransportActivity({ transport: base, activity });
    const done: unknown[] = [];
    const abort = new AbortController();
    await transport.startRun({ history: [], signal: abort.signal }, { onEvent: () => {}, onError: () => {}, onDone: (events) => { done.push(events); } });
    tab.hide(); tab.advance(31_000); await settleLocks();
    expect(pageSources[0]!.closed).toBe(false);
    expect(runSources[0]!.closed).toBe(false);
    saved = { ...saved, runStatus: "succeeded", events: [] };
    tab.advance(1_000); await settleLocks();
    expect(done).toEqual([[]]);
    expect(runSources[0]!.closed).toBe(true);
    expect(pageSources[0]!.closed).toBe(true);
    expect(activity.active({})).toBe(false);
    page.close(); abort.abort();
  });
});

describe("transport activity lifecycle", () => {
  it("the production transport factory wires its shared activity owner", async () => {
    const activity = createStreamActivity({});
    let finish: (() => void) | undefined;
    const base: ChatTransport = {
      startRun: async (_input, handlers) => { finish = () => handlers.onDone([]); return { runId: "a" }; },
      reattachRun: async () => {}, fetchRunStatus: async () => null, stopRun: async () => {},
    };
    const transport = createTovuAssistantTransport({}, { createTransport: () => base, activity });
    await transport.startRun({ history: [], signal: new AbortController().signal }, {
      onEvent: () => {}, onError: () => {}, onDone: () => {},
    });
    expect(activity.active({})).toBe(true);
    finish!();
    expect(activity.active({})).toBe(false);
  });

  it("tracks dispatch and reattachment independently, ignores transient errors and releases on detach or terminal", async () => {
    const activity = createStreamActivity({});
    const handlers: RunHandlers[] = [];
    const base: ChatTransport = {
      startRun: async (_input, handler) => { handlers.push(handler); return { runId: "a" }; },
      reattachRun: async (_run, handler) => { handlers.push(handler); },
      fetchRunStatus: async () => "running", stopRun: async () => {},
    };
    const transport = trackTransportActivity({ transport: base, activity });
    const callback: RunHandlers = { onEvent: () => {}, onError: () => {}, onDone: () => {} };
    const abort = new AbortController();
    await transport.startRun({ history: [], signal: abort.signal }, callback);
    await transport.reattachRun("b", callback);
    handlers[0]!.onError(new Error("transient"));
    expect(activity.active({})).toBe(true);
    abort.abort();
    expect(activity.active({})).toBe(true);
    handlers[1]!.onDone([]); handlers[1]!.onDone([]);
    expect(activity.active({})).toBe(false);
  });

  it("releases a rejected dispatch and completes observation of a gone durable row", async () => {
    const activity = createStreamActivity({});
    let fail = true;
    let poll: (() => void) | undefined;
    let closes = 0;
    let done = 0;
    const callback: RunHandlers = { onEvent: () => {}, onError: () => {}, onDone: () => { done++; } };
    const base: ChatTransport = {
      startRun: async (input, handlers) => {
        if (fail) throw new Error("refused");
        followDurableRun({ runId: "gone", signal: input.signal, handlers, ports: {
          read: async () => "gone", stream: () => () => { closes++; },
          schedule: ({ work }) => { poll = work; return () => { poll = undefined; }; },
        } });
        return { runId: "gone" };
      },
      reattachRun: async () => {}, fetchRunStatus: async () => null, stopRun: async () => {},
    };
    const transport = trackTransportActivity({ transport: base, activity });
    const input = { history: [], signal: new AbortController().signal };
    await expect(transport.startRun(input, callback)).rejects.toThrow("refused");
    expect(activity.active({})).toBe(false);
    fail = false;
    await transport.startRun(input, callback);
    expect(activity.active({})).toBe(true);
    poll!(); await settleLocks();
    expect(activity.active({})).toBe(false);
    expect(closes).toBe(1);
    expect(done).toBe(1);
  });
});
