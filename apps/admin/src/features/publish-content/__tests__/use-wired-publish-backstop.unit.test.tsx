import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWiredPublishBackstop } from "../hooks/use-wired-publish-backstop.hooks";
import { setPublishToLiveAvailable } from "../hooks/publish-availability.store";
import type { PublishBackstopPort } from "../hooks/publish-backstop-port.hooks";

/**
 * The composition hook for "send by hand": it reads the undo run from the page URL, the live-site
 * publish flag from the shared store, and the admin locale for copy, then hands all three to
 * `usePublishBackstop`. Each input is driven from its real source (URL, store, language setting
 * over a fetch stub); only the backstop port is a hand-written fake.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setPublishToLiveAvailable(true);
  window.history.replaceState(null, "", "/");
});

function port({ allowed = true, installed = true } = {}) {
  return {
    status: vi.fn(async () => ({ allowed, installed })),
    listPeers: vi.fn(async () => ({ peers: [] })),
    gaps: vi.fn(async () => ({ gaps: [] })),
    plan: vi.fn(),
    send: vi.fn(),
    run: vi.fn(async ({ runId }: { runId: string }) => ({ runId, reason: "Footer fix", items: [], canUndo: true })),
    undo: vi.fn(),
  } satisfies PublishBackstopPort;
}

function stubLanguage(locale: string | null) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("namespace=core.language")) return Response.json({ data: locale ? [{ key: "locale", value: locale }] : [] });
    return new Response("{}", { status: 404 });
  }));
}

describe("useWiredPublishBackstop", () => {
  it("loads the undo run named in the page URL", async () => {
    stubLanguage(null);
    window.history.replaceState(null, "", "/admin/?backstopRun=run-42");
    const fake = port();
    const { result } = renderHook(() => useWiredPublishBackstop({ port: fake, t: (key) => key }));
    await waitFor(() => expect(result.current.run?.runId).toBe("run-42"));
    expect(fake.run).toHaveBeenCalledExactlyOnceWith({ runId: "run-42" });
    expect(result.current.undoRequested).toBe(true);
  });

  it("ignores a malformed run id in the URL", async () => {
    stubLanguage(null);
    window.history.replaceState(null, "", "/admin/?backstopRun=../../x");
    const fake = port();
    const { result } = renderHook(() => useWiredPublishBackstop({ port: fake, t: (key) => key }));
    await waitFor(() => expect(result.current.allowed).toBe(true));
    expect(fake.run).not.toHaveBeenCalled();
    expect(result.current.undoRequested).toBe(false);
  });

  it("follows the live-site publish flag from the shared store", async () => {
    stubLanguage(null);
    const fake = port();
    const { result } = renderHook(() => useWiredPublishBackstop({ port: fake, t: (key) => key }));
    await waitFor(() => expect(result.current.allowed).toBe(true));
    expect(result.current.canPublish).toBe(true);
    act(() => setPublishToLiveAvailable(false));
    expect(result.current.canPublish).toBe(false);
    // With publishing off, opening the section must not discover destinations.
    await act(async () => { await result.current.open(); });
    expect(fake.listPeers).not.toHaveBeenCalled();
  });

  it("translates copy into the admin's saved language when no translator is injected", async () => {
    stubLanguage("es");
    window.history.replaceState(null, "", "/admin/?backstopRun=run-1");
    const { result } = renderHook(() => useWiredPublishBackstop({ port: port({ allowed: false }) }));
    await waitFor(() => expect(result.current.t("Send to live")).toBe("Enviar al sitio público"));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    // The status error is produced while the locale may still be loading; the translator itself
    // must answer in the saved language once it has loaded.
    expect(result.current.t("This send could not complete.")).toBe("No se pudo completar este envío.");
  });

  it("defaults to the real backstop route when called with no arguments", async () => {
    stubLanguage(null);
    const { result } = renderHook(() => useWiredPublishBackstop());
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/backstop/status"))).toBe(true));
    // The stub answers 404, which the real port reads as "not allowed": the section stays hidden.
    expect(result.current.allowed).toBe(false);
    expect(result.current.t("Send to live")).toBe("Send to live");
  });

  it("uses an injected translator instead of the locale dictionary", async () => {
    stubLanguage("es");
    const { result } = renderHook(() => useWiredPublishBackstop({ port: port(), t: (key) => `«${key}»` }));
    await waitFor(() => expect(result.current.allowed).toBe(true));
    expect(result.current.t("Send to live")).toBe("«Send to live»");
  });
});
