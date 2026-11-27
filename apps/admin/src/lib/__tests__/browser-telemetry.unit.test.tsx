// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBrowserTelemetryFeed } from "@jini-ai/admin/react";
import { ADMIN_BASE } from "@jini-ai/admin/shell/lib/router";
import { createBrowserTelemetry } from "../browser-telemetry";
import { installBrowserErrorListeners, createReactRootErrorHandlers, toRouteTemplate, type BrowserTelemetryPayload } from "@jini-ai/admin/browser";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

it("binds the collector's initial route to the admin root", () => {
  const sent: BrowserTelemetryPayload[] = [];
  const telemetry = createBrowserTelemetry({
    send: async payload => { sent.push(payload); }, nowMs: () => 0,
    setTimer: () => 0, clearTimer: () => {},
  });
  telemetry.setSignedIn(true);
  telemetry.reportError({ error: "initial" });
  expect(sent).toEqual([{ type: "error", message: "initial", stack: "", route: "/admin" }]);
});

describe("route templates", () => {
  it("replaces captured params with their names and drops the query", () => {
    expect(toRouteTemplate({ base: ADMIN_BASE, routePath: "/posts/abc123?tab=seo", params: { postId: "abc123" } })).toBe("/admin/posts/:postId");
    expect(toRouteTemplate({ base: ADMIN_BASE, routePath: "/widgets/regions/sidebar%20left", params: { regionKey: "sidebar left" } })).toBe("/admin/widgets/regions/:regionKey");
    expect(toRouteTemplate({ base: ADMIN_BASE, routePath: "/", params: {} })).toBe("/admin");
    expect(toRouteTemplate({ base: ADMIN_BASE, routePath: "/bad%E0", params: {} })).toBe("/admin/bad%E0");
  });

  it("the hook reports sign-in and the template, and re-sends on sign-in", () => {
    const calls: string[] = [];
    const telemetry = { setSignedIn: (v: boolean) => { calls.push(`signedIn:${v}`); }, setRoute: (r: string) => { calls.push(r); } };
    const params = { postId: "p1" };
    const { rerender } = renderHook((props: { signedIn: boolean }) => useBrowserTelemetryFeed({ signedIn: props.signedIn, routePath: "/posts/p1", params, base: ADMIN_BASE, telemetry }), { initialProps: { signedIn: false } });
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
    const root = createRoot(host, createReactRootErrorHandlers({ telemetry: { reportError }, report: ({ error }) => { console.error(error); } }));
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

it("posts only the settled pageview using the live host's cookie and keepalive settings", async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.stubEnv("MODE", "production");
  const telemetryPath = "/api/admin/v1/telemetry";
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    if (url === telemetryPath && init?.method === "POST") return Response.json({});
    return Response.json({ error: "Unexpected telemetry request" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  const { adminTelemetry } = await import("../browser-telemetry");
  adminTelemetry.setSignedIn(true);
  adminTelemetry.setRoute("/admin/posts/:postId");
  await vi.advanceTimersByTimeAsync(700);
  adminTelemetry.setRoute("/admin/pages/:slug");
  await vi.advanceTimersByTimeAsync(300);
  expect(fetch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(700);

  expect(fetch).toHaveBeenCalledExactlyOnceWith(telemetryPath, expect.objectContaining({
    method: "POST", keepalive: true, credentials: "same-origin",
    body: JSON.stringify({ type: "pageview", route: "/admin/pages/:slug" }),
  }));
});
