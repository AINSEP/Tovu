// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAdminTelemetry } from "../../hooks/use-admin-telemetry.hooks";
import {
  createBrowserTelemetry,
  installBrowserErrorListeners,
  reactRootErrorOptions,
  toAdminRouteTemplate,
  type BrowserTelemetryPayload,
} from "../browser-telemetry";

/** Engine over a manual clock and timer queue; `sent` is everything that would have been POSTed. */
function harness(options?: { maxErrorsPerMinute?: number }) {
  const sent: BrowserTelemetryPayload[] = [];
  let now = 0;
  let pending: (() => void) | null = null;
  const telemetry = createBrowserTelemetry({
    send: async (payload) => { sent.push(payload); },
    nowMs: () => now,
    setTimer: (fn) => { pending = fn; return 1; },
    clearTimer: () => { pending = null; },
  }, options);
  return {
    telemetry, sent,
    advance: (ms: number) => { now += ms; },
    fireTimer: () => { const fn = pending; pending = null; fn?.(); },
  };
}

afterEach(() => { vi.restoreAllMocks(); });

describe("browser telemetry engine", () => {
  it("sends nothing before sign-in", () => {
    const h = harness();
    h.telemetry.setRoute("/admin/posts");
    h.telemetry.reportError({ error: new Error("early") });
    h.fireTimer();
    expect(h.sent).toEqual([]);
  });

  it("dedupes the same error from the same place and caps errors per minute", () => {
    const h = harness({ maxErrorsPerMinute: 3 });
    h.telemetry.setSignedIn(true);
    const same = new Error("same");
    for (let i = 0; i < 5; i += 1) h.telemetry.reportError({ error: same });
    expect(h.sent).toHaveLength(1);
    for (let i = 0; i < 5; i += 1) h.telemetry.reportError({ error: new Error(`distinct ${i}`) });
    expect(h.sent).toHaveLength(3);
    h.advance(60_000);
    h.telemetry.reportError({ error: new Error("next minute") });
    expect(h.sent).toHaveLength(4);
  });

  it("carries the current route template, never dumps a non-Error value, and truncates to the server caps", () => {
    const h = harness();
    h.telemetry.setSignedIn(true);
    h.telemetry.setRoute("/admin/posts/:postId");
    h.telemetry.reportError({ error: { email: "jane@example.com", password: "hunter2" } });
    h.telemetry.reportError({ error: new Error("x".repeat(5_000)), componentStack: "c".repeat(9_000) });
    const [plain, long] = h.sent as Extract<BrowserTelemetryPayload, { type: "error" }>[];
    expect(plain).toEqual({ type: "error", message: "Non-Error thrown (object)", stack: "", route: "/admin/posts/:postId" });
    expect(JSON.stringify(h.sent)).not.toContain("jane@example.com");
    expect(long!.message).toHaveLength(1_000);
    expect(long!.stack.length).toBeLessThanOrEqual(8_000);
    expect(long!.componentStack).toHaveLength(4_000);
  });

  it("never throws, even when sending throws or rejects", () => {
    const throwing = createBrowserTelemetry({
      send: () => { throw new Error("offline"); }, nowMs: () => 0, setTimer: () => { throw new Error("no timers"); }, clearTimer: () => {},
    });
    throwing.setSignedIn(true);
    expect(() => throwing.setRoute("/admin")).not.toThrow();
    expect(() => throwing.reportError({ error: new Error("a") })).not.toThrow();
    const rejecting = createBrowserTelemetry({ send: () => Promise.reject(new Error("429")), nowMs: () => 0, setTimer: () => 0, clearTimer: () => {} });
    rejecting.setSignedIn(true);
    expect(() => rejecting.reportError({ error: new Error("b") })).not.toThrow();
  });

  it("debounces page views and does not repeat the same route", () => {
    const h = harness();
    h.telemetry.setSignedIn(true);
    h.telemetry.setRoute("/admin/posts");
    h.telemetry.setRoute("/admin/posts/:postId");
    h.fireTimer();
    h.telemetry.setRoute("/admin/posts/:postId");
    h.fireTimer();
    expect(h.sent).toEqual([{ type: "pageview", route: "/admin/posts/:postId" }]);
  });
});

describe("route templates", () => {
  it("replaces captured params with their names and drops the query", () => {
    expect(toAdminRouteTemplate({ routePath: "/posts/abc123?tab=seo", params: { postId: "abc123" } })).toBe("/admin/posts/:postId");
    expect(toAdminRouteTemplate({ routePath: "/widgets/regions/sidebar%20left", params: { regionKey: "sidebar left" } })).toBe("/admin/widgets/regions/:regionKey");
    expect(toAdminRouteTemplate({ routePath: "/", params: {} })).toBe("/admin");
    expect(toAdminRouteTemplate({ routePath: "/bad%E0", params: {} })).toBe("/admin/bad%E0");
  });

  it("the hook reports sign-in and the template, and re-sends on sign-in", () => {
    const calls: string[] = [];
    const telemetry = { setSignedIn: (v: boolean) => { calls.push(`signedIn:${v}`); }, setRoute: (r: string) => { calls.push(r); } };
    const params = { postId: "p1" };
    const { rerender } = renderHook((props: { signedIn: boolean }) => useAdminTelemetry({ signedIn: props.signedIn, routePath: "/posts/p1", params }, { telemetry }), { initialProps: { signedIn: false } });
    rerender({ signedIn: true });
    expect(calls).toEqual(["signedIn:false", "/admin/posts/:postId", "signedIn:true", "/admin/posts/:postId"]);
  });
});

describe("error sources", () => {
  it("window errors and unhandled rejections are reported; a cross-origin 'Script error.' is not", () => {
    const reportError = vi.fn();
    const target = new EventTarget() as unknown as Window;
    const uninstall = installBrowserErrorListeners({ target, telemetry: { reportError } });
    const boom = new Error("boom");
    target.dispatchEvent(Object.assign(new Event("error"), { error: boom }));
    target.dispatchEvent(Object.assign(new Event("error"), { error: null, message: "Script error." }));
    target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "nope" }));
    uninstall();
    target.dispatchEvent(Object.assign(new Event("error"), { error: boom }));
    expect(reportError.mock.calls).toEqual([[{ error: boom }], [{ error: "nope" }]]);
  });

  it("an error a React boundary catches is reported with its component stack and still logged", async () => {
    const reportError = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
      state = { failed: false };
      static getDerivedStateFromError() { return { failed: true }; }
      render() { return this.state.failed ? <p>fallback</p> : this.props.children; }
    }
    function Exploding(): ReactNode { throw new Error("render failed"); }
    const host = document.createElement("div");
    const root = createRoot(host, reactRootErrorOptions({ telemetry: { reportError } }));
    await act(async () => { root.render(<Boundary><Exploding /></Boundary>); });
    expect(host.textContent).toBe("fallback");
    expect(reportError).toHaveBeenCalledTimes(1);
    const [{ error, componentStack }] = reportError.mock.calls[0]!;
    expect((error as Error).message).toBe("render failed");
    expect(componentStack).toContain("Exploding");
    expect(consoleError).toHaveBeenCalledWith(error);
    act(() => { root.unmount(); });
  });
});
