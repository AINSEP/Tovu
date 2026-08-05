import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as settingsRefreshBus from "../settings-refresh-bus";
import { subscribeToSettingsChanges } from "../settings-events";

/**
 * @file `settings-events.ts` — the SSE feed that republishes server-side settings changes (another
 * tab, another operator, a background job) onto `settings-refresh-bus.ts`. 46.7% before this pass,
 * no dedicated test file.
 */

/** A controllable `EventSource` stand-in carrying the two things this module reads off it beyond
 *  `addEventListener`/`close`: the constructor's `(url, options)` args, and `readyState` (checked
 *  by the module's own `error` handler against the static `EventSource.CLOSED`). */
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static CLOSED = 2;
  static shouldThrowOnConstruct = false;
  readonly url: string;
  readonly options: EventSourceInit | undefined;
  readyState = 1; // OPEN by default
  closed = false;
  private readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();

  constructor(url: string, options?: EventSourceInit) {
    if (FakeEventSource.shouldThrowOnConstruct) {
      throw new DOMException("insecure connection refused", "SecurityError");
    }
    this.url = url;
    this.options = options;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (event: { data?: string }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, data?: string): void {
    for (const handler of this.listeners.get(type) ?? []) handler({ data });
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  FakeEventSource.shouldThrowOnConstruct = false;
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("subscribeToSettingsChanges", () => {
  it("opens the workspace's events URL, encoded, with credentials", () => {
    subscribeToSettingsChanges("ws with spaces");

    expect(FakeEventSource.instances).toHaveLength(1);
    const source = FakeEventSource.instances[0]!;
    expect(source.url).toBe("/api/admin/v1/workspaces/ws%20with%20spaces/settings/events");
    expect(source.options).toEqual({ withCredentials: true });
  });

  it("a 'settings-changed' frame with a namespace list republishes exactly that scope", () => {
    const publishSpy = vi.spyOn(settingsRefreshBus, "publishSettingsRefresh");
    subscribeToSettingsChanges("ws1");
    const source = FakeEventSource.instances[0]!;

    source.emit("settings-changed", JSON.stringify({ namespaces: ["appearance", "seo"] }));

    expect(publishSpy).toHaveBeenCalledWith(["appearance", "seo"]);
  });

  it("a 'settings-changed' frame with no namespaces field still refreshes everything (undefined scope)", () => {
    const publishSpy = vi.spyOn(settingsRefreshBus, "publishSettingsRefresh");
    subscribeToSettingsChanges("ws1");
    const source = FakeEventSource.instances[0]!;

    source.emit("settings-changed", JSON.stringify({}));

    expect(publishSpy).toHaveBeenCalledWith(undefined);
  });

  it("a 'settings-changed' frame whose namespaces field is not an array is treated as absent, not thrown on", () => {
    const publishSpy = vi.spyOn(settingsRefreshBus, "publishSettingsRefresh");
    subscribeToSettingsChanges("ws1");
    const source = FakeEventSource.instances[0]!;

    source.emit("settings-changed", JSON.stringify({ namespaces: "not-an-array" }));

    expect(publishSpy).toHaveBeenCalledWith(undefined);
  });

  it("malformed JSON in a 'settings-changed' frame still refreshes everything rather than throwing", () => {
    const publishSpy = vi.spyOn(settingsRefreshBus, "publishSettingsRefresh");
    subscribeToSettingsChanges("ws1");
    const source = FakeEventSource.instances[0]!;

    expect(() => source.emit("settings-changed", "{not valid json")).not.toThrow();
    expect(publishSpy).toHaveBeenCalledWith();
  });

  it("an EventSource constructor failure (e.g. an unsupported host) returns a no-op disposer instead of throwing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    FakeEventSource.shouldThrowOnConstruct = true;

    let dispose: () => void;
    expect(() => {
      dispose = subscribeToSettingsChanges("ws1");
    }).not.toThrow();
    expect(() => dispose()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith("[admin] settings change feed unavailable", expect.any(DOMException));
  });

  it("an 'error' event while the connection is CLOSED logs a warning (no further auto-reconnect from here)", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    subscribeToSettingsChanges("ws1");
    const source = FakeEventSource.instances[0]!;
    source.readyState = FakeEventSource.CLOSED;

    source.emit("error");

    expect(warnSpy).toHaveBeenCalledWith(
      "[admin] settings change feed closed by the server; no further updates on this connection",
    );
  });

  it("an 'error' event while still connecting/open does not warn — EventSource is expected to retry on its own", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    subscribeToSettingsChanges("ws1");
    const source = FakeEventSource.instances[0]!;
    source.readyState = 0; // CONNECTING, not CLOSED

    source.emit("error");

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("the returned disposer closes the connection", () => {
    const dispose = subscribeToSettingsChanges("ws1");
    const source = FakeEventSource.instances[0]!;

    dispose();

    expect(source.closed).toBe(true);
  });
});
