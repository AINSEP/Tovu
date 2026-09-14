import { afterEach, describe, expect, it, vi } from "vitest";

import { logFrontendSessionError } from "../../App.hooks";

/**
 * @file `App.hooks.tsx`'s `logFrontendSessionError` — the `onError` callback
 * `useAgentPageBridge` hands `createFrontendSessionBridge`. Regression coverage for the bug this
 * fixed: every stream hiccup (the `EventSource`'s own `error` `Event`, fired while the browser is
 * mid-retry) was logged at `console.error`, so nearly every admin page logged
 * `[admin] frontend session Event` on ordinary load. Mirrors `settings-events.unit.test.ts`'s
 * `readyState` cases for the identical `EventSource.CLOSED` convention.
 */

/** Minimal `EventSource`-shaped global — only the static `CLOSED` this module reads. */
class FakeEventSource {
  static readonly CLOSED = 2;
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
}

vi.stubGlobal("EventSource", FakeEventSource);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logFrontendSessionError", () => {
  it("a genuine Error (malformed frame, failed response POST) still logs at error level", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error("malformed frame: expected a JSON object, got null");

    logFrontendSessionError(error);

    expect(errorSpy).toHaveBeenCalledWith("[admin] frontend session", error);
  });

  it("the stream's native 'error' Event while still CONNECTING does not log at all — EventSource retries on its own", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const target = { readyState: FakeEventSource.CONNECTING };
    const event = new Event("error");
    Object.defineProperty(event, "target", { value: target });

    logFrontendSessionError(event);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("the stream's native 'error' Event once the connection is CLOSED logs a warning, not an error", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const target = { readyState: FakeEventSource.CLOSED };
    const event = new Event("error");
    Object.defineProperty(event, "target", { value: target });

    logFrontendSessionError(event);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("[admin] frontend session stream closed", event);
  });
});
