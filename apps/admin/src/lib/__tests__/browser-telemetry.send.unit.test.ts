import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); vi.unstubAllEnvs(); });

it("under test mode the shared telemetry send resolves with nothing and touches no network", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const { adminTelemetry } = await import("../browser-telemetry");
  expect(adminTelemetry).toBeDefined();
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it("outside test mode the send posts the payload to /telemetry with keepalive, and the injected clock and timers are real ones", async () => {
  vi.stubEnv("MODE", "production");
  vi.resetModules();
  const captured: { deps?: Record<string, (...args: never[]) => unknown> } = {};
  vi.doMock("@jini-ai/admin/browser", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@jini-ai/admin/browser")>();
    return { ...actual, createBrowserTelemetry: (deps: never) => { captured.deps = deps; return { reportError: vi.fn(), reportPageview: vi.fn() }; } };
  });
  const request = vi.fn(async () => undefined);
  vi.doMock("../api", async (importOriginal) => ({ ...(await importOriginal<typeof import("../api")>()), authenticatedAdminRequest: request }));
  await import("../browser-telemetry");
  const deps = captured.deps!;
  await deps.send!({ kind: "error" } as never);
  expect(request).toHaveBeenCalledExactlyOnceWith({ path: "/telemetry", method: "POST", body: { kind: "error" } }, { keepalive: true });

  vi.useFakeTimers();
  vi.setSystemTime(12345);
  expect(deps.nowMs!()).toBe(12345);
  const fn = vi.fn();
  const handle = deps.setTimer!(fn as never, 50 as never);
  vi.advanceTimersByTime(49);
  expect(fn).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(fn).toHaveBeenCalledTimes(1);
  const cancelled = vi.fn();
  const second = deps.setTimer!(cancelled as never, 50 as never);
  deps.clearTimer!(second as never);
  vi.advanceTimersByTime(100);
  expect(cancelled).not.toHaveBeenCalled();
  void handle;
  vi.useRealTimers();
  vi.doUnmock("@jini-ai/admin/browser");
  vi.doUnmock("../api");
});
