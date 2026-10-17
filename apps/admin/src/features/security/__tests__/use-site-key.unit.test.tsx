import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, type AdminSiteKeyStatus } from "@/lib/api";
import { useSiteKey, useWiredSiteKey } from "../hooks/use-site-key.hooks";
import type { SiteKeyPort } from "../hooks/site-key-port.hooks";
import { useRevealedKeyCopy } from "../SiteKeyTab.hooks";

const t = (key: string) => key;
const HEX = "ab".repeat(32);
const ACTIVE: AdminSiteKeyStatus = { active: true, source: "file", fingerprint: "fp", keyFilePath: "/key", runtimeMode: "local", state: "active" };
const MISSING: AdminSiteKeyStatus = { active: false, source: "none", keyFilePath: "/key", runtimeMode: "local", state: "missing" };

function makePort(overrides: Partial<SiteKeyPort> = {}): SiteKeyPort {
  return {
    status: vi.fn(async () => ACTIVE),
    reveal: vi.fn(async () => ({ ...ACTIVE, hex: HEX })),
    generate: vi.fn(async () => ({ outcome: "created" as const, fingerprint: "new-fp", keyFilePath: "/new-key", runtimeMode: "production" as const })),
    importSiteKey: vi.fn(), previewStartFresh: vi.fn(), startFresh: vi.fn(),
    ...overrides,
  };
}

async function mount(port: SiteKeyPort, status = ACTIVE) {
  const hook = renderHook(() => useSiteKey(port, t, "en"));
  await waitFor(() => expect(hook.result.current.status).toEqual(status));
  return hook;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useSiteKey", () => {
  it("the wired controller loads the real API port and binds its translator to the saved locale", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(init?.method ?? "GET").toBe("GET");
      if (url.includes("/settings/effective")) {
        return Response.json({ data: [{ key: "locale", value: "es" }] });
      }
      expect(url).toMatch(/\/system\/site-key$/);
      return Response.json(ACTIVE);
    }));
    const { result } = renderHook(() => useWiredSiteKey());
    await waitFor(() => expect(result.current.status).toEqual(ACTIVE));
    await waitFor(() => expect(result.current.t("unknown error")).toBe("error desconocido"));
    expect(result.current.loadError).toBeNull();
    expect(result.current.revealedHex).toBeNull();
  });

  it("a failed refresh reports the load failure and keeps the earlier revealed key", async () => {
    const port = makePort({ status: vi.fn().mockResolvedValueOnce(ACTIVE).mockRejectedValue(new Error("refresh unavailable")) });
    const { result } = await mount(port);
    await act(async () => result.current.reveal());
    expect(result.current.revealedHex).toBe(HEX);
    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.loadError).toContain("refresh unavailable"));
    expect(result.current.revealedHex).toBe(HEX);
  });

  it("loads status once on mount and reveals the exact hex only on request; hide clears it", async () => {
    const port = makePort();
    const { result, rerender } = await mount(port);
    expect(port.status).toHaveBeenCalledTimes(1);
    expect(result.current.loadError).toBeNull();
    expect(result.current.revealedHex).toBeNull();
    expect(port.reveal).not.toHaveBeenCalled();
    rerender();
    expect(port.status).toHaveBeenCalledTimes(1);
    await act(async () => result.current.reveal());
    expect(port.reveal).toHaveBeenCalledTimes(1);
    expect(result.current.revealedHex).toBe(HEX);
    expect(result.current.revealing).toBe(false);
    act(() => result.current.hideRevealed());
    expect(result.current.revealedHex).toBeNull();
  });

  it("does not reveal before status loads or when no key is active", async () => {
    const port = makePort({ status: vi.fn(async () => MISSING) });
    const { result } = renderHook(() => useSiteKey(port, t, "en"));
    await act(async () => result.current.reveal());
    await waitFor(() => expect(result.current.status).toEqual(MISSING));
    await act(async () => result.current.reveal());
    expect(port.reveal).not.toHaveBeenCalled();
    expect(result.current.revealedHex).toBeNull();
  });

  it("an active key with no revealed hex stays hidden", async () => {
    const { result } = await mount(makePort({ reveal: async () => ACTIVE }));
    await act(async () => result.current.reveal());
    expect(result.current.revealedHex).toBeNull();
    expect(result.current.revealError).toBeNull();
    expect(result.current.revealing).toBe(false);
  });

  it("ignores another reveal while the first reveal is pending", async () => {
    let finish!: (value: Awaited<ReturnType<SiteKeyPort["reveal"]>>) => void;
    const pending = new Promise<Awaited<ReturnType<SiteKeyPort["reveal"]>>>((resolve) => { finish = resolve; });
    const port = makePort({ reveal: vi.fn(() => pending) });
    const { result } = await mount(port);
    let first!: Promise<void>;
    act(() => { first = result.current.reveal(); });
    expect(result.current.revealing).toBe(true);
    await act(async () => result.current.reveal());
    expect(port.reveal).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ ...ACTIVE, hex: HEX }); await first; });
    expect(result.current.revealedHex).toBe(HEX);
    expect(result.current.revealing).toBe(false);
  });

  it("ignores generation before status loads and while a generation is pending", async () => {
    let finish!: (value: Awaited<ReturnType<SiteKeyPort["generate"]>>) => void;
    const pending = new Promise<Awaited<ReturnType<SiteKeyPort["generate"]>>>((resolve) => { finish = resolve; });
    const port = makePort({ status: vi.fn(async () => MISSING), generate: vi.fn(() => pending) });
    const { result } = renderHook(() => useSiteKey(port, t, "en"));
    await act(async () => result.current.generate());
    expect(port.generate).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.status).toEqual(MISSING));
    let first!: Promise<void>;
    act(() => { first = result.current.generate(); });
    expect(result.current.generating).toBe(true);
    await act(async () => result.current.generate());
    expect(port.generate).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ outcome: "created", fingerprint: "generated-fp", keyFilePath: "/new-key", runtimeMode: "local" });
      await first;
    });
    expect(result.current.status).toEqual({ active: true, source: "file", state: "active", fingerprint: "generated-fp", keyFilePath: "/new-key", runtimeMode: "local" });
    expect(result.current.generating).toBe(false);
    expect(result.current.generateError).toBeNull();
  });

  it("reports status and reveal failures without staying busy or exposing a key", async () => {
    const failedPort = makePort({ status: vi.fn(async () => { throw new Error("status unavailable"); }) });
    const failed = renderHook(() => useSiteKey(failedPort, t, "en"));
    await waitFor(() => expect(failed.result.current.loadError).toContain("status unavailable"));
    failed.unmount();
    const { result } = await mount(makePort({ reveal: vi.fn(async () => { throw new Error("reveal denied"); }) }));
    await act(async () => result.current.reveal());
    expect(result.current.revealError).toContain("reveal denied");
    expect(result.current.revealing).toBe(false);
    expect(result.current.revealedHex).toBeNull();
  });

  it("generate replaces missing status with the returned key metadata, without revealing it", async () => {
    const port = makePort({ status: vi.fn(async () => MISSING) });
    const { result } = await mount(port, MISSING);
    await act(async () => result.current.generate());
    expect(port.generate).toHaveBeenCalledTimes(1);
    expect(result.current.status).toEqual({ active: true, source: "file", fingerprint: "new-fp", keyFilePath: "/new-key", runtimeMode: "production", state: "active" });
    expect(result.current.revealedHex).toBeNull();
    expect(result.current.generating).toBe(false);
    expect(result.current.generateError).toBeNull();
    await act(async () => result.current.generate());
    expect(port.generate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["KEY_DEPENDENT_DATA", "locked"], ["KEY_MISMATCH", "locked"],
    ["KEY_INVALID", "refused"], ["SITE_META_UNREADABLE", "refused"],
  ])("classifies generate refusal %s and refresh clears it", async (code, kind) => {
    const port = makePort({ status: vi.fn(async () => MISSING), generate: vi.fn(async () => { throw new ApiError(code, 409, undefined, { error: code, detail: "Nothing changed" }); }) });
    const { result } = await mount(port, MISSING);
    await act(async () => result.current.generate());
    expect(result.current.generateError).toEqual({ kind, code, detail: "Nothing changed" });
    expect(result.current.generating).toBe(false);
    expect(result.current.status).toEqual(MISSING);
    await act(async () => result.current.refresh());
    expect(result.current.generateError).toBeNull();
  });

  it("refresh re-reads status and clears an earlier revealed hex", async () => {
    const port = makePort({ status: vi.fn().mockResolvedValueOnce(ACTIVE).mockResolvedValueOnce(MISSING) });
    const { result } = await mount(port);
    await act(async () => result.current.reveal());
    expect(result.current.revealedHex).toBe(HEX);
    await act(async () => result.current.refresh());
    expect(port.status).toHaveBeenCalledTimes(2);
    expect(result.current.status).toEqual(MISSING);
    expect(result.current.revealedHex).toBeNull();
  });
});

describe("useRevealedKeyCopy", () => {
  it("writes the exact revealed hex and resets Copied after the display interval", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { result } = renderHook(() => useRevealedKeyCopy(HEX));
    await act(async () => result.current.copy());
    expect(writeText).toHaveBeenCalledWith(HEX);
    expect(result.current.copied).toBe(true);
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.copied).toBe(false);

  });
});
