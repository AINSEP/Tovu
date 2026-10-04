import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api, ApiError } from "@/lib/api";
import { createFakeObservabilityStatusPort } from "../hooks/observability-status-dependencies.hooks";
import { useObservabilityStatus, useWiredObservabilityStatus } from "../hooks/use-observability-status.hooks";

/**
 * @file `useObservabilityStatus` driven against the injected `ObservabilityStatusPort`, no `fetch`
 * stub and no `vi.spyOn(api, ...)` for the load path — mirrors `use-agent-plugins.hooks.unit.test.ts`'s
 * identical "injected port" proof for its sibling screen. This is the boundary the dispatch asked
 * to mock: the admin API read, not the whole component.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("useObservabilityStatus — injected port (no fetch stub, no api spy)", () => {
  it("reports OFF/noop when the injected status says disabled — the OTEL_EXPORTER_OTLP_ENDPOINT-unset case", async () => {
    const getSpy = vi.spyOn(api, "getObservabilityStatus");
    const port = createFakeObservabilityStatusPort({ status: { enabled: false, serviceName: null } });
    const { result } = renderHook(() => useObservabilityStatus({ port, locale: "en", t: (key: string) => key }));

    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.status).toEqual({ enabled: false, serviceName: null });
    expect(result.current.error).toBeNull();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("reports ON with the service name when the injected status says enabled — the OTEL_EXPORTER_OTLP_ENDPOINT-set case", async () => {
    const port = createFakeObservabilityStatusPort({ status: { enabled: true, serviceName: "tovu" } });
    const { result } = renderHook(() => useObservabilityStatus({ port, locale: "en", t: (key: string) => key }));

    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.status).toEqual({ enabled: true, serviceName: "tovu" });
    expect(result.current.error).toBeNull();
  });

  it("does not resolve `status` while the injected port's read is still pending", () => {
    const port = createFakeObservabilityStatusPort();
    port.getObservabilityStatus = () => new Promise(() => {});
    const { result } = renderHook(() => useObservabilityStatus({ port, locale: "en", t: (key: string) => key }));

    expect(result.current.status).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("surfaces a rejected load as `error`, leaving `status` null", async () => {
    const port = createFakeObservabilityStatusPort({ failWith: new Error("boom") });
    const { result } = renderHook(() => useObservabilityStatus({ port, locale: "en", t: (key: string) => key }));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.status).toBeNull();
    expect(result.current.error).toBe("boom");
  });
});


describe("observability default binding and error copy", () => {
  it("loads the wired status through the real GET endpoint", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/admin/v1/workspaces/workspace-local/system/observability-status" && (init?.method ?? "GET") === "GET") {
        return Response.json({ enabled: true, serviceName: "test-service" });
      }
      if (url === "/api/admin/v1/workspaces/workspace-local/settings/effective?namespace=core.language") {
        return Response.json({ data: [] });
      }
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWiredObservabilityStatus());
    await waitFor(() => expect(result.current.status).toEqual({ enabled: true, serviceName: "test-service" }));
    expect(result.current.error).toBeNull();
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/system/observability-status"))).toHaveLength(1);
  });

  it.each([
    ["non-Error rejection", "offline", "no se pudo cargar el estado de observabilidad"],
    ["empty ApiError", new ApiError("", 503), "no se pudo cargar el estado de observabilidad"],
    ["ApiError message", new ApiError("permission denied", 403), "permission denied"],
  ])("maps %s to operator copy", async (_name, failure, expected) => {
    const port = createFakeObservabilityStatusPort({ failWith: failure });
    const { result } = renderHook(() => useObservabilityStatus({ port, locale: "es", t: (key) => key }));
    await waitFor(() => expect(result.current.error).toBe(expected));
    expect(result.current.status).toBeNull();
  });
});
