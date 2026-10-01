import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, type AdminSiteTokenStatus } from "@/lib/api";
import { useSiteToken } from "../hooks/use-site-token.hooks";
import type { SiteTokenPort } from "../hooks/site-token-port.hooks";
import { useRevealedKeyCopy } from "../SiteTokenTab.hooks";

const t = (key: string) => key;
const HEX = "ab".repeat(32);
const ACTIVE: AdminSiteTokenStatus = { active: true, source: "file", fingerprint: "fp", keyFilePath: "/key", runtimeMode: "local", state: "active" };
const MISSING: AdminSiteTokenStatus = { active: false, source: "none", keyFilePath: "/key", runtimeMode: "local", state: "missing" };

function makePort(overrides: Partial<SiteTokenPort> = {}): SiteTokenPort {
  return {
    status: vi.fn(async () => ACTIVE),
    reveal: vi.fn(async () => ({ ...ACTIVE, hex: HEX })),
    generate: vi.fn(async () => ({ outcome: "created" as const, fingerprint: "new-fp", keyFilePath: "/new-key", runtimeMode: "production" as const })),
    importToken: vi.fn(), previewStartFresh: vi.fn(), startFresh: vi.fn(),
    ...overrides,
  };
}

async function mount(port: SiteTokenPort, status = ACTIVE) {
  const hook = renderHook(() => useSiteToken(port, t, "en"));
  await waitFor(() => expect(hook.result.current.status).toEqual(status));
  return hook;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useSiteToken", () => {
  it("loads status once on mount and reveals the exact hex only on request; hide clears it", async () => {
    const port = makePort();
    const { result, rerender } = await mount(port);
    expect(port.status).toHaveBeenCalledTimes(1);
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
    const { result } = renderHook(() => useSiteToken(port, t, "en"));
    await act(async () => result.current.reveal());
    await waitFor(() => expect(result.current.status).toEqual(MISSING));
    await act(async () => result.current.reveal());
    expect(port.reveal).not.toHaveBeenCalled();
    expect(result.current.revealedHex).toBeNull();
  });

  it("reports status and reveal failures without staying busy or exposing a key", async () => {
    const failedPort = makePort({ status: vi.fn(async () => { throw new Error("status unavailable"); }) });
    const failed = renderHook(() => useSiteToken(failedPort, t, "en"));
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
